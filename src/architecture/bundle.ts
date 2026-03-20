import type {
  ArchModelState,
  ArchitectureIndexPayload,
  NormalizedEntity,
  RelationshipRecord,
  UnresolvedRecord,
  ValidationSummary,
} from './types.js';
import { GENERATOR_ID } from './types.js';
import { projectEntity, projectRelationship, projectUnresolved } from './projection.js';

export interface DiscoveryBundle {
  architectureIndex: ArchitectureIndexPayload;
  entityRegistry: { schema_version: string; type: string; entities: NormalizedEntity[] };
  relationshipRegistry: { schema_version: string; type: string; relationships: RelationshipRecord[] };
  unresolvedRegistry: { schema_version: string; type: string; unresolved: UnresolvedRecord[] };
  decisionRegistry: { schema_version: string; type: string; entities: NormalizedEntity[] };
  capabilityRegistry: { schema_version: string; type: string; entities: NormalizedEntity[] };
  invariantRegistry: { schema_version: string; type: string; entities: NormalizedEntity[] };
  componentRegistry: { schema_version: string; type: string; entities: NormalizedEntity[] };
  systemRegistry: { schema_version: string; type: string; entities: NormalizedEntity[] };
  legacyEntityRegistry: { schema_version: string; type: string; entities: LegacyEntity[] };
}

type LegacyEntity = {
  entity_id: string;
  entity_type: string;
  name: string;
  introduced_by: string;
  lifecycle_stage: string;
  source_path: string;
  source_artifact_type: string;
  related_adrs: string[];
  relationships: { depends_on: string[]; implements: string[]; realizes: string[] };
};

function filterByType(entities: NormalizedEntity[], t: string): NormalizedEntity[] {
  return entities.filter((e) => e.entity_type === t);
}

function legacyFromNormalized(entity: NormalizedEntity): LegacyEntity | undefined {
  const mapping: Record<string, string> = {
    capability: 'capability',
    component: 'component',
    decision: 'decision',
    invariant: 'invariant',
  };
  if (!(entity.entity_type in mapping)) return undefined;
  if (entity.entity_type === 'component' && entity.id !== (entity.metadata.legacy_component_id ?? entity.id)) {
    return undefined;
  }
  let introducedBy = entity.canonical_source.source_ref.split('#')[0];
  let sourceArtifactType = 'logical_adr';
  if (introducedBy.startsWith('ADR-PC-')) sourceArtifactType = 'physical_component_adr';
  else if (introducedBy.startsWith('ADR-PS-')) sourceArtifactType = 'physical_system_adr';
  else if (!introducedBy.startsWith('ADR-')) {
    sourceArtifactType = 'standalone_invariant';
    introducedBy = String(entity.metadata.defined_in ?? 'ADR-L-0001');
  }

  const relatedAdrs = new Set<string>();
  for (const ref of entity.source_refs) {
    if (ref.source_ref.startsWith('ADR-')) {
      relatedAdrs.add(ref.source_ref.split('#')[0]);
    }
  }

  return {
    entity_id: entity.id,
    entity_type: mapping[entity.entity_type],
    name: entity.name,
    introduced_by: introducedBy,
    lifecycle_stage: 'active',
    source_path: entity.canonical_source.artifact_path,
    source_artifact_type: sourceArtifactType,
    related_adrs: [...relatedAdrs].sort(),
    relationships: {
      depends_on: [...entity.relationships.related_to],
      implements: [...entity.relationships.enables],
      realizes: [...entity.relationships.enforces],
    },
  };
}

export function assembleDiscoveryBundle(model: ArchModelState): DiscoveryBundle {
  const rels = model.relationships;
  const projectedEntities = [...model.entities.values()]
    .map((e) => projectEntity(e, rels))
    .filter((e): e is NormalizedEntity => Boolean(e))
    .sort((a, b) => a.entity_type.localeCompare(b.entity_type) || a.id.localeCompare(b.id));

  const projectedRels = [...rels.values()]
    .map(projectRelationship)
    .sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));

  const projectedUnresolved = [...model.unresolved.values()]
    .map(projectUnresolved)
    .sort((a, b) => a.id.localeCompare(b.id));

  const validation: ValidationSummary = {
    hard_failures: 0,
    warnings: 0,
    unresolved_entries: projectedUnresolved.length,
  };

  const architectureIndex: ArchitectureIndexPayload = {
    schema_version: '1.1',
    type: 'architecture_index',
    architecture_namespace: model.namespace,
    generated_at: model.generatedAt,
    generator: GENERATOR_ID,
    entity_registry_path: 'adrs/index/entity-registry.yaml',
    relationship_registry_path: 'adrs/index/relationship-registry.yaml',
    unresolved_registry_path: 'adrs/index/unresolved-registry.yaml',
    decision_registry_path: 'adrs/index/decision-registry.yaml',
    capability_registry_path: 'adrs/index/capability-registry.yaml',
    invariant_registry_path: 'adrs/index/invariant-registry.yaml',
    component_registry_path: 'adrs/index/component-registry.yaml',
    system_registry_path: 'adrs/index/system-registry.yaml',
    validation_summary: validation,
    source_coverage: model.coverage,
  };

  const baseRegistry = { schema_version: '1.1', type: 'normalized_entity_registry' };
  const relReg = { schema_version: '1.1', type: 'relationship_registry', relationships: projectedRels };
  const unReg = { schema_version: '1.1', type: 'unresolved_registry', unresolved: projectedUnresolved };

  const legacyEntities = projectedEntities
    .map(legacyFromNormalized)
    .filter((e): e is LegacyEntity => Boolean(e))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));

  return {
    architectureIndex,
    entityRegistry: { ...baseRegistry, entities: projectedEntities },
    relationshipRegistry: relReg,
    unresolvedRegistry: unReg,
    decisionRegistry: { ...baseRegistry, entities: filterByType(projectedEntities, 'decision') },
    capabilityRegistry: { ...baseRegistry, entities: filterByType(projectedEntities, 'capability') },
    invariantRegistry: { ...baseRegistry, entities: filterByType(projectedEntities, 'invariant') },
    componentRegistry: { ...baseRegistry, entities: filterByType(projectedEntities, 'component') },
    systemRegistry: { ...baseRegistry, entities: filterByType(projectedEntities, 'system') },
    legacyEntityRegistry: { schema_version: '1.1', type: 'entity_registry', entities: legacyEntities },
  };
}
