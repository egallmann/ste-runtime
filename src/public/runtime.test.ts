import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { mergeWorkspaceGraph, preflightWorkspaceGraphIdentity, WorkspaceIdentityCollisionError } from '../workspace/workspace-merge.js';
import { canonicalize, definitionRevision } from './canonical.js';
import { RefreshError, RuntimeContractError } from './errors.js';
import { createGraphProjection } from './graph.js';
import { createRuntime } from './runtime.js';
import type { GraphNodeRef, SnapshotId, WorkspaceId } from './types.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function createFixtureRepository(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"public-runtime-fixture","version":"1.0.0"}\n');
  await fs.writeFile(path.join(root, 'src', 'index.ts'), 'export const fixture = 1;\n');
  return root;
}

describe('public runtime registration contract', () => {
  it('canonicalizes definition property and repository ordering while excluding undefined values', () => {
    const repositoryA = '019ffc3c-0000-7000-8000-000000000001' as never;
    const repositoryB = '019ffc3c-0000-7000-8000-000000000002' as never;
    const first = {
      repositories: [
        { repositoryId: repositoryB, source: { kind: 'local' as const, path: process.cwd() } },
        { repositoryId: repositoryA, source: { kind: 'local' as const, path: process.cwd() } },
      ],
    };
    const second = {
      repositories: [
        { source: { path: process.cwd(), kind: 'local' as const }, repositoryId: repositoryA },
        { source: { path: process.cwd(), kind: 'local' as const }, repositoryId: repositoryB },
      ],
    };

    expect(definitionRevision(first)).toBe(definitionRevision(second));
    expect(canonicalize({ alias: 'ignored', value: undefined })).toBe('{"alias":"ignored"}');
  });

  it('mints UUIDv7 workspace and repository identities only during registration creation', async () => {
    const runtime = createRuntime();
    const registration = await runtime.createRegistration({
      repositories: [
        { source: { kind: 'local', path: process.cwd() }, display: { alias: 'runtime' } },
      ],
    });

    expect(registration.workspaceId).toMatch(UUID_V7);
    expect(registration.definition.repositories[0]?.repositoryId).toMatch(UUID_V7);
    expect(registration.repositories[0]?.repositoryId).toBe(registration.definition.repositories[0]?.repositoryId);
    await runtime.close();
  });

  it('preserves workspace and retained repository identities across explicit revision', async () => {
    const runtime = createRuntime();
    const registration = await runtime.createRegistration({
      repositories: [{ source: { kind: 'local', path: process.cwd() }, display: { alias: 'before' } }],
    });
    const repositoryId = registration.definition.repositories[0]!.repositoryId;
    const revised = await runtime.reviseRegistration(registration, {
      retain: [{
        repositoryId,
        source: { kind: 'local', path: process.cwd() },
        display: { alias: 'after' },
      }],
      add: [],
      remove: [],
    });

    expect(revised.workspaceId).toBe(registration.workspaceId);
    expect(revised.definition.repositories[0]?.repositoryId).toBe(repositoryId);
    expect(revised.definitionRevision).toBe(registration.definitionRevision);
    expect(revised.repositories[0]?.display?.alias).toBe('after');
    await runtime.close();
  });

  it('rejects a registration whose caller-supplied definition revision is fabricated', async () => {
    const runtime = createRuntime();
    const registration = await runtime.createRegistration({
      repositories: [{ source: { kind: 'local', path: process.cwd() } }],
    });

    await expect(runtime.open({ ...registration, definitionRevision: 'sha256:fabricated' as never }))
      .rejects.toMatchObject({ code: 'DEFINITION_REVISION_MISMATCH' });
    await runtime.close();
  });

  it('rejects empty workspaces and does not persist discarded registrations', async () => {
    const runtime = createRuntime();
    await expect(runtime.createRegistration({ repositories: [] })).rejects.toMatchObject({ code: 'EMPTY_WORKSPACE' });
    const registration = await runtime.createRegistration({
      repositories: [{ source: { kind: 'local', path: process.cwd() } }],
    });
    expect(registration).toBeDefined();
    await runtime.close();
  });
});

