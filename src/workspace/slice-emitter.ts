/**
 * Transforms RECON per-repository state (YAML slices) into workspace graph slices.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import yaml from 'js-yaml';
import { globby } from 'globby';

import { createRequire } from 'node:module';
import { ioLimiter } from '../utils/concurrency.js';
import { buildResourceResolverFromState, type ResourceResolverResult } from './resource-resolver.js';
import { buildStackTopology } from './cfn-stack-resolver.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { name: string; version: string };

const CFN_TO_GRAPH: Record<string, string> = {
  'AWS::SQS::Queue': 'Queue',
  'AWS::SNS::Topic': 'Topic',
  'AWS::Lambda::Function': 'Lambda',
  'AWS::Serverless::Function': 'Lambda',
  'AWS::StepFunctions::StateMachine': 'StateMachine',
  'AWS::Serverless::StateMachine': 'StateMachine',
  'AWS::S3::Bucket': 'Bucket',
  'AWS::DynamoDB::Table': 'Database',
};

export interface SliceEmitResult {
  nodeCount: number;
  edgeCount: number;
  contentHash: string;
}

interface WorkspaceEntity {
  id: string;
  type: string;
  name: string;
  provenance: { source_path: string; source_ref: string; repo?: string };
  attributes?: Record<string, unknown>;
}

interface WorkspaceRelationship {
  from: string;
  to: string;
  verb: string;
  confidence: 'high';
  provenance: { source_path: string; source_ref: string };
}

function isIntrinsicName(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== 'string') {
    return true;
  }
  const v = value.trim();
  if (v.length === 0) {
    return true;
  }
  return /\b(Ref|Fn::|GetAtt|Sub|Join|Select|If|ImportValue)\b/.test(v) || v.startsWith('{');
}

function normalizeGraphToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickCfnDisplayName(
  el: Record<string, unknown>,
  logicalId: string,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const v = el[key];
    if (typeof v === 'string' && !isIntrinsicName(v)) {
      return v;
    }
  }
  if (logicalId && !isIntrinsicName(logicalId)) {
    return logicalId;
  }
  return null;
}

function resourceGraphId(cfnType: string, el: Record<string, unknown>): string | null {
  const graphType = CFN_TO_GRAPH[cfnType];
  if (!graphType) {
    return null;
  }
  const logicalId = String(el.logicalId ?? '');
  let name: string | null = null;
  switch (cfnType) {
    case 'AWS::SQS::Queue':
      name = pickCfnDisplayName(el, logicalId, 'queueName');
      break;
    case 'AWS::SNS::Topic':
      name = pickCfnDisplayName(el, logicalId, 'topicName');
      break;
    case 'AWS::Lambda::Function':
    case 'AWS::Serverless::Function':
      name = pickCfnDisplayName(el, logicalId, 'functionName');
      break;
    case 'AWS::StepFunctions::StateMachine':
    case 'AWS::Serverless::StateMachine':
      name = pickCfnDisplayName(el, logicalId, 'stateMachineName');
      break;
    case 'AWS::S3::Bucket':
      name = pickCfnDisplayName(el, logicalId, 'bucketName');
      break;
    case 'AWS::DynamoDB::Table':
      name = pickCfnDisplayName(el, logicalId, 'tableName');
      break;
    default:
      name = null;
  }
  if (!name) {
    return null;
  }
  const norm = normalizeGraphToken(name);
  if (!norm) {
    return null;
  }
  return `${graphType}:${norm}`;
}

function endpointGraphId(repoName: string, el: Record<string, unknown>): string | null {
  const method = normalizeGraphToken(String(el.method ?? 'any'));
  const routePath = String(el.path ?? '');
  if (!routePath) {
    return null;
  }
  const pathNorm = normalizeGraphToken(routePath.replace(/^\//, ''));
  if (!pathNorm || !method) {
    return null;
  }
  return `Endpoint:${normalizeGraphToken(repoName)}:${method}:${pathNorm}`;
}

function schemaGraphId(repoName: string, el: Record<string, unknown>): string | null {
  const schemaId = el.schemaId;
  if (typeof schemaId === 'string' && schemaId.trim().length > 0 && !isIntrinsicName(schemaId)) {
    return `Schema:${normalizeGraphToken(schemaId)}`;
  }
  const entity = el.entity;
  if (typeof entity === 'string' && entity.trim().length > 0) {
    return `Schema:${normalizeGraphToken(entity)}`;
  }
  const name = el.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return `Schema:${normalizeGraphToken(repoName)}:${normalizeGraphToken(name)}`;
  }
  return null;
}

function lambdaIdFromTrigger(el: Record<string, unknown>): string | null {
  // NS-5: Prefer targetRef (clean logical ID) over targetFunction
  // which may contain intrinsics like !GetAtt
  const fn =
    (typeof el.targetRef === 'string' && !isIntrinsicName(el.targetRef) && el.targetRef) ||
    (typeof el.targetFunction === 'string' && !isIntrinsicName(el.targetFunction) && el.targetFunction) ||
    '';
  if (!fn) {
    return null;
  }
  return `Lambda:${normalizeGraphToken(fn)}`;
}

function queueOrDbIdFromTrigger(el: Record<string, unknown>): string | null {
  const srcRef = typeof el.sourceRef === 'string' ? el.sourceRef : '';
  const srcArn = typeof el.sourceArn === 'string' ? el.sourceArn : '';
  const st = String(el.sourceType ?? '');
  if (!srcRef || isIntrinsicName(srcRef)) {
    return null;
  }
  if (st.toLowerCase().includes('sqs') || srcArn.toLowerCase().includes('sqs')) {
    return `Queue:${normalizeGraphToken(srcRef)}`;
  }
  if (st.toLowerCase().includes('dynamo') || srcArn.toLowerCase().includes('dynamodb')) {
    return `Database:${normalizeGraphToken(srcRef)}`;
  }
  return null;
}

function normPathLower(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

function sdkUsageMatchesLambdaRoots(
  resolver: ResourceResolverResult,
  usageFile: string,
  lambdaLogicalId: string,
): boolean {
  const roots = resolver.lambdaCodeRoots.get(lambdaLogicalId);
  if (!roots?.length) return false;
  const uf = normPathLower(usageFile);
  return roots.some(r => {
    const root = normPathLower(r);
    return uf === root || uf.startsWith(`${root}/`);
  });
}

function graphIdFromParamResolution(
  resolver: ResourceResolverResult,
  paramName: string,
  nodes: Map<string, WorkspaceEntity>,
): string | null {
  for (const pr of resolver.paramResolutionTable) {
    if (pr.paramName !== paramName) continue;
    if (pr.confidence === 'unresolved') continue;
    const gid = resolver.logicalIdToGraphId.get(pr.resolvedLogicalId);
    if (gid && nodes.has(gid)) return gid;
  }
  return null;
}

/** When exactly one node of a graph type exists in the slice, use it to disambiguate SDK wiring. */
function singletonNodeId(nodes: Map<string, WorkspaceEntity>, graphType: string): string | null {
  const ids: string[] = [];
  for (const n of nodes.values()) {
    if (n.type === graphType) ids.push(n.id);
  }
  return ids.length === 1 ? ids[0]! : null;
}

