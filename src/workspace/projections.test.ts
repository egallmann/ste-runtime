import { describe, expect, it } from 'vitest';

import type { WorkspaceNode, WorkspaceEdge, WorkspaceGraph } from './workspace-graph-loader.js';
import {
  systemDependencies,
  componentIntegration,
  blastRadiusWorkspace,
} from './canned-queries.js';
import { toMermaid, toTable, toAdjacencyMatrix, toMermaidAtResolution, toTableAtResolution, navigationBar } from './projections.js';
import { compress } from './compression.js';

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

function sampleGraph(): WorkspaceGraph {
  return makeGraph(
    [
      N('Service:repoA', 'Service', 'repoA'),
      N('Lambda:repoA:fn1', 'Lambda', 'repoA'),
      N('Database:repoB:db', 'Database', 'repoB'),
      N('Service:repoB', 'Service', 'repoB'),
      N('Queue:repoA:q', 'Queue', 'repoA'),
    ],
    [
      E('Service:repoA', 'Lambda:repoA:fn1', 'has_contract'),
      E('Lambda:repoA:fn1', 'Database:repoB:db', 'reads'),
      E('Lambda:repoA:fn1', 'Queue:repoA:q', 'publishes'),
    ],
  );
}

// ---------------------------------------------------------------------------
// toMermaid
// ---------------------------------------------------------------------------

