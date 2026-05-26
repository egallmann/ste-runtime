import type { ArchModelState, IrRelationship, RelationshipType } from './types.js';

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