interface SliceDiagnostic {
  level: 'warn';
  code: string;
  message: string;
  source_path?: string;
  source_ref?: string;
}

const execFileAsync = promisify(execFile);
const commitCache = new Map<string, string | null>();

async function getSourceCommitAsync(repoPath: string): Promise<string | null> {
  if (commitCache.has(repoPath)) return commitCache.get(repoPath)!;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf-8' });
    const hash = stdout.trim() || null;
    commitCache.set(repoPath, hash);
    return hash;
  } catch {
    commitCache.set(repoPath, null);
    return null;
  }
}

const SDK_TO_GRAPH_TYPE: Record<string, string> = {
  dynamodb: 'Database',
  s3: 'Bucket',
  sqs: 'Queue',
  sns: 'Topic',
};

function wireReadWriteEdges(
  resolver: ResourceResolverResult,
  nodes: Map<string, WorkspaceEntity>,
  edges: WorkspaceRelationship[],
  diagnostics: SliceDiagnostic[],
): void {
  const dedupe = new Set<string>();

  for (const usage of resolver.sdkUsages) {
    const targetGraphType = SDK_TO_GRAPH_TYPE[usage.service];
    if (!targetGraphType) continue;

    const matchingLambdas: string[] = [];
    for (const lid of resolver.logicalIdToCfnType.keys()) {
      const ct = resolver.logicalIdToCfnType.get(lid);
      if (ct !== 'AWS::Lambda::Function' && ct !== 'AWS::Serverless::Function') continue;
      if (!sdkUsageMatchesLambdaRoots(resolver, usage.file, lid)) continue;
      matchingLambdas.push(lid);
    }

    if (matchingLambdas.length === 0) {
      if (usage.hasReadOps || usage.hasWriteOps) {
        diagnostics.push({
          level: 'warn', code: 'unresolved-sdk-target',
          message: `SDK usage for ${usage.service} in ${usage.file} could not be matched to any Lambda CodeUri/layer roots`,
          source_path: usage.file,
        });
      }
      continue;
    }

    let emitted = false;
    for (const lambdaLogicalId of matchingLambdas) {
      for (const envEntry of resolver.lambdaEnvVars) {
        if (envEntry.lambdaLogicalId !== lambdaLogicalId) continue;

        const targetGid = resolver.logicalIdToGraphId.get(envEntry.refTarget);
        const lambdaGid = resolver.logicalIdToGraphId.get(envEntry.lambdaLogicalId);
        if (!targetGid || !lambdaGid) continue;
        if (!nodes.has(targetGid) || !nodes.has(lambdaGid)) continue;

        const targetNode = nodes.get(targetGid)!;
        if (targetNode.type !== targetGraphType) continue;

        if (usage.hasReadOps) {
          const k = `${lambdaGid}|${targetGid}|reads`;
          if (!dedupe.has(k)) {
            dedupe.add(k);
            edges.push({
              from: lambdaGid, to: targetGid, verb: 'reads', confidence: 'high',
              provenance: { source_path: usage.file, source_ref: `sdk:${usage.service}` },
            });
            emitted = true;
          }
        }
        if (usage.hasWriteOps) {
          const k2 = `${lambdaGid}|${targetGid}|writes`;
          if (!dedupe.has(k2)) {
            dedupe.add(k2);
            edges.push({
              from: lambdaGid, to: targetGid, verb: 'writes', confidence: 'high',
              provenance: { source_path: usage.file, source_ref: `sdk:${usage.service}` },
            });
            emitted = true;
          }
        }
      }
    }

    if (!emitted && (usage.hasReadOps || usage.hasWriteOps)) {
      const singletonId = singletonNodeId(nodes, targetGraphType);
      if (singletonId && matchingLambdas.length > 0) {
        for (const lambdaLogicalId of matchingLambdas) {
          const lambdaGid = resolver.logicalIdToGraphId.get(lambdaLogicalId);
          if (!lambdaGid || !nodes.has(lambdaGid)) continue;
          if (usage.hasReadOps) {
            const k = `${lambdaGid}|${singletonId}|reads|singleton`;
            if (!dedupe.has(k)) {
              dedupe.add(k);
              edges.push({
                from: lambdaGid, to: singletonId, verb: 'reads', confidence: 'high',
                provenance: { source_path: usage.file, source_ref: `sdk:${usage.service}:singleton` },
              });
              emitted = true;
            }
          }
          if (usage.hasWriteOps) {
            const k2 = `${lambdaGid}|${singletonId}|writes|singleton`;
            if (!dedupe.has(k2)) {
              dedupe.add(k2);
              edges.push({
                from: lambdaGid, to: singletonId, verb: 'writes', confidence: 'high',
                provenance: { source_path: usage.file, source_ref: `sdk:${usage.service}:singleton` },
              });
              emitted = true;
            }
          }
        }
      }
    }

    if (!emitted && (usage.hasReadOps || usage.hasWriteOps)) {
      diagnostics.push({
        level: 'warn', code: 'unresolved-sdk-target',
        message: `SDK usage for ${usage.service} in ${usage.file} could not be resolved to a target resource via env var bridge`,
        source_path: usage.file,
      });
    }
  }
}

