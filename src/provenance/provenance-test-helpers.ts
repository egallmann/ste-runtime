import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const steRuntimeRoot = path.resolve(__dirname, '..', '..');
export const ADR_ID_PATTERN = /^ADR-L-\d{4}$/;
export const INV_ID_PATTERN = /^INV-\d{4}$/;

export function functionAdrMetadata(target: unknown): readonly string[] {
  return (target as { __implements_adrs__?: readonly string[] }).__implements_adrs__ ?? [];
}

export function functionInvariantMetadata(target: unknown): readonly string[] {
  return (target as { __enforces_invariants__?: readonly string[] }).__enforces_invariants__ ?? [];
}

export function classAdrMetadata(classRef: unknown): readonly string[] {
  return (classRef as { __implements_adrs__?: readonly string[] }).__implements_adrs__ ?? [];
}

export function classInvariantMetadata(classRef: unknown): readonly string[] {
  return (classRef as { __enforces_invariants__?: readonly string[] }).__enforces_invariants__ ?? [];
}

export async function expectAdrSourceExists(adrId: string, relativePath: string): Promise<void> {
  const manifest = await readFile(path.resolve(steRuntimeRoot, 'adrs', 'manifest.yaml'), 'utf8');
  expect(manifest).toContain(adrId);
  await expect(access(path.resolve(steRuntimeRoot, relativePath))).resolves.toBeUndefined();
}

export function expectAdrClaims(
  target: unknown,
  adrId: string,
  invariantIds: string[] = [],
): void {
  const adrIds = functionAdrMetadata(target);
  expect(adrIds).toContain(adrId);
  expect(adrIds.every(id => ADR_ID_PATTERN.test(id))).toBe(true);

  if (invariantIds.length > 0) {
    const invIds = functionInvariantMetadata(target);
    for (const invId of invariantIds) {
      expect(invIds).toContain(invId);
    }
    expect(invIds.every(id => INV_ID_PATTERN.test(id))).toBe(true);
  }
}
