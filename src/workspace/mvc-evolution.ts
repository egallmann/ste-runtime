import crypto from 'node:crypto';

import { enforces_invariant, implements_adr } from '../architecture/intent-decorators.js';

export interface MvcRef {
  id: string;
  version: string;
  identity_scope?: 'repo-local' | 'workspace';
  corpus_scope?: string;
  qualified_id?: string;
  entity_uri?: string;
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
  identity_scope?: 'repo-local' | 'workspace';
  corpus_scope?: string;
  qualified_id?: string;
  entity_uri?: string;
  candidate_ref?: MvcRef;
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

export interface MvcDepthRecommendationInput {
  topologyMetrics: MvcTopologyMetrics;
  maxDepth?: number;
}

export interface MvcDepthRecommendation {
  recommendedDepth: number;
  reason: string;
  policyInput: {
    topology_metrics: MvcTopologyMetrics;
    max_depth?: number;
  };
}

export interface MvcTraversalRelationshipRecord {
  id: string;
  version: string;
  from_ref: MvcRef;
  to_ref: MvcRef;
  reason?: string;
}

export interface MvcLinkageSurfaceRelationshipRecord {
  id: string;
  relationship_family: string;
  from_ref: MvcRef;
  to_ref: MvcRef;
}

export interface MvcLinkageSurface {
  schema_version: '0.1.0';
  id: string;
  version: string;
  relationship_records: MvcLinkageSurfaceRelationshipRecord[];
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

export interface TraverseMvcSCandidatesInput
  extends Omit<BuildMvcSnapshotInput, 'candidateEntities' | 'candidateRelationships'> {
  seedCandidateRefs: MvcRef[];
  relationshipRecords: MvcTraversalRelationshipRecord[];
  depth: number;
}

export interface TraverseMvcSFromLinkageSurfaceInput
  extends Omit<TraverseMvcSCandidatesInput, 'relationshipRecords'> {
  linkageSurface: MvcLinkageSurface;
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

const BARE_ADR_ID_PATTERN = /^ADR-L-\d{4}$/;
const QUALIFIED_ADR_ID_PATTERN = /^[a-z][a-z0-9._-]*:ADR-L-\d{4}$/;
const ARCHITECTURAL_ENTITY_URI_PATTERN = /^entity:\/\/[a-z][a-z0-9._-]*\/[A-Z]+-[A-Z0-9-]+$/;
const FEDERATION_NEGATIVE_SPACE_PATTERN = /(ambiguous|missing).*(federation|linkage|identity)/i;
const TRAVERSAL_FORBIDDEN_FIELDS = [
  'adjacencyMap',
  'graphDomain',
  'graphDomainDefinition',
  'linkageSurface',
  'materializedGraph',
  'repositoryPath',
  'topologyCache',
  'workspaceGraph',
];
const LINKAGE_SURFACE_ADAPTER_FORBIDDEN_FIELDS = TRAVERSAL_FORBIDDEN_FIELDS.filter(
  field => field !== 'linkageSurface',
);

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

function assertFiniteNonNegativeNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function assertOptionalNonNegativeInteger(value: unknown, label: string): asserts value is number | undefined {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function assertTopologyMetrics(value: unknown, label: string): asserts value is MvcTopologyMetrics {
  assertRecord(value, label);
  for (const field of ['node_count', 'edge_count', 'branching_factor', 'convergence_score'] as const) {
    if (!(field in value)) {
      throw new Error(`${label} is missing required field: ${field}`);
    }
  }
  assertOptionalNonNegativeInteger(value.recommended_depth, `${label}.recommended_depth`);
  assertOptionalNonNegativeInteger(value.node_count, `${label}.node_count`);
  assertOptionalNonNegativeInteger(value.edge_count, `${label}.edge_count`);
  assertFiniteNonNegativeNumber(value.branching_factor, `${label}.branching_factor`);
  assertFiniteNonNegativeNumber(value.convergence_score, `${label}.convergence_score`);
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

function candidateIdentityKey(ref: MvcRef): string {
  if (ref.entity_uri) {
    return `entity_uri:${ref.entity_uri}`;
  }
  if (ref.qualified_id) {
    return `qualified_id:${ref.qualified_id}`;
  }
  if (ref.identity_scope && ref.corpus_scope) {
    return `scoped:${ref.identity_scope}:${ref.corpus_scope}:${ref.id}`;
  }
  return `ref:${ref.id}:${ref.version}`;
}

function canonicalString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function stableIdFragment(value: string): string {
  const fragment = value.toLowerCase().replace(/[^a-z0-9._:/-]+/g, '-').replace(/^-+/, '');
  return fragment || 'unknown';
}

function dedupeCandidateRefs(items: MvcRef[]): MvcRef[] {
  const byIdentity = new Map<string, MvcRef>();
  for (const item of items) {
    const key = candidateIdentityKey(item);
    const current = byIdentity.get(key);
    if (!current || canonicalString(item) < canonicalString(current)) {
      byIdentity.set(key, item);
    }
  }
  return canonicalArray([...byIdentity.values()]);
}

function assertWorkspaceIdentityFields(value: MvcRef | MvcRationale, label: string): void {
  if (value.identity_scope !== 'workspace') {
    return;
  }
  if (!value.corpus_scope) {
    throw new Error(`${label} workspace identity must preserve corpus_scope`);
  }
  if (!value.qualified_id && !value.entity_uri) {
    throw new Error(`${label} workspace identity must include qualified_id or entity_uri`);
  }
  if (value.qualified_id && !QUALIFIED_ADR_ID_PATTERN.test(value.qualified_id)) {
    throw new Error(`${label} has invalid qualified_id: ${value.qualified_id}`);
  }
  if (value.entity_uri && !ARCHITECTURAL_ENTITY_URI_PATTERN.test(value.entity_uri)) {
    throw new Error(`${label} has invalid entity_uri: ${value.entity_uri}`);
  }
}

function assertRepoLocalIdentityFields(value: MvcRef | MvcRationale, label: string): void {
  if (value.identity_scope === 'repo-local' && !value.corpus_scope) {
    throw new Error(`${label} repo-local identity must preserve corpus_scope`);
  }
}

function assertRefIdentity(value: MvcRef, label: string): void {
  if (value.identity_scope === 'workspace' && BARE_ADR_ID_PATTERN.test(value.id)) {
    throw new Error(`${label} contains workspace-scoped bare ADR identity: ${value.id}`);
  }
  if (BARE_ADR_ID_PATTERN.test(value.id) && value.identity_scope !== 'repo-local') {
    throw new Error(`${label} bare ADR identity must be repo-local: ${value.id}`);
  }
  if (BARE_ADR_ID_PATTERN.test(value.id) && !value.corpus_scope) {
    throw new Error(`${label} bare ADR identity must preserve corpus_scope: ${value.id}`);
  }
  assertWorkspaceIdentityFields(value, label);
  assertRepoLocalIdentityFields(value, label);
}

function assertRationaleIdentity(value: MvcRationale, label: string): void {
  assertWorkspaceIdentityFields(value, label);
  assertRepoLocalIdentityFields(value, label);
  if (value.candidate_ref) {
    assertRefIdentity(value.candidate_ref, `${label}.candidate_ref`);
  }
}

function assertTraversalRelationshipRecord(value: unknown, label: string): asserts value is MvcTraversalRelationshipRecord {
  assertRecord(value, label);
  for (const field of ['id', 'version', 'from_ref', 'to_ref'] as const) {
    if (!(field in value)) {
      throw new Error(`${label} is missing required field: ${field}`);
    }
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new Error(`${label}.id must be a non-empty string`);
  }
  if (typeof value.version !== 'string' || value.version.length === 0) {
    throw new Error(`${label}.version must be a non-empty string`);
  }
  assertRefIdentity(value.from_ref as MvcRef, `${label}.from_ref`);
  assertRefIdentity(value.to_ref as MvcRef, `${label}.to_ref`);
}

function assertMvcLinkageSurface(value: unknown, label: string): asserts value is MvcLinkageSurface {
  assertRecord(value, label);
  for (const field of ['schema_version', 'id', 'version', 'relationship_records'] as const) {
    if (!(field in value)) {
      throw new Error(`${label} is missing required field: ${field}`);
    }
  }
  if (value.schema_version !== '0.1.0') {
    throw new Error(`${label}.schema_version must be 0.1.0`);
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new Error(`${label}.id must be a non-empty string`);
  }
  if (typeof value.version !== 'string' || value.version.length === 0) {
    throw new Error(`${label}.version must be a non-empty string`);
  }
  assertArray(value.relationship_records, `${label}.relationship_records`);
  value.relationship_records.forEach((relationship, index) => {
    assertRecord(relationship, `${label}.relationship_records[${index}]`);
    for (const field of ['id', 'relationship_family', 'from_ref', 'to_ref'] as const) {
      if (!(field in relationship)) {
        throw new Error(`${label}.relationship_records[${index}] is missing required field: ${field}`);
      }
    }
    if (typeof relationship.id !== 'string' || relationship.id.length === 0) {
      throw new Error(`${label}.relationship_records[${index}].id must be a non-empty string`);
    }
    if (typeof relationship.relationship_family !== 'string' || relationship.relationship_family.length === 0) {
      throw new Error(`${label}.relationship_records[${index}].relationship_family must be a non-empty string`);
    }
    assertRefIdentity(relationship.from_ref as MvcRef, `${label}.relationship_records[${index}].from_ref`);
    assertRefIdentity(relationship.to_ref as MvcRef, `${label}.relationship_records[${index}].to_ref`);
  });
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

export const assertMvcFederatedIdentity = implements_adr(
  'ADR-L-0021',
)(enforces_invariant('INV-0030', 'INV-0031')(function assertMvcFederatedIdentity(snapshot: MvcSnapshot): void {
  assertMvcSnapshotCandidateOnly(snapshot);

  for (const [field, refs] of [
    ['candidate_entities', snapshot.candidate_entities],
    ['candidate_relationships', snapshot.candidate_relationships],
    ['candidate_evidence', snapshot.candidate_evidence],
    ['candidate_constraints', snapshot.candidate_constraints],
  ] as const) {
    refs.forEach((ref, index) => assertRefIdentity(ref, `${field}[${index}]`));
  }

  snapshot.inclusion_rationale.forEach((rationale, index) => {
    assertRationaleIdentity(rationale, `inclusion_rationale[${index}]`);
  });
  snapshot.exclusion_rationale.forEach((rationale, index) => {
    assertRationaleIdentity(rationale, `exclusion_rationale[${index}]`);
  });

  const requiresNegativeSpace = snapshot.exclusion_rationale.some(rationale =>
    FEDERATION_NEGATIVE_SPACE_PATTERN.test(rationale.reason),
  );
  if (requiresNegativeSpace && snapshot.negative_space.length === 0) {
    throw new Error('ambiguous or missing federation linkage must be represented in negative_space');
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

  const candidateEntities = dedupeCandidateRefs(input.candidateEntities);
  const candidateRelationships = dedupeCandidateRefs(input.candidateRelationships);
  const candidateEvidence = dedupeCandidateRefs(input.candidateEvidence);
  const candidateConstraints = dedupeCandidateRefs(input.candidateConstraints);

  const canonicalBody = {
    mvc_d_ref: {
      id: input.mvcDefinition.mvc_d_id,
      version: input.mvcDefinition.version,
    },
    ir_snapshot_ref: input.irSnapshotRef,
    graph_snapshot_refs: input.graphSnapshotRefs,
    linkage_surface_refs: input.linkageSurfaceRefs,
    selector_version_refs: input.selectorVersionRefs,
    candidate_entities: candidateEntities,
    candidate_relationships: candidateRelationships,
    candidate_evidence: candidateEvidence,
    candidate_constraints: candidateConstraints,
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
    candidate_entities: candidateEntities,
    candidate_relationships: candidateRelationships,
    candidate_evidence: candidateEvidence,
    candidate_constraints: candidateConstraints,
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
  const candidateEntities = dedupeCandidateRefs(input.candidateEntities);
  const candidateRelationships = dedupeCandidateRefs(input.candidateRelationships);
  const candidateEvidence = dedupeCandidateRefs(input.candidateEvidence);
  const candidateConstraints = dedupeCandidateRefs(input.candidateConstraints);
  return canonicalize({
    mvc_d_ref: {
      id: input.mvcDefinition.mvc_d_id,
      version: input.mvcDefinition.version,
    },
    ir_snapshot_ref: input.irSnapshotRef,
    graph_snapshot_refs: input.graphSnapshotRefs,
    linkage_surface_refs: input.linkageSurfaceRefs,
    selector_version_refs: input.selectorVersionRefs,
    candidate_entities: candidateEntities,
    candidate_relationships: candidateRelationships,
    candidate_evidence: candidateEvidence,
    candidate_constraints: candidateConstraints,
    topology_metrics: input.topologyMetrics,
  });
});

export const recommendMvcDepthFromTopology: (
  input: MvcDepthRecommendationInput,
) => MvcDepthRecommendation = implements_adr('ADR-L-0021')(
  enforces_invariant('INV-0032')(function recommendMvcDepthFromTopology(
    input: MvcDepthRecommendationInput,
  ): MvcDepthRecommendation {
    assertRecord(input, 'MVC-S depth recommendation input');
    if (!('topologyMetrics' in input)) {
      throw new Error('MVC-S depth recommendation input is missing required field: topologyMetrics');
    }
    assertTopologyMetrics(input.topologyMetrics, 'topologyMetrics');
    assertOptionalNonNegativeInteger(input.maxDepth, 'maxDepth');

    const metrics = input.topologyMetrics;
    const density = metrics.node_count === 0 ? 0 : metrics.edge_count / metrics.node_count;
    let category = 'balanced';
    let recommendedDepth = 2;

    if (metrics.node_count === 0) {
      category = 'empty';
      recommendedDepth = 0;
    } else if (metrics.edge_count === 0) {
      category = 'degenerate';
      recommendedDepth = 1;
    } else if (metrics.branching_factor >= 3.5) {
      category = 'exploding';
      recommendedDepth = 1;
    } else if (density >= 2) {
      category = 'dense';
      recommendedDepth = 1;
    } else if (metrics.convergence_score >= 0.75) {
      category = 'convergent';
      recommendedDepth = 3;
    } else if (metrics.branching_factor <= 0.75) {
      category = 'sparse';
      recommendedDepth = 3;
    }

    const uncappedDepth = recommendedDepth;
    if (input.maxDepth !== undefined) {
      recommendedDepth = Math.min(recommendedDepth, input.maxDepth);
    }

    const capReason =
      input.maxDepth === undefined
        ? 'no budget cap supplied'
        : `budget cap ${input.maxDepth} applied to uncapped depth ${uncappedDepth}`;

    return canonicalize({
      recommendedDepth,
      reason: `advisory depth ${recommendedDepth} for ${category} supplied MVC-S topology metrics; ${capReason}`,
      policyInput: {
        topology_metrics: metrics,
        max_depth: input.maxDepth,
      },
    }) as MvcDepthRecommendation;
  }),
);

export const traverseMvcSCandidates: (
  input: TraverseMvcSCandidatesInput,
) => MvcSnapshot = implements_adr('ADR-L-0023')(
  enforces_invariant('INV-0031', 'INV-0035', 'INV-0036', 'INV-0037')(function traverseMvcSCandidates(
    input: TraverseMvcSCandidatesInput,
  ): MvcSnapshot {
    assertRecord(input, 'MVC-S traversal input');
    for (const field of TRAVERSAL_FORBIDDEN_FIELDS) {
      if (field in input) {
        throw new Error(`MVC-S traversal input must not contain ${field}`);
      }
    }
    assertMvcDefinitionContract(input.mvcDefinition);
    assertMvcSnapshotCandidateOnly(input);
    assertArray(input.seedCandidateRefs, 'seedCandidateRefs');
    assertArray(input.relationshipRecords, 'relationshipRecords');
    assertOptionalNonNegativeInteger(input.depth, 'depth');
    assertArray(input.candidateEvidence, 'candidateEvidence');
    assertArray(input.candidateConstraints, 'candidateConstraints');
    assertArray(input.inclusionRationale, 'inclusionRationale');
    assertArray(input.exclusionRationale, 'exclusionRationale');
    assertArray(input.negativeSpace, 'negativeSpace');
    input.seedCandidateRefs.forEach((ref, index) => assertRefIdentity(ref, `seedCandidateRefs[${index}]`));
    input.relationshipRecords.forEach((record, index) =>
      assertTraversalRelationshipRecord(record, `relationshipRecords[${index}]`),
    );

    const relationshipRecords = canonicalArray(input.relationshipRecords);
    const candidateEntities: MvcRef[] = [];
    const candidateRelationships: MvcRef[] = [];
    const inclusionRationale: MvcRationale[] = [...input.inclusionRationale];
    const exclusionRationale: MvcRationale[] = [...input.exclusionRationale];
    const negativeSpace: MvcNegativeSpace[] = [...input.negativeSpace];
    const expanded = new Set<string>();
    const discovered = new Set<string>();
    let frontier = canonicalArray(input.seedCandidateRefs);

    for (const seed of frontier) {
      const seedKey = canonicalString(seed);
      discovered.add(seedKey);
      candidateEntities.push(seed);
      inclusionRationale.push({
        reason: `Seed candidate supplied for MVC-S traversal: ${seed.id}.`,
        selector_path: `supplied-relationship-traversal/seed/${seed.id}`,
        candidate_ref: seed,
        identity_scope: seed.identity_scope,
        corpus_scope: seed.corpus_scope,
        qualified_id: seed.qualified_id,
        entity_uri: seed.entity_uri,
      });
    }

    for (let hopDepth = 1; hopDepth <= input.depth; hopDepth += 1) {
      const nextFrontier: MvcRef[] = [];
      let matchedAtDepth = false;

      for (const candidate of frontier) {
        const candidateKey = canonicalString(candidate);
        if (expanded.has(candidateKey)) {
          continue;
        }
        expanded.add(candidateKey);

        for (const relationship of relationshipRecords) {
          if (canonicalString(relationship.from_ref) !== candidateKey) {
            continue;
          }
          matchedAtDepth = true;
          candidateRelationships.push({ id: relationship.id, version: relationship.version });
          const targetKey = canonicalString(relationship.to_ref);
          if (discovered.has(targetKey)) {
            continue;
          }
          discovered.add(targetKey);
          candidateEntities.push(relationship.to_ref);
          nextFrontier.push(relationship.to_ref);
          inclusionRationale.push({
            reason: `Traversal followed supplied relationship ${relationship.id} at hop ${hopDepth}: ${relationship.reason ?? 'no relationship reason supplied'}`,
            selector_path: `supplied-relationship-traversal/depth:${hopDepth}/relationship:${relationship.id}`,
            candidate_ref: relationship.to_ref,
            identity_scope: relationship.to_ref.identity_scope,
            corpus_scope: relationship.to_ref.corpus_scope,
            qualified_id: relationship.to_ref.qualified_id,
            entity_uri: relationship.to_ref.entity_uri,
          });
        }
      }

      if (!matchedAtDepth) {
        for (const candidate of frontier) {
          negativeSpace.push({
            id: `missing-relationship:${stableIdFragment(candidate.id)}`,
            reason: `No supplied relationship record starts from expanded candidate ${candidate.id} at hop ${hopDepth}; no inverse or inferred edge was derived.`,
          });
        }
      }
      frontier = canonicalArray(nextFrontier);
      if (frontier.length === 0) {
        break;
      }
    }

    if (frontier.length > 0 || input.depth === 0) {
      negativeSpace.push({
        id: `depth-cap:${input.depth}`,
        reason: `Traversal stopped at caller-supplied relationship-hop depth ${input.depth}; runtime did not adjust or override the cap.`,
      });
    }

    return buildMvcSnapshotCandidate({
      mvcDefinition: input.mvcDefinition,
      irSnapshotRef: input.irSnapshotRef,
      graphSnapshotRefs: input.graphSnapshotRefs,
      linkageSurfaceRefs: input.linkageSurfaceRefs,
      selectorVersionRefs: input.selectorVersionRefs,
      candidateEntities,
      candidateRelationships,
      candidateEvidence: input.candidateEvidence,
      candidateConstraints: input.candidateConstraints,
      topologyMetrics: input.topologyMetrics,
      inclusionRationale,
      exclusionRationale,
      negativeSpace,
    });
  }),
);

export const traverseMvcSFromLinkageSurface: (
  input: TraverseMvcSFromLinkageSurfaceInput,
) => MvcSnapshot = implements_adr('ADR-L-0023')(
  enforces_invariant('INV-0031', 'INV-0035', 'INV-0036', 'INV-0037')(function traverseMvcSFromLinkageSurface(
    input: TraverseMvcSFromLinkageSurfaceInput,
  ): MvcSnapshot {
    assertRecord(input, 'MVC-S Linkage Surface traversal input');
    for (const field of LINKAGE_SURFACE_ADAPTER_FORBIDDEN_FIELDS) {
      if (field in input) {
        throw new Error(`MVC-S Linkage Surface traversal input must not contain ${field}`);
      }
    }
    if (!('linkageSurface' in input)) {
      throw new Error('MVC-S Linkage Surface traversal input is missing required field: linkageSurface');
    }
    assertMvcLinkageSurface(input.linkageSurface, 'linkageSurface');

    const relationshipRecords = input.linkageSurface.relationship_records.map(relationship => ({
      id: relationship.id,
      version: input.linkageSurface.version,
      from_ref: relationship.from_ref,
      to_ref: relationship.to_ref,
      reason: `Linkage Surface ${input.linkageSurface.id} supplied ${relationship.relationship_family} relationship ${relationship.id}.`,
    }));

    return traverseMvcSCandidates({
      mvcDefinition: input.mvcDefinition,
      irSnapshotRef: input.irSnapshotRef,
      graphSnapshotRefs: input.graphSnapshotRefs,
      linkageSurfaceRefs: input.linkageSurfaceRefs,
      selectorVersionRefs: input.selectorVersionRefs,
      seedCandidateRefs: input.seedCandidateRefs,
      relationshipRecords,
      depth: input.depth,
      candidateEvidence: input.candidateEvidence,
      candidateConstraints: input.candidateConstraints,
      topologyMetrics: input.topologyMetrics,
      inclusionRationale: input.inclusionRationale,
      exclusionRationale: input.exclusionRationale,
      negativeSpace: input.negativeSpace,
    });
  }),
);
