/**
 * Build cross-domain join maps from per-repo RECON state.
 * All maps keyed by structural type, never by repository name (INV-0015).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { globby } from 'globby';
import type { ParsedStateFile } from './slice-emitter.js';
import {
  buildOutputIndex,
  buildParamResolutionTable,
  type StackTopology,
  type ParamResolution,
  type UnresolvedResolution,
} from './cfn-stack-resolver.js';
import { getCfnGraphType, NODE_NAME_KEYS } from './cfn-type-mapping.js';

const SDK_SERVICE_TO_GRAPH_TYPE: Record<string, string> = {
  dynamodb: 'Database',
  s3: 'Bucket',
  sqs: 'Queue',
  sns: 'Topic',
  lambda: 'Lambda',
  stepfunctions: 'StateMachine',
  sfn: 'StateMachine',
};

export interface EnvVarRef {
  varName: string;
  logicalId: string;
  cfnType: string;
  file: string;
}

export interface SdkUsageEntry {
  file: string;
  service: string;
  hasReadOps: boolean;
  hasWriteOps: boolean;
  graphType: string | null;
}

export interface LambdaEnvVar {
  lambdaLogicalId: string;
  varName: string;
  refTarget: string;
  file: string;
}

export interface StepFunctionDef {
  stateMachineLogicalId: string;
  lambdaRefs: string[];
  file: string;
}

export interface ResourceResolverResult {
  envVarToResource: Map<string, EnvVarRef>;
  lambdaEnvVars: LambdaEnvVar[];
  sdkUsages: SdkUsageEntry[];
  stepFunctions: StepFunctionDef[];
  logicalIdToGraphId: Map<string, string>;
  logicalIdToCfnType: Map<string, string>;
  paramResolutionTable: ParamResolution[];
  unresolvedResolutions: UnresolvedResolution[];
  topology: StackTopology | null;
  /** Lambda logical ID → directory prefixes (POSIX) for CodeUri + layer ContentUri roots. */
  lambdaCodeRoots: Map<string, string[]>;
  /** Logical IDs of DynamoDB tables that have StreamSpecification enabled (hasStream: true). */
  streamDatabaseLogicalIds: string[];
}

function normalizeToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Match slice-emitter `isIntrinsicName` so graph IDs align with infrastructure nodes. */
function isIntrinsicEl(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return true;
  const v = value.trim();
  if (v.length === 0) return true;
  return /\b(Ref|Fn::|GetAtt|Sub|Join|Select|If|ImportValue)\b/.test(v) || v.startsWith('{');
}

/**
 * Same naming rule as slice-emitter `resourceGraphId`: prefer plain string
 * physical names; when those are intrinsics, fall back to logical ID.
 * Uses the shared NODE_NAME_KEYS for generic resolution across all types.
 */
function displayNameForGraphId(cfnType: string, el: Record<string, unknown>, logicalId: string): string {
  const graphType = getCfnGraphType(cfnType);
  const nameKeys = NODE_NAME_KEYS[graphType];
  if (nameKeys) {
    for (const key of nameKeys) {
      const v = el[key];
      if (typeof v === 'string' && !isIntrinsicEl(v)) return v;
    }
  }
  return logicalId;
}


