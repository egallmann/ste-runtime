import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AidocGraph, AidocNode } from '../rss/graph-loader.js';
import type { RssContext } from '../rss/rss-operations.js';
import { diagnose, overview } from './tools-optimized.js';

let tempDir: string;
let ctx: RssContext;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'tools-optimized-architecture-test-'));
  const graph: AidocGraph = new Map();

  const node: AidocNode = {
    key: 'api/function/handler',
    domain: 'api',
    type: 'function',
    id: 'handler',
    path: 'src/api/handler.ts',
    tags: ['exported'],
    sourceFiles: ['src/api/handler.ts'],
    references: [],
    referencedBy: [],
    element: { name: 'handler' },
  };
  graph.set(node.key, node);

  ctx = {
    graph,
    graphVersion: 'test-graph',
    stateRoot: tempDir,
  };
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeYaml(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

async function writeArchitectureBundle(): Promise<void> {
  await writeYaml('adrs/index/architecture-index.yaml', `
schema_version: '1.1'
architecture_namespace: test-runtime
generated_at: '2026-03-19T00:00:00Z'
entity_registry_path: adrs/index/entity-registry.yaml
relationship_registry_path: adrs/index/relationship-registry.yaml
unresolved_registry_path: adrs/index/unresolved-registry.yaml
`);
  await writeYaml('adrs/manifest.yaml', `
schema_version: '1.0'
generated_date: '2026-03-19T00:00:00Z'
adrs:
  - id: ADR-L-0013
`);
  await writeYaml('adrs/index/entity-registry.yaml', 'entities: []\n');
  await writeYaml('adrs/index/relationship-registry.yaml', 'relationships: []\n');
  await writeYaml('adrs/index/unresolved-registry.yaml', 'unresolved: []\n');
}

describe('optimized MCP architecture bundle reporting', () => {
  it('adds architecture bundle status to overview when projectRoot is provided', async () => {
    await writeArchitectureBundle();

    const result = await overview(ctx, {}, { projectRoot: tempDir });

    expect(result.architectureBundle?.status).toBe('valid');
    expect(result.architectureBundle?.index.architectureNamespace).toBe('test-runtime');
  });

  it('adds architecture bundle status to diagnose details when projectRoot is provided', async () => {
    await writeArchitectureBundle();

    const result = await diagnose(ctx, { mode: 'health' }, { projectRoot: tempDir });
    const architectureBundle = result.details.architectureBundle as { status: string; manifest: { adrCount?: number } };

    expect(architectureBundle.status).toBe('valid');
    expect(architectureBundle.manifest.adrCount).toBe(1);
  });
});
