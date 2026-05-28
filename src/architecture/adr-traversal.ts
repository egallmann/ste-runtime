import type { ArchModelState, IrEntity, IrRelationship, NormalizedEntity, RelationshipRecord, RelationshipType } from './types.js';
import { projectEntity, projectRelationship } from './projection.js';

export interface BrokenEdge {
  fromEntityId: string;
  toEntityId: string;
  relationshipType: RelationshipType;
}

export interface TraversalResult {
  entityIds: string[];
  traversalDepth: number;
  truncated: boolean;
  brokenEdges: BrokenEdge[];
}

interface AdjacencyIndex {
  outAdj: Map<string, Array<{ targetId: string; type: RelationshipType }>>;
  inAdj: Map<string, Array<{ sourceId: string; type: RelationshipType }>>;
}

function buildAdjacencyIndex(relationships: Map<string, IrRelationship>): AdjacencyIndex {
  const outAdj = new Map<string, Array<{ targetId: string; type: RelationshipType }>>();
  const inAdj = new Map<string, Array<{ sourceId: string; type: RelationshipType }>>();

  for (const rel of relationships.values()) {
    if (!outAdj.has(rel.from_entity_id)) outAdj.set(rel.from_entity_id, []);
    outAdj.get(rel.from_entity_id)!.push({ targetId: rel.to_entity_id, type: rel.relationship_type });

    if (!inAdj.has(rel.to_entity_id)) inAdj.set(rel.to_entity_id, []);
    inAdj.get(rel.to_entity_id)!.push({ sourceId: rel.from_entity_id, type: rel.relationship_type });
  }

  return { outAdj, inAdj };
}

/**
 * Forward traversal: entities that this entity depends on (outgoing edges).
 * Uses bounded BFS with cycle detection.
 */
export function adrDependencies(
  model: ArchModelState,
  entityId: string,
  maxDepth: number = 3,
  maxNodes: number = 100,
): TraversalResult {
  const { outAdj } = buildAdjacencyIndex(model.relationships);
  return bfsTraversal(model, entityId, outAdj, 'forward', maxDepth, maxNodes);
}

/**
 * Reverse traversal: entities that depend on this entity (incoming edges).
 * Uses bounded BFS with cycle detection.
 */
export function adrDependents(
  model: ArchModelState,
  entityId: string,
  maxDepth: number = 3,
  maxNodes: number = 100,
): TraversalResult {
  const { inAdj } = buildAdjacencyIndex(model.relationships);
  const reverseAdj = new Map<string, Array<{ targetId: string; type: RelationshipType }>>();
  for (const [nodeId, edges] of inAdj) {
    reverseAdj.set(
      nodeId,
      edges.map((e) => ({ targetId: e.sourceId, type: e.type })),
    );
  }
  return bfsTraversal(model, entityId, reverseAdj, 'reverse', maxDepth, maxNodes);
}

/**
 * Bidirectional traversal: full impact surface (both directions).
 * Uses bounded BFS with cycle detection.
 */
export function adrBlastRadius(
  model: ArchModelState,
  entityId: string,
  maxDepth: number = 3,
  maxNodes: number = 100,
): TraversalResult {
  const { outAdj, inAdj } = buildAdjacencyIndex(model.relationships);

  const biAdj = new Map<string, Array<{ targetId: string; type: RelationshipType }>>();
  for (const [nodeId, edges] of outAdj) {
    if (!biAdj.has(nodeId)) biAdj.set(nodeId, []);
    biAdj.get(nodeId)!.push(...edges);
  }
  for (const [nodeId, edges] of inAdj) {
    if (!biAdj.has(nodeId)) biAdj.set(nodeId, []);
    biAdj.get(nodeId)!.push(...edges.map((e) => ({ targetId: e.sourceId, type: e.type })));
  }

  return bfsTraversal(model, entityId, biAdj, 'bidirectional', maxDepth, maxNodes);
}

