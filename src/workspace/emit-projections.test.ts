import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emitProjections } from './emit-projections.js';
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
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'emit-proj-'));
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

describe('emitProjections', () => {
  it('writes all expected projection files for a 2-repo workspace', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
      { name: 'repoB', status: 'success', slice: 'slices/repoB.yaml' },
    ]);

    await writeSlice('repoA', [
      { id: 'Lambda:repoA:fn1', type: 'Lambda', name: 'fn1', provenance: { repo: 'repoA', source_path: 'f.py', source_ref: 'Fn1' } },
      { id: 'Queue:repoA:q', type: 'Queue', name: 'q', provenance: { repo: 'repoA', source_path: 'q.yaml', source_ref: 'Q' } },
    ], [
      { from: 'Lambda:repoA:fn1', to: 'Queue:repoA:q', verb: 'publishes', confidence: 'high' },
    ]);

    await writeSlice('repoB', [
      { id: 'Database:repoB:db', type: 'Database', name: 'db', provenance: { repo: 'repoB', source_path: 'db.yaml', source_ref: 'Db' } },
    ], [
      { from: 'Lambda:repoA:fn1', to: 'Database:repoB:db', verb: 'reads', confidence: 'high' },
    ]);

    const result = await emitProjections(tmpDir, MANIFEST);

    expect(result.fileCount).toBe(5);
    expect(result.filePaths).toHaveLength(5);

    const fileNames = result.filePaths.map(p => path.basename(p));
    expect(fileNames).toContain('system-dependencies.md');
    expect(fileNames).toContain('component-integration.md');
    expect(fileNames).toContain('component-integration-repoA.md');
    expect(fileNames).toContain('component-integration-repoB.md');
    expect(fileNames).toContain('architecture-overview.md');
  });

  it('system-dependencies.md contains Mermaid flowchart and markdown table', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
      { name: 'repoB', status: 'success', slice: 'slices/repoB.yaml' },
    ]);

    await writeSlice('repoA', [
      { id: 'Lambda:repoA:fn1', type: 'Lambda', name: 'fn1', provenance: { repo: 'repoA', source_path: 'f.py', source_ref: 'Fn1' } },
    ], []);

    await writeSlice('repoB', [
      { id: 'Database:repoB:db', type: 'Database', name: 'db', provenance: { repo: 'repoB', source_path: 'db.yaml', source_ref: 'Db' } },
    ], [
      { from: 'Lambda:repoA:fn1', to: 'Database:repoB:db', verb: 'reads', confidence: 'high' },
    ]);

    await emitProjections(tmpDir, MANIFEST);
    const content = await readProjection('system-dependencies.md');

    expect(content).toContain('flowchart');
    expect(content).toContain('From Repo');
    expect(content).toContain('To Repo');
    expect(content).toContain('Connection Type');
    expect(content).toContain('Details');
  });

  it('architecture-overview.md contains LLM-enrichment markers and repo summary', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
      { name: 'repoB', status: 'success', slice: 'slices/repoB.yaml' },
    ]);

    await writeSlice('repoA', [
      { id: 'Lambda:repoA:fn1', type: 'Lambda', name: 'fn1', provenance: { repo: 'repoA', source_path: 'f.py', source_ref: 'Fn1' } },
    ], []);

    await writeSlice('repoB', [
      { id: 'Database:repoB:db', type: 'Database', name: 'db', provenance: { repo: 'repoB', source_path: 'db.yaml', source_ref: 'Db' } },
    ], []);

    await emitProjections(tmpDir, MANIFEST);
    const content = await readProjection('architecture-overview.md');

    expect(content).toContain('<!-- LLM-ENRICHMENT: system-context -->');
    expect(content).toContain('<!-- LLM-ENRICHMENT: narrative-repoA -->');
    expect(content).toContain('<!-- LLM-ENRICHMENT: narrative-repoB -->');
    expect(content).toContain('Workspace Repo Summary');
    expect(content).toContain('repoA');
    expect(content).toContain('repoB');
  });

  it('creates per-repo files matching manifest repo names', async () => {
    await writeIndex([
      { name: 'repoA', status: 'success', slice: 'slices/repoA.yaml' },
      { name: 'repoB', status: 'success', slice: 'slices/repoB.yaml' },
    ]);

    await writeSlice('repoA', [
      { id: 'Lambda:repoA:fn1', type: 'Lambda', name: 'fn1', provenance: { repo: 'repoA', source_path: 'f.py', source_ref: 'Fn1' } },
    ], []);

    await writeSlice('repoB', [
      { id: 'Database:repoB:db', type: 'Database', name: 'db', provenance: { repo: 'repoB', source_path: 'db.yaml', source_ref: 'Db' } },
    ], []);

    await emitProjections(tmpDir, MANIFEST);

    const repoAContent = await readProjection('component-integration-repoA.md');
    expect(repoAContent).toContain('Component Integration: repoA');
    expect(repoAContent).toContain('Scope: repoA');

    const repoBContent = await readProjection('component-integration-repoB.md');
    expect(repoBContent).toContain('Component Integration: repoB');
    expect(repoBContent).toContain('Scope: repoB');
  });

  it('produces valid but minimal projections for an empty graph', async () => {
    await writeIndex([]);

    const result = await emitProjections(tmpDir, MANIFEST);

    expect(result.fileCount).toBe(5);

    const sysDeps = await readProjection('system-dependencies.md');
    expect(sysDeps).toContain('System Dependencies');
    expect(sysDeps).toContain('0 repos');

    const overview = await readProjection('architecture-overview.md');
    expect(overview).toContain('Architecture Overview');
    expect(overview).toContain('<!-- LLM-ENRICHMENT: system-context -->');
  });

  it('throws when workspace-index.yaml is missing (caller handles non-fatally)', async () => {
    await expect(emitProjections(tmpDir, MANIFEST)).rejects.toThrow();
  });
});
