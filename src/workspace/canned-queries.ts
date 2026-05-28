/**
 * Deterministic, non-LLM graph traversal queries that answer common
 * workspace-level questions using only the typed workspace infra graph.
 */

import type { WorkspaceGraph, WorkspaceNode, WorkspaceEdge } from './workspace-graph-loader.js';

// ---------------------------------------------------------------------------
// Result types — systemDependencies
// ---------------------------------------------------------------------------

export interface RepoDependency {
  from: string;
  to: string;
  verbs: string[];
  details: Array<{ fromNode: string; toNode: string; verb: string }>;
}

export interface SystemDependencyResult {
  kind: 'system-dependencies';
  repos: Array<{ name: string; nodeTypes: Record<string, number> }>;
  dependencies: RepoDependency[];
  connectionTypes: Array<{ type: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Result types — componentIntegration
// ---------------------------------------------------------------------------

export interface IntegrationGroup {
  pattern: string;
  edges: WorkspaceEdge[];
}

export interface ComponentIntegrationResult {
  kind: 'component-integration';
  scope: string;
  components: WorkspaceNode[];
  integrations: IntegrationGroup[];
  summary: { totalComponents: number; totalEdges: number; patterns: string[] };
}

// ---------------------------------------------------------------------------
// Result types — blastRadiusWorkspace
// ---------------------------------------------------------------------------

export interface BlastTier {
  tier: number;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
}

export interface WorkspaceBlastRadiusResult {
  kind: 'blast-radius';
  target: WorkspaceNode;
  tiers: BlastTier[];
  affectedRepos: string[];
  affectedNodeCount: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

// ---------------------------------------------------------------------------
// Union type for projection dispatch
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Result types — Section 11 node-level queries
// ---------------------------------------------------------------------------

export interface WhatCallsResult {
  kind: 'what-calls';
  targetId: string;
  callers: string[];
}

export interface WhatDependsOnResult {
  kind: 'what-depends-on';
  targetId: string;
  dependents: string[];
}

export interface NodeBlastRadiusResult {
  kind: 'node-blast-radius';
  targetId: string;
  affected: string[];
}

export type CannedQueryResult =
  | SystemDependencyResult
  | ComponentIntegrationResult
  | WorkspaceBlastRadiusResult
  | WhatCallsResult
  | WhatDependsOnResult
  | NodeBlastRadiusResult;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VERB_TO_PATTERN: Record<string, string> = {
  has_contract: 'HTTP API',
  reads: 'Shared Database',
  writes: 'Shared Database',
  publishes: 'Event Stream',
  consumes: 'Event Stream',
  invokes: 'Invocation',
  deploys_to: 'Deployment',
};

function classifyPattern(verb: string): string {
  return VERB_TO_PATTERN[verb] ?? 'Other';
}

function computeRisk(
  tierTwoCount: number,
  affectedRepoCount: number,
): 'low' | 'medium' | 'high' | 'critical' {
  if (affectedRepoCount >= 4 || tierTwoCount >= 10) return 'critical';
  if (affectedRepoCount >= 3 || tierTwoCount >= 5) return 'high';
  if (affectedRepoCount >= 2 || tierTwoCount >= 2) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Query: systemDependencies
// ---------------------------------------------------------------------------

/**
 * Collect cross-repo edges, group by repo pair, and produce a repo-level
 * dependency DAG.
 */
export function systemDependencies(graph: WorkspaceGraph): SystemDependencyResult {
  const repoNodes = new Map<string, Map<string, number>>();

  for (const node of graph.nodes.values()) {
    if (!repoNodes.has(node.repo)) {
      repoNodes.set(node.repo, new Map());
    }
    const counts = repoNodes.get(node.repo)!;
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }

  const pairKey = (from: string, to: string) => `${from}\0${to}`;
  const pairMap = new Map<string, { verbs: Set<string>; details: RepoDependency['details'] }>();

  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from);
    const toNode = graph.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;
    if (fromNode.repo === toNode.repo) continue;

    const pk = pairKey(fromNode.repo, toNode.repo);
    let entry = pairMap.get(pk);
    if (!entry) {
      entry = { verbs: new Set(), details: [] };
      pairMap.set(pk, entry);
    }
    entry.verbs.add(edge.verb);
    entry.details.push({ fromNode: edge.from, toNode: edge.to, verb: edge.verb });
  }

  const deps: RepoDependency[] = [];
  for (const [pk, entry] of pairMap) {
    const [from, to] = pk.split('\0');
    deps.push({
      from: from!,
      to: to!,
      verbs: [...entry.verbs].sort(),
      details: entry.details,
    });
  }

  const repos = [...repoNodes.entries()].map(([name, counts]) => ({
    name,
    nodeTypes: Object.fromEntries(counts),
  }));

  const verbCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    verbCounts.set(edge.verb, (verbCounts.get(edge.verb) ?? 0) + 1);
  }
  const connectionTypes = [...verbCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return { kind: 'system-dependencies', repos, dependencies: deps, connectionTypes };
}

// ---------------------------------------------------------------------------
// Query: componentIntegration
// ---------------------------------------------------------------------------

/**
 * Collect the subgraph scoped to a single repo or the full workspace,
 * grouping edges by integration pattern.
 */
export function componentIntegration(
  graph: WorkspaceGraph,
  opts?: { repo?: string },
): ComponentIntegrationResult {
  const scope = opts?.repo ?? 'workspace';

  const components: WorkspaceNode[] = [];
  const nodeIds = new Set<string>();

  for (const node of graph.nodes.values()) {
    if (opts?.repo && node.repo !== opts.repo) continue;
    components.push(node);
    nodeIds.add(node.id);
  }

  const scopedEdges: WorkspaceEdge[] = [];
  for (const edge of graph.edges) {
    if (opts?.repo) {
      if (!nodeIds.has(edge.from) && !nodeIds.has(edge.to)) continue;
    }
    scopedEdges.push(edge);
  }

  const groupMap = new Map<string, WorkspaceEdge[]>();
  for (const edge of scopedEdges) {
    const pattern = classifyPattern(edge.verb);
    const list = groupMap.get(pattern);
    if (list) {
      list.push(edge);
    } else {
      groupMap.set(pattern, [edge]);
    }
  }

  const integrations: IntegrationGroup[] = [...groupMap.entries()]
    .map(([pattern, edges]) => ({ pattern, edges }))
    .sort((a, b) => a.pattern.localeCompare(b.pattern));

  const patterns = integrations.map(g => g.pattern);

  return {
    kind: 'component-integration',
    scope,
    components,
    integrations,
    summary: {
      totalComponents: components.length,
      totalEdges: scopedEdges.length,
      patterns,
    },
  };
}

// ---------------------------------------------------------------------------
// Query: blastRadiusWorkspace
// ---------------------------------------------------------------------------

/**
 * BFS from the target node in both directions, classifying reachable nodes
 * into blast-radius tiers.
 */
export function blastRadiusWorkspace(
  graph: WorkspaceGraph,
  targetId: string,
  opts?: { maxDepth?: number },
): WorkspaceBlastRadiusResult {
  const maxDepth = opts?.maxDepth ?? 3;
  const targetNode = graph.nodes.get(targetId);

  if (!targetNode) {
    throw new Error(`Node not found in workspace graph: ${targetId}`);
  }

  const tierMap = new Map<string, number>();
  const tierEdges = new Map<number, WorkspaceEdge[]>();
  const queue: Array<{ id: string; depth: number }> = [{ id: targetId, depth: 0 }];
  tierMap.set(targetId, 0);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const outEdges = graph.outAdj.get(id) ?? [];
    const inEdges = graph.inAdj.get(id) ?? [];
    const allEdges = [...outEdges, ...inEdges];

    for (const edge of allEdges) {
      const neighborId = edge.from === id ? edge.to : edge.from;
      if (tierMap.has(neighborId)) continue;

      const neighborTier = depth + 1;
      tierMap.set(neighborId, neighborTier);
      queue.push({ id: neighborId, depth: neighborTier });

      const edgeList = tierEdges.get(neighborTier);
      if (edgeList) {
        edgeList.push(edge);
      } else {
        tierEdges.set(neighborTier, [edge]);
      }
    }
  }

  const tierBuckets = new Map<number, WorkspaceNode[]>();
  for (const [nodeId, tier] of tierMap) {
    const node = graph.nodes.get(nodeId);
    if (!node) continue;
    const list = tierBuckets.get(tier);
    if (list) {
      list.push(node);
    } else {
      tierBuckets.set(tier, [node]);
    }
  }

  const tiers: BlastTier[] = [];
  const maxTierSeen = Math.max(0, ...tierMap.values());
  for (let t = 0; t <= maxTierSeen; t++) {
    tiers.push({
      tier: t,
      nodes: tierBuckets.get(t) ?? [],
      edges: tierEdges.get(t) ?? [],
    });
  }

  const affectedRepoSet = new Set<string>();
  for (const [nodeId] of tierMap) {
    const node = graph.nodes.get(nodeId);
    if (node && nodeId !== targetId) {
      affectedRepoSet.add(node.repo);
    }
  }
  const affectedRepos = [...affectedRepoSet].sort();

  const tierTwoPlus = [...tierMap.values()].filter(t => t >= 2).length;

  return {
    kind: 'blast-radius',
    target: targetNode,
    tiers,
    affectedRepos,
    affectedNodeCount: tierMap.size,
    risk: computeRisk(tierTwoPlus, affectedRepos.length),
  };
}

// ---------------------------------------------------------------------------
// Query: whatCalls (Section 11 port)
// ---------------------------------------------------------------------------

const CALL_VERBS = new Set(['invokes', 'publishes', 'calls', 'triggers', 'publishes_to']);

/**
 * Depth-1 reverse neighborhood on invokes/publishes/calls/triggers/publishes_to edges.
 * Port of the legacy workspace-graph query module (what_calls).
 */
export function whatCalls(
  graph: WorkspaceGraph,
  nodeId: string,
): WhatCallsResult {
  const inEdges = graph.inAdj.get(nodeId) ?? [];
  const callers = new Set<string>();
  for (const edge of inEdges) {
    if (CALL_VERBS.has(edge.verb)) {
      callers.add(edge.from);
    }
  }
  return { kind: 'what-calls', targetId: nodeId, callers: [...callers].sort() };
}

// ---------------------------------------------------------------------------
// Query: whatDependsOn (Section 11 port)
// ---------------------------------------------------------------------------

/**
 * Forward transitive closure on all edges. Cycle-safe.
 * Port of the legacy workspace-graph query module (what_depends_on).
 */
export function whatDependsOn(
  graph: WorkspaceGraph,
  nodeId: string,
): WhatDependsOnResult {
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const outEdges = graph.outAdj.get(cur) ?? [];
    for (const edge of outEdges) {
      if (seen.has(edge.to) || edge.to === nodeId) continue;
      seen.add(edge.to);
      stack.push(edge.to);
    }
  }
  return { kind: 'what-depends-on', targetId: nodeId, dependents: [...seen].sort() };
}

// ---------------------------------------------------------------------------
// Query: blastRadiusNode (Section 11 port)
// ---------------------------------------------------------------------------

/**
 * Reverse transitive closure on all edges. Cycle-safe.
 * Port of the legacy workspace-graph query module (blast_radius).
 */
export function blastRadiusNode(
  graph: WorkspaceGraph,
  nodeId: string,
): NodeBlastRadiusResult {
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const inEdges = graph.inAdj.get(cur) ?? [];
    for (const edge of inEdges) {
      if (seen.has(edge.from) || edge.from === nodeId) continue;
      seen.add(edge.from);
      stack.push(edge.from);
    }
  }
  return { kind: 'node-blast-radius', targetId: nodeId, affected: [...seen].sort() };
}
