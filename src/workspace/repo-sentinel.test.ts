/**
 * Sentinel fingerprint hashing (deterministic ordering).
 */

import { describe, expect, it } from 'vitest';
import { computeSourceHash } from './repo-sentinel.js';

describe('computeSourceHash', () => {
  it('is order-invariant under unsorted inputs', () => {
    const a = [{ relativePath: 'a.ts', mtimeMs: 1, size: 10 }];
    const permuted = [{ relativePath: 'b.ts', mtimeMs: 2, size: 11 }, ...a];
    const sorted = [...a, { relativePath: 'b.ts', mtimeMs: 2, size: 11 }];
    expect(computeSourceHash(permuted)).toBe(computeSourceHash(sorted));
  });
});