function extractRefTarget(value: unknown): string | null {
  if (typeof value === 'string') {
    const s = value.trim();
    const refMatch = s.match(/^!Ref\s+(\S+)/);
    if (refMatch) return refMatch[1];
    if (s.startsWith('!If')) {
      try {
        const arr = JSON.parse(s.replace(/^!If\s+/, '')) as unknown[];
        if (Array.isArray(arr) && arr.length >= 3) {
          const t = extractRefTarget(arr[1]);
          const f = extractRefTarget(arr[2]);
          if (t && !f) return t;
          if (f && !t) return f;
          if (t && t === f) return t;
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.Ref === 'string') return obj.Ref;
    if (obj['Fn::GetAtt'] && Array.isArray(obj['Fn::GetAtt'])) {
      return String(obj['Fn::GetAtt'][0]);
    }
    if (obj['Fn::GetAtt'] && typeof obj['Fn::GetAtt'] === 'string') {
      return String(obj['Fn::GetAtt']).split('.')[0];
    }
    if (obj['Fn::If'] && Array.isArray(obj['Fn::If']) && obj['Fn::If'].length >= 3) {
      const branches = obj['Fn::If'] as unknown[];
      const t = extractRefTarget(branches[1]);
      const f = extractRefTarget(branches[2]);
      if (t && !f) return t;
      if (f && !t) return f;
      if (t && t === f) return t;
    }
    if (obj['Fn::Sub'] && Array.isArray(obj['Fn::Sub']) && obj['Fn::Sub'].length >= 2) {
      const vars = obj['Fn::Sub'][1];
      if (vars && typeof vars === 'object' && !Array.isArray(vars)) {
        for (const v of Object.values(vars as Record<string, unknown>)) {
          const inner = extractRefTarget(v);
          if (inner) return inner;
        }
      }
    }
  }
  return null;
}

function posixDirOf(filePath: string): string {
  const n = filePath.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(0, i) : '.';
}

function stripLeadingRelPath(s: string): string {
  return s.replace(/^\.?\//, '').replace(/\/+$/, '');
}

function collectLayerRefIds(layers: unknown): string[] {
  const ids: string[] = [];
  const pushRef = (v: unknown): void => {
    if (!v) return;
    if (typeof v === 'string') {
      const m = v.match(/^!Ref\s+(\S+)/);
      if (m) ids.push(m[1]);
      return;
    }
    if (typeof v === 'object' && v !== null && 'Ref' in v && typeof (v as { Ref: string }).Ref === 'string') {
      ids.push((v as { Ref: string }).Ref);
    }
  };
  if (Array.isArray(layers)) {
    for (const item of layers) pushRef(item);
  } else {
    pushRef(layers);
  }
  return ids;
}

function collectLambdaCodePathPrefixes(
  el: Record<string, unknown>,
  templateFile: string,
  layerContentRoots: Map<string, string>,
): string[] {
  const roots: string[] = [];
  const tplDir = posixDirOf(templateFile);
  const codeUriRaw = el.codeUri ?? el.CodeUri;
  if (typeof codeUriRaw === 'string' && !isIntrinsicEl(codeUriRaw)) {
    const rel = stripLeadingRelPath(codeUriRaw);
    const joined = `${tplDir}/${rel}`.replace(/\/+/g, '/');
    const fullRoot = path.posix.normalize(joined);
    roots.push(fullRoot);
    const parentOfCodeUri = posixDirOf(fullRoot);
    if (parentOfCodeUri !== tplDir && parentOfCodeUri !== '.') {
      roots.push(parentOfCodeUri);
    }
  } else {
    roots.push(tplDir);
  }
  const layersVal = el.layers ?? el.Layers
    ?? (el.properties as Record<string, unknown> | undefined)?.Layers;
  for (const lid of collectLayerRefIds(layersVal)) {
    const lr = layerContentRoots.get(lid);
    if (lr) roots.push(lr.replace(/\\/g, '/'));
  }
  return [...new Set(roots)];
}

const LAMBDA_ARN_RE = /arn:aws:lambda:[^:]*:[^:]*:function:([a-zA-Z0-9_-]+)/;
const STATES_LAMBDA_RE = /arn:aws:states:[^:]*:[^:]*:lambda:invoke/;
const FN_SUB_VAR_RE = /\$\{([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z]+)?)\}/g;

function extractFnSubRefs(subValue: unknown, results: string[]): void {
  if (typeof subValue === 'string') {
    let m: RegExpExecArray | null;
    while ((m = FN_SUB_VAR_RE.exec(subValue)) !== null) {
      const ref = m[1];
      const dotIdx = ref.indexOf('.');
      results.push(dotIdx >= 0 ? ref.slice(0, dotIdx) : ref);
    }
    const arnMatch = subValue.match(LAMBDA_ARN_RE);
    if (arnMatch) results.push(arnMatch[1]);
  } else if (Array.isArray(subValue) && subValue.length === 2) {
    if (typeof subValue[0] === 'string') {
      extractFnSubRefs(subValue[0], results);
    }
    if (subValue[1] && typeof subValue[1] === 'object') {
      for (const val of Object.values(subValue[1] as Record<string, unknown>)) {
        if (typeof val === 'string') {
          const arnMatch = val.match(LAMBDA_ARN_RE);
          if (arnMatch) results.push(arnMatch[1]);
        } else if (val && typeof val === 'object') {
          extractLambdaArns(val, results);
        }
      }
    }
  }
}

function extractLambdaArns(body: unknown, results: string[]): void {
  if (!body || typeof body !== 'object') return;
  if (Array.isArray(body)) {
    for (const item of body) extractLambdaArns(item, results);
    return;
  }
  const obj = body as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'Ref' && typeof val === 'string') {
      results.push(val);
    } else if (key === 'Fn::GetAtt' && Array.isArray(val)) {
      results.push(String(val[0]));
    } else if (key === 'Fn::Sub') {
      extractFnSubRefs(val, results);
    } else if (typeof val === 'string') {
      const arnMatch = val.match(LAMBDA_ARN_RE);
      if (arnMatch) {
        results.push(arnMatch[1]);
      }
      if (key === 'Resource' && STATES_LAMBDA_RE.test(val)) {
        const parent = obj.Parameters as Record<string, unknown> | undefined;
        if (parent?.FunctionName && typeof parent.FunctionName === 'string') {
          const fnMatch = parent.FunctionName.match(LAMBDA_ARN_RE);
          if (fnMatch) results.push(fnMatch[1]);
        }
      }
      if (key === 'Resource' && FN_SUB_VAR_RE.test(val)) {
        FN_SUB_VAR_RE.lastIndex = 0;
        let sm: RegExpExecArray | null;
        while ((sm = FN_SUB_VAR_RE.exec(val)) !== null) {
          const ref = sm[1];
          const dotIdx = ref.indexOf('.');
          results.push(dotIdx >= 0 ? ref.slice(0, dotIdx) : ref);
        }
      }
    } else {
      extractLambdaArns(val, results);
    }
  }
}

