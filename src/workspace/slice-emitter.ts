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
import { atomicWriteFile } from '../utils/atomic-write.js';
import { buildResourceResolverFromState, type ResourceResolverResult } from './resource-resolver.js';
import { buildStackTopology } from './cfn-stack-resolver.js';
import type { ExternalSystemEntry } from './manifest.js';
import { getCfnGraphType, NODE_NAME_KEYS, AUXILIARY_NODE_TYPES } from './cfn-type-mapping.js';
import { entityUri, workspaceUri } from './source-uri.js';
import { computeFileHash } from './source-locator-registry.js';
import { enforces_invariant, implements_adr } from '../architecture/intent-decorators.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { name: string; version: string };

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
  entity_uri?: string;
  source_uri?: string;
  source_hash?: string;
  source_locator_ref?: string;
  canonical?: boolean;
  authority?: string;
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

function resourceGraphId(cfnType: string, el: Record<string, unknown>, repoName?: string): string {
  const graphType = getCfnGraphType(cfnType);
  const logicalId = String(el.logicalId ?? '');

  const nameKeys = NODE_NAME_KEYS[graphType];
  const name = nameKeys
    ? pickCfnDisplayName(el, logicalId, ...nameKeys)
    : pickCfnDisplayName(el, logicalId);

  const displayName = name ?? logicalId;
  const norm = normalizeGraphToken(displayName);
  const finalNorm = norm || normalizeGraphToken(logicalId) || 'unknown';
  const repoPrefix = repoName ? `${normalizeGraphToken(repoName)}:` : '';
  return `${graphType}:${repoPrefix}${finalNorm}`;
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
  const repo = normalizeGraphToken(repoName);
  const schemaId = el.schemaId;
  if (typeof schemaId === 'string' && schemaId.trim().length > 0 && !isIntrinsicName(schemaId)) {
    return `Schema:${repo}:${normalizeGraphToken(schemaId)}`;
  }
  const entity = el.entity;
  if (typeof entity === 'string' && entity.trim().length > 0) {
    return `Schema:${repo}:${normalizeGraphToken(entity)}`;
  }
  const name = el.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return `Schema:${repo}:${normalizeGraphToken(name)}`;
  }
  return null;
}

function lambdaIdFromTrigger(el: Record<string, unknown>, repoName?: string): string | null {
  // NS-5: Prefer targetRef (clean logical ID) over targetFunction
  // which may contain intrinsics like !GetAtt
  const fn =
    (typeof el.targetRef === 'string' && !isIntrinsicName(el.targetRef) && el.targetRef) ||
    (typeof el.targetFunction === 'string' && !isIntrinsicName(el.targetFunction) && el.targetFunction) ||
    '';
  if (!fn) {
    return null;
  }
  const repoPrefix = repoName ? `${normalizeGraphToken(repoName)}:` : '';
  return `Lambda:${repoPrefix}${normalizeGraphToken(fn)}`;
}

