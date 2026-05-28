import { describe, expect, it } from 'vitest';

import type { WorkspaceGraph, WorkspaceNode, WorkspaceEdge } from './workspace-graph-loader.js';
import {
  systemDependencies,
  componentIntegration,
  blastRadiusWorkspace,
  whatCalls,
  whatDependsOn,
  blastRadiusNode,
} from './canned-queries.js';

function makeGraph(
  nodes: WorkspaceNode[],
  edges: WorkspaceEdge[],
): WorkspaceGraph {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const outAdj = new Map<string, WorkspaceEdge[]>();
  const inAdj = new Map<string, WorkspaceEdge[]>();

  for (const edge of edges) {
    const out = outAdj.get(edge.from);
    if (out) out.push(edge);
    else outAdj.set(edge.from, [edge]);

    const inp = inAdj.get(edge.to);
    if (inp) inp.push(edge);
    else inAdj.set(edge.to, [edge]);
  }

  return { nodes: nodeMap, edges, outAdj, inAdj };
}

const N = (id: string, type: string, repo: string): WorkspaceNode => ({
  id, type, name: id, repo,
});

const E = (from: string, to: string, verb: string): WorkspaceEdge => ({
  from, to, verb,
});

// ---------------------------------------------------------------------------
// systemDependencies
// ---------------------------------------------------------------------------

