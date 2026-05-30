import crypto from 'node:crypto';

import { enforces_invariant, implements_adr } from '../architecture/intent-decorators.js';

export interface MvcRef {
  id: string;
  version: string;
}

export interface MvcRefWithHash extends MvcRef {
  snapshot_hash?: string;
}

export interface MvcRationale {
  reason: string;
  selector_path: string;
  persona_ref?: string;
  task_ref?: string;
  policy_ref?: string;
}

export interface MvcNegativeSpace {
  id: string;
  reason: string;
}

export interface MvcTopologyMetrics {
  node_count: number;
  edge_count: number;
  branching_factor: number;
  convergence_score: number;
  recommended_depth?: number;
}

export interface MvcDefinition {
  schema_version: '0.1.0';
  mvc_d_id: string;
  version: string;
  status: string;
  task_context: Record<string, unknown>;
  persona_set: MvcRef[];
  context_domain_requirements: Array<Record<string, unknown>>;
  graph_domain_refs: MvcRef[];
  linkage_surface_refs: MvcRef[];
  traversal_policy_ref: MvcRef;
  projection_policy_ref: MvcRef;
  admission_policy_ref: MvcRef;
  budgets: Record<string, unknown>;
  mvc_d_boundary: 'definition_not_materialized_context';
}

export interface MvcSnapshot {
  schema_version: '0.1.0';
  mvc_s_id: string;
  fingerprint: string;
  mvc_d_ref: MvcRef;
  ir_snapshot_ref: MvcRefWithHash;
  graph_snapshot_refs: MvcRefWithHash[];
  linkage_surface_refs: MvcRefWithHash[];
  selector_version_refs: MvcRef[];
  candidate_entities: MvcRef[];
  candidate_relationships: MvcRef[];
  candidate_evidence: MvcRef[];
  candidate_constraints: MvcRef[];
  topology_metrics: MvcTopologyMetrics;
  inclusion_rationale: MvcRationale[];
  exclusion_rationale: MvcRationale[];
  negative_space: MvcNegativeSpace[];
  mvc_s_boundary: 'candidate_surface_prior_to_admission';
}

export interface BuildMvcSnapshotInput {
  mvcDefinition: MvcDefinition;
  irSnapshotRef: MvcRefWithHash;
  graphSnapshotRefs: MvcRefWithHash[];
  linkageSurfaceRefs: MvcRefWithHash[];
  selectorVersionRefs: MvcRef[];
  candidateEntities: MvcRef[];
  candidateRelationships: MvcRef[];
  candidateEvidence: MvcRef[];
  candidateConstraints: MvcRef[];
  topologyMetrics: MvcTopologyMetrics;
  inclusionRationale: MvcRationale[];
  exclusionRationale: MvcRationale[];
  negativeSpace: MvcNegativeSpace[];
}

const REQUIRED_INPUT_FIELDS: Array<keyof BuildMvcSnapshotInput> = [
  'mvcDefinition',
  'irSnapshotRef',
  'graphSnapshotRefs',
  'linkageSurfaceRefs',
  'selectorVersionRefs',
  'candidateEntities',
  'candidateRelationships',
  'candidateEvidence',
  'candidateConstraints',
  'topologyMetrics',
  'inclusionRationale',
  'exclusionRationale',
  'negativeSpace',
];

const MVC_D_REQUIRED_FIELDS: Array<keyof MvcDefinition> = [
  'schema_version',
  'mvc_d_id',
  'version',
  'status',
  'task_context',
  'persona_set',
  'context_domain_requirements',
  'graph_domain_refs',
  'linkage_surface_refs',
  'traversal_policy_ref',
  'projection_policy_ref',
  'admission_policy_ref',
  'budgets',
  'mvc_d_boundary',
];

