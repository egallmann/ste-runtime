import { describe, expect, it } from 'vitest';

import {
  entityUri,
  normalizeWorkspaceUri,
  parseSourceUri,
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
});