function wirePublishEdges(
  resolver: ResourceResolverResult,
  nodes: Map<string, WorkspaceEntity>,
  edges: WorkspaceRelationship[],
  diagnostics: SliceDiagnostic[],
): void {
  const dedupe = new Set<string>();

  for (const usage of resolver.sdkUsages) {
    if (usage.service !== 'sqs' && usage.service !== 'sns') continue;
    const targetGraphType = usage.service === 'sqs' ? 'Queue' : 'Topic';

    const matchingLambdas: string[] = [];
    for (const lid of resolver.logicalIdToCfnType.keys()) {
      const ct = resolver.logicalIdToCfnType.get(lid);
      if (ct !== 'AWS::Lambda::Function' && ct !== 'AWS::Serverless::Function') continue;
      if (!sdkUsageMatchesLambdaRoots(resolver, usage.file, lid)) continue;
      matchingLambdas.push(lid);
    }

    if (matchingLambdas.length === 0) {
      diagnostics.push({
        level: 'warn', code: 'unresolved-sdk-publish',
        message: `SDK ${usage.service} usage in ${usage.file} could not be matched to any Lambda CodeUri/layer roots`,
        source_path: usage.file,
      });
      continue;
    }

    let emitted = false;
    for (const lambdaLogicalId of matchingLambdas) {
      for (const envEntry of resolver.lambdaEnvVars) {
        if (envEntry.lambdaLogicalId !== lambdaLogicalId) continue;

        const lambdaGid = resolver.logicalIdToGraphId.get(envEntry.lambdaLogicalId);
        const targetGid = resolver.logicalIdToGraphId.get(envEntry.refTarget);
        if (!lambdaGid || !targetGid) continue;
        if (!nodes.has(lambdaGid) || !nodes.has(targetGid)) continue;

        const targetNode = nodes.get(targetGid)!;
        if (targetNode.type !== targetGraphType) continue;

        const k = `${lambdaGid}|${targetGid}|publishes`;
        if (dedupe.has(k)) continue;
        dedupe.add(k);
        edges.push({
          from: lambdaGid, to: targetGid, verb: 'publishes', confidence: 'high',
          provenance: { source_path: usage.file, source_ref: `sdk:${usage.service}` },
        });
        emitted = true;
      }
    }

    if (!emitted) {
      diagnostics.push({
        level: 'warn', code: 'unresolved-sdk-publish',
        message: `SDK ${usage.service} in ${usage.file} had no env var ref to a ${targetGraphType}`,
        source_path: usage.file,
      });
    }
  }
}