/**
 * Parse a standalone ASL definition (from .asl.json or DefinitionString) and
 * extract all Lambda function references (ARN patterns + intrinsics).
 */
export function extractLambdaRefsFromAsl(aslBody: unknown): string[] {
  const refs: string[] = [];
  extractLambdaArns(aslBody, refs);
  return [...new Set(refs)];
}

export async function buildResourceResolverFromState(
  stateFiles: ParsedStateFile[],
  stateDir: string,
  topology?: StackTopology,
  repoPath?: string,
  repoName?: string,
): Promise<ResourceResolverResult> {
  const envVarToResource = new Map<string, EnvVarRef>();
  const lambdaEnvVars: LambdaEnvVar[] = [];
  const sdkUsages: SdkUsageEntry[] = [];
  const stepFunctions: StepFunctionDef[] = [];
  const logicalIdToGraphId = new Map<string, string>();
  const logicalIdToCfnType = new Map<string, string>();
  const layerContentRoots = new Map<string, string>();
  const pendingAslReads: Array<{
    logicalId: string;
    srcFile: string;
    defUri: string;
    substitutions?: Record<string, unknown>;
  }> = [];

  for (const sf of stateFiles) {
    const { slice, element, provenance } = sf;
    const domain = String(slice.domain ?? '');
    const sliceType = String(slice.type ?? '');
    const srcFile = String(provenance?.file ?? sf.relativePath);

    if (domain === 'infrastructure' && sliceType === 'resource') {
      const cfnType = String(element.type ?? '');
      const logicalId = String(element.logicalId ?? '');
      const graphType = getCfnGraphType(cfnType);

      if (logicalId) {
        logicalIdToCfnType.set(logicalId, cfnType);
      }

      if (cfnType === 'AWS::Serverless::LayerVersion' || cfnType === 'AWS::Lambda::LayerVersion') {
        const el = element as Record<string, unknown>;
        const cu = el.contentUri ?? el.ContentUri;
        if (typeof cu === 'string' && !isIntrinsicEl(cu) && logicalId) {
          const rel = stripLeadingRelPath(cu);
          const root = path.posix.normalize(`${posixDirOf(srcFile)}/${rel}`.replace(/\/+/g, '/'));
          layerContentRoots.set(logicalId, root);
        }
      }

      if (logicalId && cfnType) {
        const el = element as Record<string, unknown>;
        const name = displayNameForGraphId(cfnType, el, logicalId);
        const norm = normalizeToken(name);
        const finalNorm = norm || normalizeToken(logicalId) || 'unknown';
        const repoPrefix = repoName ? `${normalizeToken(repoName)}:` : '';
        logicalIdToGraphId.set(logicalId, `${graphType}:${repoPrefix}${finalNorm}`);
      }

      if (cfnType === 'AWS::Lambda::Function' || cfnType === 'AWS::Serverless::Function') {
        const props = element.properties as Record<string, unknown> | undefined;
        const envBlock = props?.Environment as Record<string, unknown> | undefined;
        const envVars = envBlock?.Variables as Record<string, unknown> | undefined
          ?? (element as Record<string, unknown>).environment as Record<string, unknown> | undefined
          ?? (element as Record<string, unknown>).environmentVariables as Record<string, unknown> | undefined
          ?? (props?.environment as Record<string, unknown> | undefined)?.Variables as Record<string, unknown> | undefined;
        if (envVars && typeof envVars === 'object') {
          for (const [varName, varValue] of Object.entries(envVars)) {
            const refTarget = extractRefTarget(varValue);
            if (refTarget) {
              lambdaEnvVars.push({ lambdaLogicalId: logicalId, varName, refTarget, file: srcFile });
            }
          }
        }
      }

      if (cfnType === 'AWS::StepFunctions::StateMachine' || cfnType === 'AWS::Serverless::StateMachine') {
        const refs: string[] = [];

        const defBody = element.definitionBody ?? element.definition;
        if (defBody && typeof defBody === 'object') {
          extractLambdaArns(defBody, refs);
        }

        const defUri = element.definitionUri as string | undefined;
        if (typeof defUri === 'string' && /\.(json|yaml|yml)$/i.test(defUri)) {
          const defSubs = element.definitionSubstitutions as Record<string, unknown> | undefined;
          pendingAslReads.push({ logicalId, srcFile, defUri, substitutions: defSubs });
        }

        const unique = [...new Set(refs)];
        if (unique.length > 0) {
          stepFunctions.push({ stateMachineLogicalId: logicalId, lambdaRefs: unique, file: srcFile });
        }
      }
    }

    if (domain === 'behavior' && sliceType === 'aws_sdk_usage') {
      const services = element.services as string[] | undefined;
      const hasRead = Boolean(element.hasReadOperations);
      const hasWrite = Boolean(element.hasWriteOperations);
      if (services && Array.isArray(services)) {
        for (const svc of services) {
          const svcLower = svc.toLowerCase();
          sdkUsages.push({
            file: srcFile,
            service: svcLower,
            hasReadOps: hasRead,
            hasWriteOps: hasWrite,
            graphType: SDK_SERVICE_TO_GRAPH_TYPE[svcLower] ?? null,
          });
        }
      }
    }
  }

  const streamDatabaseLogicalIds: string[] = [];
  for (const sf of stateFiles) {
    const domain = String(sf.slice.domain ?? '');
    const sliceType = String(sf.slice.type ?? '');
    if (domain !== 'infrastructure' || sliceType !== 'resource') continue;
    const cfnType = String(sf.element.type ?? '');
    if (cfnType !== 'AWS::DynamoDB::Table') continue;
    const logicalId = String(sf.element.logicalId ?? '');
    if (!logicalId) continue;
    if ((sf.element as Record<string, unknown>).hasStream === true) {
      streamDatabaseLogicalIds.push(logicalId);
    }
  }

  const lambdaCodeRoots = new Map<string, string[]>();
  for (const sf of stateFiles) {
    const domain = String(sf.slice.domain ?? '');
    const sliceType = String(sf.slice.type ?? '');
    if (domain !== 'infrastructure' || sliceType !== 'resource') continue;
    const cfnType = String(sf.element.type ?? '');
    if (cfnType !== 'AWS::Lambda::Function' && cfnType !== 'AWS::Serverless::Function') continue;
    const logicalId = String(sf.element.logicalId ?? '');
    if (!logicalId) continue;
    const srcFile = String(sf.provenance?.file ?? sf.relativePath);
    const prefixes = collectLambdaCodePathPrefixes(sf.element as Record<string, unknown>, srcFile, layerContentRoots);
    if (prefixes.length > 0) {
      const existing = lambdaCodeRoots.get(logicalId);
      if (existing) {
        const merged = new Set([...existing, ...prefixes]);
        lambdaCodeRoots.set(logicalId, [...merged]);
      } else {
        lambdaCodeRoots.set(logicalId, prefixes);
      }
    }
  }

  for (const pending of pendingAslReads) {
    const refs: string[] = [];
    const templateDir = path.dirname(pending.srcFile);
    const candidates: string[] = [];
    if (repoPath) {
      candidates.push(path.resolve(repoPath, templateDir, pending.defUri));
    }
    candidates.push(
      path.resolve(stateDir, '..', pending.defUri),
      path.resolve(stateDir, '..', templateDir, pending.defUri),
    );
    const isYamlUri = /\.(yaml|yml)$/i.test(pending.defUri);
    for (const candidate of candidates) {
      try {
        const aslText = await fs.readFile(candidate, 'utf-8');
        const aslDoc = isYamlUri
          ? yaml.load(aslText) as unknown
          : JSON.parse(aslText);
        if (aslDoc && typeof aslDoc === 'object') {
          extractLambdaArns(aslDoc, refs);
        }
        break;
      } catch { /* file not found or invalid content */ }
    }
    if (refs.length > 0 && pending.substitutions) {
      const subMap = new Map<string, string>();
      for (const [varName, varValue] of Object.entries(pending.substitutions)) {
        const refTarget = extractRefTarget(varValue);
        if (refTarget) subMap.set(varName, refTarget);
      }
      for (let i = 0; i < refs.length; i++) {
        const mapped = subMap.get(refs[i]);
        if (mapped) refs[i] = mapped;
      }
    }
    const unique = [...new Set(refs)];
    if (unique.length > 0) {
      const existing = stepFunctions.find(sf => sf.stateMachineLogicalId === pending.logicalId);
      if (existing) {
        const merged = new Set([...existing.lambdaRefs, ...unique]);
        existing.lambdaRefs = [...merged];
      } else {
        stepFunctions.push({ stateMachineLogicalId: pending.logicalId, lambdaRefs: unique, file: pending.srcFile });
      }
    }
  }

  // NS-4: Cross-stack parameter resolution (R5 - pure phase)
  let paramResolutionTable: ParamResolution[] = [];
  let unresolvedResolutions: UnresolvedResolution[] = [];
  let resolvedTopology: StackTopology | null = null;

  if (topology && topology.roots.length > 0) {
    resolvedTopology = topology;

    // NS-2: Build output index from the already-computed topology
    const outputUnresolved: UnresolvedResolution[] = [];
    const outputIndex = await buildOutputIndex(topology, stateDir, outputUnresolved, repoPath);

    // NS-3: Build param resolution table
    const resourceTypes = new Map<string, string>();
    for (const [lid, cfnType] of logicalIdToCfnType) {
      resourceTypes.set(lid, cfnType);
    }
    const { resolutions, unresolved } = buildParamResolutionTable(
      topology, outputIndex, resourceTypes,
    );

    paramResolutionTable = resolutions;
    unresolvedResolutions = [...outputUnresolved, ...unresolved];

    // R5: Build ResolvedParamMap separately, then merge in a single pass
    const resolvedParamMap = new Map<string, string>();
    for (const entry of paramResolutionTable) {
      if (entry.confidence !== 'unresolved' && entry.resolvedLogicalId) {
        const existingGid = logicalIdToGraphId.get(entry.resolvedLogicalId);
        if (existingGid) {
          resolvedParamMap.set(entry.paramName, existingGid);
        }
      }
    }

    // Single-pass merge into logicalIdToGraphId
    for (const [paramName, graphId] of resolvedParamMap) {
      if (!logicalIdToGraphId.has(paramName)) {
        logicalIdToGraphId.set(paramName, graphId);
      }
    }
  }

  return {
    envVarToResource,
    lambdaEnvVars,
    sdkUsages,
    stepFunctions,
    logicalIdToGraphId,
    logicalIdToCfnType,
    paramResolutionTable,
    unresolvedResolutions,
    topology: resolvedTopology,
    lambdaCodeRoots,
    streamDatabaseLogicalIds,
  };
}

export async function buildResourceResolver(stateDir: string): Promise<ResourceResolverResult> {
  const { loadRepoState } = await import('./slice-emitter.js');
  const stateFiles = await loadRepoState(stateDir);
  return buildResourceResolverFromState(stateFiles, stateDir);
}
