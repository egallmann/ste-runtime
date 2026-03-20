import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveArchitectureEvidenceFreshness } from './architecture-evidence-freshness.js';
import type { ArchitectureBundleResult } from '../discovery/architecture-bundle.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'ste-runtime-freshness-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeYaml(relativePath: string, content = 'id: test\n'): Promise<string> {
  const fullPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
  return fullPath;
}

async function setMtime(filePath: string, isoTimestamp: string): Promise<void> {
  const timestamp = new Date(isoTimestamp);
  await utimes(filePath, timestamp, timestamp);
}

function createBundle(overrides: Partial<ArchitectureBundleResult> = {}): ArchitectureBundleResult {
  return {
    status: 'valid',
    scopeRoot: tempDir,
    requiredArtifacts: {
      architectureIndex: { path: path.join(tempDir, 'adrs/index/architecture-index.yaml'), exists: true, data: {} },
      manifest: { path: path.join(tempDir, 'adrs/manifest.yaml'), exists: true, data: {} },
      entityRegistry: { path: path.join(tempDir, 'adrs/index/entity-registry.yaml'), exists: true, data: {} },
      relationshipRegistry: { path: path.join(tempDir, 'adrs/index/relationship-registry.yaml'), exists: true, data: {} },
      unresolvedRegistry: { path: path.join(tempDir, 'adrs/index/unresolved-registry.yaml'), exists: true, data: {} },
    },
    additiveArtifacts: {
      architectureGraph: { path: path.join(tempDir, 'adrs/index/architecture-graph.yaml'), exists: true, data: {} },
      subsetRegistries: [],
    },
    manifest: {
      generatedDate: '2026-03-20T00:00:00Z',
    },
    index: {
      generatedAt: '2026-03-20T00:00:01Z',
    },
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe('resolveArchitectureEvidenceFreshness', () => {
  it('returns current when all canonical ADR sources are older than or equal to the bundle timestamp', async () => {
    const logicalAdr = await writeYaml('adrs/logical/ADR-L-0001-test.yaml');
    await setMtime(logicalAdr, '2026-03-20T00:00:01Z');

    const result = await resolveArchitectureEvidenceFreshness(tempDir, createBundle());

    expect(result.status).toBe('current');
    expect(result.lastReconciled).toBe('2026-03-20T00:00:01.000Z');
  });

  it('returns stale-confirmed when any canonical ADR source is newer than the bundle timestamp', async () => {
    const logicalAdr = await writeYaml('adrs/logical/ADR-L-0001-test.yaml');
    await setMtime(logicalAdr, '2026-03-20T00:00:02Z');

    const result = await resolveArchitectureEvidenceFreshness(tempDir, createBundle());

    expect(result.status).toBe('stale-confirmed');
  });

  it('returns stale-unknown when no valid bundle timestamp is available', async () => {
    await writeYaml('adrs/logical/ADR-L-0001-test.yaml');

    const result = await resolveArchitectureEvidenceFreshness(
      tempDir,
      createBundle({
        index: {
          generatedAt: 'not-a-date',
        },
        manifest: {
          generatedDate: 'still-not-a-date',
        },
      }),
    );

    expect(result.status).toBe('stale-unknown');
    expect(result.warnings.some(warning => warning.includes('no valid bundle timestamp'))).toBe(true);
  });

  it('returns stale-unknown when no canonical ADR source files are found', async () => {
    await writeYaml('adrs/index/architecture-index.yaml');
    await writeYaml('adrs/rendered/ADR-L-0001-test.md', '# rendered');
    await writeYaml('adrs/entities/registry.yaml');
    await writeYaml('adrs/manifest.yaml');

    const result = await resolveArchitectureEvidenceFreshness(tempDir, createBundle());

    expect(result.status).toBe('stale-unknown');
    expect(result.warnings.some(warning => warning.includes('no canonical ADR source files'))).toBe(true);
  });

  it('ignores newer derived artifacts when computing freshness', async () => {
    const logicalAdr = await writeYaml('adrs/logical/ADR-L-0001-test.yaml');
    const derivedIndex = await writeYaml('adrs/index/architecture-index.yaml');
    await setMtime(logicalAdr, '2026-03-20T00:00:00Z');
    await setMtime(derivedIndex, '2026-03-20T00:05:00Z');

    const result = await resolveArchitectureEvidenceFreshness(tempDir, createBundle());

    expect(result.status).toBe('current');
  });

  it('falls back to manifest.generatedDate only when architecture-index.generatedAt is invalid', async () => {
    const logicalAdr = await writeYaml('adrs/logical/ADR-L-0001-test.yaml');
    await setMtime(logicalAdr, '2026-03-19T23:59:59Z');

    const result = await resolveArchitectureEvidenceFreshness(
      tempDir,
      createBundle({
        index: {
          generatedAt: 'invalid-date',
        },
        manifest: {
          generatedDate: '2026-03-20T00:00:00-05:00',
        },
      }),
    );

    expect(result.status).toBe('current');
    expect(result.lastReconciled).toBe('2026-03-20T05:00:00.000Z');
    expect(result.warnings.some(warning => warning.includes('manifest.generatedDate'))).toBe(true);
  });
});
