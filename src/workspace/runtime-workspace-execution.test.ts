import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createRuntime } from '../public/runtime.js';
import {
  createWorkspaceExecutionAdapter,
  WorkspaceExecutionError,
} from './runtime-workspace-execution.js';
import { WorkspaceIdentityCollisionError } from './workspace-merge.js';
import { executeWorkspaceRecon } from './workspace-recon.js';

vi.mock('./workspace-recon.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./workspace-recon.js')>();
  return {
    ...actual,
    executeWorkspaceRecon: vi.fn(actual.executeWorkspaceRecon),
  };
});

async function createRepository(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"workspace-execution-fixture","version":"1.0.0"}\n');
  await fs.writeFile(path.join(root, 'src', 'index.ts'), 'export const fixture = 1;\n');
  return root;
}

describe('private runtime workspace execution adapter', () => {
  it('owns synthetic execution mapping and returns an in-memory graph result', async () => {
    const repositoryA = await createRepository('runtime-workspace-execution-a');
    const repositoryB = await createRepository('runtime-workspace-execution-b');
    const runtime = createRuntime();
    const adapter = createWorkspaceExecutionAdapter();

    try {
      const registration = await runtime.createRegistration({
        repositories: [
          { source: { kind: 'local', path: repositoryB } },
          { source: { kind: 'local', path: repositoryA } },
        ],
      });

      const result = await adapter.execute(registration);

      expect([...result.executionToRepository.keys()]).toEqual(['repo-1', 'repo-2']);
      expect(new Set(result.executionToRepository.values())).toEqual(
        new Set(registration.definition.repositories.map(repository => repository.repositoryId)),
      );
      expect([...result.initialStatuses.values()]).toEqual(['present', 'present']);
      expect(result.reconResult.repos.every(repository => repository.status === 'success')).toBe(true);
      expect(result.graph.nodes).toEqual(expect.any(Array));
    } finally {
      await adapter.close();
      await runtime.close();
      await fs.rm(repositoryA, { recursive: true, force: true });
      await fs.rm(repositoryB, { recursive: true, force: true });
    }
  });

  it('normalizes execution failures and removes its temporary execution state', async () => {
    const repository = await createRepository('runtime-workspace-execution-failure');
    const runtime = createRuntime();
    const adapter = createWorkspaceExecutionAdapter();
    const mockedExecuteWorkspaceRecon = vi.mocked(executeWorkspaceRecon);
    let temporaryRoot: string | undefined;

    mockedExecuteWorkspaceRecon.mockImplementationOnce(async options => {
      temporaryRoot = path.dirname(options.workspacePath);
      throw new Error('deterministic execution failure');
    });

    try {
      const registration = await runtime.createRegistration({
        repositories: [{ source: { kind: 'local', path: repository } }],
      });

      await expect(adapter.execute(registration)).rejects.toMatchObject({
        name: 'WorkspaceExecutionError',
        code: 'EXECUTION_FAILED',
        message: 'deterministic execution failure',
      } satisfies Partial<WorkspaceExecutionError>);
      expect(temporaryRoot).toBeDefined();
      await expect(fs.access(temporaryRoot!)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.access(path.join(repository, '.ste'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.access(path.join(repository, '.ste-self'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.access(path.join(repository, '.workspace-graph'))).rejects.toMatchObject({ code: 'ENOENT' });

      await adapter.close();
      await adapter.close();
    } finally {
      await adapter.close();
      await runtime.close();
      await fs.rm(repository, { recursive: true, force: true });
    }
  });

  it('normalizes identity collisions to public repository IDs and cleans up', async () => {
    const repositoryA = await createRepository('runtime-workspace-execution-collision-a');
    const repositoryB = await createRepository('runtime-workspace-execution-collision-b');
    const runtime = createRuntime();
    const adapter = createWorkspaceExecutionAdapter();
    const mockedExecuteWorkspaceRecon = vi.mocked(executeWorkspaceRecon);
    let temporaryRoot: string | undefined;

    mockedExecuteWorkspaceRecon.mockImplementationOnce(async options => {
      temporaryRoot = path.dirname(options.workspacePath);
      throw new WorkspaceIdentityCollisionError([{
        id: 'Service:shared',
        repositories: ['repo-1', 'repo-2'],
        declarations: [
          { repository: 'repo-1', type: 'Service', name: 'shared' },
          { repository: 'repo-2', type: 'Service', name: 'shared' },
        ],
      }]);
    });

    try {
      const registration = await runtime.createRegistration({
        repositories: [
          { source: { kind: 'local', path: repositoryA } },
          { source: { kind: 'local', path: repositoryB } },
        ],
      });
      const expectedRepositoryIds = [...registration.definition.repositories]
        .sort((left, right) => left.repositoryId.localeCompare(right.repositoryId))
        .map(repository => repository.repositoryId);

      await expect(adapter.execute(registration)).rejects.toMatchObject({
        name: 'WorkspaceExecutionError',
        code: 'ENTITY_ID_COLLISION',
        collisions: [{ id: 'Service:shared', repositoryIds: expectedRepositoryIds }],
      } satisfies Partial<WorkspaceExecutionError>);
      expect(temporaryRoot).toBeDefined();
      await expect(fs.access(temporaryRoot!)).rejects.toMatchObject({ code: 'ENOENT' });

      await adapter.close();
      await adapter.close();
    } finally {
      await adapter.close();
      await runtime.close();
      await fs.rm(repositoryA, { recursive: true, force: true });
      await fs.rm(repositoryB, { recursive: true, force: true });
    }
  });
});
