import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { buildArchitectureEvidence, runArchitectureEvidenceCommand, deriveSubjectsFromBundle, type EvidenceSubject } from './evidence-command.js';
import type { ArchitectureBundleResult } from '../discovery/architecture-bundle.js';

const DEFAULT_SUBJECTS: EvidenceSubject[] = [
  { kind: 'adr_l', id: 'ADR-L-0001', effect: 'validates' },
];

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
  await writeYaml('adrs/logical/ADR-L-0013-test.yaml', 'id: ADR-L-0013\n');
}

async function setMtime(relativePath: string, isoTimestamp: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  const timestamp = new Date(isoTimestamp);
  await utimes(fullPath, timestamp, timestamp);
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadSpecSchema(schemaFile: string): Promise<object> {
  const steRuntimeRoot = path.resolve(__dirname, '..', '..');
  const candidates = [
    path.resolve(steRuntimeRoot, '..', 'ste-spec', 'contracts', schemaFile),
    path.resolve(steRuntimeRoot, 'test', 'fixtures', schemaFile),
  ];
  for (const schemaPath of candidates) {
    try {
      await access(schemaPath);
      return JSON.parse(await readFile(schemaPath, 'utf8')) as object;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `Architecture evidence schema not found (tried: ${candidates.join(', ')}). ` +
      'Add ste-spec as a sibling repo or keep test/fixtures copy in sync.',
  );
}

async function expectMatchesArchitectureEvidenceSchema(payload: unknown): Promise<void> {
  const ajv = new Ajv2020({ strict: false });
  const schema = await loadSpecSchema('architecture-evidence.schema.json');
  const validate = ajv.compile(schema);
  const valid = validate(payload);
  expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
}

describe('buildArchitectureEvidence', () => {
  it('builds the versioned evidence contract with required arrays', async () => {
    const result = await buildArchitectureEvidence(
      tempDir,
      createBundleResult({
        status: 'degraded',
        warnings: ['missing additive graph'],
      }),
      DEFAULT_SUBJECTS,
      {
        async resolveFreshness() {
          return {
            status: 'stale-unknown',
            lastReconciled: '2026-03-19T00:00:01Z',
            warnings: [],
            errors: [],
          };
        },
      },
    );

    expect(result.version).toBe('2');
    expect(result.subjects).toEqual(DEFAULT_SUBJECTS);
    expect(result.bundle.status).toBe('degraded');
    expect(result.bundle.warnings).toEqual(['missing additive graph']);
    expect(result.bundle.errors).toEqual([]);
    expect(result.freshness.status).toBe('stale-unknown');
    expect(result.freshness.lastReconciled).toBe('2026-03-19T00:00:01Z');
    await expectMatchesArchitectureEvidenceSchema(result);
  });

  it('falls back to manifest generated date when index timestamp is unavailable', async () => {
    const result = await buildArchitectureEvidence(
      tempDir,
      createBundleResult({
        index: {},
      }),
      DEFAULT_SUBJECTS,
      {
        async resolveFreshness() {
          return {
            status: 'stale-unknown',
            lastReconciled: '2026-03-19T00:00:00.000Z',
            warnings: [],
            errors: [],
          };
        },
      },
    );

    expect(result.freshness.status).toBe('stale-unknown');
    expect(result.freshness.lastReconciled).toBe('2026-03-19T00:00:00.000Z');
  });

  it('keeps stdout payload JSON-compatible and policy-free', async () => {
    const result = await buildArchitectureEvidence(
      tempDir,
      createBundleResult(),
      DEFAULT_SUBJECTS,
      {
        async resolveFreshness() {
          return {
            status: 'stale-unknown',
            lastReconciled: '2026-03-19T00:00:01Z',
            warnings: [],
            errors: [],
          };
        },
      },
    );
    const parsed = JSON.parse(JSON.stringify(result));

    expect(parsed.bundle.status).toBe('valid');
    expect(parsed.freshness.status).toBe('stale-unknown');
    expect(parsed).not.toHaveProperty('decision');
    expect(parsed).not.toHaveProperty('eligibility');
    await expectMatchesArchitectureEvidenceSchema(parsed);
  });
});

describe('runArchitectureEvidenceCommand', () => {
  it('returns zero and emits JSON-only evidence on success', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    await writeBundleFixture();
    await setMtime('adrs/logical/ADR-L-0013-test.yaml', '2026-03-18T00:00:00Z');

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
    expect(parsed.version).toBe('2');
    expect(parsed.subjects).toEqual([
      { kind: 'adr_l', id: 'ADR-L-0013', effect: 'validates' },
    ]);
    expect(parsed.bundle.status).toBe('degraded');
    expect(parsed.bundle.warnings).toEqual(expect.any(Array));
    expect(parsed.bundle.errors).toEqual(expect.any(Array));
    expect(parsed.freshness.status).toBe('current');
    await expectMatchesArchitectureEvidenceSchema(parsed);
  });

  it('emits stale-confirmed when canonical ADR sources are newer than the bundle timestamp', async () => {
    const stdout: string[] = [];
    await writeBundleFixture();
    await setMtime('adrs/logical/ADR-L-0013-test.yaml', '2026-03-20T00:00:02Z');

    const exitCode = await runArchitectureEvidenceCommand(tempDir, {
      stdout(message: string) {
        stdout.push(message);
      },
      stderr() {},
    });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.join(''));
    expect(parsed.freshness.status).toBe('stale-confirmed');
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
        async resolveFreshness() {
          return { status: 'current', warnings: [], errors: [] };
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join('')).toContain('fatal evidence failure');
  });
});

describe('deriveSubjectsFromBundle', () => {
  it('extracts ADR subjects from manifest data', () => {
    const bundle = createBundleResult();
    (bundle.requiredArtifacts.manifest as { data: unknown }).data = {
      adrs: [
        { id: 'ADR-L-0001' },
        { id: 'ADR-PS-0002' },
        { id: 'ADR-PC-0003' },
      ],
    };
    const subjects = deriveSubjectsFromBundle(bundle);
    expect(subjects).toEqual([
      { kind: 'adr_l', id: 'ADR-L-0001', effect: 'validates' },
      { kind: 'adr_ps', id: 'ADR-PS-0002', effect: 'validates' },
      { kind: 'adr_pc', id: 'ADR-PC-0003', effect: 'validates' },
    ]);
  });

  it('marks subjects as invalidates when bundle status is invalid', () => {
    const bundle = createBundleResult({ status: 'invalid' });
    (bundle.requiredArtifacts.manifest as { data: unknown }).data = {
      adrs: [{ id: 'ADR-L-0001' }],
    };
    const subjects = deriveSubjectsFromBundle(bundle);
    expect(subjects).toEqual([
      { kind: 'adr_l', id: 'ADR-L-0001', effect: 'invalidates' },
    ]);
  });

  it('returns empty when manifest has no ADR data', () => {
    const bundle = createBundleResult();
    (bundle.requiredArtifacts.manifest as { data: unknown }).data = {};
    expect(deriveSubjectsFromBundle(bundle)).toEqual([]);
  });
});
