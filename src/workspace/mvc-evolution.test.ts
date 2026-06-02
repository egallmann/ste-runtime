import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  assertMvcDefinitionContract,
  assertMvcSnapshotCandidateOnly,
  buildMvcSnapshotCandidate,
  canonicalMvcFingerprintInput,
  type BuildMvcSnapshotInput,
  type MvcDefinition,
} from './mvc-evolution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const steRuntimeRoot = path.resolve(__dirname, '..', '..');
const ADR_ID_PATTERN = /^ADR-L-\d{4}$/;

async function loadJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(steRuntimeRoot, relativePath), 'utf8'));
}

async function loadMvcSchema(schemaFile: string): Promise<object> {
  const candidates = [
    path.resolve(steRuntimeRoot, '..', 'ste-spec', 'contracts', 'mvc', schemaFile),
    path.resolve(steRuntimeRoot, 'test', 'fixtures', 'mvc-evolution', schemaFile),
  ];
  for (const schemaPath of candidates) {
    try {
      await access(schemaPath);
      return JSON.parse(await readFile(schemaPath, 'utf8')) as object;
    } catch {
      /* try next */
    }
  }
  throw new Error(`MVC schema not found (tried: ${candidates.join(', ')})`);
}

async function expectMatchesSchema(schemaFile: string, payload: unknown): Promise<void> {
  const ajv = new Ajv2020({ strict: false });
  const schema = await loadMvcSchema(schemaFile);
  const validate = ajv.compile(schema);
  expect(validate(payload), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

async function expectSchemaRejects(schemaFile: string, payload: unknown): Promise<void> {
  const ajv = new Ajv2020({ strict: false });
  const schema = await loadMvcSchema(schemaFile);
  const validate = ajv.compile(schema);
  expect(validate(payload)).toBe(false);
}

async function mvcDefinitionFixture(): Promise<MvcDefinition> {
  return await loadJson('test/fixtures/mvc-evolution/mvc-definition.valid.json') as MvcDefinition;
}

async function buildInput(overrides: Partial<BuildMvcSnapshotInput> = {}): Promise<BuildMvcSnapshotInput> {
  const mvcDefinition = await mvcDefinitionFixture();
  return {
    mvcDefinition,
    irSnapshotRef: {
      id: 'architecture-ir:fixture',
      version: '0.1.0',
      snapshot_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    graphSnapshotRefs: [
      {
        id: 'graph-domain:runtime-workspace',
        version: '0.1.0',
        snapshot_hash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
      {
        id: 'graph-domain:architecture-ir',
        version: '0.1.0',
        snapshot_hash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      },
    ],
    linkageSurfaceRefs: [
      {
        id: 'linkage-surface:adr-to-code',
        version: '0.1.0',
        snapshot_hash: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      },
    ],
    selectorVersionRefs: [
      { id: 'selector:mvc-fixture:decision', version: '0.1.0' },
      { id: 'selector:mvc-fixture:embodiment', version: '0.1.0' },
    ],
    candidateEntities: [
      { id: 'decision:adr-l-0043', version: '0.1.0' },
      { id: 'component:runtime-mvc-fixture', version: '0.1.0' },
    ],
    candidateRelationships: [
      { id: 'relationship:decision-to-component', version: '0.1.0' },
    ],
    candidateEvidence: [
      { id: 'evidence:runtime-fixture', version: '0.1.0' },
    ],
    candidateConstraints: [
      { id: 'invariant:inv-0031', version: '0.1.0' },
    ],
    topologyMetrics: {
      node_count: 2,
      edge_count: 1,
      branching_factor: 0.5,
      convergence_score: 1,
      recommended_depth: 1,
    },
    inclusionRationale: [
      {
        reason: 'Architectural decision and runtime candidate component are fully supplied by fixture.',
        selector_path: 'selector:mvc-fixture:decision/entity:decision:adr-l-0043',
        persona_ref: 'architect',
        task_ref: 'task:mvc-evolution-fixture',
      },
    ],
    exclusionRationale: [
      {
        reason: 'Admission state is excluded because MVC-S is candidate-only.',
        selector_path: 'runtime-boundary/admission',
        policy_ref: 'policy:runtime-candidate-only',
      },
    ],
    negativeSpace: [
      {
        id: 'missing:direct-code-to-invariant',
        reason: 'Fixture preserves missing direct code to invariant linkage as negative space.',
      },
    ],
    ...overrides,
  };
}

function functionAdrMetadata(target: unknown): readonly string[] {
  return (target as { __implements_adrs__?: readonly string[] }).__implements_adrs__ ?? [];
}

function functionInvariantMetadata(target: unknown): readonly string[] {
  return (target as { __enforces_invariants__?: readonly string[] }).__enforces_invariants__ ?? [];
}

describe('MVC evolution contract consumption', () => {
  it('validates the MVC-D fixture against the ste-spec contract', async () => {
    const mvcD = await mvcDefinitionFixture();
    await expectMatchesSchema('mvc-definition.schema.json', mvcD);
    expect(() => assertMvcDefinitionContract(mvcD)).not.toThrow();
  });

  it('emits schema-valid MVC-S candidate snapshots from fully supplied inputs', async () => {
    const snapshot = buildMvcSnapshotCandidate(await buildInput());

    await expectMatchesSchema('mvc-snapshot.schema.json', snapshot);
    expect(snapshot.candidate_entities).toHaveLength(2);
    expect(snapshot.candidate_relationships).toHaveLength(1);
    expect(snapshot.topology_metrics.node_count).toBe(2);
    expect(snapshot.inclusion_rationale).toHaveLength(1);
    expect(snapshot.exclusion_rationale).toHaveLength(1);
    expect(snapshot.negative_space).toContainEqual(
      expect.objectContaining({ id: 'missing:direct-code-to-invariant' }),
    );
  });

  it('rejects missing and unsupported MVC-D schema version fields', async () => {
    const mvcD = await mvcDefinitionFixture();
    const missingVersion = { ...mvcD };
    delete (missingVersion as Partial<MvcDefinition>).schema_version;
    expect(() => assertMvcDefinitionContract(missingVersion)).toThrow('schema_version');
    await expectSchemaRejects('mvc-definition.schema.json', missingVersion);

    const unsupportedVersion = { ...mvcD, schema_version: '9.9.9' };
    expect(() => assertMvcDefinitionContract(unsupportedVersion)).toThrow('Unsupported MVC-D schema_version');
    await expectSchemaRejects('mvc-definition.schema.json', unsupportedVersion);
  });

  it('rejects missing required MVC-D fields instead of auto-healing input', async () => {
    const mvcD = await mvcDefinitionFixture();
    const missingTaskContext = { ...mvcD };
    delete (missingTaskContext as Partial<MvcDefinition>).task_context;
    expect(() => assertMvcDefinitionContract(missingTaskContext)).toThrow('task_context');
    await expectSchemaRejects('mvc-definition.schema.json', missingTaskContext);
  });

  it('rejects mismatched schema identifiers when inputs try to carry one', async () => {
    const mvcD = { ...(await mvcDefinitionFixture()), schema_id: 'runtime-owned-mvc-definition' };
    await expectSchemaRejects('mvc-definition.schema.json', mvcD);
  });

  it('rejects invalid MVC-S output without auto-healing admission semantics', async () => {
    const invalidSnapshot = {
      ...buildMvcSnapshotCandidate(await buildInput()),
      admission_decision: { admitted: true },
    };

    expect(() => assertMvcSnapshotCandidateOnly(invalidSnapshot)).toThrow('admission_decision');
    await expectSchemaRejects('mvc-snapshot.schema.json', invalidSnapshot);
  });

  it('does not silently default admission, eligibility, kernel, enforcement, or governance fields', async () => {
    const snapshot = buildMvcSnapshotCandidate(await buildInput());

    for (const field of [
      'admission_decision',
      'admission_status',
      'admitted_payload',
      'caller_facing_eligibility',
      'eligibility_outcome',
      'enforcement_outcome',
      'governance_state',
      'kernel_assessment_state',
      'kernel_verdict',
    ]) {
      expect(snapshot).not.toHaveProperty(field);
    }
  });

  it('emits identical snapshots and fingerprints for identical inputs', async () => {
    const input = await buildInput();
    const first = buildMvcSnapshotCandidate(input);
    const second = buildMvcSnapshotCandidate(input);

    expect(second).toEqual(first);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.ir_snapshot_ref).toEqual(first.ir_snapshot_ref);
    expect(second.graph_snapshot_refs).toEqual(first.graph_snapshot_refs);
    expect(second.linkage_surface_refs).toEqual(first.linkage_surface_refs);
  });

  it('canonicalizes ordering and JSON formatting before fingerprinting', async () => {
    const input = await buildInput();
    const reversed = await buildInput({
      graphSnapshotRefs: [...input.graphSnapshotRefs].reverse(),
      selectorVersionRefs: [...input.selectorVersionRefs].reverse(),
      candidateEntities: [...input.candidateEntities].reverse(),
    });

    const first = buildMvcSnapshotCandidate(input);
    const second = buildMvcSnapshotCandidate(JSON.parse(JSON.stringify(reversed)) as BuildMvcSnapshotInput);

    expect(second).toEqual(first);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(canonicalMvcFingerprintInput(reversed)).toEqual(canonicalMvcFingerprintInput(input));
  });

  it('changes fingerprint when topology-affecting inputs change', async () => {
    const first = buildMvcSnapshotCandidate(await buildInput());
    const second = buildMvcSnapshotCandidate(await buildInput({
      topologyMetrics: {
        node_count: 3,
        edge_count: 2,
        branching_factor: 0.75,
        convergence_score: 0.9,
        recommended_depth: 2,
      },
    }));

    expect(second.fingerprint).not.toBe(first.fingerprint);
  });

  it('rejects calls without fully supplied candidate material instead of reconstructing it', async () => {
    const input = await buildInput();
    const missingCandidates = { ...input };
    delete (missingCandidates as Partial<BuildMvcSnapshotInput>).candidateEntities;

    expect(() => buildMvcSnapshotCandidate(missingCandidates as BuildMvcSnapshotInput)).toThrow(
      'candidateEntities',
    );
  });

  it('exposes machine-readable code provenance for ADR-L-0021 and runtime invariants', () => {
    for (const target of [
      assertMvcDefinitionContract,
      assertMvcSnapshotCandidateOnly,
      buildMvcSnapshotCandidate,
    ]) {
      const adrIds = functionAdrMetadata(target);
      expect(adrIds).toContain('ADR-L-0021');
      expect(adrIds.every(id => ADR_ID_PATTERN.test(id))).toBe(true);
    }

    expect(functionInvariantMetadata(assertMvcDefinitionContract)).toContain('INV-0030');
    expect(functionInvariantMetadata(assertMvcSnapshotCandidateOnly)).toContain('INV-0031');
    expect(functionInvariantMetadata(buildMvcSnapshotCandidate)).toEqual(['INV-0031', 'INV-0032']);
  });

  it('anchors code provenance to an existing runtime ADR source', async () => {
    await expect(access(path.resolve(
      steRuntimeRoot,
      'adrs',
      'logical',
      'ADR-L-0021-experimental-mvc-d-to-mvc-s-contract-consumption.yaml',
    ))).resolves.toBeUndefined();
  });
});
