import crypto from 'node:crypto';
import path from 'node:path';

import type {
  DefinitionRevision,
  RepositoryDefinition,
  RepositoryId,
  WorkspaceDefinition,
} from './types.js';

export const PUBLIC_RUNTIME_CONTRACT_VERSION = '1.0.0';

export function normalizeLocalSourcePath(input: string): string {
  const resolved = path.resolve(input.trim());
  const normalized = path.normalize(resolved);
  return process.platform === 'win32' ? normalized.replace(/\\/g, '/').toLowerCase() : normalized;
}

export function canonicalize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError(`Unsupported value in canonical representation: ${typeof value}`);
}

export function canonicalDefinition(definition: WorkspaceDefinition): string {
  const repositories = [...definition.repositories]
    .map(repository => ({
      repositoryId: repository.repositoryId,
      source: {
        kind: repository.source.kind,
        path: normalizeLocalSourcePath(repository.source.path),
      },
    }))
    .sort((a, b) => a.repositoryId.localeCompare(b.repositoryId));

  return canonicalize({
    contractVersion: PUBLIC_RUNTIME_CONTRACT_VERSION,
    repositories,
  });
}

export function definitionRevision(definition: WorkspaceDefinition): DefinitionRevision {
  return `sha256:${crypto.createHash('sha256').update(canonicalDefinition(definition), 'utf8').digest('hex')}` as DefinitionRevision;
}

export function canonicalObservation(value: unknown): string {
  return canonicalize(value);
}

export function observationFingerprint(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalObservation(value), 'utf8').digest('hex')}`;
}

export function canonicalRepositoryDefinition(
  repositoryId: RepositoryId,
  sourcePath: string,
): RepositoryDefinition {
  return {
    repositoryId,
    source: { kind: 'local', path: normalizeLocalSourcePath(sourcePath) },
  };
}
