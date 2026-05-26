import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

import { mergeWorkspaceGraph } from './workspace-merge.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-merge-test-'));
  await mkdir(path.join(tempDir, 'slices'), { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function makeSliceYaml(repo: string, nodes: unknown[], edges: unknown[]): string {
  return yaml.dump({
    schema_version: '1.0',
    repo,
    generated_by: 'test',
    generated_at: '2026-01-01T00:00:00Z',
    nodes,
    edges,
  });
}

describe('mergeWorkspaceGraph', () => {
  it('merges nodes and edges from multiple slices', async () => {
    await writeFile(
      path.join(tempDir, 'slices', 'repoA.yaml'),
      makeSliceYaml('repoA', [
        { id: 'Service:repoA:svc', type: 'Service', name: 'SvcA', provenance: { source_path: 'a', source_ref: 'ref' } },
      ], []),
    );
    await writeFile(
      path.join(tempDir, 'slices', 'repoB.yaml'),
      makeSliceYaml('repoB', [
        { id: 'Lambda:repoB:fn', type: 'Lambda', name: 'FnB', provenance: { source_path: 'b', source_ref: 'ref' } },
      ], [
        { from: 'Lambda:repoB:fn', to: 'Service:repoA:svc', verb: 'invokes', confidence: 'high', provenance: { source_path: 'b', source_ref: 'ref' } },
      ]),
    );

    const result = await mergeWorkspaceGraph(tempDir);
    expect(result.graph.nodes.length).toBe(2);
    expect(result.graph.edges.length).toBe(1);
    expect(result.graph.partial_from).toEqual([]);
    expect(result.repoStatuses.every((s) => s.status === 'success')).toBe(true);

    const graphYaml = await readFile(path.join(tempDir, 'graph.yaml'), 'utf-8');
    const graphDoc = yaml.load(graphYaml) as Record<string, unknown>;
    expect(graphDoc.schema_version).toBe('1.0');
  });

  it('detects node ID collisions with first-wins policy', async () => {
    await writeFile(
      path.join(tempDir, 'slices', 'repoA.yaml'),
      makeSliceYaml('repoA', [
        { id: 'Service:shared:svc', type: 'Service', name: 'SvcA', provenance: { source_path: 'a', source_ref: 'ref' } },
      ], []),
    );
    await writeFile(
      path.join(tempDir, 'slices', 'repoB.yaml'),
      makeSliceYaml('repoB', [
        { id: 'Service:shared:svc', type: 'Service', name: 'SvcB-different', provenance: { source_path: 'b', source_ref: 'ref' } },
      ], []),
    );

    const result = await mergeWorkspaceGraph(tempDir);
    expect(result.graph.nodes.length).toBe(1);
    expect(result.graph.nodes[0].name).toBe('SvcA');
  });

  it('records failed repos in partial_from', async () => {
    await writeFile(path.join(tempDir, 'slices', 'bad.yaml'), 'this is: [not valid YAML');

    const result = await mergeWorkspaceGraph(tempDir);
    expect(result.graph.partial_from).toContain('bad');
    expect(result.repoStatuses.find((s) => s.name === 'bad')?.status).toBe('failed');
  });

  it('drops edges with dangling references', async () => {
    await writeFile(
      path.join(tempDir, 'slices', 'repo.yaml'),
      makeSliceYaml('repo', [
        { id: 'Service:repo:svc', type: 'Service', name: 'Svc', provenance: { source_path: 'x', source_ref: 'ref' } },
      ], [
        { from: 'Service:repo:svc', to: 'Lambda:missing:fn', verb: 'invokes', confidence: 'high', provenance: { source_path: 'x', source_ref: 'ref' } },
      ]),
    );

    const result = await mergeWorkspaceGraph(tempDir);
    expect(result.graph.edges.length).toBe(0);
  });

  it('folds cross-repo edges from workspace-edges.yaml', async () => {
    await writeFile(
      path.join(tempDir, 'slices', 'repoA.yaml'),
      makeSliceYaml('repoA', [
        { id: 'Service:repoA:svc', type: 'Service', name: 'SvcA', provenance: { source_path: 'a', source_ref: 'ref' } },
      ], []),
    );
    await writeFile(
      path.join(tempDir, 'slices', 'repoB.yaml'),
      makeSliceYaml('repoB', [
        { id: 'Endpoint:repoB:ep', type: 'Endpoint', name: 'EpB', provenance: { source_path: 'b', source_ref: 'ref' } },
      ], []),
    );
    await writeFile(
      path.join(tempDir, 'workspace-edges.yaml'),
      yaml.dump({
        schema_version: '1.0',
        generated_at: '2026-01-01T00:00:00Z',
        cross_repo_edges: [
          { from: 'Service:repoA:svc', to: 'Endpoint:repoB:ep', verb: 'calls', confidence: 'high', provenance: { source_repo: 'repoA', target_repo: 'repoB', evidence: 'test' } },
        ],
      }),
    );

    const result = await mergeWorkspaceGraph(tempDir);
    expect(result.graph.edges.length).toBe(1);
    expect(result.graph.edges[0].verb).toBe('calls');
  });

  it('emits graph.yaml to output directory', async () => {
    await writeFile(
      path.join(tempDir, 'slices', 'repo.yaml'),
      makeSliceYaml('repo', [
        { id: 'Service:repo:svc', type: 'Service', name: 'Svc', provenance: { source_path: 'x', source_ref: 'ref' } },
      ], []),
    );

    const result = await mergeWorkspaceGraph(tempDir);
    expect(result.graphPath).toBe(path.join(tempDir, 'graph.yaml'));

    const content = await readFile(result.graphPath, 'utf-8');
    expect(content).toBeTruthy();
  });
});
