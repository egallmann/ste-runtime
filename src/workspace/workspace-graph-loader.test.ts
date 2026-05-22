import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadWorkspaceGraph } from './workspace-graph-loader.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ws-loader-'));
  await mkdir(path.join(tmpDir, 'slices'), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeIndex(repos: Array<{ name: string; status: string; slice?: string }>) {
  const doc = { schema_version: '1.0', generated_at: new Date().toISOString(), repos };
  await writeFile(path.join(tmpDir, 'workspace-index.yaml'), yaml.dump(doc), 'utf-8');
}

async function writeSlice(repoName: string, nodes: unknown[], edges: unknown[]) {
  const doc = {
    schema_version: '1.0',
    repo: repoName,
    generated_by: 'test',
    generated_at: new Date().toISOString(),
    source_commit: null,
    nodes,
    edges,
    diagnostics: [],
  };
  await writeFile(path.join(tmpDir, 'slices', `${repoName}.yaml`), yaml.dump(doc), 'utf-8');
}

describe('loadWorkspaceGraph', () => {
  it('loads a workspace with two repos', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
      { name: 'repoB', status: 'success', slice: 'slices/repoB.yaml' },
    ]);

    await writeSlice('repoA', [
      { id: 'Service:repoA', type: 'Service', name: 'repoA', provenance: { source_path: '.', source_ref: 'workspace', repo: 'repoA' } },
      { id: 'Lambda:repoA:fn1', type: 'Lambda', name: 'fn1', provenance: { source_path: 'fn.py', source_ref: 'Fn1', repo: 'repoA' } },
    ], [
      { from: 'Service:repoA', to: 'Lambda:repoA:fn1', verb: 'has_contract', confidence: 'high', provenance: { source_path: 'x.yaml', source_ref: '1' } },
    ]);

    await writeSlice('repoB', [
      { id: 'Service:repoB', type: 'Service', name: 'repoB', provenance: { source_path: '.', source_ref: 'workspace', repo: 'repoB' } },
      { id: 'Database:repoB:db', type: 'Database', name: 'db', provenance: { source_path: 'db.yaml', source_ref: 'Db', repo: 'repoB' } },
    ], [
      { from: 'Lambda:repoA:fn1', to: 'Database:repoB:db', verb: 'reads', confidence: 'high', provenance: { source_path: 'y.py', source_ref: 'sdk:dynamodb' } },
    ]);

    const graph = await loadWorkspaceGraph(tmpDir);

    expect(graph.nodes.size).toBe(4);
    expect(graph.edges.length).toBe(2);
    expect(graph.outAdj.get('Service:repoA')?.length).toBe(1);
    expect(graph.inAdj.get('Database:repoB:db')?.length).toBe(1);
    expect(graph.nodes.get('Lambda:repoA:fn1')?.repo).toBe('repoA');
  });

  it('handles an empty workspace', async () => {
    await writeIndex([]);
    const graph = await loadWorkspaceGraph(tmpDir);
    expect(graph.nodes.size).toBe(0);
    expect(graph.edges.length).toBe(0);
  });

  it('skips failed repos in the index', async () => {
    await writeIndex([
      { name: 'ok', status: 'success', slice: 'slices/ok.yaml' },
      { name: 'bad', status: 'failed' },
    ]);
    await writeSlice('ok', [
      { id: 'Service:ok', type: 'Service', name: 'ok', provenance: { source_path: '.', source_ref: 'workspace', repo: 'ok' } },
    ], []);

    const graph = await loadWorkspaceGraph(tmpDir);
    expect(graph.nodes.size).toBe(1);
    expect(graph.nodes.has('Service:ok')).toBe(true);
  });

  it('skips slices that do not exist on disk', async () => {
    await writeIndex([
      { name: 'ghost', status: 'success', slice: 'slices/ghost.yaml' },
    ]);
    const graph = await loadWorkspaceGraph(tmpDir);
    expect(graph.nodes.size).toBe(0);
  });

  it('populates adjacency lists correctly for bidirectional lookup', async () => {
    await writeIndex([
      { name: 'r', status: 'success', slice: 'slices/r.yaml' },
    ]);
    await writeSlice('r', [
      { id: 'A', type: 'Lambda', name: 'A', provenance: { repo: 'r' } },
      { id: 'B', type: 'Database', name: 'B', provenance: { repo: 'r' } },
      { id: 'C', type: 'Queue', name: 'C', provenance: { repo: 'r' } },
    ], [
      { from: 'A', to: 'B', verb: 'reads', confidence: 'high', provenance: { source_path: 'x', source_ref: 'y' } },
      { from: 'A', to: 'C', verb: 'publishes', confidence: 'high', provenance: { source_path: 'x', source_ref: 'y' } },
    ]);

    const graph = await loadWorkspaceGraph(tmpDir);

    expect(graph.outAdj.get('A')?.length).toBe(2);
    expect(graph.outAdj.has('B')).toBe(false);
    expect(graph.inAdj.get('B')?.length).toBe(1);
    expect(graph.inAdj.get('C')?.length).toBe(1);
    expect(graph.inAdj.has('A')).toBe(false);
  });
});
