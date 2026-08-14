import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createRuntime } from '../public/runtime.js';
import { createWorkspaceExecutionAdapter } from './runtime-workspace-execution.js';

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
});
