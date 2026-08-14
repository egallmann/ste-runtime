import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import { implements_adr } from '../architecture/intent-decorators.js';
import type {
  RepositoryId,
  WorkspaceRegistration,
} from '../public/types.js';
import {
  preflightWorkspaceGraphIdentity,
  WorkspaceIdentityCollisionError,
} from './workspace-merge.js';
import {
  executeWorkspaceRecon,
  type WorkspaceReconResult,
} from './workspace-recon.js';

export interface LegacyGraph {
  nodes?: Array<{
    id: string;
    type: string;
    name: string;
    repo?: string;
    attributes?: Record<string, unknown>;
    provenance?: {
      source_path?: string;
      source_ref?: string;
      repo?: string;
    };
  }>;
  edges?: Array<{
    from: string;
    to: string;
    verb: string;
    provenance?: {
      source_path?: string;
      source_ref?: string;
      repo?: string;
      source_repo?: string;
      target_repo?: string;
      evidence?: string;
    };
  }>;
}

export type SourceAvailability = 'present' | 'orphaned' | 'unavailable';

export interface WorkspaceExecutionResult {
  readonly executionToRepository: ReadonlyMap<string, RepositoryId>;
  readonly graph: LegacyGraph;
  readonly initialStatuses: ReadonlyMap<RepositoryId, SourceAvailability>;
  readonly reconResult: WorkspaceReconResult;
}

export class WorkspaceExecutionError extends Error {
  readonly code: 'ENTITY_ID_COLLISION' | 'EXECUTION_FAILED';
  readonly collisions?: readonly { id: string; repositoryIds: readonly RepositoryId[] }[];

  constructor(
    code: WorkspaceExecutionError['code'],
    message: string,
    collisions?: readonly { id: string; repositoryIds: readonly RepositoryId[] }[],
  ) {
    super(message);
    this.name = 'WorkspaceExecutionError';
    this.code = code;
    this.collisions = collisions;
  }
}

export interface WorkspaceExecutionAdapter {
  execute(registration: WorkspaceRegistration): Promise<WorkspaceExecutionResult>;
  close(): Promise<void>;
}

function executionKey(index: number): string {
  return `repo-${index + 1}`;
}

function sortedByRepositoryId<T extends { repositoryId: RepositoryId }>(values: readonly T[]): T[] {
  return [...values].sort((a, b) => a.repositoryId.localeCompare(b.repositoryId));
}

async function pathStatus(sourcePath: string): Promise<SourceAvailability> {
  try {
    const stat = await fs.stat(sourcePath);
    return stat.isDirectory() ? 'present' : 'unavailable';
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'orphaned' : 'unavailable';
  }
}

async function writeWorkspaceManifest(
  workspaceRoot: string,
  registration: WorkspaceRegistration,
): Promise<{ manifestPath: string; executionToRepository: Map<string, RepositoryId> }> {
  const executionToRepository = new Map<string, RepositoryId>();
  const manifestRepos = sortedByRepositoryId(registration.definition.repositories).map((repository, index) => {
    const key = executionKey(index);
    executionToRepository.set(key, repository.repositoryId);
    return {
      name: key,
      path: repository.source.path,
      kind: 'service',
      lang: 'unknown',
    };
  });
  const manifestPath = path.join(workspaceRoot, 'workspace.yaml');
  await fs.writeFile(
    manifestPath,
    yaml.dump({ schema_version: '1.0', output_dir: '.workspace-graph', repos: manifestRepos }),
    'utf8',
  );
  return { manifestPath, executionToRepository };
}

function readLegacyGraph(raw: string): LegacyGraph {
  return (yaml.load(raw) as LegacyGraph | null) ?? {};
}

/**
 * Private P1 execution boundary. It owns all temporary legacy workspace state
 * and returns only parsed, in-memory data to the public runtime facade.
 */
export const createWorkspaceExecutionAdapter: () => WorkspaceExecutionAdapter = implements_adr(
  '019ff84e-4ece-7ddc-b31f-3a009abe14b3',
)(function createWorkspaceExecutionAdapter(): WorkspaceExecutionAdapter {
  const temporaryRoots = new Set<string>();
  let closed = false;

  const ensureOpen = (): void => {
    if (closed) throw new WorkspaceExecutionError('EXECUTION_FAILED', 'Workspace execution adapter has been closed');
  };

  return {
    execute: async (registration: WorkspaceRegistration): Promise<WorkspaceExecutionResult> => {
      ensureOpen();
      const refreshRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ste-runtime-public-refresh-'));
      temporaryRoots.add(refreshRoot);
      let executionToRepository: Map<string, RepositoryId> | undefined;

      try {
        const manifest = await writeWorkspaceManifest(refreshRoot, registration);
        executionToRepository = manifest.executionToRepository;
        const initialStatuses = new Map<RepositoryId, SourceAvailability>();
        for (const repository of registration.definition.repositories) {
          initialStatuses.set(repository.repositoryId, await pathStatus(repository.source.path));
        }

        const reconResult = await executeWorkspaceRecon({
          workspacePath: manifest.manifestPath,
          mode: 'full',
          runtimeDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
          failOnAnyError: false,
          skipUnchanged: false,
          beforeMerge: outputDir => preflightWorkspaceGraphIdentity(outputDir),
        });
        const graphRaw = await fs.readFile(path.join(refreshRoot, '.workspace-graph', 'graph.yaml'), 'utf8');
        return {
          executionToRepository: manifest.executionToRepository,
          graph: readLegacyGraph(graphRaw),
          initialStatuses,
          reconResult,
        };
      } catch (error) {
        if (error instanceof WorkspaceIdentityCollisionError) {
          throw new WorkspaceExecutionError(
            'ENTITY_ID_COLLISION',
            error.message,
            error.collisions.map(collision => ({
              id: collision.id,
              repositoryIds: collision.repositories
                .map(repository => executionToRepository?.get(repository))
                .filter((repositoryId): repositoryId is RepositoryId => repositoryId !== undefined),
            })),
          );
        }
        if (error instanceof WorkspaceExecutionError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new WorkspaceExecutionError('EXECUTION_FAILED', message);
      } finally {
        await fs.rm(refreshRoot, { recursive: true, force: true });
        temporaryRoots.delete(refreshRoot);
      }
    },
    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await Promise.all([...temporaryRoots].map(root => fs.rm(root, { recursive: true, force: true })));
      temporaryRoots.clear();
    },
  };
});
