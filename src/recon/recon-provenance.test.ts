import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { executeRecon } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const steRuntimeRoot = path.resolve(__dirname, '..', '..');
const ADR_ID_PATTERN = /^ADR-L-\d{4}$/;

function functionAdrMetadata(target: unknown): readonly string[] {
  return (target as { __implements_adrs__?: readonly string[] }).__implements_adrs__ ?? [];
}

function functionInvariantMetadata(target: unknown): readonly string[] {
  return (target as { __enforces_invariants__?: readonly string[] }).__enforces_invariants__ ?? [];
}

describe('RECON provenance contract consumption (ADR-L-0001)', () => {
  it('exposes machine-readable code provenance on executeRecon', () => {
    const adrIds = functionAdrMetadata(executeRecon);
    expect(adrIds).toContain('ADR-L-0001');
    expect(adrIds.every(id => ADR_ID_PATTERN.test(id))).toBe(true);

    const invariantIds = functionInvariantMetadata(executeRecon);
    expect(invariantIds).toContain('INV-0002');
  });

  it('anchors code provenance to an existing runtime ADR source', async () => {
    const manifest = await readFile(
      path.resolve(steRuntimeRoot, 'adrs', 'manifest.yaml'),
      'utf8',
    );
    expect(manifest).toContain('ADR-L-0001');

    await expect(access(path.resolve(
      steRuntimeRoot,
      'adrs',
      'logical',
      'ADR-L-0001-recon-provisional-execution-for-project-level-sema.yaml',
    ))).resolves.toBeUndefined();
  });
});