function bfsTraversal(
  model: ArchModelState,
  startId: string,
  adj: Map<string, Array<{ targetId: string; type: RelationshipType }>>,
  _direction: 'forward' | 'reverse' | 'bidirectional',
  maxDepth: number,
  maxNodes: number,
): TraversalResult {
  const visited = new Set<string>();
  const result: string[] = [];
  const brokenEdges: BrokenEdge[] = [];
  let truncated = false;

  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  visited.add(startId);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (id !== startId) {
      if (result.length >= maxNodes) {
        truncated = true;
        break;
      }
      result.push(id);
    }

    if (depth >= maxDepth) continue;

    const neighbors = adj.get(id) ?? [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.targetId)) continue;
      visited.add(neighbor.targetId);

      if (!model.entities.has(neighbor.targetId)) {
        brokenEdges.push({
          fromEntityId: id,
          toEntityId: neighbor.targetId,
          relationshipType: neighbor.type,
        });
        continue;
      }

      queue.push({ id: neighbor.targetId, depth: depth + 1 });
    }
  }

  if (!truncated && queue.length > 0) {
    truncated = true;
  }

  return {
    entityIds: result,
    traversalDepth: maxDepth,
    truncated,
    brokenEdges,
  };
}

// ---------------------------------------------------------------------------
// Subgraph projection
// ---------------------------------------------------------------------------

export interface SubgraphFilter {
  entityTypes?: NormalizedEntity['entity_type'][];
  relationshipTypes?: RelationshipType[];
  domains?: string[];
  adrScope?: string;
}

export interface SubgraphResult {
  entities: NormalizedEntity[];
  relationships: RelationshipRecord[];
}

/**
 * Project a filtered subgraph from the compiled ADR model.
 *
 * Filters are intersected: an entity must satisfy ALL specified criteria.
 * - entityTypes: include only entities of these types
 * - relationshipTypes: include only edges of these types
 * - domains: include only entities whose metadata.domains overlaps
 * - adrScope: include only entities declared_in (or equal to) this ADR ID
 */
export function adrSubgraph(model: ArchModelState, filter: SubgraphFilter): SubgraphResult {
  const entityTypeSet = filter.entityTypes ? new Set(filter.entityTypes) : null;
  const relTypeSet = filter.relationshipTypes ? new Set<string>(filter.relationshipTypes) : null;
  const domainSet = filter.domains ? new Set(filter.domains) : null;

  const includedIds = new Set<string>();

  for (const entity of model.entities.values()) {
    if (entityTypeSet && !entityTypeSet.has(entity.entity_type as NormalizedEntity['entity_type'])) continue;

    if (domainSet) {
      const entityDomains = Array.isArray(entity.metadata.domains) ? entity.metadata.domains : [];
      if (!entityDomains.some((d: unknown) => typeof d === 'string' && domainSet.has(d))) continue;
    }

    if (filter.adrScope) {
      const isTheAdr = entity.id === filter.adrScope;
      const declaredInScope = entity.canonical_source.source_ref.split('#')[0] === filter.adrScope;
      if (!isTheAdr && !declaredInScope) continue;
    }

    includedIds.add(entity.id);
  }

  const projectedEntities: NormalizedEntity[] = [];
  for (const id of [...includedIds].sort()) {
    const entity = model.entities.get(id);
    if (!entity) continue;
    const projected = projectEntity(entity, model.relationships, model.entities);
    if (projected) projectedEntities.push(projected);
  }

  const projectedRels: RelationshipRecord[] = [];
  for (const rel of model.relationships.values()) {
    if (relTypeSet && !relTypeSet.has(rel.relationship_type)) continue;
    if (!includedIds.has(rel.from_entity_id) || !includedIds.has(rel.to_entity_id)) continue;
    projectedRels.push(projectRelationship(rel));
  }
  projectedRels.sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));

  return { entities: projectedEntities, relationships: projectedRels };
}

