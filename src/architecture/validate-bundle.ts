import type { CompileDiagnostic, NormalizedEntity, RelationshipRecord, UnresolvedRecord } from './types.js';

export function validateRegistryBundle(
  entities: NormalizedEntity[],
  relationships: RelationshipRecord[],
  unresolved: UnresolvedRecord[],
): CompileDiagnostic[] {
  const diags: CompileDiagnostic[] = [];
  const entityIds = new Set(entities.map((e) => e.id));
  const entityLookup = new Map(entities.map((e) => [e.id, e] as const));
  const relationshipKeys = new Set(
    relationships.map((r) => `${r.relationship_type}:${r.from_entity_id}:${r.to_entity_id}`),
  );
  const unresolvedIds = unresolved.map((u) => u.id);
  if (new Set(unresolvedIds).size !== unresolvedIds.length) {
    const dup = [...new Set(unresolvedIds.filter((id, i) => unresolvedIds.indexOf(id) !== i))].sort();
    diags.push({
      level: 'ERROR',
      code: 'E401',
      message: `Duplicate unresolved IDs detected: ${dup.join(', ')}`,
      source_ref: 'unresolved_registry',
    });
  }

  for (const rel of relationships) {
    if (!entityIds.has(rel.from_entity_id) || !entityIds.has(rel.to_entity_id)) {
      diags.push({
        level: 'ERROR',
        code: 'E402',
        message: `Relationship references unknown entity: ${rel.relationship_id}`,
        source_ref: rel.relationship_id,
      });
    }
  }

  for (const entity of entities) {
    for (const [relationshipType, targets] of Object.entries(entity.relationships) as [
      string,
      string[],
    ][]) {
      for (const targetId of targets) {
        if (!entityIds.has(targetId)) {
          diags.push({
            level: 'ERROR',
            code: 'E403',
            message: `Entity relationship summary references unknown entity: ${entity.id}.${relationshipType} -> ${targetId}`,
            source_ref: `${entity.id}.${relationshipType}`,
          });
        } else if (
          !relationshipKeys.has(`${relationshipType}:${entity.id}:${targetId}`)
        ) {
          diags.push({
            level: 'ERROR',
            code: 'E404',
            message: `Entity relationship summary missing registry edge: ${entity.id}.${relationshipType} -> ${targetId}`,
            source_ref: `${entity.id}.${relationshipType}`,
          });
        }
      }
    }
  }

  for (const u of unresolved) {
    if (!entityLookup.has(u.source_entity_id)) {
      diags.push({
        level: 'ERROR',
        code: 'E405',
        message: `Unresolved record references unknown source entity: ${u.id} -> ${u.source_entity_id}`,
        source_ref: u.id,
      });
    }
  }

  return diags;
}
