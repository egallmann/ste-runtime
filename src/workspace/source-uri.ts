import { implements_adr } from '../architecture/intent-decorators.js';

export interface LineRange {
  start: number;
  end: number;
}

export type ParsedSourceUri =
  | { kind: 'workspace'; repo: string; path: string; lineRange?: LineRange }
  | { kind: 'entity'; entityId: string; repo?: string }
  | { kind: 'adr'; adrId: string; repo?: string }
  | { kind: 'decision'; decisionId: string }
  | { kind: 'graph'; graphSnapshotHash: string; entityId: string }
  | { kind: 'projection'; family: string; projectionId: string };

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodePathSegment(value: string): string {
  return decodeURIComponent(value);
}

function normalizeRepo(repo: string): string {
  const trimmed = repo.trim();
  if (!trimmed) {
    throw new Error('Source URI repo must be non-empty');
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`Source URI repo is not portable: ${repo}`);
  }
  return trimmed;
}

export const normalizePortablePath: (input: string) => string = implements_adr(
  'ADR-L-0013',
)(function normalizePortablePath(input: string): string {
  const raw = input.trim().replace(/\\/g, '/');
  if (!raw) {
    throw new Error('Source URI path must be non-empty');
  }
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) {
    throw new Error(`Source URI path is not portable: ${input}`);
  }
  const parts = raw.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..')) {
    throw new Error(`Source URI path is not portable: ${input}`);
  }
  return parts.join('/');
});

function formatLineRange(lineRange?: LineRange): string {
  if (!lineRange) return '';
  if (
    !Number.isInteger(lineRange.start) ||
    !Number.isInteger(lineRange.end) ||
    lineRange.start < 1 ||
    lineRange.end < lineRange.start
  ) {
    throw new Error(`Invalid source URI line range: ${lineRange.start}-${lineRange.end}`);
  }
  return `#L${lineRange.start}-L${lineRange.end}`;
}

export const workspaceUri: (repo: string, sourcePath: string, lineRange?: LineRange) => string = implements_adr(
  'ADR-L-0013',
)(function workspaceUri(repo: string, sourcePath: string, lineRange?: LineRange): string {
  const normalizedRepo = normalizeRepo(repo);
  const normalizedPath = normalizePortablePath(sourcePath);
  const encodedPath = normalizedPath.split('/').map(encodePathSegment).join('/');
  return `workspace://${encodePathSegment(normalizedRepo)}/${encodedPath}${formatLineRange(lineRange)}`;
});

/** Repo-qualified entity URI for architecture entities (ADR, decision, invariant). */
export function entityUriForRepo(repo: string, entityId: string): string {
  const trimmed = entityId.trim();
  if (!trimmed) {
    throw new Error('Entity URI id must be non-empty');
  }
  return `entity://${encodePathSegment(normalizeRepo(repo))}/${encodePathSegment(trimmed)}`;
}

/** Workspace-scoped entity URI for infra/graph nodes (legacy). */
export function entityUri(entityId: string): string {
  const trimmed = entityId.trim();
  if (!trimmed) {
    throw new Error('Entity URI id must be non-empty');
  }
  return `entity://workspace/${encodePathSegment(trimmed)}`;
}

export function resolveEntityUri(repo: string, entityId: string, entityType: string): string {
  const type = entityType.toLowerCase();
  if (
    type === 'adr' ||
    type === 'decision' ||
    type === 'invariant' ||
    /^ADR-[LP]/.test(entityId) ||
    /^DEC-/.test(entityId) ||
    /^INV-/.test(entityId)
  ) {
    return entityUriForRepo(repo, entityId);
  }
  return entityUri(entityId);
}

function parseLineRange(fragment: string): LineRange | undefined {
  if (!fragment) return undefined;
  const match = fragment.match(/^L(\d+)-L(\d+)$/);
  if (!match) {
    throw new Error(`Invalid source URI line range fragment: ${fragment}`);
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start) {
    throw new Error(`Invalid source URI line range fragment: ${fragment}`);
  }
  return { start, end };
}

export function parseSourceUri(uriOrId: string): ParsedSourceUri {
  const value = uriOrId.trim();
  if (value.startsWith('workspace://')) {
    const withoutScheme = value.slice('workspace://'.length);
    const hashIdx = withoutScheme.indexOf('#');
    const body = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme;
    const fragment = hashIdx >= 0 ? withoutScheme.slice(hashIdx + 1) : '';
    const slashIdx = body.indexOf('/');
    if (slashIdx < 1) {
      throw new Error(`Invalid workspace URI: ${uriOrId}`);
    }
    const repo = decodePathSegment(body.slice(0, slashIdx));
    const sourcePath = body.slice(slashIdx + 1).split('/').map(decodePathSegment).join('/');
    const parsed: ParsedSourceUri = {
      kind: 'workspace',
      repo: normalizeRepo(repo),
      path: normalizePortablePath(sourcePath),
    };
    const lineRange = parseLineRange(fragment);
    if (lineRange) {
      parsed.lineRange = lineRange;
    }
    return parsed;
  }
  if (value.startsWith('entity://')) {
    const withoutScheme = value.slice('entity://'.length);
    if (withoutScheme.startsWith('workspace/')) {
      return {
        kind: 'entity',
        entityId: decodePathSegment(withoutScheme.slice('workspace/'.length)),
      };
    }
    const slashIdx = withoutScheme.indexOf('/');
    if (slashIdx >= 1) {
      const repo = decodePathSegment(withoutScheme.slice(0, slashIdx));
      const entityId = decodePathSegment(withoutScheme.slice(slashIdx + 1));
      return {
        kind: 'entity',
        entityId,
        repo: normalizeRepo(repo),
      };
    }
  }
  if (value.startsWith('adr://')) {
    const body = value.slice('adr://'.length);
    const colonIdx = body.indexOf(':');
    if (colonIdx > 0 && body.indexOf('/', colonIdx) < 0) {
      const maybeRepo = body.slice(0, colonIdx);
      const maybeId = body.slice(colonIdx + 1);
      if (/^ADR-[LP]/.test(maybeId)) {
        return { kind: 'adr', adrId: maybeId, repo: normalizeRepo(maybeRepo) };
      }
    }
    return { kind: 'adr', adrId: body };
  }
  if (value.startsWith('decision://')) {
    return { kind: 'decision', decisionId: value.slice('decision://'.length) };
  }
  if (value.startsWith('graph://workspace/')) {
    const rest = value.slice('graph://workspace/'.length);
    const marker = '/node/';
    const idx = rest.indexOf(marker);
    if (idx < 1) throw new Error(`Invalid graph URI: ${uriOrId}`);
    return {
      kind: 'graph',
      graphSnapshotHash: decodePathSegment(rest.slice(0, idx)),
      entityId: decodePathSegment(rest.slice(idx + marker.length)),
    };
  }
  if (value.startsWith('projection://workspace/')) {
    const rest = value.slice('projection://workspace/'.length);
    const idx = rest.indexOf('/');
    if (idx < 1) throw new Error(`Invalid projection URI: ${uriOrId}`);
    return {
      kind: 'projection',
      family: decodePathSegment(rest.slice(0, idx)),
      projectionId: decodePathSegment(rest.slice(idx + 1)),
    };
  }
  return { kind: 'entity', entityId: value };
}

export function normalizeWorkspaceUri(uri: string): string {
  const parsed = parseSourceUri(uri);
  if (parsed.kind !== 'workspace') {
    throw new Error(`Not a workspace URI: ${uri}`);
  }
  return workspaceUri(parsed.repo, parsed.path, parsed.lineRange);
}
