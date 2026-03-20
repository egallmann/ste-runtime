import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compileArchitecture } from './compile-architecture.js';
import { buildAdrGraph } from './adr-graph.js';
import { runArchitecturePipeline } from './run-pipeline.js';
import { architectureMerge, emptyReconSnapshot } from './architecture-merge.js';

async function writeMinimalScope(root: string): Promise<void> {
  await writeFile(
    path.join(root, 'PROJECT.yaml'),
    `schema_version: "1.0"
type: project_metadata
project:
  name: "fixture"
architecture_documentation:
  architecture_namespace: "fixture-ns"
`,
    'utf8',
  );

  const logicalDir = path.join(root, 'adrs', 'logical');
  await mkdir(logicalDir, { recursive: true });
  await writeFile(
    path.join(logicalDir, 'ADR-L-9001.yaml'),
    `schema_version: "1.0"
adr_type: logical
id: ADR-L-9001
title: "Fixture ADR"
status: accepted
created_date: "2026-01-01"
authors: ["test"]
domains: ["test"]
tags: []
context: "Fixture context for compiler test."
capabilities:
  - id: CAP-9001
    name: "Fixture capability"
    description: "Does a thing."
    implemented_by_components: []
    enabled_by_decisions: []
decisions:
  - id: DEC-9001
    summary: "We choose fixture."
    rationale: "Because test."
    related_invariants: []
    enforces_invariants: []
    enables_capabilities: ["CAP-9001"]
    governs_components: []
    supersedes: []
    refines: []
invariants: []
gaps: []
related_adrs: []
`,
    'utf8',
  );
}

describe('architecture compiler', () => {
  it('discovers and compiles minimal scope (dry run)', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ste-arch-'));
    try {
      await writeMinimalScope(tmp);
      const result = await compileArchitecture({ scopeRoot: tmp, dryRun: true });
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('builds internal ADR graph deterministically', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ste-arch-'));
    try {
      await writeMinimalScope(tmp);
      const model = await runArchitecturePipeline({
        scopeRoot: tmp,
        generatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const merged = architectureMerge(model, emptyReconSnapshot);
      const graph = buildAdrGraph(merged);
      expect(graph.nodes.map((n) => n.adrId)).toEqual(['ADR-L-9001']);
      expect(graph.nodes[0].introducedEntityIds.sort()).toEqual(['CAP-9001', 'DEC-9001']);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