function wireDeploysToEdges(
  resolver: ResourceResolverResult,
  nodes: Map<string, WorkspaceEntity>,
  edges: WorkspaceRelationship[],
  diagnostics: SliceDiagnostic[],
): void {
  for (const sfn of resolver.stepFunctions) {
    const smGid = resolver.logicalIdToGraphId.get(sfn.stateMachineLogicalId);
    if (!smGid || !nodes.has(smGid)) continue;

    for (const ref of sfn.lambdaRefs) {
      const lambdaGid = resolver.logicalIdToGraphId.get(ref);
      if (lambdaGid && nodes.has(lambdaGid)) {
        edges.push({
          from: smGid, to: lambdaGid, verb: 'deploys_to', confidence: 'high',
          provenance: { source_path: sfn.file, source_ref: `sfn-def:${sfn.stateMachineLogicalId}` },
        });
      } else {
        diagnostics.push({
          level: 'warn', code: 'unresolved-sfn-lambda',
          message: `StepFunctions ${sfn.stateMachineLogicalId} references ${ref} but it could not be resolved to a Lambda node`,
          source_path: sfn.file,
        });
      }
    }
  }
}

function wireConsumesEdgesFromTriggers(
  resolver: ResourceResolverResult,
  stateFiles: ParsedStateFile[],
  nodes: Map<string, WorkspaceEntity>,
  edges: WorkspaceRelationship[],
  diagnostics: SliceDiagnostic[],
): void {
  for (const sf of stateFiles) {
    const domain = String(sf.slice.domain ?? '');
    const sliceType = String(sf.slice.type ?? '');
    if (domain !== 'infrastructure' || sliceType !== 'trigger') continue;

    const { element, provenance } = sf;
    const srcFile = String(provenance?.file ?? sf.relativePath);
    const line = provenance?.line !== undefined ? String(provenance.line) : '0';
    const triggerType = String(element.triggerType ?? '');
    const lambdaId = lambdaIdFromTrigger(element);

    if (!lambdaId) continue;

    if (triggerType.includes('event_source') || triggerType === 'event_source_mapping') {
      const srcRef = typeof element.sourceRef === 'string' ? element.sourceRef : '';
      if (!srcRef) continue;

      // Prefer resolver mapping (logical id or cross-stack param name) so `to`
      // matches infrastructure node ids (which use display names when present).
      const mapped = resolver.logicalIdToGraphId.get(srcRef);
      let targetId: string | null =
        mapped && nodes.has(mapped) ? mapped : null;
      if (!targetId) {
        const sansArn = srcRef.replace(/Arn$/i, '');
        if (sansArn !== srcRef) {
          const viaArn = resolver.logicalIdToGraphId.get(sansArn);
          if (viaArn && nodes.has(viaArn)) {
            targetId = viaArn;
          }
        }
      }
      if (!targetId) {
        const qid = queueOrDbIdFromTrigger(element);
        if (qid && nodes.has(qid)) {
          targetId = qid;
        }
      }
      if (!targetId && srcRef && !isIntrinsicName(srcRef)) {
        const viaParam = graphIdFromParamResolution(resolver, srcRef, nodes);
        if (viaParam) {
          targetId = viaParam;
        }
      }
      if (!targetId) {
        const arnLower = String(element.sourceArn ?? '').toLowerCase();
        const refLower = srcRef.toLowerCase();
        if (arnLower.includes('dynamodb') || refLower.includes('dynamo') || refLower.includes('stream')) {
          const dbOnly = singletonNodeId(nodes, 'Database');
          if (dbOnly) {
            targetId = dbOnly;
          } else if (refLower.includes('stream') || arnLower.includes('stream')) {
            // When multiple Database nodes exist, prefer the one with a stream enabled.
            const streamGids = resolver.streamDatabaseLogicalIds
              .map(lid => resolver.logicalIdToGraphId.get(lid))
              .filter((gid): gid is string => !!gid && nodes.has(gid));
            if (streamGids.length === 1) {
              targetId = streamGids[0];
            }
          }
        }
      }

      if (targetId && nodes.has(targetId) && nodes.has(lambdaId)) {
        const exists = edges.some(e => e.from === lambdaId && e.to === targetId && e.verb === 'consumes');
        if (!exists) {
          edges.push({
            from: lambdaId, to: targetId, verb: 'consumes', confidence: 'high',
            provenance: { source_path: srcFile, source_ref: line },
          });
        }
      }
    }
  }
}

