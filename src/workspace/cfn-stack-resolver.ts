/**
 * Nested stack topology discovery, output index construction, and cross-stack
 * parameter resolution. All resolution is static analysis of template files
 * on disk -- no runtime AWS API calls.
 *
 * Key data structures (all keyed by canonical stackId = <template-path>#<logicalId>):
 *   StackTopology  – immutable graph of master -> child relationships (R7)
 *   OutputIndex    – child outputs with raw intrinsic structure preserved
 *   ParamResolutionTable – resolved parameter chains with resolutionPath (R2)
 *   UnresolvedResolutionSet – diagnostics for every unresolved param (R6)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { ParsedStateFile } from './slice-emitter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Confidence = 'high' | 'partial' | 'unresolved';

export type ReasonCode =
  | 'UNSUPPORTED_INTRINSIC'
  | 'UNSUPPORTED_SUB_STRING_FORM'
  | 'UNRESOLVABLE_S3_URI'
  | 'UNRESOLVABLE_MASTER_PARAM'
  | 'MAX_DEPTH_EXCEEDED'
  | 'CYCLE_DETECTED'
  | 'OUTPUT_NOT_FOUND'
  | 'CHILD_TEMPLATE_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND';

export interface ResolutionStep {
  stepIndex: number;
  action: 'GetAtt' | 'Ref' | 'Sub_map' | 'OutputLookup';
  fromStackId: string;
  toStackId: string;
  reference: string;
}

export interface ParamResolution {
  sourceStackId: string;
  targetStackId: string;
  paramName: string;
  resolvedLogicalId: string;
  resolvedCfnType: string;
  resolutionPath: ResolutionStep[];
  confidence: Confidence;
}

export interface UnresolvedResolution {
  stackId: string;
  paramName: string;
  reason: ReasonCode;
  reasonDetail: string;
  attemptedPaths: ResolutionStep[];
}

export interface ChildEntry {
  stackId: string;
  logicalId: string;
  templatePath: string;
  paramValues: Record<string, unknown>;
}

export interface StackTopology {
  readonly roots: ReadonlyArray<string>;
  readonly children: Readonly<Record<string, ChildEntry>>;
  readonly templateToStackIds: Readonly<Record<string, string[]>>;
  readonly standalones: ReadonlyArray<string>;
}

export type OutputIndex = Readonly<Record<string, Record<string, unknown>>>;

export interface StackResolutionResult {
  topology: StackTopology;
  outputIndex: OutputIndex;
  paramResolutionTable: ParamResolution[];
  unresolvedResolutions: UnresolvedResolution[];
}

// ---------------------------------------------------------------------------
// Intrinsic classification (R3)
// ---------------------------------------------------------------------------

type IntrinsicResult =
  | { type: 'Ref'; target: string }
  | { type: 'GetAtt'; logicalId: string; attribute: string }
  | { type: 'Sub_map'; refs: Record<string, unknown> }
  | { type: 'literal'; value: unknown }
  | { type: 'unsupported'; reason: ReasonCode; detail: string };

function classifyIntrinsic(value: unknown): IntrinsicResult {
  if (value === null || value === undefined) {
    return { type: 'literal', value };
  }
  if (typeof value === 'string') {
    return { type: 'literal', value };
  }
  if (typeof value !== 'object') {
    return { type: 'literal', value };
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.Ref === 'string') {
    return { type: 'Ref', target: obj.Ref };
  }

  if (obj['Fn::GetAtt']) {
    const ga = obj['Fn::GetAtt'];
    if (Array.isArray(ga) && ga.length >= 2) {
      return { type: 'GetAtt', logicalId: String(ga[0]), attribute: String(ga[1]) };
    }
    if (typeof ga === 'string') {
      const parts = ga.split('.');
      if (parts.length >= 2) {
        return { type: 'GetAtt', logicalId: parts[0], attribute: parts.slice(1).join('.') };
      }
    }
  }

  // !GetAtt shorthand in YAML: js-yaml parses "!GetAtt Foo.Bar" as a string with tag
  // but after js-yaml load, it appears as a string -- handled by the string branch above
  // when sanitized. If raw, it should be caught by Fn::GetAtt.

  if (obj['Fn::Sub']) {
    const sub = obj['Fn::Sub'];
    if (Array.isArray(sub) && sub.length === 2 && typeof sub[0] === 'string' && sub[1] && typeof sub[1] === 'object') {
      return { type: 'Sub_map', refs: sub[1] as Record<string, unknown> };
    }
    if (typeof sub === 'string') {
      return { type: 'unsupported', reason: 'UNSUPPORTED_SUB_STRING_FORM', detail: `Fn::Sub bare string form: ${sub.substring(0, 80)}` };
    }
  }

  for (const key of Object.keys(obj)) {
    if (['Fn::FindInMap', 'Fn::If', 'Fn::Select', 'Fn::ImportValue', 'Fn::Join'].includes(key)) {
      return { type: 'unsupported', reason: 'UNSUPPORTED_INTRINSIC', detail: `${key} is not supported for static resolution` };
    }
  }

  return { type: 'literal', value };
}

// ---------------------------------------------------------------------------
// YAML custom schema for CFN intrinsics
// ---------------------------------------------------------------------------

const CFN_YAML_TAGS = [
  { tag: '!Ref', construct: (data: string) => ({ Ref: data }) },
  { tag: '!GetAtt', construct: (data: string) => {
    const parts = data.split('.');
    return { 'Fn::GetAtt': [parts[0], parts.slice(1).join('.')] };
  }},
  { tag: '!Sub', construct: (data: unknown) => ({ 'Fn::Sub': data }) },
  { tag: '!Join', construct: (data: unknown) => ({ 'Fn::Join': data }) },
  { tag: '!Select', construct: (data: unknown) => ({ 'Fn::Select': data }) },
  { tag: '!If', construct: (data: unknown) => ({ 'Fn::If': data }) },
  { tag: '!FindInMap', construct: (data: unknown) => ({ 'Fn::FindInMap': data }) },
  { tag: '!ImportValue', construct: (data: unknown) => ({ 'Fn::ImportValue': data }) },
  { tag: '!Split', construct: (data: unknown) => ({ 'Fn::Split': data }) },
  { tag: '!Equals', construct: (data: unknown) => ({ 'Fn::Equals': data }) },
  { tag: '!And', construct: (data: unknown) => ({ 'Fn::And': data }) },
  { tag: '!Or', construct: (data: unknown) => ({ 'Fn::Or': data }) },
  { tag: '!Not', construct: (data: unknown) => ({ 'Fn::Not': data }) },
  { tag: '!Condition', construct: (data: unknown) => ({ Condition: data }) },
  { tag: '!Base64', construct: (data: unknown) => ({ 'Fn::Base64': data }) },
  { tag: '!Cidr', construct: (data: unknown) => ({ 'Fn::Cidr': data }) },
  { tag: '!GetAZs', construct: (data: unknown) => ({ 'Fn::GetAZs': data }) },
  { tag: '!Transform', construct: (data: unknown) => ({ 'Fn::Transform': data }) },
];

function buildCfnYamlSchema(): yaml.Schema {
  const types = CFN_YAML_TAGS.map(({ tag, construct }) =>
    new yaml.Type(tag, {
      kind: 'scalar',
      construct,
    }),
  );
  const mappingTypes = CFN_YAML_TAGS.filter(t =>
    ['!Sub', '!Join', '!Select', '!If', '!FindInMap', '!Split', '!Equals', '!And', '!Or', '!Not', '!Cidr', '!Transform'].includes(t.tag),
  ).map(({ tag, construct }) =>
    new yaml.Type(tag, {
      kind: 'sequence',
      construct,
    }),
  );
  const mappingObjectTypes = CFN_YAML_TAGS.filter(t =>
    ['!Sub', '!Transform', '!Condition'].includes(t.tag),
  ).map(({ tag, construct }) =>
    new yaml.Type(tag, {
      kind: 'mapping',
      construct,
    }),
  );
  return yaml.DEFAULT_SCHEMA.extend([...types, ...mappingTypes, ...mappingObjectTypes]);
}

const CFN_SCHEMA = buildCfnYamlSchema();

export function loadCfnYaml(text: string): Record<string, unknown> | null {
  try {
    const doc = yaml.load(text, { schema: CFN_SCHEMA }) as Record<string, unknown>;
    return doc && typeof doc === 'object' ? doc : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// NS-1: Nested Stack Discovery and Topology Extraction
// ---------------------------------------------------------------------------

const NESTED_STACK_TYPES = new Set([
  'AWS::Serverless::Application',
  'AWS::CloudFormation::Stack',
]);

function resolveChildTemplatePath(
  parentTemplatePath: string,
  locationValue: unknown,
  repoRoot: string,
): string | null {
  const classified = classifyIntrinsic(locationValue);
  if (classified.type === 'literal' && typeof classified.value === 'string') {
    const loc = classified.value;
    if (loc.startsWith('s3://') || loc.startsWith('https://')) {
      return null; // S3 URI -- cannot resolve statically
    }
    const parentDir = path.dirname(parentTemplatePath);
    const resolved = path.resolve(repoRoot, parentDir, loc);
    return path.relative(repoRoot, resolved).split(path.sep).join('/');
  }
  return null; // intrinsic or object -- cannot resolve
}

function makeStackId(templatePath: string, logicalId: string): string {
  return `${templatePath}#${logicalId}`;
}

export async function buildStackTopology(
  stateFiles: ParsedStateFile[],
  stateDir: string,
  repoPath?: string,
): Promise<{
  topology: StackTopology;
  unresolvedResolutions: UnresolvedResolution[];
}> {
  const repoRoot = repoPath ? path.resolve(repoPath) : path.resolve(stateDir, '..');
  const unresolvedResolutions: UnresolvedResolution[] = [];

  // Collect all nested stack resources from state
  const nestedStackResources: Array<{
    parentTemplatePath: string;
    logicalId: string;
    cfnType: string;
    stateElement: Record<string, unknown>;
  }> = [];

  for (const sf of stateFiles) {
    const domain = String(sf.slice.domain ?? '');
    const sliceType = String(sf.slice.type ?? '');
    if (domain !== 'infrastructure' || sliceType !== 'resource') continue;

    const cfnType = String(sf.element.type ?? '');
    if (!NESTED_STACK_TYPES.has(cfnType)) continue;

    const logicalId = String(sf.element.logicalId ?? '');
    const srcFile = String(sf.provenance?.file ?? sf.relativePath);

    nestedStackResources.push({
      parentTemplatePath: srcFile,
      logicalId,
      cfnType,
      stateElement: sf.element,
    });
  }

  if (nestedStackResources.length === 0) {
    const emptyTopology: StackTopology = {
      roots: [],
      children: {},
      templateToStackIds: {},
      standalones: [],
    };
    return { topology: Object.freeze(emptyTopology), unresolvedResolutions };
  }

  // Re-read raw templates to get intrinsic structure for parameter values
  const rawTemplateCache = new Map<string, Record<string, unknown>>();

  async function getRawTemplate(templatePath: string): Promise<Record<string, unknown> | null> {
    if (rawTemplateCache.has(templatePath)) {
      return rawTemplateCache.get(templatePath)!;
    }
    const absPath = path.resolve(repoRoot, templatePath);
    try {
      const text = await fs.readFile(absPath, 'utf-8');
      const doc = loadCfnYaml(text);
      if (doc) rawTemplateCache.set(templatePath, doc);
      return doc;
    } catch {
      return null;
    }
  }

  // Build children entries
  const children: Record<string, ChildEntry> = {};
  const referencedTemplates = new Set<string>();
  const parentTemplates = new Set<string>();

  for (const nsr of nestedStackResources) {
    parentTemplates.add(nsr.parentTemplatePath);

    const rawDoc = await getRawTemplate(nsr.parentTemplatePath);
    const rawResource = rawDoc?.Resources
      ? (rawDoc.Resources as Record<string, Record<string, unknown>>)[nsr.logicalId]
      : null;
    const rawProps = rawResource?.Properties as Record<string, unknown> | undefined;

    // Resolve child template path
    let locationProp: unknown;
    if (nsr.cfnType === 'AWS::Serverless::Application') {
      locationProp = rawProps?.Location;
    } else {
      locationProp = rawProps?.TemplateURL;
    }

    const childTemplatePath = resolveChildTemplatePath(
      nsr.parentTemplatePath,
      locationProp,
      repoRoot,
    );

    if (!childTemplatePath) {
      const stackId = makeStackId(nsr.parentTemplatePath, nsr.logicalId);
      const reason: ReasonCode = typeof locationProp === 'string' && (locationProp.startsWith('s3://') || locationProp.startsWith('https://'))
        ? 'UNRESOLVABLE_S3_URI'
        : 'UNSUPPORTED_INTRINSIC';
      unresolvedResolutions.push({
        stackId,
        paramName: nsr.cfnType === 'AWS::Serverless::Application' ? 'Location' : 'TemplateURL',
        reason,
        reasonDetail: `Cannot resolve child template path from ${JSON.stringify(locationProp)}`,
        attemptedPaths: [],
      });
      continue;
    }

    referencedTemplates.add(childTemplatePath);
    const stackId = makeStackId(nsr.parentTemplatePath, nsr.logicalId);

    const paramValues = (rawProps?.Parameters as Record<string, unknown>) ?? {};

    children[stackId] = {
      stackId,
      logicalId: nsr.logicalId,
      templatePath: childTemplatePath,
      paramValues,
    };
  }

  // Graph-based root identification (R1)
  const allTemplates = new Set<string>();
  for (const sf of stateFiles) {
    const domain = String(sf.slice.domain ?? '');
    const sliceType = String(sf.slice.type ?? '');
    if (domain === 'infrastructure' && sliceType === 'resource') {
      const srcFile = String(sf.provenance?.file ?? sf.relativePath);
      allTemplates.add(srcFile);
    }
  }

  const roots: string[] = [];
  for (const tp of parentTemplates) {
    if (!referencedTemplates.has(tp)) {
      roots.push(tp);
    }
  }

  const standalones: string[] = [];
  for (const tp of allTemplates) {
    if (!parentTemplates.has(tp) && !referencedTemplates.has(tp)) {
      standalones.push(tp);
    }
  }

  // Build reverse lookup: templatePath -> stackId[]
  const templateToStackIds: Record<string, string[]> = {};
  for (const [stackId, entry] of Object.entries(children)) {
    const tp = entry.templatePath;
    if (!templateToStackIds[tp]) templateToStackIds[tp] = [];
    templateToStackIds[tp].push(stackId);
  }

  const topology: StackTopology = Object.freeze({
    roots: Object.freeze(roots),
    children: Object.freeze(children),
    templateToStackIds: Object.freeze(templateToStackIds),
    standalones: Object.freeze(standalones),
  });

  return { topology, unresolvedResolutions };
}

// ---------------------------------------------------------------------------
// NS-2: Output Index Construction
// ---------------------------------------------------------------------------

export async function buildOutputIndex(
  topology: StackTopology,
  stateDir: string,
  unresolvedResolutions: UnresolvedResolution[],
  repoPath?: string,
): Promise<OutputIndex> {
  const repoRoot = repoPath ? path.resolve(repoPath) : path.resolve(stateDir, '..');
  const index: Record<string, Record<string, unknown>> = {};

  const templatePaths = new Set<string>();
  for (const child of Object.values(topology.children)) {
    templatePaths.add(child.templatePath);
  }

  for (const templatePath of templatePaths) {
    const absPath = path.resolve(repoRoot, templatePath);
    let doc: Record<string, unknown> | null = null;
    try {
      const text = await fs.readFile(absPath, 'utf-8');
      doc = loadCfnYaml(text);
    } catch {
      // template file not found
    }

    if (!doc) continue;

    const outputs = doc.Outputs as Record<string, Record<string, unknown>> | undefined;
    if (!outputs) continue;

    // Find all stackIds that reference this template
    const stackIds = topology.templateToStackIds[templatePath] ?? [];

    for (const stackId of stackIds) {
      index[stackId] = {};
      for (const [outputName, outputDef] of Object.entries(outputs)) {
        const value = outputDef.Value;
        const classified = classifyIntrinsic(value);
        if (classified.type === 'unsupported') {
          unresolvedResolutions.push({
            stackId,
            paramName: `Output:${outputName}`,
            reason: classified.reason,
            reasonDetail: classified.detail,
            attemptedPaths: [],
          });
        }
        index[stackId][outputName] = value;
      }
    }
  }

  return Object.freeze(index);
}

// ---------------------------------------------------------------------------
// NS-3: Cross-Stack Parameter Bridge
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DEPTH = 5;

export function buildParamResolutionTable(
  topology: StackTopology,
  outputIndex: OutputIndex,
  resourceTypes: Map<string, string>,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): { resolutions: ParamResolution[]; unresolved: UnresolvedResolution[] } {
  const resolutions: ParamResolution[] = [];
  const unresolved: UnresolvedResolution[] = [];

  for (const [stackId, child] of Object.entries(topology.children)) {
    for (const [paramName, paramValue] of Object.entries(child.paramValues)) {
      const visited = new Set<string>();
      const steps: ResolutionStep[] = [];

      const result = resolveParamValue(
        paramValue,
        stackId,
        paramName,
        topology,
        outputIndex,
        resourceTypes,
        visited,
        steps,
        0,
        maxDepth,
      );

      if (result.resolved) {
        resolutions.push({
          sourceStackId: stackId,
          targetStackId: result.targetStackId,
          paramName,
          resolvedLogicalId: result.logicalId,
          resolvedCfnType: result.cfnType,
          resolutionPath: steps,
          confidence: result.confidence,
        });
      } else if (result.reason) {
        unresolved.push({
          stackId,
          paramName,
          reason: result.reason,
          reasonDetail: result.detail ?? '',
          attemptedPaths: steps,
        });
      }
    }
  }

  return { resolutions, unresolved };
}

interface ResolveResult {
  resolved: boolean;
  logicalId: string;
  cfnType: string;
  targetStackId: string;
  confidence: Confidence;
  reason?: ReasonCode;
  detail?: string;
}

function resolveParamValue(
  value: unknown,
  currentStackId: string,
  paramName: string,
  topology: StackTopology,
  outputIndex: OutputIndex,
  resourceTypes: Map<string, string>,
  visited: Set<string>,
  steps: ResolutionStep[],
  depth: number,
  maxDepth: number,
): ResolveResult {
  const visitKey = `${currentStackId}:${paramName}`;
  if (visited.has(visitKey)) {
    return {
      resolved: false, logicalId: '', cfnType: '', targetStackId: '',
      confidence: 'unresolved', reason: 'CYCLE_DETECTED',
      detail: `Cycle detected at ${visitKey}`,
    };
  }
  if (depth >= maxDepth) {
    return {
      resolved: false, logicalId: '', cfnType: '', targetStackId: '',
      confidence: 'unresolved', reason: 'MAX_DEPTH_EXCEEDED',
      detail: `Max depth ${maxDepth} exceeded at ${visitKey}`,
    };
  }
  visited.add(visitKey);

  const classified = classifyIntrinsic(value);

  if (classified.type === 'GetAtt') {
    // !GetAtt ChildStack.Outputs.OutputName
    if (classified.attribute.startsWith('Outputs.')) {
      const outputName = classified.attribute.replace('Outputs.', '');
      const childLogicalId = classified.logicalId;

      // Find the child's stackId from topology
      const parentTemplate = currentStackId.includes('#')
        ? currentStackId.split('#')[0]
        : currentStackId;
      const childStackId = makeStackId(parentTemplate, childLogicalId);
      const childEntry = topology.children[childStackId];

      if (!childEntry) {
        return {
          resolved: false, logicalId: '', cfnType: '', targetStackId: '',
          confidence: 'unresolved', reason: 'CHILD_TEMPLATE_NOT_FOUND',
          detail: `Child stack ${childStackId} not found in topology`,
        };
      }

      steps.push({
        stepIndex: steps.length,
        action: 'GetAtt',
        fromStackId: currentStackId,
        toStackId: childStackId,
        reference: `${childLogicalId}.Outputs.${outputName}`,
      });

      // Look up output in child
      const childOutputs = outputIndex[childStackId];
      if (!childOutputs || !(outputName in childOutputs)) {
        return {
          resolved: false, logicalId: '', cfnType: '', targetStackId: '',
          confidence: 'unresolved', reason: 'OUTPUT_NOT_FOUND',
          detail: `Output ${outputName} not found in ${childStackId}`,
        };
      }

      const outputValue = childOutputs[outputName];
      steps.push({
        stepIndex: steps.length,
        action: 'OutputLookup',
        fromStackId: childStackId,
        toStackId: childStackId,
        reference: `Output:${outputName}`,
      });

      // Recurse to resolve the output value
      return resolveParamValue(
        outputValue,
        childStackId,
        outputName,
        topology,
        outputIndex,
        resourceTypes,
        visited,
        steps,
        depth + 1,
        maxDepth,
      );
    }

    // !GetAtt ResourceLogicalId.Attribute -- terminal resolution
    const logicalId = classified.logicalId;
    const cfnType = resourceTypes.get(logicalId) ?? '';
    const childTemplatePath = findTemplateForStackId(currentStackId, topology);
    const targetStackId = currentStackId;

    steps.push({
      stepIndex: steps.length,
      action: 'GetAtt',
      fromStackId: currentStackId,
      toStackId: targetStackId,
      reference: `${logicalId}.${classified.attribute}`,
    });

    if (cfnType) {
      return {
        resolved: true, logicalId, cfnType, targetStackId,
        confidence: 'high',
      };
    }
    return {
      resolved: false, logicalId, cfnType: '', targetStackId,
      confidence: 'unresolved', reason: 'RESOURCE_NOT_FOUND',
      detail: `Resource ${logicalId} has no known CFN type`,
    };
  }

  if (classified.type === 'Ref') {
    const target = classified.target;

    // Check if it's a pseudo-parameter
    if (target.startsWith('AWS::')) {
      return {
        resolved: false, logicalId: '', cfnType: '', targetStackId: '',
        confidence: 'unresolved', reason: 'UNSUPPORTED_INTRINSIC',
        detail: `Ref to pseudo-parameter ${target}`,
      };
    }

    // Check if target is a resource in the current template
    const cfnType = resourceTypes.get(target);
    if (cfnType) {
      steps.push({
        stepIndex: steps.length,
        action: 'Ref',
        fromStackId: currentStackId,
        toStackId: currentStackId,
        reference: target,
      });
      return {
        resolved: true, logicalId: target, cfnType, targetStackId: currentStackId,
        confidence: 'high',
      };
    }

    // Target might be a parameter in the current template -- need to trace upstream
    // Check if this stack is a child, and its parent passed this param
    for (const [parentStackId, childEntry] of Object.entries(topology.children)) {
      if (childEntry.templatePath === findTemplateForStackId(currentStackId, topology)) {
        const passedValue = childEntry.paramValues[target];
        if (passedValue !== undefined) {
          steps.push({
            stepIndex: steps.length,
            action: 'Ref',
            fromStackId: currentStackId,
            toStackId: parentStackId,
            reference: `Param:${target}`,
          });

          const parentTemplate = parentStackId.split('#')[0];
          return resolveParamValue(
            passedValue,
            parentTemplate,
            target,
            topology,
            outputIndex,
            resourceTypes,
            visited,
            steps,
            depth + 1,
            maxDepth,
          );
        }
      }
    }

    // Parameter with no upstream resolution
    return {
      resolved: false, logicalId: '', cfnType: '', targetStackId: '',
      confidence: 'unresolved', reason: 'UNRESOLVABLE_MASTER_PARAM',
      detail: `Ref ${target} is a parameter with no traceable upstream value`,
    };
  }

  if (classified.type === 'Sub_map') {
    // Extract Ref targets from the substitution map
    for (const [_key, subValue] of Object.entries(classified.refs)) {
      const subClassified = classifyIntrinsic(subValue);
      if (subClassified.type === 'Ref' || subClassified.type === 'GetAtt') {
        steps.push({
          stepIndex: steps.length,
          action: 'Sub_map',
          fromStackId: currentStackId,
          toStackId: currentStackId,
          reference: `Sub map extraction`,
        });
        return resolveParamValue(
          subValue,
          currentStackId,
          paramName,
          topology,
          outputIndex,
          resourceTypes,
          visited,
          steps,
          depth + 1,
          maxDepth,
        );
      }
    }
    return {
      resolved: false, logicalId: '', cfnType: '', targetStackId: '',
      confidence: 'unresolved', reason: 'UNSUPPORTED_INTRINSIC',
      detail: 'Fn::Sub map form with no resolvable Ref/GetAtt targets',
    };
  }

  if (classified.type === 'unsupported') {
    return {
      resolved: false, logicalId: '', cfnType: '', targetStackId: '',
      confidence: 'unresolved', reason: classified.reason,
      detail: classified.detail,
    };
  }

  // Literal value -- not a resource reference
  return {
    resolved: false, logicalId: '', cfnType: '', targetStackId: '',
    confidence: 'unresolved', reason: 'UNRESOLVABLE_MASTER_PARAM',
    detail: `Literal value ${JSON.stringify(value)?.substring(0, 80)} is not a resource reference`,
  };
}

function findTemplateForStackId(stackId: string, topology: StackTopology): string {
  const child = topology.children[stackId];
  if (child) return child.templatePath;

  // If stackId is a root template reference, extract template path
  if (stackId.includes('#')) {
    return stackId.split('#')[0];
  }
  return stackId;
}

// ---------------------------------------------------------------------------
// Full resolution pipeline
// ---------------------------------------------------------------------------

export async function resolveNestedStacks(
  stateFiles: ParsedStateFile[],
  stateDir: string,
  repoPath?: string,
): Promise<StackResolutionResult> {
  // Build topology (NS-1)
  const { topology, unresolvedResolutions } = await buildStackTopology(stateFiles, stateDir, repoPath);

  if (topology.roots.length === 0) {
    return {
      topology,
      outputIndex: Object.freeze({}),
      paramResolutionTable: [],
      unresolvedResolutions,
    };
  }

  // Build resource type map from state files
  const resourceTypes = new Map<string, string>();
  for (const sf of stateFiles) {
    const domain = String(sf.slice.domain ?? '');
    const sliceType = String(sf.slice.type ?? '');
    if (domain === 'infrastructure' && sliceType === 'resource') {
      const logicalId = String(sf.element.logicalId ?? '');
      const cfnType = String(sf.element.type ?? '');
      if (logicalId && cfnType) {
        resourceTypes.set(logicalId, cfnType);
      }
    }
  }

  // Build output index (NS-2)
  const outputIndex = await buildOutputIndex(topology, stateDir, unresolvedResolutions, repoPath);

  // Build param resolution table (NS-3)
  const { resolutions, unresolved } = buildParamResolutionTable(
    topology,
    outputIndex,
    resourceTypes,
  );

  unresolvedResolutions.push(...unresolved);

  return {
    topology,
    outputIndex,
    paramResolutionTable: resolutions,
    unresolvedResolutions,
  };
}
