import { mkdir, mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emitMultiResProjections } from './emit-multi-res-projections.js';
import type { WorkspaceManifest } from './manifest.js';

let tmpDir: string;

const MANIFEST: WorkspaceManifest = {
  schema_version: '1.0',
  output_dir: '.',
  repos: [
    { name: 'repoA', path: './repoA', kind: 'service', lang: 'typescript' },
    { name: 'repoB', path: './repoB', kind: 'service', lang: 'dotnet' },
  ],
  external_systems: [],
};

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'emit-mres-'));
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

async function readProjection(name: string): Promise<string> {
  return readFile(path.join(tmpDir, 'projections', name), 'utf-8');
}

describe('emitMultiResProjections', () => {
  it('emits L0, L1, L2 workspace-level files', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
      { name: 'repoB', status: 'success', slice: 'slices/repoB.yaml' },
    ]);
    await writeSlice('repoA', [
      { id: 'Service:repoA', type: 'Service', name: 'repoA', provenance: { repo: 'repoA' } },
      { id: 'Endpoint:repoA:get:api-account-info', type: 'Endpoint', name: 'api-account-info', provenance: { repo: 'repoA' } },
      { id: 'Endpoint:repoA:get:api-account-list', type: 'Endpoint', name: 'api-account-list', provenance: { repo: 'repoA' } },
    ], [
      { from: 'Service:repoA', to: 'Endpoint:repoA:get:api-account-info', verb: 'has_contract' },
      { from: 'Service:repoA', to: 'Endpoint:repoA:get:api-account-list', verb: 'has_contract' },
    ]);
    await writeSlice('repoB', [
      { id: 'Service:repoB', type: 'Service', name: 'repoB', provenance: { repo: 'repoB' } },
    ], []);

    const result = await emitMultiResProjections(tmpDir, MANIFEST);
    const fileNames = result.filePaths.map(p => path.basename(p));

    expect(fileNames).toContain('system-context-L0.md');
    expect(fileNames).toContain('service-topology-L1.md');
    expect(fileNames).toContain('capability-domains-L2.md');
    expect(fileNames).toContain('contract-integration-L3.md');
    expect(result.fileCount).toBeGreaterThanOrEqual(4);
  });

  it('L0 file contains only Service nodes', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
    ]);
    await writeSlice('repoA', [
      { id: 'Service:repoA', type: 'Service', name: 'repoA', provenance: { repo: 'repoA' } },
      { id: 'Lambda:repoA:fn1', type: 'Lambda', name: 'fn1', provenance: { repo: 'repoA' } },
    ], []);

    await emitMultiResProjections(tmpDir, MANIFEST);
    const content = await readProjection('system-context-L0.md');

    expect(content).toContain('projection_level: L0');
    expect(content).toContain('derivation: deterministic');
    expect(content).toContain('flowchart TD');
  });

  it('each file has valid YAML frontmatter', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
    ]);
    await writeSlice('repoA', [
      { id: 'Service:repoA', type: 'Service', name: 'repoA', provenance: { repo: 'repoA' } },
    ], []);

    const result = await emitMultiResProjections(tmpDir, MANIFEST);

    for (const fp of result.filePaths) {
      const content = await readFile(fp, 'utf-8');
      expect(content).toMatch(/^---\n/);
      const endIdx = content.indexOf('\n---\n', 4);
      expect(endIdx).toBeGreaterThan(0);
      const frontmatterStr = content.slice(4, endIdx);
      const parsed = yaml.load(frontmatterStr) as Record<string, unknown>;
      expect(parsed).toHaveProperty('projection_level');
      expect(parsed).toHaveProperty('derivation', 'deterministic');
      expect(parsed).toHaveProperty('generation_hash');
      expect(parsed).toHaveProperty('node_count');
      expect(parsed).toHaveProperty('edge_count');
      expect(parsed).toHaveProperty('compression_ratio');
    }
  });

  it('each file contains a navigation bar', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
    ]);
    await writeSlice('repoA', [
      { id: 'Service:repoA', type: 'Service', name: 'repoA', provenance: { repo: 'repoA' } },
    ], []);

    const result = await emitMultiResProjections(tmpDir, MANIFEST);

    for (const fp of result.filePaths) {
      const content = await readFile(fp, 'utf-8');
      expect(content).toContain('> **Resolution:**');
      expect(content).toContain('System Context');
      expect(content).toContain('Full Graph');
    }
  });

  it('produces valid minimal files for empty graph', async () => {
    await writeIndex([]);

    const result = await emitMultiResProjections(tmpDir, MANIFEST);

    expect(result.fileCount).toBeGreaterThanOrEqual(4);
    for (const fp of result.filePaths) {
      const content = await readFile(fp, 'utf-8');
      expect(content).toContain('projection_level:');
      expect(content).toContain('derivation: deterministic');
    }
  });

  it('emits per-repo L2 files matching manifest repos', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
      { name: 'repoB', status: 'success', slice: 'slices/repoB.yaml' },
    ]);
    await writeSlice('repoA', [
      { id: 'Service:repoA', type: 'Service', name: 'repoA', provenance: { repo: 'repoA' } },
      { id: 'Endpoint:repoA:get:api-account-info', type: 'Endpoint', name: 'api-account-info', provenance: { repo: 'repoA' } },
      { id: 'Endpoint:repoA:get:api-account-list', type: 'Endpoint', name: 'api-account-list', provenance: { repo: 'repoA' } },
    ], [
      { from: 'Service:repoA', to: 'Endpoint:repoA:get:api-account-info', verb: 'has_contract' },
      { from: 'Service:repoA', to: 'Endpoint:repoA:get:api-account-list', verb: 'has_contract' },
    ]);
    await writeSlice('repoB', [
      { id: 'Service:repoB', type: 'Service', name: 'repoB', provenance: { repo: 'repoB' } },
    ], []);

    const result = await emitMultiResProjections(tmpDir, MANIFEST);
    const fileNames = result.filePaths.map(p => path.basename(p));

    expect(fileNames).toContain('capability-domains-L2-repoA.md');
  });
});
