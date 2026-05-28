import type { ArchModelState, RelationshipType } from './types.js';
import { adrBlastRadius, type SubgraphFilter, type TraversalResult } from './adr-traversal.js';

export type InclusionReason =
  | 'entry_point'
  | 'traversal_path'
  | 'domain_match'
  | 'entity_type_match';

export type ExclusionReason =
  | 'depth_exceeded'
  | 'max_nodes_exceeded'
  | 'domain_filter'
  | 'entity_type_filter'
  | 'broken_edge'
  | 'not_reachable';

export interface InclusionRecord {
  entityId: string;
  entityType: string;
  reason: InclusionReason;
  pathFromEntry: string[];
  depth: number;
}

export interface ExclusionRecord {
  entityId: string;
  entityType: string;
  reason: ExclusionReason;
  detail: string;
}

export interface ContextAssemblyRationale {
  entryPointId: string;
  included: InclusionRecord[];
  excluded: ExclusionRecord[];
  traversalResult: TraversalResult;
  filters: SubgraphFilter;
}

/**
 * Assemble context around a root entity with inclusion/exclusion rationale.
 *
 * Returns the traversal result plus a rationale for every entity in the model:
 * why it was included or why it was excluded. This supports MVC
 * (Minimum Viable Context) reasoning for AI context assembly.
 */
export function assembleContextWithRationale(
  model: ArchModelState,
  entryPointId: string,
  filters: SubgraphFilter = {},
  maxDepth: number = 3,
  maxNodes: number = 100,
): ContextAssemblyRationale {
  const traversal = adrBlastRadius(model, entryPointId, maxDepth, maxNodes);

  const includedSet = new Set(traversal.entityIds);
  includedSet.add(entryPointId);

  const entityTypeSet = filters.entityTypes ? new Set(filters.entityTypes) : null;
  const domainSet = filters.domains ? new Set(filters.domains) : null;

  const included: InclusionRecord[] = [];
  const excluded: ExclusionRecord[] = [];

  const entryEntity = model.entities.get(entryPointId);
  if (entryEntity) {
    included.push({
      entityId: entryPointId,
      entityType: entryEntity.entity_type,
      reason: 'entry_point',
      pathFromEntry: [],
      depth: 0,
    });
  }

  for (const entityId of traversal.entityIds) {
    const entity = model.entities.get(entityId);
    if (!entity) continue;

    let shouldExclude = false;
    let exclusionReason: ExclusionReason | undefined;
    let exclusionDetail = '';

    if (entityTypeSet && !entityTypeSet.has(entity.entity_type as any)) {
      shouldExclude = true;
      exclusionReason = 'entity_type_filter';
      exclusionDetail = `Entity type '${entity.entity_type}' not in filter [${[...entityTypeSet].join(', ')}]`;
    }

    if (!shouldExclude && domainSet) {
      const entityDomains = Array.isArray(entity.metadata.domains) ? entity.metadata.domains : [];
      if (!entityDomains.some((d: unknown) => typeof d === 'string' && domainSet.has(d))) {
        shouldExclude = true;
        exclusionReason = 'domain_filter';
        exclusionDetail = `No domain overlap with filter [${[...domainSet].join(', ')}]`;
      }
    }

    if (shouldExclude && exclusionReason) {
      excluded.push({
        entityId,
        entityType: entity.entity_type,
        reason: exclusionReason,
        detail: exclusionDetail,
      });
    } else {
      included.push({
        entityId,
        entityType: entity.entity_type,
        reason: 'traversal_path',
        pathFromEntry: [entryPointId],
        depth: 1,
      });
    }
  }

  for (const brokenEdge of traversal.brokenEdges) {
    excluded.push({
      entityId: brokenEdge.toEntityId,
      entityType: 'unknown',
      reason: 'broken_edge',
      detail: `Broken edge from ${brokenEdge.fromEntityId} via ${brokenEdge.relationshipType}`,
    });
  }

  if (traversal.truncated) {
    for (const entity of model.entities.values()) {
      if (includedSet.has(entity.id)) continue;
      if (excluded.some((e) => e.entityId === entity.id)) continue;
      excluded.push({
        entityId: entity.id,
        entityType: entity.entity_type,
        reason: 'max_nodes_exceeded',
        detail: `Traversal truncated at ${maxNodes} nodes`,
      });
    }
  }

  included.sort((a, b) => a.depth - b.depth || a.entityId.localeCompare(b.entityId));
  excluded.sort((a, b) => a.reason.localeCompare(b.reason) || a.entityId.localeCompare(b.entityId));

  return {
    entryPointId,
    included,
    excluded,
    traversalResult: traversal,
    filters,
  };
}