function wireInvokesEdges(
  resolver: ResourceResolverResult,
  nodes: Map<string, WorkspaceEntity>,
  edges: WorkspaceRelationship[],
  _diagnostics: SliceDiagnostic[],
): void {
  const lambdaCfnTypes = new Set(['AWS::Lambda::Function', 'AWS::Serverless::Function']);

  for (const envEntry of resolver.lambdaEnvVars) {
    const cfnType = resolver.logicalIdToCfnType.get(envEntry.refTarget);
    if (!cfnType || !lambdaCfnTypes.has(cfnType)) continue;

    const fromGid = resolver.logicalIdToGraphId.get(envEntry.lambdaLogicalId);
    const toGid = resolver.logicalIdToGraphId.get(envEntry.refTarget);
    if (!fromGid || !toGid) continue;
    if (!nodes.has(fromGid) || !nodes.has(toGid)) continue;
    if (fromGid === toGid) continue;

    edges.push({
      from: fromGid, to: toGid, verb: 'invokes', confidence: 'high',
      provenance: { source_path: envEntry.file, source_ref: `env:${envEntry.varName}` },
    });
  }

  for (const usage of resolver.sdkUsages) {
    if (usage.service !== 'lambda') continue;
    for (const envEntry of resolver.lambdaEnvVars) {
      const lambdaGid = resolver.logicalIdToGraphId.get(envEntry.lambdaLogicalId);
      const targetGid = resolver.logicalIdToGraphId.get(envEntry.refTarget);
      if (!lambdaGid || !targetGid) continue;
      const targetCfn = resolver.logicalIdToCfnType.get(envEntry.refTarget);
      if (!targetCfn || !lambdaCfnTypes.has(targetCfn)) continue;
      if (!nodes.has(lambdaGid) || !nodes.has(targetGid)) continue;
      if (lambdaGid === targetGid) continue;

      const exists = edges.some(e => e.from === lambdaGid && e.to === targetGid && e.verb === 'invokes');
      if (!exists) {
        edges.push({
          from: lambdaGid, to: targetGid, verb: 'invokes', confidence: 'high',
          provenance: { source_path: usage.file, source_ref: `sdk:lambda.invoke` },
        });
      }
    }
  }
}