describe('snapshot-bound graph projection', () => {
  it('traverses a deterministic cross-repository relationship inside one workspace snapshot', () => {
    const workspaceId = '019ffc3c-0000-7000-8000-000000000000' as WorkspaceId;
    const snapshotId = '019ffc3c-0000-7002-8000-000000000000' as SnapshotId;
    const source: GraphNodeRef = { workspaceId, snapshotId, nodeId: 'Service:repo-a' };
    const target: GraphNodeRef = { workspaceId, snapshotId, nodeId: 'Endpoint:repo-b:get:health' };
    const graph = createGraphProjection(
      workspaceId,
      snapshotId,
      [
        { ref: source, type: 'Service', name: 'A', provenance: { snapshotId, sources: [{ repositoryId: 'repo-a' as never }] } },
        { ref: target, type: 'Endpoint', name: 'B', provenance: { snapshotId, sources: [{ repositoryId: 'repo-b' as never }] } },
      ],
      [{
        source,
        target,
        verb: 'calls',
        provenance: {
          snapshotId,
          sources: [{ repositoryId: 'repo-a' as never }, { repositoryId: 'repo-b' as never }],
          evidence: 'deterministic fixture evidence',
        },
      }],
    );

    expect(graph.traverse(source)).toEqual([source, target]);
    expect(graph.getNode(source)?.provenance.sources[0]?.repositoryId).toBe('repo-a');
    expect(graph.getNode(target)?.provenance.sources[0]?.repositoryId).toBe('repo-b');
  });

  it('treats legacy node keys as opaque snapshot-scoped projection identity', () => {
    const workspaceId = '019ffc3c-0000-7000-8000-000000000000' as WorkspaceId;
    const snapshotId = '019ffc3c-0000-7002-8000-000000000000' as SnapshotId;
    const otherSnapshotId = '019ffc3c-0000-7003-8000-000000000000' as SnapshotId;
    const ref: GraphNodeRef = { workspaceId, snapshotId, nodeId: 'Service:legacy-execution-key' };
    const graph = createGraphProjection(
      workspaceId,
      snapshotId,
      [{ ref, type: 'Service', name: 'Example', provenance: { snapshotId, sources: [] } }],
      [],
    );

    expect(ref).toEqual({ workspaceId, snapshotId, nodeId: 'Service:legacy-execution-key' });
    expect(() => graph.getNode({ workspaceId, snapshotId: otherSnapshotId, nodeId: ref.nodeId }))
      .toThrowError('FOREIGN_GRAPH_PROJECTION');
  });

  it('fails closed when traversal crosses the workspace boundary', () => {
    const workspaceId = '019ffc3c-0000-7000-8000-000000000000' as WorkspaceId;
    const foreign = '019ffc3c-0000-7001-8000-000000000000' as WorkspaceId;
    const snapshotId = '019ffc3c-0000-7002-8000-000000000000' as SnapshotId;
    const start: GraphNodeRef = { workspaceId, snapshotId, nodeId: 'a' };
    const graph = createGraphProjection(
      workspaceId,
      snapshotId,
      [{ ref: start, type: 'Service', name: 'A', provenance: { snapshotId, sources: [] } }],
      [{
        source: start,
        target: { workspaceId: foreign, snapshotId, nodeId: 'b' },
        verb: 'calls',
        provenance: { snapshotId, sources: [] },
      }],
    );

    expect(() => graph.traverse(start)).toThrowError(RuntimeContractError);
    expect(() => graph.traverse({ workspaceId: foreign, snapshotId, nodeId: 'b' })).toThrowError('FOREIGN_WORKSPACE_TRAVERSAL');
    expect(() => graph.traverse({ workspaceId, snapshotId: '019ffc3c-0000-7003-8000-000000000000' as SnapshotId, nodeId: 'a' }))
      .toThrowError('FOREIGN_GRAPH_PROJECTION');
  });
});

