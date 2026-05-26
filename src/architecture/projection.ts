import {
  type IrEntity,
  type IrRelationship,
  type IrUnresolved,
  type LifecycleStage,
  type NormalizedEntity,
  type RelationshipRecord,
  type RelationshipType,
  type UnresolvedRecord,
  emptyRelationshipBuckets,
} from './types.js';

const PROJECTABLE = new Set(['adr', 'system', 'component', 'decision', 'capability', 'invariant']);

const VALID_LIFECYCLE_STAGES = new Set<string>(['proposed', 'active', 'deprecated', 'superseded']);

function deriveLifecycleStage(entity: IrEntity, allEntities?: Map<string, IrEntity>): LifecycleStage {
  if (entity.entity_type === 'adr') {
    const raw = String(entity.metadata.status ?? 'active');
    return VALID_LIFECYCLE_STAGES.has(raw) ? (raw as LifecycleStage) : 'active';
  }
  if (allEntities) {
    const parentAdrId = entity.canonical_source.source_ref.split('#')[0];
    const parentAdr = allEntities.get(parentAdrId);
    if (parentAdr && parentAdr.entity_type === 'adr') {
      const raw = String(parentAdr.metadata.status ?? 'active');
      return VALID_LIFECYCLE_STAGES.has(raw) ? (raw as LifecycleStage) : 'active';
    }
  }
  return 'active';
}

export function buildRelationshipSummary(
  entityId: string,
  relationships: Map<string, IrRelationship>,
): Record<RelationshipType, string[]> {
  const buckets = emptyRelationshipBuckets();
  for (const rel of [...relationships.values()].sort((a, b) => a.relationship_id.localeCompare(b.relationship_id))) {
    if (rel.from_entity_id !== entityId) continue;
    const key = rel.relationship_type as RelationshipType;
    if (buckets[key]) buckets[key].push(rel.to_entity_id);
  }
  for (const k of Object.keys(buckets) as RelationshipType[]) {
    buckets[k].sort();
  }
  return buckets;
}

export function projectEntity(
  entity: IrEntity,
  rels: Map<string, IrRelationship>,
  allEntities?: Map<string, IrEntity>,
): NormalizedEntity | undefined {
  if (!PROJECTABLE.has(entity.entity_type)) return undefined;
  const relationships = buildRelationshipSummary(entity.id, rels);
  return {
    id: entity.id,
    entity_type: entity.entity_type as NormalizedEntity['entity_type'],
    name: entity.name,
    summary: entity.summary,
    lifecycle_stage: deriveLifecycleStage(entity, allEntities),
    canonical_source: entity.canonical_source,
    source_refs: [...entity.source_refs].sort(
      (a, b) => a.source_ref.localeCompare(b.source_ref) || a.mention_role.localeCompare(b.mention_role),
    ),
    metadata: { ...entity.metadata },
    relationships,
    completeness: entity.completeness,
    provenance: entity.provenance,
  };
}

export function projectRelationship(rel: IrRelationship): RelationshipRecord {
  return {
    relationship_id: rel.relationship_id,
    relationship_type: rel.relationship_type,
    from_entity_id: rel.from_entity_id,
    to_entity_id: rel.to_entity_id,
    provenance_classification: rel.provenance_classification,
    evidence: [...rel.evidence],
    canonical_source_ref: rel.canonical_source_ref,
    confidence: rel.confidence,
    metadata: { ...rel.metadata },
  };
}

export function projectUnresolved(item: IrUnresolved): UnresolvedRecord {
  return {
    id: item.id,
    gap_class: item.gap_class,
    gap_type: item.gap_type,
    source_entity_id: item.source_entity_id,
    related_entity_id: item.related_entity_id,
    expected_relationship: item.expected_relationship,
    severity: item.severity,
    provenance: item.provenance,
    evidence: [...item.evidence],
    suggested_resolution: item.suggested_resolution,
  };
}
