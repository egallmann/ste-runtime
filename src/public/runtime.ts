import crypto from 'node:crypto';

import {
  createWorkspaceExecutionAdapter,
  type LegacyGraph,
  type WorkspaceExecutionResult,
  WorkspaceExecutionError,
} from '../workspace/runtime-workspace-execution.js';
import {
  canonicalDefinition,
  definitionRevision,
  normalizeLocalSourcePath,
  observationFingerprint,
  PUBLIC_RUNTIME_CONTRACT_VERSION,
} from './canonical.js';
import { RefreshError, RuntimeContractError } from './errors.js';
import { createGraphProjection } from './graph.js';
import type {
  CreateRegistrationInput,
  EntityProvenance,
  GraphNode,
  GraphRelationship,
  LocalRepositorySource,
  RegisteredRepositoryMetadata,
  RepositoryDefinition,
  RepositoryDisplayMetadata,
  RepositoryId,
  RepositoryObservation,
  ReviseRegistrationInput,
  Runtime,
  RuntimeCapabilityManifest,
  RuntimeDiagnostic,
  RuntimeSnapshot,
  SnapshotId,
  SourceProvenance,
  WorkspaceDefinition,
  WorkspaceHandle,
  WorkspaceId,
  WorkspaceRegistration,
} from './types.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidv7(): string {
  const bytes = crypto.randomBytes(16);
  const timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp >> BigInt((5 - index) * 8)) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isUuidV7(value: string): boolean {
  return UUID_V7.test(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function cloneDisplay(value: RepositoryDisplayMetadata | undefined): RepositoryDisplayMetadata | undefined {
  return value ? { ...value } : undefined;
}

function normalizeSource(source: LocalRepositorySource): LocalRepositorySource {
  if (source.kind !== 'local' || typeof source.path !== 'string' || source.path.trim().length === 0) {
    throw new RuntimeContractError('INVALID_REPOSITORY_SOURCE', 'Only non-empty local repository paths are supported');
  }
  return { kind: 'local', path: normalizeLocalSourcePath(source.path) };
}

function validateRepositoryId(value: string): asserts value is RepositoryId {
  if (!isUuidV7(value)) {
    throw new RuntimeContractError('INVALID_REPOSITORY_ID', `RepositoryId is not a UUIDv7: ${value}`);
  }
}

function validateWorkspaceId(value: string): asserts value is WorkspaceId {
  if (!isUuidV7(value)) {
    throw new RuntimeContractError('INVALID_WORKSPACE_ID', `WorkspaceId is not a UUIDv7: ${value}`);
  }
}

function validateSnapshotId(value: string): asserts value is SnapshotId {
  if (!isUuidV7(value)) {
    throw new RuntimeContractError('INVALID_SNAPSHOT_ID', `SnapshotId is not a UUIDv7: ${value}`);
  }
}

function sortedByRepositoryId<T extends { repositoryId: RepositoryId }>(values: readonly T[]): T[] {
  return [...values].sort((a, b) => a.repositoryId.localeCompare(b.repositoryId));
}

function createDefinition(repositories: readonly RepositoryDefinition[]): WorkspaceDefinition {
  if (repositories.length === 0) {
    throw new RuntimeContractError('EMPTY_WORKSPACE', 'A workspace must contain at least one repository');
  }
  const ids = new Set<string>();
  for (const repository of repositories) {
    validateRepositoryId(repository.repositoryId);
    if (ids.has(repository.repositoryId)) {
      throw new RuntimeContractError('DUPLICATE_REPOSITORY_ID', `RepositoryId is duplicated: ${repository.repositoryId}`);
    }
    ids.add(repository.repositoryId);
  }
  return { repositories: sortedByRepositoryId(repositories).map(repository => ({
    repositoryId: repository.repositoryId,
    source: normalizeSource(repository.source),
  })) };
}

function buildRegistration(
  workspaceId: WorkspaceId,
  definition: WorkspaceDefinition,
  display: WorkspaceRegistration['display'],
  metadata: readonly RegisteredRepositoryMetadata[],
): WorkspaceRegistration {
  const normalizedDefinition = createDefinition(definition.repositories);
  const registration: WorkspaceRegistration = {
    workspaceId,
    definition: normalizedDefinition,
    definitionRevision: definitionRevision(normalizedDefinition),
    display: display ? { ...display } : undefined,
    repositories: sortedByRepositoryId(metadata).map(entry => ({
      repositoryId: entry.repositoryId,
      display: cloneDisplay(entry.display),
    })),
  };
  return deepFreeze(registration);
}

function validateRegistration(registration: WorkspaceRegistration): WorkspaceRegistration {
  if (!registration || typeof registration !== 'object') {
    throw new RuntimeContractError('INVALID_REGISTRATION', 'A complete WorkspaceRegistration is required');
  }
  validateWorkspaceId(registration.workspaceId);
  const normalizedDefinition = createDefinition(registration.definition.repositories);
  const expected = definitionRevision(normalizedDefinition);
  if (registration.definitionRevision !== expected) {
    throw new RuntimeContractError(
      'DEFINITION_REVISION_MISMATCH',
      `Workspace definition revision does not match canonical definition (expected ${expected})`,
    );
  }
  const ids = new Set(normalizedDefinition.repositories.map(repository => repository.repositoryId));
  for (const metadata of registration.repositories) {
    validateRepositoryId(metadata.repositoryId);
    if (!ids.has(metadata.repositoryId)) {
      throw new RuntimeContractError(
        'REGISTRATION_METADATA_MISMATCH',
        `Repository metadata references a repository outside the definition: ${metadata.repositoryId}`,
      );
    }
  }
  return buildRegistration(registration.workspaceId, normalizedDefinition, registration.display, registration.repositories);
}

function sourceLocator(sourcePath?: string, sourceRef?: string): string | undefined {
  if (!sourcePath && !sourceRef) return undefined;
  if (!sourceRef) return sourcePath;
  if (!sourcePath) return sourceRef;
  return `${sourcePath}#${sourceRef}`;
}

function repositoryIdFor(
  key: string | undefined,
  executionToRepository: ReadonlyMap<string, RepositoryId>,
): RepositoryId | undefined {
  return key ? executionToRepository.get(key) : undefined;
}

function toDiagnostic(code: string, message: string, repositoryIds?: readonly RepositoryId[]): RuntimeDiagnostic {
  return { code, message, repositoryIds };
}

function graphFromLegacy(
  workspaceId: WorkspaceId,
  snapshotId: SnapshotId,
  graph: LegacyGraph,
  executionToRepository: ReadonlyMap<string, RepositoryId>,
): ReturnType<typeof createGraphProjection> {
  const nodes: GraphNode[] = [];
  const nodeById = new Map<string, GraphNode>();

  for (const node of graph.nodes ?? []) {
    const repoKey = node.provenance?.repo ?? node.repo;
    const repositoryId = repositoryIdFor(repoKey, executionToRepository);
    if (!repositoryId || nodeById.has(node.id)) continue;
    const provenance: EntityProvenance = {
      snapshotId,
      sources: [{
        repositoryId,
        sourceLocator: sourceLocator(node.provenance?.source_path, node.provenance?.source_ref),
      }],
    };
    const projected: GraphNode = {
      ref: { workspaceId, snapshotId, nodeId: node.id },
      type: node.type,
      name: node.name,
      provenance,
      attributes: node.attributes,
    };
    nodes.push(projected);
    nodeById.set(node.id, projected);
  }

  const relationships: GraphRelationship[] = [];
  const relationshipKeys = new Set<string>();
  for (const edge of graph.edges ?? []) {
    const source = nodeById.get(edge.from);
    const target = nodeById.get(edge.to);
    if (!source || !target) continue;

    const sourceRepository = repositoryIdFor(edge.provenance?.source_repo, executionToRepository)
      ?? source.provenance.sources[0]?.repositoryId;
    const targetRepository = repositoryIdFor(edge.provenance?.target_repo, executionToRepository)
      ?? target.provenance.sources[0]?.repositoryId;
    const sourceRecords: SourceProvenance[] = [];
    if (sourceRepository) sourceRecords.push({ repositoryId: sourceRepository });
    if (targetRepository && targetRepository !== sourceRepository) sourceRecords.push({ repositoryId: targetRepository });
    for (const record of source.provenance.sources) {
      if (!sourceRecords.some(existing => existing.repositoryId === record.repositoryId)) sourceRecords.push(record);
    }
    for (const record of target.provenance.sources) {
      if (!sourceRecords.some(existing => existing.repositoryId === record.repositoryId)) sourceRecords.push(record);
    }

    const key = `${edge.from}|${edge.to}|${edge.verb}`;
    if (relationshipKeys.has(key)) continue;
    relationshipKeys.add(key);
    relationships.push({
      source: source.ref,
      target: target.ref,
      verb: edge.verb,
      provenance: {
        snapshotId,
        sources: sourceRecords,
        evidence: edge.provenance?.evidence ?? sourceLocator(edge.provenance?.source_path, edge.provenance?.source_ref),
      },
    });
  }

  return createGraphProjection(workspaceId, snapshotId, nodes, relationships);
}

function currentObservationValue(
  registration: WorkspaceRegistration,
  observations: readonly RepositoryObservation[],
  graph: ReturnType<typeof createGraphProjection>,
): unknown {
  return {
    definitionRevision: registration.definitionRevision,
    repositories: observations.map(observation => ({
      repositoryId: observation.repositoryId,
      status: observation.status,
      diagnostic: observation.diagnostic,
    })),
    nodes: graph.nodes.map(node => ({
      ref: { workspaceId: node.ref.workspaceId, nodeId: node.ref.nodeId },
      type: node.type,
      name: node.name,
      provenance: { sources: node.provenance.sources },
      attributes: node.attributes,
    })),
    relationships: graph.relationships.map(relationship => ({
      source: { workspaceId: relationship.source.workspaceId, nodeId: relationship.source.nodeId },
      target: { workspaceId: relationship.target.workspaceId, nodeId: relationship.target.nodeId },
      verb: relationship.verb,
      provenance: { sources: relationship.provenance.sources, evidence: relationship.provenance.evidence },
    })),
  };
}

function observationsForResult(
  registration: WorkspaceRegistration,
  execution: WorkspaceExecutionResult,
): { observations: RepositoryObservation[]; observedCount: number; diagnostics: RuntimeDiagnostic[] } {
  const observations: RepositoryObservation[] = [];
  const diagnostics: RuntimeDiagnostic[] = [];
  for (const repository of sortedByRepositoryId(registration.definition.repositories)) {
    const key = [...execution.executionToRepository.entries()].find(([, id]) => id === repository.repositoryId)?.[0];
    const repoResult = execution.reconResult.repos.find(entry => entry.name === key);
    const initial = execution.initialStatuses.get(repository.repositoryId) ?? 'unavailable';
    if (repoResult?.status === 'success') {
      observations.push({
        repositoryId: repository.repositoryId,
        status: 'observed',
        sourceFingerprint: repoResult.contentHash,
      });
      continue;
    }
    const status = initial === 'orphaned' ? 'orphaned' : 'unavailable';
    const message = repoResult?.error?.message ?? `Repository ${repository.repositoryId} was not observed`;
    observations.push({ repositoryId: repository.repositoryId, status, diagnostic: message });
    diagnostics.push(toDiagnostic(status === 'orphaned' ? 'REPOSITORY_ORPHANED' : 'REPOSITORY_UNAVAILABLE', message, [repository.repositoryId]));
  }
  return {
    observations,
    observedCount: observations.filter(observation => observation.status === 'observed').length,
    diagnostics,
  };
}

export function createRuntime(): Runtime {
  const workspaceExecution = createWorkspaceExecutionAdapter();
  let closed = false;

  const capabilities: RuntimeCapabilityManifest = Object.freeze({
    contractVersion: PUBLIC_RUNTIME_CONTRACT_VERSION,
    mechanical: true,
    supportedSourceKinds: ['local'] as const,
    federation: false,
  });

  const ensureOpen = (): void => {
    if (closed) throw new RuntimeContractError('RUNTIME_CLOSED', 'Runtime has been closed');
  };

  const createRegistration = async (input: CreateRegistrationInput): Promise<WorkspaceRegistration> => {
    ensureOpen();
    if (!input || !Array.isArray(input.repositories) || input.repositories.length === 0) {
      throw new RuntimeContractError('EMPTY_WORKSPACE', 'A workspace must contain at least one repository');
    }
    const ordered = [...input.repositories].sort((a, b) => normalizeLocalSourcePath(a.source.path).localeCompare(normalizeLocalSourcePath(b.source.path)));
    const definitions: RepositoryDefinition[] = [];
    const metadata: RegisteredRepositoryMetadata[] = [];
    for (const repository of ordered) {
      const repositoryId = uuidv7() as RepositoryId;
      definitions.push({ repositoryId, source: normalizeSource(repository.source) });
      metadata.push({ repositoryId, display: cloneDisplay(repository.display) });
    }
    return buildRegistration(uuidv7() as WorkspaceId, { repositories: definitions }, input.display, metadata);
  };

  const reviseRegistration = async (
    registrationInput: WorkspaceRegistration,
    input: ReviseRegistrationInput,
  ): Promise<WorkspaceRegistration> => {
    ensureOpen();
    const registration = validateRegistration(registrationInput);
    const existingIds = new Set(registration.definition.repositories.map(repository => repository.repositoryId));
    const retainedIds = new Set<RepositoryId>();
    const removedIds = new Set<RepositoryId>();
    for (const retained of input.retain) {
      validateRepositoryId(retained.repositoryId);
      if (!existingIds.has(retained.repositoryId)) {
        throw new RuntimeContractError('UNKNOWN_REPOSITORY_ID', `Cannot retain unknown repository ${retained.repositoryId}`);
      }
      if (!retainedIds.add(retained.repositoryId)) {
        throw new RuntimeContractError('DUPLICATE_REPOSITORY_ID', `Repository is retained twice: ${retained.repositoryId}`);
      }
    }
    for (const removed of input.remove) {
      validateRepositoryId(removed);
      if (!existingIds.has(removed) || retainedIds.has(removed) || !removedIds.add(removed)) {
        throw new RuntimeContractError('INVALID_REPOSITORY_REVISION', `Invalid repository removal: ${removed}`);
      }
    }
    if (retainedIds.size + removedIds.size !== existingIds.size) {
      throw new RuntimeContractError('INCOMPLETE_REPOSITORY_REVISION', 'Every existing repository must be retained or explicitly removed');
    }

    const retainedDefinitions = input.retain.map(repository => ({
      repositoryId: repository.repositoryId,
      source: normalizeSource(repository.source),
    }));
    const orderedAdds = [...input.add].sort((a, b) => normalizeLocalSourcePath(a.source.path).localeCompare(normalizeLocalSourcePath(b.source.path)));
    const addedDefinitions: RepositoryDefinition[] = [];
    const addedMetadata: RegisteredRepositoryMetadata[] = [];
    for (const repository of orderedAdds) {
      const repositoryId = uuidv7() as RepositoryId;
      addedDefinitions.push({ repositoryId, source: normalizeSource(repository.source) });
      addedMetadata.push({ repositoryId, display: cloneDisplay(repository.display) });
    }
    const currentMetadata = new Map(registration.repositories.map(entry => [entry.repositoryId, entry.display]));
    const metadata: RegisteredRepositoryMetadata[] = [
      ...retainedDefinitions.map(repository => ({
        repositoryId: repository.repositoryId,
        display: cloneDisplay(input.retain.find(entry => entry.repositoryId === repository.repositoryId)?.display ?? currentMetadata.get(repository.repositoryId)),
      })),
      ...addedMetadata,
    ];
    const revised = buildRegistration(
      registration.workspaceId,
      { repositories: [...retainedDefinitions, ...addedDefinitions] },
      input.display ?? registration.display,
      metadata,
    );
    return revised;
  };

  const open = async (registrationInput: WorkspaceRegistration): Promise<WorkspaceHandle> => {
    ensureOpen();
    const registration = validateRegistration(registrationInput);
    return {
      registration,
      refresh: async (): Promise<RuntimeSnapshot> => {
        ensureOpen();
        try {
          const execution = await workspaceExecution.execute(registration);
          const { observations, observedCount, diagnostics } = observationsForResult(
            registration,
            execution,
          );
          if (observedCount === 0) {
            throw new RefreshError('NO_SOURCE_OBSERVED', 'No registered repository could be observed', diagnostics);
          }

          const snapshotId = uuidv7() as SnapshotId;
          validateSnapshotId(snapshotId);
          const graph = graphFromLegacy(
            registration.workspaceId,
            snapshotId,
            execution.graph,
            execution.executionToRepository,
          );
          const snapshot: RuntimeSnapshot = {
            snapshotId,
            workspaceId: registration.workspaceId,
            definitionRevision: registration.definitionRevision,
            status: observedCount === registration.definition.repositories.length ? 'complete' : 'partial',
            observationFingerprint: observationFingerprint(currentObservationValue(registration, observations, graph)),
            observedAt: new Date().toISOString(),
            runtimeContractVersion: PUBLIC_RUNTIME_CONTRACT_VERSION,
            repositoryObservations: observations,
            graph,
            diagnostics,
          };
          return deepFreeze(snapshot);
        } catch (error) {
          if (error instanceof RefreshError) throw error;
          if (error instanceof WorkspaceExecutionError && error.code === 'ENTITY_ID_COLLISION') {
            const collisions = error.collisions ?? [];
            const diagnostics = collisions.map(collision => toDiagnostic(
              'ENTITY_ID_COLLISION',
              `${collision.id} was declared by ${collision.repositoryIds.join(', ')}`,
              collision.repositoryIds,
            ));
            throw new RefreshError('ENTITY_ID_COLLISION', error.message, diagnostics);
          }
          const message = error instanceof Error ? error.message : String(error);
          throw new RefreshError('REFRESH_FAILED', message, [toDiagnostic('REFRESH_FAILED', message)]);
        }
      },
    };
  };

  return {
    createRegistration,
    reviseRegistration,
    open,
    capabilities: () => capabilities,
    close: async () => {
      if (closed) return;
      closed = true;
      await workspaceExecution.close();
    },
  };
}

export { canonicalDefinition, definitionRevision, normalizeLocalSourcePath };
