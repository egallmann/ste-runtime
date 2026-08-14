import { RuntimeContractError } from './errors.js';
import type {
  GraphNodeRef,
  GraphNode,
  GraphProjection,
  GraphRelationship,
  SnapshotId,
  TraversalOptions,
  WorkspaceId,
} from './types.js';

function refKey(ref: GraphNodeRef): string {
  return `${ref.workspaceId}:${ref.snapshotId}:${ref.nodeId}`;
}

export function createGraphProjection(
  workspaceId: WorkspaceId,
  snapshotId: SnapshotId,
  nodes: readonly GraphNode[],
  relationships: readonly GraphRelationship[],
): GraphProjection {
  const nodeMap = new Map(nodes.map(node => [refKey(node.ref), node]));
  const outgoing = new Map<string, GraphRelationship[]>();
  for (const relationship of relationships) {
    const key = refKey(relationship.source);
    const existing = outgoing.get(key) ?? [];
    existing.push(relationship);
    outgoing.set(key, existing);
  }

  const getNode = (ref: GraphNodeRef): GraphNode | undefined => {
    if (ref.workspaceId !== workspaceId || ref.snapshotId !== snapshotId) {
      throw new RuntimeContractError(
        'FOREIGN_GRAPH_PROJECTION',
        `Node ${ref.nodeId} does not belong to graph projection ${workspaceId}/${snapshotId}`,
      );
    }
    return nodeMap.get(refKey(ref));
  };

  const traverse = (start: GraphNodeRef, options: TraversalOptions = {}): readonly GraphNodeRef[] => {
    if (start.workspaceId !== workspaceId || start.snapshotId !== snapshotId) {
      throw new RuntimeContractError(
        start.workspaceId !== workspaceId ? 'FOREIGN_WORKSPACE_TRAVERSAL' : 'FOREIGN_GRAPH_PROJECTION',
        `Node ${start.nodeId} does not belong to graph projection ${workspaceId}/${snapshotId}`,
      );
    }
    if (!nodeMap.has(refKey(start))) return [];

    const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
    const maxNodes = options.maxNodes ?? Number.POSITIVE_INFINITY;
    const result: GraphNodeRef[] = [];
    const seen = new Set<string>();
    const queue: Array<{ ref: GraphNodeRef; depth: number }> = [{ ref: start, depth: 0 }];

    while (queue.length > 0 && result.length < maxNodes) {
      const current = queue.shift()!;
      const key = refKey(current.ref);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(current.ref);
      if (current.depth >= maxDepth) continue;

      for (const relationship of outgoing.get(key) ?? []) {
        if (relationship.target.workspaceId !== workspaceId || relationship.target.snapshotId !== snapshotId) {
          throw new RuntimeContractError(
            relationship.target.workspaceId !== workspaceId ? 'FOREIGN_WORKSPACE_TRAVERSAL' : 'FOREIGN_GRAPH_PROJECTION',
            `Relationship target ${relationship.target.nodeId} crosses the graph projection boundary`,
          );
        }
        queue.push({ ref: relationship.target, depth: current.depth + 1 });
      }
    }

    return result;
  };

  return Object.freeze({
    nodes: Object.freeze([...nodes]),
    relationships: Object.freeze([...relationships]),
    getNode,
    traverse,
  });
}
