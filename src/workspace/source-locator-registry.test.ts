import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

import {
  emitSourceLocatorRegistry,
  loadSourceLocatorRegistry,
  resolveLocator,
} from './source-locator-registry.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'source-locators-'));
  await mkdir(path.join(tmpDir, 'repoA', 'src'), { recursive: true });
  await mkdir(path.join(tmpDir, 'out', 'slices'), { recursive: true });
  await writeFile(path.join(tmpDir, 'repoA', 'src', 'fn.ts'), 'export const fn = 1;\n', 'utf-8');
  await writeFile(
    path.join(tmpDir, 'out', 'slices', 'repoA.yaml'),
    yaml.dump({
      schema_version: '1.0',
      repo: 'repoA',
      generated_by: 'test',
      generated_at: '2026-01-01T00:00:00Z',
      nodes: [
        {
          id: 'Lambda:repoA:fn',
          type: 'Lambda',
          name: 'fn',
          provenance: { source_path: 'src/fn.ts', source_ref: 'fn', repo: 'repoA' },
        },
      ],
      edges: [],
    }),
    'utf-8',
  );
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('SourceLocatorRegistry', () => {
  it('emits deterministic source locator entries from workspace slices', async () => {
    const result = await emitSourceLocatorRegistry({
      outputDir: path.join(tmpDir, 'out'),
      workspaceRoot: tmpDir,
      repos: [{ name: 'repoA', path: 'repoA' }],
      graphSnapshotHash: 'sha256:graph',
      workspaceManifestHash: 'sha256:manifest',
      generatedAt: '2026-01-01T00:00:00.000Z',
      generatedBy: 'test',
    });

    expect(result.registry.locators).toHaveLength(1);
    expect(result.registry.locators[0]).toMatchObject({
      entity_uri: 'entity://workspace/Lambda%3ArepoA%3Afn',
      entity_id: 'Lambda:repoA:fn',
      entity_type: 'Lambda',
      source_uri: 'workspace://repoA/src/fn.ts',
      repo: 'repoA',
      path: 'src/fn.ts',
      graph_snapshot_hash: 'sha256:graph',
      canonical: true,
      authority: 'repoA',
    });
    expect(result.registry.locators[0].source_hash).toMatch(/^sha256:/);

    const raw = await readFile(path.join(tmpDir, 'out', 'source-locator-registry.yaml'), 'utf-8');
    expect(raw).not.toContain('export const fn');
  });

  it('resolves entity and workspace URIs through the registry', async () => {
    await emitSourceLocatorRegistry({
      outputDir: path.join(tmpDir, 'out'),
      workspaceRoot: tmpDir,
      repos: [{ name: 'repoA', path: 'repoA' }],
      graphSnapshotHash: 'sha256:graph',
      workspaceManifestHash: 'sha256:manifest',
      generatedAt: '2026-01-01T00:00:00.000Z',
      generatedBy: 'test',
    });

    const registry = await loadSourceLocatorRegistry(path.join(tmpDir, 'out'));
    expect(resolveLocator(registry, 'Lambda:repoA:fn')?.source_uri).toBe('workspace://repoA/src/fn.ts');
    expect(resolveLocator(registry, 'entity://workspace/Lambda%3ArepoA%3Afn')?.source_uri).toBe('workspace://repoA/src/fn.ts');
    expect(resolveLocator(registry, 'workspace://repoA/src/fn.ts')?.entity_id).toBe('Lambda:repoA:fn');
  });

  it('emits locators from ADR architecture entity registries', async () => {
    await mkdir(path.join(tmpDir, 'repoA', 'adrs', 'index'), { recursive: true });
    await mkdir(path.join(tmpDir, 'repoA', 'adrs', 'logical'), { recursive: true });
    await writeFile(path.join(tmpDir, 'repoA', 'adrs', 'logical', 'ADR-L-0001-test.yaml'), 'id: ADR-L-0001\n', 'utf-8');
    await writeFile(
      path.join(tmpDir, 'repoA', 'adrs', 'index', 'entity-registry.yaml'),
      yaml.dump({
        schema_version: '1.1',
        type: 'normalized_entity_registry',
        entities: [
          {
            id: 'ADR-L-0001',
            entity_type: 'adr',
            name: 'Test ADR',
            canonical_source: {
              source_type: 'logical_adr',
              source_ref: 'ADR-L-0001',
              artifact_path: 'adrs/logical/ADR-L-0001-test.yaml',
            },
          },
        ],
      }),
      'utf-8',
    );

    await emitSourceLocatorRegistry({
      outputDir: path.join(tmpDir, 'out'),
      workspaceRoot: tmpDir,
      repos: [{ name: 'repoA', path: 'repoA' }],
      graphSnapshotHash: 'sha256:graph',
      workspaceManifestHash: 'sha256:manifest',
      generatedAt: '2026-01-01T00:00:00.000Z',
      generatedBy: 'test',
    });

    const registry = await loadSourceLocatorRegistry(path.join(tmpDir, 'out'));
    expect(resolveLocator(registry, 'adr://ADR-L-0001')?.source_uri).toBe(
      'workspace://repoA/adrs/logical/ADR-L-0001-test.yaml',
    );
  });
});
