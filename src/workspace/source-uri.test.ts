import { describe, expect, it } from 'vitest';

import {
  entityUri,
  entityUriForRepo,
  normalizeWorkspaceUri,
  parseSourceUri,
  resolveEntityUri,
  workspaceUri,
} from './source-uri.js';

describe('source URI normalization', () => {
  it('normalizes workspace URIs with POSIX paths and line ranges', () => {
    expect(workspaceUri('ste-runtime', 'src\\workspace\\source-uri.ts')).toBe(
      'workspace://ste-runtime/src/workspace/source-uri.ts',
    );
    expect(workspaceUri('ste-runtime', 'src/workspace/source-uri.ts', { start: 3, end: 7 })).toBe(
      'workspace://ste-runtime/src/workspace/source-uri.ts#L3-L7',
    );
  });

  it('rejects absolute, parent-relative, and drive-letter paths', () => {
    expect(() => workspaceUri('repo', '../x.ts')).toThrow(/portable/);
    expect(() => workspaceUri('repo', '/x.ts')).toThrow(/portable/);
    expect(() => workspaceUri('repo', 'C:/x.ts')).toThrow(/portable/);
  });

  it('round trips workspace URIs', () => {
    const uri = workspaceUri('adr-architecture-kit', 'adrs/logical/ADR-L-0001.yaml');
    expect(normalizeWorkspaceUri(uri)).toBe(uri);
    expect(parseSourceUri(uri)).toEqual({
      kind: 'workspace',
      repo: 'adr-architecture-kit',
      path: 'adrs/logical/ADR-L-0001.yaml',
    });
  });

  it('normalizes entity URIs with segment encoding', () => {
    expect(entityUri('Lambda:repo:my function')).toBe('entity://workspace/Lambda%3Arepo%3Amy%20function');
  });

  it('builds repo-qualified entity URIs for architecture entities', () => {
    expect(entityUriForRepo('ste-runtime', 'ADR-L-0013')).toBe('entity://ste-runtime/ADR-L-0013');
    expect(parseSourceUri('entity://ste-runtime/ADR-L-0013')).toEqual({
      kind: 'entity',
      entityId: 'ADR-L-0013',
      repo: 'ste-runtime',
    });
    expect(resolveEntityUri('adr-architecture-kit', 'ADR-L-0012', 'adr')).toBe(
      'entity://adr-architecture-kit/ADR-L-0012',
    );
    expect(resolveEntityUri('repoA', 'Lambda:repoA:fn', 'Lambda')).toBe(
      'entity://workspace/Lambda%3ArepoA%3Afn',
    );
  });
});