// ---------------------------------------------------------------------------
// Architecture Consequence Surface
// ---------------------------------------------------------------------------

const HARD_CONSEQUENCE_TYPES: ReadonlySet<string> = new Set([
  'enforces', 'enforced_by', 'governs', 'governed_by',
  'implements', 'implemented_by', 'supersedes', 'superseded_by',
  'contradicts',
]);

const SOFT_CONSEQUENCE_TYPES: ReadonlySet<string> = new Set([
  'related_to', 'references', 'referenced_by', 'refines', 'refined_by',
  'enables', 'enabled_by',
]);

export interface ConsequenceTier {
  entityId: string;
  entityType: string;
  tier: 'hard' | 'soft';
  pathDepth: number;
  viaRelationship: RelationshipType;
}

export interface ConsequenceSurfaceResult {
  rootEntityId: string;
  hardConsequences: ConsequenceTier[];
  softConsequences: ConsequenceTier[];
  totalAffected: number;
  truncated: boolean;
}

/**
 * Compute the transitive consequence closure for a proposed change to
 * the given entity. Distinguishes "hard" consequences (enforces, governs,
 * implements, supersedes, contradicts) from "soft" consequences (related_to,
 * references, refines, enables).
 */
export function consequenceSurface(
  model: ArchModelState,
  entityId: string,
  maxDepth: number = 3,
  maxNodes: number = 200,
): ConsequenceSurfaceResult {
  const hard: ConsequenceTier[] = [];
  const soft: ConsequenceTier[] = [];
  const visited = new Set<string>();
  let truncated = false;

  const queue: Array<{ id: string; depth: number; viaRel: RelationshipType }> = [];
  visited.add(entityId);

  for (const rel of model.relationships.values()) {
    if (rel.from_entity_id === entityId || rel.to_entity_id === entityId) {
      const neighborId = rel.from_entity_id === entityId ? rel.to_entity_id : rel.from_entity_id;
      if (!visited.has(neighborId) && model.entities.has(neighborId)) {
        visited.add(neighborId);
        queue.push({ id: neighborId, depth: 1, viaRel: rel.relationship_type });
      }
    }
  }

  while (queue.length > 0) {
    const { id, depth, viaRel } = queue.shift()!;
    const entity = model.entities.get(id);
    if (!entity) continue;

    if (hard.length + soft.length >= maxNodes) {
      truncated = true;
      break;
    }

    const tier: ConsequenceTier = {
      entityId: id,
      entityType: entity.entity_type,
      tier: HARD_CONSEQUENCE_TYPES.has(viaRel) ? 'hard' : 'soft',
      pathDepth: depth,
      viaRelationship: viaRel,
    };

    if (tier.tier === 'hard') {
      hard.push(tier);
    } else {
      soft.push(tier);
    }

    if (depth >= maxDepth) continue;

    for (const rel of model.relationships.values()) {
      if (rel.from_entity_id !== id && rel.to_entity_id !== id) continue;
      const neighborId = rel.from_entity_id === id ? rel.to_entity_id : rel.from_entity_id;
      if (visited.has(neighborId)) continue;
      if (!model.entities.has(neighborId)) continue;
      if (!HARD_CONSEQUENCE_TYPES.has(rel.relationship_type) && !SOFT_CONSEQUENCE_TYPES.has(rel.relationship_type)) continue;
      visited.add(neighborId);
      queue.push({ id: neighborId, depth: depth + 1, viaRel: rel.relationship_type });
    }
  }

  if (!truncated && queue.length > 0) truncated = true;

  hard.sort((a, b) => a.pathDepth - b.pathDepth || a.entityId.localeCompare(b.entityId));
  soft.sort((a, b) => a.pathDepth - b.pathDepth || a.entityId.localeCompare(b.entityId));

  return {
    rootEntityId: entityId,
    hardConsequences: hard,
    softConsequences: soft,
    totalAffected: hard.length + soft.length,
    truncated,
  };
}