const MVC_S_FORBIDDEN_FIELDS = [
  'admission_decision',
  'admission_status',
  'admitted',
  'admitted_payload',
  'caller_facing_eligibility',
  'eligibility_outcome',
  'enforcement_outcome',
  'governance_state',
  'kernel_assessment_state',
  'kernel_verdict',
];

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be fully supplied as an array`);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(item => canonicalize(item))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function stableHash(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function canonicalArray<T>(items: T[]): T[] {
  return canonicalize(items) as T[];
}

export const assertMvcDefinitionContract = implements_adr(
  'ADR-L-0021',
)(enforces_invariant('INV-0030')(function assertMvcDefinitionContract(value: unknown): asserts value is MvcDefinition {
  assertRecord(value, 'MVC-D');
  for (const field of MVC_D_REQUIRED_FIELDS) {
    if (!(field in value)) {
      throw new Error(`MVC-D is missing required field: ${field}`);
    }
  }
  if (value.schema_version !== '0.1.0') {
    throw new Error(`Unsupported MVC-D schema_version: ${String(value.schema_version)}`);
  }
  if (value.mvc_d_boundary !== 'definition_not_materialized_context') {
    throw new Error('MVC-D boundary must be definition_not_materialized_context');
  }
}));

export const assertMvcSnapshotCandidateOnly = implements_adr(
  'ADR-L-0021',
)(enforces_invariant('INV-0031')(function assertMvcSnapshotCandidateOnly(value: unknown): void {
  assertRecord(value, 'MVC-S candidate');
  for (const field of MVC_S_FORBIDDEN_FIELDS) {
    if (field in value) {
      throw new Error(`MVC-S candidate must not contain ${field}`);
    }
  }
}));

export const buildMvcSnapshotCandidate = implements_adr(
  'ADR-L-0021',
)(enforces_invariant('INV-0031', 'INV-0032')(function buildMvcSnapshotCandidate(
  input: BuildMvcSnapshotInput,
): MvcSnapshot {
  assertRecord(input, 'MVC-S builder input');
  for (const field of REQUIRED_INPUT_FIELDS) {
    if (!(field in input)) {
      throw new Error(`MVC-S builder input is missing required field: ${field}`);
    }
  }
  assertMvcDefinitionContract(input.mvcDefinition);
  assertMvcSnapshotCandidateOnly(input);

  assertArray(input.graphSnapshotRefs, 'graphSnapshotRefs');
  assertArray(input.linkageSurfaceRefs, 'linkageSurfaceRefs');
  assertArray(input.selectorVersionRefs, 'selectorVersionRefs');
  assertArray(input.candidateEntities, 'candidateEntities');
  assertArray(input.candidateRelationships, 'candidateRelationships');
  assertArray(input.candidateEvidence, 'candidateEvidence');
  assertArray(input.candidateConstraints, 'candidateConstraints');
  assertArray(input.inclusionRationale, 'inclusionRationale');
  assertArray(input.exclusionRationale, 'exclusionRationale');
  assertArray(input.negativeSpace, 'negativeSpace');

  const canonicalBody = {
    mvc_d_ref: {
      id: input.mvcDefinition.mvc_d_id,
      version: input.mvcDefinition.version,
    },
    ir_snapshot_ref: input.irSnapshotRef,
    graph_snapshot_refs: input.graphSnapshotRefs,
    linkage_surface_refs: input.linkageSurfaceRefs,
    selector_version_refs: input.selectorVersionRefs,
    candidate_entities: input.candidateEntities,
    candidate_relationships: input.candidateRelationships,
    candidate_evidence: input.candidateEvidence,
    candidate_constraints: input.candidateConstraints,
    topology_metrics: input.topologyMetrics,
  };
  const fingerprint = stableHash(canonicalBody);
  const snapshot: MvcSnapshot = {
    schema_version: '0.1.0',
    mvc_s_id: `mvc-s:${fingerprint.slice(7, 23)}`,
    fingerprint,
    mvc_d_ref: {
      id: input.mvcDefinition.mvc_d_id,
      version: input.mvcDefinition.version,
    },
    ir_snapshot_ref: canonicalize(input.irSnapshotRef) as MvcRefWithHash,
    graph_snapshot_refs: canonicalArray(input.graphSnapshotRefs),
    linkage_surface_refs: canonicalArray(input.linkageSurfaceRefs),
    selector_version_refs: canonicalArray(input.selectorVersionRefs),
    candidate_entities: canonicalArray(input.candidateEntities),
    candidate_relationships: canonicalArray(input.candidateRelationships),
    candidate_evidence: canonicalArray(input.candidateEvidence),
    candidate_constraints: canonicalArray(input.candidateConstraints),
    topology_metrics: canonicalize(input.topologyMetrics) as MvcTopologyMetrics,
    inclusion_rationale: canonicalArray(input.inclusionRationale),
    exclusion_rationale: canonicalArray(input.exclusionRationale),
    negative_space: canonicalArray(input.negativeSpace),
    mvc_s_boundary: 'candidate_surface_prior_to_admission',
  };
  assertMvcSnapshotCandidateOnly(snapshot);
  return snapshot;
}));

export const canonicalMvcFingerprintInput: (input: BuildMvcSnapshotInput) => unknown = implements_adr(
  'ADR-L-0021',
)(function canonicalMvcFingerprintInput(input: BuildMvcSnapshotInput): unknown {
  assertMvcDefinitionContract(input.mvcDefinition);
  return canonicalize({
    mvc_d_ref: {
      id: input.mvcDefinition.mvc_d_id,
      version: input.mvcDefinition.version,
    },
    ir_snapshot_ref: input.irSnapshotRef,
    graph_snapshot_refs: input.graphSnapshotRefs,
    linkage_surface_refs: input.linkageSurfaceRefs,
    selector_version_refs: input.selectorVersionRefs,
    candidate_entities: input.candidateEntities,
    candidate_relationships: input.candidateRelationships,
    candidate_evidence: input.candidateEvidence,
    candidate_constraints: input.candidateConstraints,
    topology_metrics: input.topologyMetrics,
  });
});