describe('toMermaid', () => {
  it('produces valid flowchart for systemDependencies', () => {
    const graph = sampleGraph();
    const result = systemDependencies(graph);
    const output = toMermaid(result);

    expect(output).toContain('flowchart TD');
    expect(output).toContain('repoA');
    expect(output).toContain('repoB');
    expect(output).toContain('-->');
  });

  it('produces subgraph blocks for componentIntegration', () => {
    const graph = sampleGraph();
    const result = componentIntegration(graph);
    const output = toMermaid(result);

    expect(output).toContain('flowchart TD');
    expect(output).toContain('subgraph');
    expect(output).toContain('end');
    expect(output).toContain('reads');
    expect(output).toContain('publishes');
  });

  it('produces tier subgraphs for blastRadius', () => {
    const graph = sampleGraph();
    const result = blastRadiusWorkspace(graph, 'Lambda:repoA:fn1');
    const output = toMermaid(result);

    expect(output).toContain('flowchart TD');
    expect(output).toContain('Target');
    expect(output).toContain('Tier 1');
  });

  it('sanitizes node IDs to remove special characters', () => {
    const graph = makeGraph(
      [N('Lambda:repo-A:my-fn', 'Lambda', 'repo-A')],
      [],
    );
    const result = blastRadiusWorkspace(graph, 'Lambda:repo-A:my-fn');
    const output = toMermaid(result);

    expect(output).toContain('Lambda_repo_A_my_fn');
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Lambda_repo_A_my_fn')) {
        const beforeQuote = trimmed.split('"')[0]!;
        expect(beforeQuote).not.toContain(':');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// toTable
// ---------------------------------------------------------------------------

describe('toTable', () => {
  it('has correct columns for systemDependencies', () => {
    const graph = sampleGraph();
    const result = systemDependencies(graph);
    const rows = toTable(result);

    expect(rows.length).toBeGreaterThan(0);
    const keys = Object.keys(rows[0]!);
    expect(keys).toContain('From Repo');
    expect(keys).toContain('To Repo');
    expect(keys).toContain('Connection Type');
    expect(keys).toContain('Details');
  });

  it('has correct columns for componentIntegration', () => {
    const graph = sampleGraph();
    const result = componentIntegration(graph);
    const rows = toTable(result);

    expect(rows.length).toBeGreaterThan(0);
    const keys = Object.keys(rows[0]!);
    expect(keys).toContain('Component');
    expect(keys).toContain('Type');
    expect(keys).toContain('Connects To');
    expect(keys).toContain('Via');
  });

  it('has correct columns for blastRadius', () => {
    const graph = sampleGraph();
    const result = blastRadiusWorkspace(graph, 'Lambda:repoA:fn1');
    const rows = toTable(result);

    expect(rows.length).toBeGreaterThan(0);
    const keys = Object.keys(rows[0]!);
    expect(keys).toContain('Tier');
    expect(keys).toContain('Component');
    expect(keys).toContain('Repo');
    expect(keys).toContain('Type');
  });
});

// ---------------------------------------------------------------------------
// toAdjacencyMatrix
// ---------------------------------------------------------------------------

describe('toAdjacencyMatrix', () => {
  it('produces a square matrix for systemDependencies', () => {
    const graph = sampleGraph();
    const result = systemDependencies(graph);
    const m = toAdjacencyMatrix(result);

    expect(m.labels.length).toBeGreaterThan(0);
    expect(m.matrix.length).toBe(m.labels.length);
    for (const row of m.matrix) {
      expect(row.length).toBe(m.labels.length);
    }
  });

  it('populates cells with verbs for connected nodes', () => {
    const graph = sampleGraph();
    const result = systemDependencies(graph);
    const m = toAdjacencyMatrix(result);

    const fromIdx = m.labels.indexOf('repoA');
    const toIdx = m.labels.indexOf('repoB');
    expect(fromIdx).toBeGreaterThanOrEqual(0);
    expect(toIdx).toBeGreaterThanOrEqual(0);
    expect(m.matrix[fromIdx]![toIdx]).toContain('reads');
  });

  it('produces correct labels for componentIntegration', () => {
    const graph = sampleGraph();
    const result = componentIntegration(graph);
    const m = toAdjacencyMatrix(result);

    expect(m.labels).toContain('Lambda:repoA:fn1');
    expect(m.labels).toContain('Database:repoB:db');
  });

  it('is square for blastRadius', () => {
    const graph = sampleGraph();
    const result = blastRadiusWorkspace(graph, 'Lambda:repoA:fn1');
    const m = toAdjacencyMatrix(result);

    expect(m.matrix.length).toBe(m.labels.length);
    for (const row of m.matrix) {
      expect(row.length).toBe(m.labels.length);
    }
  });
});

// ---------------------------------------------------------------------------
// toMermaidAtResolution
// ---------------------------------------------------------------------------

function sevenRepoGraph(): WorkspaceGraph {
  const nodes: WorkspaceNode[] = [];
  const edges: WorkspaceEdge[] = [];
  const repos = ['repoA', 'repoB', 'repoC', 'repoD', 'repoE', 'repoF', 'repoG'];
  for (const r of repos) {
    nodes.push(N(`Service:${r}`, 'Service', r));
  }
  edges.push(E('Service:repoA', 'Service:repoB', 'calls'));
  return makeGraph(nodes, edges);
}

describe('toMermaidAtResolution', () => {
  it('L0 output is <= 30 lines for 7-repo fixture', () => {
    const graph = sevenRepoGraph();
    const result = componentIntegration(graph);
    const projection = compress(result, { level: 'L0' });
    const output = toMermaidAtResolution(projection);

    const lineCount = output.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(30);
  });

  it('L2 produces capability subgraphs for endpoint-heavy fixture', () => {
    const graph = makeGraph(
      [
        N('Service:api', 'Service', 'api'),
        N('Endpoint:api:get:api-account-info', 'Endpoint', 'api'),
        N('Endpoint:api:get:api-account-list', 'Endpoint', 'api'),
        N('Endpoint:api:post:api-payment-pay', 'Endpoint', 'api'),
        N('Endpoint:api:post:api-payment-refund', 'Endpoint', 'api'),
      ],
      [
        E('Service:api', 'Endpoint:api:get:api-account-info', 'has_contract'),
        E('Service:api', 'Endpoint:api:get:api-account-list', 'has_contract'),
        E('Service:api', 'Endpoint:api:post:api-payment-pay', 'has_contract'),
        E('Service:api', 'Endpoint:api:post:api-payment-refund', 'has_contract'),
      ],
    );
    const result = componentIntegration(graph);
    const projection = compress(result, { level: 'L2' });
    const output = toMermaidAtResolution(projection);

    expect(output).toContain('Account Domain');
    expect(output).toContain('Payment Domain');
  });

  it('L4 backward compat: toMermaid and toMermaidAtResolution produce consistent output', () => {
    const graph = sampleGraph();
    const result = componentIntegration(graph);
    const existing = toMermaid(result);
    const projection = compress(result, { level: 'L4' });
    const atResolution = toMermaidAtResolution(projection);

    expect(existing).toContain('flowchart TD');
    expect(atResolution).toContain('flowchart TD');
    expect(existing).toContain('reads');
    expect(atResolution).toContain('reads');
  });
});

// ---------------------------------------------------------------------------
// toTableAtResolution
// ---------------------------------------------------------------------------

describe('toTableAtResolution', () => {
  it('L2 table has Capability Domain column', () => {
    const graph = makeGraph(
      [
        N('Service:api', 'Service', 'api'),
        N('Endpoint:api:get:api-account-info', 'Endpoint', 'api'),
        N('Endpoint:api:get:api-account-list', 'Endpoint', 'api'),
      ],
      [
        E('Service:api', 'Endpoint:api:get:api-account-info', 'has_contract'),
        E('Service:api', 'Endpoint:api:get:api-account-list', 'has_contract'),
      ],
    );
    const result = componentIntegration(graph);
    const projection = compress(result, { level: 'L2' });
    const rows = toTableAtResolution(projection);

    expect(rows.length).toBeGreaterThan(0);
    const keys = Object.keys(rows[0]!);
    expect(keys).toContain('Capability Domain');
  });

  it('L0 table has Members column for aggregates', () => {
    const graph = sevenRepoGraph();
    const result = componentIntegration(graph);
    const projection = compress(result, { level: 'L0' });
    const rows = toTableAtResolution(projection);

    expect(rows.length).toBe(7);
    expect(rows[0]!['Type']).toBe('Service');
  });
});

// ---------------------------------------------------------------------------
// navigationBar
// ---------------------------------------------------------------------------

describe('navigationBar', () => {
  it('bolds the current level', () => {
    const bar = navigationBar('L2');
    expect(bar).toContain('**L2** Capabilities');
    expect(bar).toContain('L0 [System Context]');
    expect(bar).toContain('L4 [Full Graph]');
  });

  it('includes all 5 levels', () => {
    const bar = navigationBar('L0');
    expect(bar).toContain('L0');
    expect(bar).toContain('L1');
    expect(bar).toContain('L2');
    expect(bar).toContain('L3');
    expect(bar).toContain('L4');
  });
});
