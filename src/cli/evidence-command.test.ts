import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildArchitectureEvidence, runArchitectureEvidenceCommand } from './evidence-command.js';
import type { ArchitectureBundleResult } from '../discovery/architecture-bundle.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'ste-runtime-evidence-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeYaml(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

async function writeBundleFixture(): Promise<void> {
  await writeYaml('adrs/index/architecture-index.yaml', `
schema_version: '1.1'
architecture_namespace: sample-runtime
generated_at: '2026-03-19T00:00:01Z'
entity_registry_path: adrs/index/entity-registry.yaml
relationship_registry_path: adrs/index/relationship-registry.yaml
unresolved_registry_path: adrs/index/unresolved-registry.yaml
`);
  await writeYaml('adrs/manifest.yaml', `
schema_version: '1.0'
generated_date: '2026-03-19T00:00:00Z'
adrs:
  - id: ADR-L-0013
`);
  await writeYaml('adrs/index/entity-registry.yaml', 'entities: []\n');
  await writeYaml('adrs/index/relationship-registry.yaml', 'relationships: []\n');
  await writeYaml('adrs/index/unresolved-registry.yaml', 'unresolved: []\n');
}

function createBundleResult(
  overrides: Partial<ArchitectureBundleResult> = {},
): ArchitectureBundleResult {
  return {
    status: 'valid',
    scopeRoot: 'C:/fixture',
    requiredArtifacts: {
      architectureIndex: { path: 'C:/fixture/adrs/index/architecture-index.yaml', exists: true, data: {} },
      manifest: { path: 'C:/fixture/adrs/manifest.yaml', exists: true, data: {} },
      entityRegistry: { path: 'C:/fixture/adrs/index/entity-registry.yaml', exists: true, data: {} },
      relationshipRegistry: { path: 'C:/fixture/adrs/index/relationship-registry.yaml', exists: true, data: {} },
      unresolvedRegistry: { path: 'C:/fixture/adrs/index/unresolved-registry.yaml', exists: true, data: {} },
    },
    additiveArtifacts: {
      architectureGraph: { path: 'C:/fixture/adrs/index/architecture-graph.yaml', exists: false, error: 'File not found' },
      subsetRegistries: [],
    },
    manifest: {
      generatedDate: '2026-03-19T00:00:00Z',
    },
    index: {
      generatedAt: '2026-03-19T00:00:01Z',
    },
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe('buildArchitectureEvidence', () => {
  it('builds the versioned evidence contract with required arrays', () => {
    const result = buildArchitectureEvidence(
      createBundleResult({
        status: 'degraded',
        warnings: ['missing additive graph'],
      }),
    );

    expect(result.version).toBe('1');
    expect(result.bundle.status).toBe('degraded');
    expect(result.bundle.warnings).toEqual(['missing additive graph']);
    expect(result.bundle.errors).toEqual([]);
    expect(result.freshness.status).toBe('stale-unknown');
    expect(result.freshness.lastReconciled).toBe('2026-03-19T00:00:01Z');
  });

  it('falls back to manifest generated date when index timestamp is unavailable', () => {
    const result = buildArchitectureEvidence(
      createBundleResult({
        index: {},
      }),
    );

    expect(result.freshness.status).toBe('stale-unknown');
    expect(result.freshness.lastReconciled).toBe('2026-03-19T00:00:00Z');
  });

  it('keeps stdout payload JSON-compatible and policy-free', () => {
    const result = buildArchitectureEvidence(createBundleResult());
    const parsed = JSON.parse(JSON.stringify(result));

    expect(parsed.bundle.status).toBe('valid');
    expect(parsed.freshness.status).toBe('stale-unknown');
    expect(parsed).not.toHaveProperty('decision');
    expect(parsed).not.toHaveProperty('eligibility');
  });
});

describe('runArchitectureEvidenceCommand', () => {
  it('returns zero and emits JSON-only evidence on success', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    await writeBundleFixture();

    const exitCode = await runArchitectureEvidenceCommand(tempDir, {
      stdout(message: string) {
        stdout.push(message);
      },
      stderr(message: string) {
        stderr.push(message);
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const parsed = JSON.parse(stdout.join(''));
    expect(parsed.version).toBe('1');
    expect(parsed.bundle.status).toBe('degraded');
    expect(parsed.bundle.warnings).toEqual(expect.any(Array));
    expect(parsed.bundle.errors).toEqual(expect.any(Array));
    expect(parsed.freshness.status).toBe('stale-unknown');
  });

  it('returns non-zero and writes to stderr when bundle loading fails', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runArchitectureEvidenceCommand(
      tempDir,
      {
        stdout(message: string) {
          stdout.push(message);
        },
        stderr(message: string) {
          stderr.push(message);
        },
      },
      {
        async loadBundle() {
          throw new Error('fatal evidence failure');
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join('')).toContain('fatal evidence failure');
  });
});