function queueOrDbIdFromTrigger(el: Record<string, unknown>, repoName?: string): string | null {
  const srcRef = typeof el.sourceRef === 'string' ? el.sourceRef : '';
  const srcArn = typeof el.sourceArn === 'string' ? el.sourceArn : '';
  const st = String(el.sourceType ?? '');
  if (!srcRef || isIntrinsicName(srcRef)) {
    return null;
  }
  const repoPrefix = repoName ? `${normalizeGraphToken(repoName)}:` : '';
  if (st.toLowerCase().includes('sqs') || srcArn.toLowerCase().includes('sqs')) {
    return `Queue:${repoPrefix}${normalizeGraphToken(srcRef)}`;
  }
  if (st.toLowerCase().includes('dynamo') || srcArn.toLowerCase().includes('dynamodb')) {
    return `Database:${repoPrefix}${normalizeGraphToken(srcRef)}`;
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

async function enrichNodeSourceLocators(
  nodes: Map<string, WorkspaceEntity>,
  repoName: string,
  repoPath: string,
): Promise<void> {
  const hashCache = new Map<string, string | undefined>();
  for (const node of nodes.values()) {
    node.entity_uri = entityUri(node.id);
    node.source_locator_ref = node.entity_uri;
    node.canonical = true;
    node.authority = repoName;

    const sourcePath = node.provenance.source_path;
    if (!sourcePath || sourcePath === '.') continue;
    try {
      node.source_uri = workspaceUri(repoName, sourcePath);
    } catch {
      continue;
    }
    const abs = path.resolve(repoPath, sourcePath);
    if (!hashCache.has(abs)) {
      hashCache.set(abs, await computeFileHash(abs));
    }
    const hash = hashCache.get(abs);
    if (hash) {
      node.source_hash = hash;
    }
  }
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
  repoName?: string,
): void {
  for (const sf of stateFiles) {
    const domain = String(sf.slice.domain ?? '');
    const sliceType = String(sf.slice.type ?? '');
    if (domain !== 'infrastructure' || sliceType !== 'trigger') continue;

    const { element, provenance } = sf;
    const srcFile = String(provenance?.file ?? sf.relativePath);
    const line = provenance?.line !== undefined ? String(provenance.line) : '0';
    const triggerType = String(element.triggerType ?? '');
    const lambdaId = lambdaIdFromTrigger(element, repoName);

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
        const qid = queueOrDbIdFromTrigger(element, repoName);
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

function wireExternalSystemEdges(
  externalSystems: ExternalSystemEntry[],
  resolver: ResourceResolverResult,
  nodes: Map<string, WorkspaceEntity>,
  edges: WorkspaceRelationship[],
  diagnostics: SliceDiagnostic[],
  repoName: string,
): void {
  if (externalSystems.length === 0) return;

  for (const ext of externalSystems) {
    const extId = `ExternalSystem:${normalizeGraphToken(ext.key)}`;
    if (!nodes.has(extId)) {
      nodes.set(extId, {
        id: extId,
        type: 'ExternalSystem',
        name: ext.name,
        provenance: { source_path: 'workspace.yaml', source_ref: `external_systems.${ext.key}`, repo: repoName },
        attributes: { kind: ext.kind, key: ext.key },
      });
    }
  }

  const lambdaCfnTypes = new Set(['AWS::Lambda::Function', 'AWS::Serverless::Function']);
  for (const [logicalId, cfnType] of resolver.logicalIdToCfnType) {
    if (!lambdaCfnTypes.has(cfnType)) continue;
    const lambdaGid = resolver.logicalIdToGraphId.get(logicalId);
    if (!lambdaGid || !nodes.has(lambdaGid)) continue;

    for (const envEntry of resolver.lambdaEnvVars) {
      if (envEntry.lambdaLogicalId !== logicalId) continue;
      const varNameLower = envEntry.varName.toLowerCase();
      const refLower = (envEntry.refTarget ?? '').toLowerCase();

      for (const ext of externalSystems) {
        const keyLower = ext.key.toLowerCase();
        const extId = `ExternalSystem:${normalizeGraphToken(ext.key)}`;
        const keyInVar = varNameLower.includes(keyLower) || refLower.includes(keyLower);
        const urlMatch = ext.url_patterns?.some(p => refLower.includes(p.toLowerCase()));
        if (keyInVar || urlMatch) {
          const exists = edges.some(e => e.from === lambdaGid && e.to === extId && e.verb === 'invokes');
          if (!exists) {
            edges.push({
              from: lambdaGid, to: extId, verb: 'invokes', confidence: 'high',
              provenance: { source_path: envEntry.file, source_ref: `env:${envEntry.varName}→${ext.key}` },
            });
          }
          } else {
          const lambdaName = (nodes.get(lambdaGid)?.name ?? '').toLowerCase();
          if (lambdaName.includes(keyLower)) {
            const exists = edges.some(e => e.from === lambdaGid && e.to === extId && e.verb === 'invokes');
            if (!exists) {
              diagnostics.push({
                level: 'warn',
                code: 'ambiguous-external-system-match',
                message: `Lambda ${lambdaGid} name contains '${ext.key}' but no env var match; edge not emitted`,
                source_path: envEntry.file,
              });
            }
          }
        }
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
    .filter((r: ParsedStateFile | null): r is ParsedStateFile => r !== null)
    .sort((a: ParsedStateFile, b: ParsedStateFile) => a.filePath.localeCompare(b.filePath));
}

/**
 * Emit a workspace graph slice YAML file from RECON state under {@code stateDir}.
 */
export const emitWorkspaceSlice: (
  repoName: string,
  stateDir: string,
  outputPath: string,
  _repoPath: string,
  externalSystems?: ExternalSystemEntry[],
) => Promise<SliceEmitResult> = implements_adr(
  'ADR-L-0016',
)(enforces_invariant('INV-0017', 'INV-0025')(async function emitWorkspaceSlice(
  repoName: string,
  stateDir: string,
  outputPath: string,
  _repoPath: string,
  externalSystems?: ExternalSystemEntry[],
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
      if (cfnType) {
        const gid = resourceGraphId(cfnType, element, repoName);
        const graphType = getCfnGraphType(cfnType);
        const attrs: Record<string, unknown> = { cfn_type: cfnType, logical_id: element.logicalId };
        if (AUXILIARY_NODE_TYPES.has(graphType)) {
          attrs.auxiliary = true;
        }
        nodes.set(gid, {
          id: gid,
          type: graphType,
          name: gid.split(':').slice(1).join(':'),
          provenance: { source_path: srcFile, source_ref: String(element.logicalId ?? ''), repo: repoName },
          attributes: attrs,
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
      const lambdaId = lambdaIdFromTrigger(element, repoName);
      // SQS/SNS/Dynamo event_source_mapping consumes edges are emitted in
      // wireConsumesEdgesFromTriggers (after resolver + param bridge) so
      // targets resolve to the same graph IDs as infrastructure nodes.

      const samEventType = String(element.samEventType ?? '');
      if (samEventType === 'S3' || samEventType === 's3_event') {
        const srcRef = element.sourceRef as string | undefined;
        if (lambdaId && srcRef && !isIntrinsicName(srcRef)) {
          const bucketGid = `Bucket:${normalizeGraphToken(repoName)}:${normalizeGraphToken(srcRef)}`;
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
  const resolver = await buildResourceResolverFromState(stateFiles, stateDir, topology, _repoPath || undefined, repoName);

  // Emit Stack nodes from infrastructure/template slices
  for (const sf of stateFiles) {
    const domain = String(sf.slice.domain ?? '');
    const sliceType = String(sf.slice.type ?? '');
    if (domain !== 'infrastructure' || sliceType !== 'template') continue;

    const templatePath = String(sf.element.templatePath ?? sf.provenance?.file ?? sf.relativePath);
    const templateName = templatePath.split('/').pop()?.replace(/\.(yaml|yml|json|template)$/i, '') ?? 'unknown';
    const stackNorm = normalizeGraphToken(templateName);
    if (!stackNorm) continue;

    const repoPrefix = repoName ? `${normalizeGraphToken(repoName)}:` : '';
    const stackGid = `Stack:${repoPrefix}${stackNorm}`;
    if (!nodes.has(stackGid)) {
      nodes.set(stackGid, {
        id: stackGid,
        type: 'Stack',
        name: templateName,
        provenance: { source_path: templatePath, source_ref: 'template', repo: repoName },
        attributes: { template_path: templatePath },
      });
    }
  }

  // Emit contains edges from stack topology (stackId = parentTemplatePath#logicalId)
  if (topology) {
    const repoPrefix = repoName ? `${normalizeGraphToken(repoName)}:` : '';
    for (const [_stackId, child] of Object.entries(topology.children)) {
      const parentTemplatePath = _stackId.split('#')[0] ?? '';
      const parentTemplateName = parentTemplatePath.split('/').pop()?.replace(/\.(yaml|yml|json|template)$/i, '') ?? '';
      const parentNorm = normalizeGraphToken(parentTemplateName);
      if (!parentNorm) continue;
      const parentStackGid = `Stack:${repoPrefix}${parentNorm}`;

      const childTemplateName = child.templatePath.split('/').pop()?.replace(/\.(yaml|yml|json|template)$/i, '') ?? child.logicalId;
      const childNorm = normalizeGraphToken(childTemplateName);
      if (!childNorm) continue;
      const childStackGid = `Stack:${repoPrefix}${childNorm}`;

      if (nodes.has(parentStackGid) && nodes.has(childStackGid) && parentStackGid !== childStackGid) {
        const exists = edges.some(e => e.from === parentStackGid && e.to === childStackGid && e.verb === 'contains');
        if (!exists) {
          edges.push({
            from: parentStackGid,
            to: childStackGid,
            verb: 'contains',
            confidence: 'high',
            provenance: { source_path: parentTemplatePath, source_ref: `nested:${child.logicalId}` },
          });
        }
      }
    }
  }

  wireReadWriteEdges(resolver, nodes, edges, diagnostics);
  wirePublishEdges(resolver, nodes, edges, diagnostics);
  wireDeploysToEdges(resolver, nodes, edges, diagnostics);
  wireInvokesEdges(resolver, nodes, edges, diagnostics);
  wireConsumesEdgesFromTriggers(resolver, stateFiles, nodes, edges, diagnostics, repoName);
  if (externalSystems && externalSystems.length > 0) {
    wireExternalSystemEdges(externalSystems, resolver, nodes, edges, diagnostics, repoName);
  }

  await enrichNodeSourceLocators(nodes, repoName, _repoPath);

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
  await atomicWriteFile(outputPath, yamlOut);
  const contentHash = `sha256:${crypto.createHash('sha256').update(yamlOut, 'utf-8').digest('hex')}`;
  return {
    nodeCount: nodes.size,
    edgeCount: edges.length,
    contentHash,
  };
}));