describe('pre-merge workspace identity guard', () => {
  async function createSlices(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ste-runtime-collision-'));
    await fs.mkdir(path.join(root, 'slices'));
    await fs.writeFile(path.join(root, 'slices', 'repo-a.yaml'), `schema_version: '1.0'\nrepo: repo-a\ngenerated_by: test\ngenerated_at: now\nnodes:\n  - id: Service:shared\n    type: Service\n    name: repo-a\n    provenance:\n      source_path: src/index.ts\n      source_ref: x\n      repo: repo-a\nedges: []\n`);
    await fs.writeFile(path.join(root, 'slices', 'repo-b.yaml'), `schema_version: '1.0'\nrepo: repo-b\ngenerated_by: test\ngenerated_at: now\nnodes:\n  - id: Service:shared\n    type: Service\n    name: repo-b\n    provenance:\n      source_path: src/index.ts\n      source_ref: x\n      repo: repo-b\nedges: []\n`);
    return root;
  }

  it('fails before legacy first-wins merge and identifies both repositories', async () => {
    const root = await createSlices();
    await expect(preflightWorkspaceGraphIdentity(root)).rejects.toSatisfy(error => {
      expect(error).toBeInstanceOf(WorkspaceIdentityCollisionError);
      expect((error as WorkspaceIdentityCollisionError).collisions[0]?.repositories).toEqual(['repo-a', 'repo-b']);
      return true;
    });
    await fs.rm(root, { recursive: true, force: true });
  });

  it('allows unique workspace entity IDs across repositories', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ste-runtime-unique-'));
    await fs.mkdir(path.join(root, 'slices'));
    await fs.writeFile(path.join(root, 'slices', 'repo-a.yaml'), `schema_version: '1.0'\nrepo: repo-a\ngenerated_by: test\ngenerated_at: now\nnodes:\n  - id: Service:a\n    type: Service\n    name: repo-a\n    provenance:\n      source_path: src/a.ts\n      source_ref: a\n      repo: repo-a\nedges: []\n`);
    await fs.writeFile(path.join(root, 'slices', 'repo-b.yaml'), `schema_version: '1.0'\nrepo: repo-b\ngenerated_by: test\ngenerated_at: now\nnodes:\n  - id: Service:b\n    type: Service\n    name: repo-b\n    provenance:\n      source_path: src/b.ts\n      source_ref: b\n      repo: repo-b\nedges: []\n`);
    await expect(preflightWorkspaceGraphIdentity(root)).resolves.toBeUndefined();
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('cross-repository relationship provenance', () => {
  it('retains deterministic source and target repository evidence through merge', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ste-runtime-edge-provenance-'));
    await fs.mkdir(path.join(root, 'slices'));
    const slice = (repo: string, nodeId: string) => `schema_version: '1.0'\nrepo: ${repo}\ngenerated_by: test\ngenerated_at: now\nnodes:\n  - id: ${nodeId}\n    type: Service\n    name: ${repo}\n    provenance:\n      source_path: src/index.ts\n      source_ref: service\n      repo: ${repo}\nedges: []\n`;
    await fs.writeFile(path.join(root, 'slices', 'repo-a.yaml'), slice('repo-a', 'Service:a'));
    await fs.writeFile(path.join(root, 'slices', 'repo-b.yaml'), slice('repo-b', 'Service:b'));
    await fs.writeFile(path.join(root, 'workspace-edges.yaml'), `cross_repo_edges:\n  - from: Service:a\n    to: Service:b\n    verb: calls\n    confidence: high\n    provenance:\n      source_repo: repo-a\n      target_repo: repo-b\n      evidence: bilateral test evidence\n`);

    const result = await mergeWorkspaceGraph(root);
    expect(result.graph.edges[0]?.provenance).toEqual({
      source_repo: 'repo-a',
      target_repo: 'repo-b',
      evidence: 'bilateral test evidence',
    });
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('no-source current projection', () => {
  it('returns a typed failure for an orphaned materialization and never fabricates a snapshot', async () => {
    const runtime = createRuntime();
    const registration = await runtime.createRegistration({
      repositories: [{ source: { kind: 'local', path: path.join(os.tmpdir(), 'missing-ste-runtime-repository') } }],
    });
    const workspace = await runtime.open(registration);
    await expect(workspace.refresh()).rejects.toSatisfy(error => {
      expect(error).toBeInstanceOf(RefreshError);
      expect((error as RefreshError).code).toBe('NO_SOURCE_OBSERVED');
      expect((error as RefreshError).diagnostics[0]?.code).toBe('REPOSITORY_ORPHANED');
      return true;
    });
    await runtime.close();
  });

  it('returns a partial current projection without stale content for an orphaned member', async () => {
    const observedRoot = await createFixtureRepository('ste-runtime-observed');
    const orphanedRoot = path.join(os.tmpdir(), `missing-ste-runtime-${Date.now()}`);
    const runtime = createRuntime();
    try {
      const registration = await runtime.createRegistration({
        repositories: [
          { source: { kind: 'local', path: observedRoot } },
          { source: { kind: 'local', path: orphanedRoot } },
        ],
      });
      const workspace = await runtime.open(registration);
      const snapshot = await workspace.refresh();
      const observedId = snapshot.repositoryObservations.find(observation => observation.status === 'observed')!.repositoryId;
      const orphanedId = snapshot.repositoryObservations.find(observation => observation.status === 'orphaned')!.repositoryId;

      expect(snapshot.status).toBe('partial');
      expect(snapshot.repositoryObservations).toEqual(expect.arrayContaining([
        expect.objectContaining({ repositoryId: observedId, status: 'observed' }),
        expect.objectContaining({ repositoryId: orphanedId, status: 'orphaned' }),
      ]));
      expect(snapshot.graph.nodes.every(node => node.provenance.sources.every(source => source.repositoryId === observedId))).toBe(true);
      expect(snapshot.graph.relationships.every(edge => edge.provenance.sources.every(source => source.repositoryId === observedId))).toBe(true);
    } finally {
      await runtime.close();
      await fs.rm(observedRoot, { recursive: true, force: true });
    }
  });

  it('does not substitute a prior snapshot after a failed refresh', async () => {
    const sourceRoot = await createFixtureRepository('ste-runtime-failed-refresh');
    const runtime = createRuntime();
    try {
      const registration = await runtime.createRegistration({
        repositories: [{ source: { kind: 'local', path: sourceRoot } }],
      });
      const workspace = await runtime.open(registration);
      const first = await workspace.refresh();
      const start = first.graph.nodes[0]!.ref;
      await fs.rm(sourceRoot, { recursive: true, force: true });

      await expect(workspace.refresh()).rejects.toMatchObject({ code: 'NO_SOURCE_OBSERVED' });
      expect(first.graph.traverse(start, { maxDepth: 0, maxNodes: 1 })).toEqual([start]);
      expect('currentSnapshot' in workspace).toBe(false);
      expect('graph' in workspace).toBe(false);
    } finally {
      await runtime.close();
      await fs.rm(sourceRoot, { recursive: true, force: true });
    }
  });

  it('assigns a new snapshot ID while retaining an equal fingerprint for identical observations', async () => {
    const sourceRoot = await createFixtureRepository('ste-runtime-repeatable-refresh');
    const runtime = createRuntime();
    try {
      const registration = await runtime.createRegistration({
        repositories: [{ source: { kind: 'local', path: sourceRoot } }],
      });
      const workspace = await runtime.open(registration);
      const first = await workspace.refresh();
      const second = await workspace.refresh();
      expect(second.snapshotId).not.toBe(first.snapshotId);
      expect(second.observationFingerprint).toBe(first.observationFingerprint);
    } finally {
      await runtime.close();
      await fs.rm(sourceRoot, { recursive: true, force: true });
    }
  });

  it('observes multiple repositories in one workspace with separate provenance', async () => {
    const repositoryA = await createFixtureRepository('ste-runtime-multi-a');
    const repositoryB = await createFixtureRepository('ste-runtime-multi-b');
    const runtime = createRuntime();
    try {
      const registration = await runtime.createRegistration({
        repositories: [
          { source: { kind: 'local', path: repositoryA } },
          { source: { kind: 'local', path: repositoryB } },
        ],
      });
      const snapshot = await (await runtime.open(registration)).refresh();
      const repositoryIds = new Set(registration.definition.repositories.map(repository => repository.repositoryId));
      const observedIds = new Set(snapshot.repositoryObservations
        .filter(observation => observation.status === 'observed')
        .map(observation => observation.repositoryId));
      expect(snapshot.status).toBe('complete');
      expect(observedIds).toEqual(repositoryIds);
      expect(new Set(snapshot.graph.nodes.flatMap(node => node.provenance.sources.map(source => source.repositoryId)))).toEqual(repositoryIds);
    } finally {
      await runtime.close();
      await fs.rm(repositoryA, { recursive: true, force: true });
      await fs.rm(repositoryB, { recursive: true, force: true });
    }
  });

  it('isolates concurrent refreshes without materializing state in either source repository', async () => {
    const repositoryA = await createFixtureRepository('ste-runtime-concurrent-a');
    const repositoryB = await createFixtureRepository('ste-runtime-concurrent-b');
    const runtime = createRuntime();
    try {
      const [registrationA, registrationB] = await Promise.all([
        runtime.createRegistration({ repositories: [{ source: { kind: 'local', path: repositoryA } }] }),
        runtime.createRegistration({ repositories: [{ source: { kind: 'local', path: repositoryB } }] }),
      ]);
      const [snapshotA, snapshotB] = await Promise.all([
        (await runtime.open(registrationA)).refresh(),
        (await runtime.open(registrationB)).refresh(),
      ]);

      expect(snapshotA.workspaceId).toBe(registrationA.workspaceId);
      expect(snapshotB.workspaceId).toBe(registrationB.workspaceId);
      expect(snapshotA.workspaceId).not.toBe(snapshotB.workspaceId);
      for (const repository of [repositoryA, repositoryB]) {
        await expect(fs.access(path.join(repository, '.ste'))).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(path.join(repository, '.workspace-graph'))).rejects.toMatchObject({ code: 'ENOENT' });
      }
    } finally {
      await runtime.close();
      await fs.rm(repositoryA, { recursive: true, force: true });
      await fs.rm(repositoryB, { recursive: true, force: true });
    }
  });
});