describe('systemDependencies', () => {
  it('detects cross-repo dependencies', () => {
    const graph = makeGraph(
      [
        N('Service:A', 'Service', 'repoA'),
        N('Lambda:A:fn', 'Lambda', 'repoA'),
        N('Database:B:db', 'Database', 'repoB'),
        N('Service:B', 'Service', 'repoB'),
      ],
      [
        E('Service:A', 'Lambda:A:fn', 'has_contract'),
        E('Lambda:A:fn', 'Database:B:db', 'reads'),
      ],
    );

    const result = systemDependencies(graph);

    expect(result.kind).toBe('system-dependencies');
    expect(result.repos.length).toBe(2);
    expect(result.dependencies.length).toBe(1);

    const dep = result.dependencies[0]!;
    expect(dep.from).toBe('repoA');
    expect(dep.to).toBe('repoB');
    expect(dep.verbs).toContain('reads');
    expect(dep.details.length).toBe(1);
  });

  it('returns empty dependencies for single-repo workspace', () => {
    const graph = makeGraph(
      [
        N('Service:A', 'Service', 'repoA'),
        N('Lambda:A:fn', 'Lambda', 'repoA'),
      ],
      [E('Service:A', 'Lambda:A:fn', 'has_contract')],
    );

    const result = systemDependencies(graph);
    expect(result.dependencies.length).toBe(0);
  });

  it('groups multiple verbs for the same repo pair', () => {
    const graph = makeGraph(
      [
        N('Lambda:A:fn', 'Lambda', 'repoA'),
        N('Database:B:db', 'Database', 'repoB'),
        N('Queue:B:q', 'Queue', 'repoB'),
      ],
      [
        E('Lambda:A:fn', 'Database:B:db', 'reads'),
        E('Lambda:A:fn', 'Queue:B:q', 'publishes'),
      ],
    );

    const result = systemDependencies(graph);
    expect(result.dependencies.length).toBe(1);
    const dep = result.dependencies[0]!;
    expect(dep.verbs).toEqual(['publishes', 'reads']);
    expect(dep.details.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// componentIntegration
// ---------------------------------------------------------------------------

describe('componentIntegration', () => {
  it('returns all components when no repo filter', () => {
    const graph = makeGraph(
      [
        N('Lambda:A:fn', 'Lambda', 'repoA'),
        N('Database:B:db', 'Database', 'repoB'),
      ],
      [E('Lambda:A:fn', 'Database:B:db', 'reads')],
    );

    const result = componentIntegration(graph);
    expect(result.kind).toBe('component-integration');
    expect(result.scope).toBe('workspace');
    expect(result.components.length).toBe(2);
    expect(result.summary.totalEdges).toBe(1);
  });

  it('filters to a specific repo', () => {
    const graph = makeGraph(
      [
        N('Lambda:A:fn', 'Lambda', 'repoA'),
        N('Database:A:db', 'Database', 'repoA'),
        N('Queue:B:q', 'Queue', 'repoB'),
      ],
      [
        E('Lambda:A:fn', 'Database:A:db', 'reads'),
        E('Lambda:A:fn', 'Queue:B:q', 'publishes'),
      ],
    );

    const result = componentIntegration(graph, { repo: 'repoA' });
    expect(result.scope).toBe('repoA');
    expect(result.components.length).toBe(2);
    // Both edges involve repoA nodes, so both should be included
    expect(result.summary.totalEdges).toBe(2);
  });

  it('groups edges by pattern', () => {
    const graph = makeGraph(
      [
        N('Lambda:A:fn', 'Lambda', 'repoA'),
        N('Database:A:db', 'Database', 'repoA'),
        N('Queue:A:q', 'Queue', 'repoA'),
      ],
      [
        E('Lambda:A:fn', 'Database:A:db', 'reads'),
        E('Lambda:A:fn', 'Queue:A:q', 'publishes'),
      ],
    );

    const result = componentIntegration(graph);
    const patterns = result.integrations.map(g => g.pattern);
    expect(patterns).toContain('Shared Database');
    expect(patterns).toContain('Event Stream');
  });
});

// ---------------------------------------------------------------------------
// blastRadiusWorkspace
// ---------------------------------------------------------------------------

describe('blastRadiusWorkspace', () => {
  it('tier-0 contains only the target', () => {
    const graph = makeGraph(
      [
        N('Lambda:A:fn', 'Lambda', 'repoA'),
        N('Database:B:db', 'Database', 'repoB'),
      ],
      [E('Lambda:A:fn', 'Database:B:db', 'reads')],
    );

    const result = blastRadiusWorkspace(graph, 'Lambda:A:fn');
    expect(result.kind).toBe('blast-radius');
    expect(result.tiers[0]!.tier).toBe(0);
    expect(result.tiers[0]!.nodes.length).toBe(1);
    expect(result.tiers[0]!.nodes[0]!.id).toBe('Lambda:A:fn');
  });

  it('finds direct neighbors in tier 1', () => {
    const graph = makeGraph(
      [
        N('A', 'Lambda', 'r1'),
        N('B', 'Database', 'r2'),
        N('C', 'Queue', 'r2'),
      ],
      [
        E('A', 'B', 'reads'),
        E('A', 'C', 'publishes'),
      ],
    );

    const result = blastRadiusWorkspace(graph, 'A');
    expect(result.tiers.length).toBe(2);
    expect(result.tiers[1]!.nodes.length).toBe(2);
  });

  it('finds transitive dependents in tier 2+', () => {
    const graph = makeGraph(
      [
        N('A', 'Lambda', 'r1'),
        N('B', 'Database', 'r2'),
        N('C', 'Lambda', 'r3'),
      ],
      [
        E('A', 'B', 'reads'),
        E('C', 'B', 'reads'),
      ],
    );

    const result = blastRadiusWorkspace(graph, 'A');
    expect(result.affectedNodeCount).toBe(3);
    const tier2Nodes = result.tiers.find(t => t.tier === 2)?.nodes ?? [];
    expect(tier2Nodes.length).toBe(1);
    expect(tier2Nodes[0]!.id).toBe('C');
  });

  it('throws on non-existent target', () => {
    const graph = makeGraph([], []);
    expect(() => blastRadiusWorkspace(graph, 'nope')).toThrowError('Node not found');
  });

  it('handles cyclic edges without infinite loop', () => {
    const graph = makeGraph(
      [
        N('A', 'Lambda', 'r1'),
        N('B', 'Lambda', 'r1'),
      ],
      [
        E('A', 'B', 'invokes'),
        E('B', 'A', 'invokes'),
      ],
    );

    const result = blastRadiusWorkspace(graph, 'A');
    expect(result.affectedNodeCount).toBe(2);
  });

  it('classifies risk based on tier-2 and repo spread', () => {
    const graph = makeGraph(
      [
        N('A', 'Lambda', 'r1'),
        N('B', 'Database', 'r2'),
        N('C', 'Lambda', 'r3'),
        N('D', 'Queue', 'r4'),
      ],
      [
        E('A', 'B', 'reads'),
        E('C', 'B', 'reads'),
        E('D', 'C', 'consumes'),
      ],
    );

    const result = blastRadiusWorkspace(graph, 'A');
    expect(result.affectedRepos.length).toBeGreaterThanOrEqual(2);
    expect(['medium', 'high', 'critical']).toContain(result.risk);
  });

  it('node with no edges returns low risk', () => {
    const graph = makeGraph(
      [N('solo', 'Lambda', 'r1')],
      [],
    );

    const result = blastRadiusWorkspace(graph, 'solo');
    expect(result.risk).toBe('low');
    expect(result.affectedNodeCount).toBe(1);
    expect(result.tiers.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// whatCalls (Section 11 port)
// ---------------------------------------------------------------------------

describe('whatCalls', () => {
  it('returns callers on invokes/publishes verbs', () => {
    const graph = makeGraph(
      [N('Service:A', 'Service', 'r1'), N('Service:B', 'Service', 'r2'), N('Service:C', 'Service', 'r3')],
      [E('Service:A', 'Service:C', 'invokes'), E('Service:B', 'Service:C', 'publishes')],
    );
    const result = whatCalls(graph, 'Service:C');
    expect(result.callers).toEqual(['Service:A', 'Service:B']);
  });

  it('ignores non-call verbs', () => {
    const graph = makeGraph(
      [N('Service:A', 'Service', 'r1'), N('Database:B', 'Database', 'r1')],
      [E('Service:A', 'Database:B', 'reads')],
    );
    const result = whatCalls(graph, 'Database:B');
    expect(result.callers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// whatDependsOn (Section 11 port)
// ---------------------------------------------------------------------------

describe('whatDependsOn', () => {
  it('returns transitive forward closure', () => {
    const graph = makeGraph(
      [N('S:A', 'Service', 'r1'), N('S:B', 'Service', 'r2'), N('S:C', 'Service', 'r3')],
      [E('S:A', 'S:B', 'invokes'), E('S:B', 'S:C', 'reads')],
    );
    const result = whatDependsOn(graph, 'S:A');
    expect(result.dependents).toEqual(['S:B', 'S:C']);
  });

  it('handles cycles without infinite loop', () => {
    const graph = makeGraph(
      [N('S:A', 'Service', 'r1'), N('S:B', 'Service', 'r2')],
      [E('S:A', 'S:B', 'invokes'), E('S:B', 'S:A', 'invokes')],
    );
    const result = whatDependsOn(graph, 'S:A');
    expect(result.dependents).toEqual(['S:B']);
  });
});

// ---------------------------------------------------------------------------
// blastRadiusNode (Section 11 port)
// ---------------------------------------------------------------------------

describe('blastRadiusNode', () => {
  it('returns reverse transitive closure', () => {
    const graph = makeGraph(
      [N('S:A', 'Service', 'r1'), N('S:B', 'Service', 'r2'), N('S:C', 'Service', 'r3')],
      [E('S:A', 'S:B', 'invokes'), E('S:B', 'S:C', 'reads')],
    );
    const result = blastRadiusNode(graph, 'S:C');
    expect(result.affected).toEqual(['S:A', 'S:B']);
  });

  it('returns empty for leaf node with no incoming edges', () => {
    const graph = makeGraph(
      [N('S:A', 'Service', 'r1')],
      [],
    );
    const result = blastRadiusNode(graph, 'S:A');
    expect(result.affected).toEqual([]);
  });
});