export interface ParsedStateFile {
  filePath: string;
  relativePath: string;
  doc: Record<string, unknown>;
  slice: Record<string, unknown>;
  element: Record<string, unknown>;
  provenance: Record<string, unknown> | undefined;
}

export async function loadRepoState(stateDir: string): Promise<ParsedStateFile[]> {
  const files = await globby('**/*.yaml', { cwd: stateDir, onlyFiles: true, absolute: true });
  const results = await Promise.all(files.map(file => ioLimiter(async () => {
    try {
      const text = await fs.readFile(file, 'utf-8');
      const doc = yaml.load(text) as Record<string, unknown>;
      if (!doc || typeof doc !== 'object') return null;
      const slice = doc._slice as Record<string, unknown> | undefined;
      const element = doc.element as Record<string, unknown> | undefined;
      if (!slice || !element) return null;
      return {
        filePath: file,
        relativePath: path.relative(stateDir, file).split(path.sep).join('/'),
        doc,
        slice,
        element,
        provenance: doc.provenance as Record<string, unknown> | undefined,
      };
    } catch { return null; }
  })));
  return results
    .filter((r): r is ParsedStateFile => r !== null)
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
}

/**
 * Emit a workspace graph slice YAML file from RECON state under {@code stateDir}.
 */
export async function emitWorkspaceSlice(
  repoName: string,
  stateDir: string,
  outputPath: string,
  _repoPath: string,
): Promise<SliceEmitResult> {
  const stateFiles = await loadRepoState(stateDir);
  const nodes = new Map<string, WorkspaceEntity>();
  const edges: WorkspaceRelationship[] = [];
  const diagnostics: SliceDiagnostic[] = [];

  const serviceId = `Service:${normalizeGraphToken(repoName)}`;
  nodes.set(serviceId, {
    id: serviceId,
    type: 'Service',
    name: repoName,
    provenance: { source_path: '.', source_ref: 'workspace', repo: repoName },
  });

  for (const sf of stateFiles) {
    const { slice, element, provenance } = sf;
    const domain = String(slice.domain ?? '');
    const sliceType = String(slice.type ?? '');
    const srcFile = String(provenance?.file ?? sf.relativePath);
    const line = provenance?.line !== undefined ? String(provenance.line) : '0';

    if (domain === 'infrastructure' && sliceType === 'resource') {
      const cfnType = String(element.type ?? '');
      const gid = resourceGraphId(cfnType, element);
      if (gid) {
        nodes.set(gid, {
          id: gid,
          type: CFN_TO_GRAPH[cfnType]!,
          name: gid.split(':').slice(1).join(':'),
          provenance: { source_path: srcFile, source_ref: String(element.logicalId ?? ''), repo: repoName },
          attributes: { cfn_type: cfnType, logical_id: element.logicalId },
        });
      }
    }

    if (domain === 'api' && sliceType === 'endpoint') {
      const eid = endpointGraphId(repoName, element);
      if (eid) {
        nodes.set(eid, {
          id: eid,
          type: 'Endpoint',
          name: eid,
          provenance: {
            source_path: srcFile,
            source_ref: `${String(element.method ?? '')} ${String(element.path ?? '')}`.trim(),
            repo: repoName,
          },
          attributes: {
            method: element.method,
            path: element.path,
          },
        });
        edges.push({
          from: serviceId,
          to: eid,
          verb: 'has_contract',
          confidence: 'high',
          provenance: { source_path: srcFile, source_ref: line },
        });
      }
    }

    if (domain === 'data' && sliceType === 'schema') {
      const sid = schemaGraphId(repoName, element);
      if (sid) {
        nodes.set(sid, {
          id: sid,
          type: 'Schema',
          name: sid,
          provenance: { source_path: srcFile, source_ref: String(element.entity ?? 'schema'), repo: repoName },
          attributes: { schema_id: element.schemaId, entity: element.entity },
        });
      }
    }

    if (domain === 'infrastructure' && sliceType === 'trigger') {
      const lambdaId = lambdaIdFromTrigger(element);
      // SQS/SNS/Dynamo event_source_mapping consumes edges are emitted in
      // wireConsumesEdgesFromTriggers (after resolver + param bridge) so
      // targets resolve to the same graph IDs as infrastructure nodes.

      const samEventType = String(element.samEventType ?? '');
      if (samEventType === 'S3' || samEventType === 's3_event') {
        const srcRef = element.sourceRef as string | undefined;
        if (lambdaId && srcRef && !isIntrinsicName(srcRef)) {
          const bucketGid = `Bucket:${normalizeGraphToken(srcRef)}`;
          if (nodes.has(bucketGid)) {
            edges.push({
              from: lambdaId, to: bucketGid, verb: 'consumes', confidence: 'high',
              provenance: { source_path: srcFile, source_ref: `sam:${samEventType}` },
            });
          }
        }
      }
    }
  }

  // NS-4: Compute topology once per repo (R7), pass to resolver
  const { topology } = await buildStackTopology(stateFiles, stateDir, _repoPath || undefined);
  const resolver = await buildResourceResolverFromState(stateFiles, stateDir, topology, _repoPath || undefined);

  wireReadWriteEdges(resolver, nodes, edges, diagnostics);
  wirePublishEdges(resolver, nodes, edges, diagnostics);
  wireDeploysToEdges(resolver, nodes, edges, diagnostics);
  wireInvokesEdges(resolver, nodes, edges, diagnostics);
  wireConsumesEdgesFromTriggers(resolver, stateFiles, nodes, edges, diagnostics);

  const body = {
    schema_version: '1.0',
    repo: repoName,
    generated_by: `${pkg.name}@${pkg.version}`,
    generated_at: new Date().toISOString(),
    source_commit: await getSourceCommitAsync(_repoPath),
    nodes: [...nodes.values()],
    edges,
    diagnostics,
  };
  const yamlOut = yaml.dump(body, { lineWidth: 120, noRefs: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, yamlOut, 'utf-8');
  const contentHash = `sha256:${crypto.createHash('sha256').update(yamlOut, 'utf-8').digest('hex')}`;
  return {
    nodeCount: nodes.size,
    edgeCount: edges.length,
    contentHash,
  };
}
