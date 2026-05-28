/** Internal architecture compiler types (mirrors adr-kit discovery / IR shapes). */

export const GENERATOR_ID = 'adr-architecture-index';

export const RELATIONSHIP_TYPES = [
  'declared_in',
  'declares',
  'references',
  'referenced_by',
  'related_to',
  'enforces',
  'enforced_by',
  'enabled_by',
  'enables',
  'governs',
  'governed_by',
  'implemented_by',
  'implements',
  'embodied_in',
  'embodies',
  'supersedes',
  'superseded_by',
  'refines',
  'refined_by',
  'contradicts',
  'rejects',
  'rejected_by',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export function emptyRelationshipBuckets(): Record<RelationshipType, string[]> {
  return {
    declared_in: [],
    declares: [],
    references: [],
    referenced_by: [],
    related_to: [],
    enforces: [],
    enforced_by: [],
    enabled_by: [],
    enables: [],
    governs: [],
    governed_by: [],
    implemented_by: [],
    implements: [],
    embodied_in: [],
    embodies: [],
    supersedes: [],
    superseded_by: [],
    refines: [],
    refined_by: [],
    contradicts: [],
    rejects: [],
    rejected_by: [],
  };
}

export interface CanonicalSource {
  source_type: string;
  source_ref: string;
  artifact_path: string;
}

export interface SourceRef {
  source_type: string;
  source_ref: string;
  artifact_path: string;
  mention_role: string;
}

export interface DiscoveryProvenance {
  source_type: string;
  source_ref: string;
  extraction_phase: string;
  classification: 'explicit' | 'derived' | 'heuristic';
  generator: string;
}

export interface Completeness {
  status: 'complete' | 'partial' | 'reference_only' | 'conflicted';
  missing_fields: string[];
}

export interface IrEntity {
  id: string;
  entity_type: string;
  name: string;
  summary: string;
  canonical_source: CanonicalSource;
  source_refs: SourceRef[];
  metadata: Record<string, unknown>;
  completeness: Completeness;
  provenance: DiscoveryProvenance;
  relationships: Record<RelationshipType, string[]>;
}

export interface IrRelationship {
  relationship_id: string;
  relationship_type: RelationshipType;
  from_entity_id: string;
  to_entity_id: string;
  canonical_source_ref: string;
  provenance_classification: 'explicit' | 'derived' | 'heuristic';
  evidence: string[];
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface IrUnresolved {
  id: string;
  gap_class: 'author_declared' | 'generator_derived';
  gap_type: string;
  source_entity_id: string;
  related_entity_id?: string;
  expected_relationship?: string;
  severity: 'critical' | 'important' | 'advisory';
  provenance: DiscoveryProvenance;
  evidence: string[];
  suggested_resolution?: string;
}

export interface SourceCoverageSummary {
  logical_adrs: number;
  physical_adrs: number;
  physical_system_adrs: number;
  physical_component_adrs: number;
  standalone_invariants: number;
}

export interface ValidationSummary {
  hard_failures: number;
  warnings: number;
  unresolved_entries: number;
}

export type LifecycleStage = 'proposed' | 'active' | 'deprecated' | 'superseded';
export type AdmissionStatus = 'candidate' | 'admitted' | 'rejected';

export interface NormalizedEntity {
  id: string;
  entity_type: 'adr' | 'system' | 'component' | 'decision' | 'capability' | 'invariant' | 'rule' | 'rejection';
  name: string;
  summary: string;
  lifecycle_stage: LifecycleStage;
  admission_status: AdmissionStatus;
  canonical_source: CanonicalSource;
  source_refs: SourceRef[];
  metadata: Record<string, unknown>;
  relationships: Record<RelationshipType, string[]>;
  completeness: Completeness;
  provenance: DiscoveryProvenance;
}

export interface RelationshipRecord {
  relationship_id: string;
  relationship_type: RelationshipType;
  from_entity_id: string;
  to_entity_id: string;
  provenance_classification: 'explicit' | 'derived' | 'heuristic';
  evidence: string[];
  canonical_source_ref: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface UnresolvedRecord {
  id: string;
  gap_class: 'author_declared' | 'generator_derived';
  gap_type: string;
  source_entity_id: string;
  related_entity_id?: string;
  expected_relationship?: string;
  severity: 'critical' | 'important' | 'advisory';
  provenance: DiscoveryProvenance;
  evidence: string[];
  suggested_resolution?: string;
}

export interface ArchitectureIndexPayload {
  schema_version: string;
  type: 'architecture_index';
  architecture_namespace: string;
  generated_at: string;
  generator: string;
  entity_registry_path: string;
  relationship_registry_path: string;
  unresolved_registry_path: string;
  decision_registry_path: string;
  capability_registry_path: string;
  invariant_registry_path: string;
  component_registry_path: string;
  system_registry_path: string;
  rule_registry_path: string;
  validation_summary: ValidationSummary;
  source_coverage: SourceCoverageSummary;
}

export interface AdrGraphNode {
  adrId: string;
  classification: string;
  status: string;
  sourcePath: string;
  introducedEntityIds: string[];
  relatedAdrIds: string[];
}

export interface AdrGraphEdge {
  fromAdrId: string;
  toTargetId: string;
  relationshipType: string;
  sourceRef: string;
}

export interface AdrGraph {
  nodes: AdrGraphNode[];
  edges: AdrGraphEdge[];
}

export interface ArchModelState {
  scopeRoot: string;
  namespace: string;
  generatedAt: string;
  entities: Map<string, IrEntity>;
  relationships: Map<string, IrRelationship>;
  unresolved: Map<string, IrUnresolved>;
  coverage: SourceCoverageSummary;
  corpus: Map<string, unknown>;
  logicalAdrs: Array<{ adr: Record<string, unknown>; path: string }>;
  physicalAdrs: Array<{ adr: Record<string, unknown>; path: string; kind: string }>;
  standaloneInvariants: Array<{ inv: Record<string, unknown>; path: string }>;
}

export type DecLifecycleStage = 'candidate' | 'proposed' | 'accepted' | 'governing' | 'superseded';

export interface DecisionMetadata {
  dec_lifecycle_stage?: DecLifecycleStage;
  reevaluation_conditions?: string[];
  accumulated_consequences?: string[];
  gravity_score?: number;
}

export interface CompileDiagnostic {
  level: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  source_ref?: string;
}

export interface AttributionRecord {
  implementation_entity_id: string;
  implementation_entity_type: string;
  attributed_adrs: string[];
  enforced_invariants: string[];
  provenance: {
    source_file: string;
    extractor: string;
    commit: string | null;
  };
  metadata: Record<string, unknown>;
}

export interface ReconArchitectureSnapshot {
  readonly version: '1';
  attribution_records: AttributionRecord[];
}
