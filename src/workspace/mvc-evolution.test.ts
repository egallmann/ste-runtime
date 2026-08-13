import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  assertMvcDefinitionContract,
  assertMvcFederatedIdentity,
  assertMvcSnapshotCandidateOnly,
  buildMvcSnapshotCandidate,
  canonicalMvcFingerprintInput,
  recommendMvcDepthFromTopology,
  traverseMvcSFromLinkageSurface,
  traverseMvcSCandidates,
  type BuildMvcSnapshotInput,
  type MvcDefinition,
  type MvcLinkageSurface,
  type MvcSnapshot,
  type MvcTraversalRelationshipRecord,
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

async function loadLinkageSurfaceSchema(): Promise<object> {
  const candidates = [
    path.resolve(steRuntimeRoot, '..', 'ste-spec', 'contracts', 'linkage-surface', 'linkage-surface.schema.json'),
    path.resolve(steRuntimeRoot, 'test', 'fixtures', 'mvc-evolution', 'linkage-surface.schema.json'),
  ];
  for (const schemaPath of candidates) {
    try {
      await access(schemaPath);
      return JSON.parse(await readFile(schemaPath, 'utf8')) as object;
    } catch {
      /* try next */
    }
  }
  throw new Error(`Linkage Surface schema not found (tried: ${candidates.join(', ')})`);
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

async function expectMatchesLinkageSurfaceSchema(payload: unknown): Promise<void> {
  const ajv = new Ajv2020({ strict: false });
  const schema = await loadLinkageSurfaceSchema();
  const validate = ajv.compile(schema);
  expect(validate(payload), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

async function expectLinkageSurfaceSchemaRejects(payload: unknown): Promise<void> {
  const ajv = new Ajv2020({ strict: false });
  const schema = await loadLinkageSurfaceSchema();
  const validate = ajv.compile(schema);
  expect(validate(payload)).toBe(false);
}

async function mvcDefinitionFixture(): Promise<MvcDefinition> {
  return await loadJson('test/fixtures/mvc-evolution/mvc-definition.valid.json') as MvcDefinition;
}

async function linkageSurfaceFixture(): Promise<MvcLinkageSurface> {
  const siblingExample = path.resolve(
    steRuntimeRoot,
    '..',
    'ste-spec',
    'contracts',
    'examples',
    'linkage-surface.valid-workspace-qualified-adr.json',
  );
  try {
    return JSON.parse(await readFile(siblingExample, 'utf8')) as MvcLinkageSurface;
  } catch {
    return {
      schema_version: '0.1.0',
      id: 'workspace-qualified-adr-linkage-surface',
      version: '0.1.0',
      status: 'experimental',
      source_snapshot_refs: [
        {
          id: 'workspace-attribution-federation',
          version: '0.1.0',
          snapshot_hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
      relationship_records: [
        {
          id: 'workspace-qualified-adr-invariant-link',
          relationship_family: 'adr_to_invariant',
          from_ref: {
            id: 'ste-runtime:ADR-L-0021',
            version: '1',
            identity_scope: 'workspace',
            corpus_scope: 'ste-runtime',
            qualified_id: 'ste-runtime:ADR-L-0021',
          },
          to_ref: {
            id: 'ste-spec:INV-0001',
            version: '1',
            identity_scope: 'workspace',
            corpus_scope: 'ste-spec',
            entity_uri: 'entity://ste-spec/INV-0001',
          },
          relationship_origin: 'manual_mapping',
          producer_ref: 'fixture:mvc-evolution',
          producer_kind: 'manual',
          generation_method: 'curated_fixture',
          provenance: {
            source_ref: {
              id: 'ste-runtime:ADR-L-0021',
              version: '1',
              identity_scope: 'workspace',
              corpus_scope: 'ste-runtime',
              qualified_id: 'ste-runtime:ADR-L-0021',
            },
            source_kind: 'adr',
          },
          integrity: {
            content_hash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
          rationale_refs: [
            {
              id: 'ste-runtime:ADR-L-0021',
              version: '1',
              identity_scope: 'workspace',
              corpus_scope: 'ste-runtime',
              qualified_id: 'ste-runtime:ADR-L-0021',
            },
          ],
        },
      ],
      provenance: {
        source_ref: {
          id: 'workspace-attribution-federation',
          version: '0.1.0',
        },
        source_kind: 'federation-index',
      },
      integrity: {
        content_hash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      },
      freshness: {
        status: 'current',
        observed_at: '2026-05-30T00:00:00.000Z',
      },
      confidence_or_validation_status: 'candidate',
      negative_space: [],
    } as MvcLinkageSurface;
  }
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

  it('deduplicates identity-equivalent candidate refs across all candidate arrays', async () => {
    const input = await buildInput({
      candidateEntities: [
        { id: 'entity:alias-a', version: '1', identity_scope: 'workspace', corpus_scope: 'ste-runtime', entity_uri: 'entity://ste-runtime/ADR-L-0021' },
        { id: 'entity:alias-b', version: '2', identity_scope: 'workspace', corpus_scope: 'ste-runtime', entity_uri: 'entity://ste-runtime/ADR-L-0021' },
      ],
      candidateRelationships: [
        { id: 'ste-runtime:ADR-L-0021', version: '1', identity_scope: 'workspace', corpus_scope: 'ste-runtime', qualified_id: 'ste-runtime:ADR-L-0021' },
        { id: 'decision:runtime-contract', version: '2', identity_scope: 'workspace', corpus_scope: 'ste-runtime', qualified_id: 'ste-runtime:ADR-L-0021' },
      ],
      candidateEvidence: [
        { id: 'ADR-L-0021', version: '1', identity_scope: 'repo-local', corpus_scope: 'ste-runtime' },
        { id: 'ADR-L-0021', version: '2', identity_scope: 'repo-local', corpus_scope: 'ste-runtime' },
      ],
      candidateConstraints: [
        { id: 'constraint:runtime-boundary', version: '1' },
        { id: 'constraint:runtime-boundary', version: '1' },
      ],
    });

    const snapshot = buildMvcSnapshotCandidate(input);

    expect(snapshot.candidate_entities).toHaveLength(1);
    expect(snapshot.candidate_relationships).toHaveLength(1);
    expect(snapshot.candidate_evidence).toHaveLength(1);
    expect(snapshot.candidate_constraints).toHaveLength(1);
    await expectMatchesSchema('mvc-snapshot.schema.json', snapshot);
  });

  it('keeps identity-distinct homonyms and repo-local/workspace identities separate', async () => {
    const snapshot = buildMvcSnapshotCandidate(await buildInput({
      candidateEntities: [
        { id: 'ste-runtime:ADR-L-0013', version: '1', identity_scope: 'workspace', corpus_scope: 'ste-runtime', qualified_id: 'ste-runtime:ADR-L-0013' },
        { id: 'adr-architecture-kit:ADR-L-0013', version: '1', identity_scope: 'workspace', corpus_scope: 'adr-architecture-kit', qualified_id: 'adr-architecture-kit:ADR-L-0013' },
        { id: 'ADR-L-0013', version: '1', identity_scope: 'repo-local', corpus_scope: 'ste-runtime' },
      ],
    }));

    expect(snapshot.candidate_entities).toHaveLength(3);
    expect(snapshot.candidate_entities.map(ref => ref.qualified_id ?? `${ref.identity_scope}:${ref.corpus_scope}:${ref.id}`).sort()).toEqual([
      'adr-architecture-kit:ADR-L-0013',
      'repo-local:ste-runtime:ADR-L-0013',
      'ste-runtime:ADR-L-0013',
    ]);
  });

  it('keeps dedupe output stable regardless of candidate insertion order', async () => {
    const candidates = [
      { id: 'entity:alias-b', version: '2', identity_scope: 'workspace' as const, corpus_scope: 'ste-runtime', entity_uri: 'entity://ste-runtime/ADR-L-0021' },
      { id: 'entity:alias-a', version: '1', identity_scope: 'workspace' as const, corpus_scope: 'ste-runtime', entity_uri: 'entity://ste-runtime/ADR-L-0021' },
      { id: 'adr-architecture-kit:ADR-L-0013', version: '1', identity_scope: 'workspace' as const, corpus_scope: 'adr-architecture-kit', qualified_id: 'adr-architecture-kit:ADR-L-0013' },
    ];
    const first = buildMvcSnapshotCandidate(await buildInput({ candidateEntities: candidates }));
    const second = buildMvcSnapshotCandidate(await buildInput({ candidateEntities: [...candidates].reverse() }));

    expect(second.candidate_entities).toEqual(first.candidate_entities);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('does not let duplicate candidate refs change fingerprint', async () => {
    const input = await buildInput();
    const withDuplicate = await buildInput({
      candidateEntities: [...input.candidateEntities, input.candidateEntities[0]],
      candidateRelationships: [...input.candidateRelationships, input.candidateRelationships[0]],
      candidateEvidence: [...input.candidateEvidence, input.candidateEvidence[0]],
      candidateConstraints: [...input.candidateConstraints, input.candidateConstraints[0]],
    });

    const first = buildMvcSnapshotCandidate(input);
    const second = buildMvcSnapshotCandidate(withDuplicate);

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(canonicalMvcFingerprintInput(withDuplicate)).toEqual(canonicalMvcFingerprintInput(input));
  });

  it('keeps rationale and negative space outside the fingerprint contract', async () => {
    const first = buildMvcSnapshotCandidate(await buildInput());
    const withRationaleChanges = buildMvcSnapshotCandidate(await buildInput({
      inclusionRationale: [
        {
          reason: 'Different selector path selected the same candidate.',
          selector_path: 'persona:threat-modeler/selector:decision/entity:decision:adr-l-0043',
          persona_ref: 'threat-modeler',
          task_ref: 'task:mvc-evolution-fixture',
        },
      ],
      negativeSpace: [
        {
          id: 'missing:alternate-selector-path',
          reason: 'Independent negative-space observation for the same candidate survives.',
        },
      ],
    }));

    expect(withRationaleChanges.fingerprint).toBe(first.fingerprint);
  });

  it('rejects calls without fully supplied candidate material instead of reconstructing it', async () => {
    const input = await buildInput();
    const missingCandidates = { ...input };
    delete (missingCandidates as Partial<BuildMvcSnapshotInput>).candidateEntities;

    expect(() => buildMvcSnapshotCandidate(missingCandidates as BuildMvcSnapshotInput)).toThrow(
      'candidateEntities',
    );
  });

  it('rejects workspace-scoped bare ADR identities as ambiguous', async () => {
    const snapshot = buildMvcSnapshotCandidate(await buildInput({
      candidateEntities: [
        {
          id: 'ADR-L-0013',
          version: '1',
          identity_scope: 'workspace',
        },
      ],
      exclusionRationale: [
        {
          reason: 'Workspace bare ADR-L-0013 is ambiguous across repositories.',
          selector_path: 'workspace-federation/homonym-groups/ADR-L-0013',
        },
      ],
      negativeSpace: [
        {
          id: 'missing:qualified-adr-identity',
          reason: 'Workspace candidate lacks repo-qualified ADR identity.',
        },
      ],
    }));

    expect(() => assertMvcFederatedIdentity(snapshot)).toThrow('workspace-scoped bare ADR identity');
    await expectSchemaRejects('mvc-snapshot.schema.json', snapshot);
  });

  it('accepts workspace-scoped qualified ADR and entity URI identities', async () => {
    const snapshot = buildMvcSnapshotCandidate(await buildInput({
      candidateEntities: [
        {
          id: 'ste-runtime:ADR-L-0021',
          version: '1',
          identity_scope: 'workspace',
          corpus_scope: 'ste-runtime',
          qualified_id: 'ste-runtime:ADR-L-0021',
        },
        {
          id: 'entity://ste-runtime/ADR-L-0021',
          version: '1',
          identity_scope: 'workspace',
          corpus_scope: 'ste-runtime',
          entity_uri: 'entity://ste-runtime/ADR-L-0021',
        },
      ],
      inclusionRationale: [
        {
          reason: 'Workspace qualified ADR identity is preserved.',
          selector_path: 'workspace-federation/qualified-adrs/ste-runtime:ADR-L-0021',
          identity_scope: 'workspace',
          corpus_scope: 'ste-runtime',
          qualified_id: 'ste-runtime:ADR-L-0021',
        },
        {
          reason: 'Workspace entity URI identity is preserved.',
          selector_path: 'workspace-federation/entities/entity://ste-runtime/ADR-L-0021',
          identity_scope: 'workspace',
          corpus_scope: 'ste-runtime',
          entity_uri: 'entity://ste-runtime/ADR-L-0021',
        },
      ],
    }));

    expect(() => assertMvcFederatedIdentity(snapshot)).not.toThrow();
    await expectMatchesSchema('mvc-snapshot.schema.json', snapshot);
  });

  it('requires corpus scope for repo-local bare ADR identities', async () => {
    const missingCorpus = buildMvcSnapshotCandidate(await buildInput({
      candidateEntities: [
        {
          id: 'ADR-L-0021',
          version: '1',
          identity_scope: 'repo-local',
        },
      ],
    }));

    expect(() => assertMvcFederatedIdentity(missingCorpus)).toThrow('corpus_scope');
    await expectSchemaRejects('mvc-snapshot.schema.json', missingCorpus);

    const scoped = buildMvcSnapshotCandidate(await buildInput({
      candidateEntities: [
        {
          id: 'ADR-L-0021',
          version: '1',
          identity_scope: 'repo-local',
          corpus_scope: 'ste-runtime',
        },
      ],
      inclusionRationale: [
        {
          reason: 'Repo-local bare ADR identity is scoped to ste-runtime.',
          selector_path: 'repo-local/adrs/ADR-L-0021',
          identity_scope: 'repo-local',
          corpus_scope: 'ste-runtime',
        },
      ],
    }));

    expect(() => assertMvcFederatedIdentity(scoped)).not.toThrow();
    await expectMatchesSchema('mvc-snapshot.schema.json', scoped);
  });

  it('preserves homonym ADRs as distinct qualified candidate refs and rationale entries', async () => {
    const snapshot = buildMvcSnapshotCandidate(await buildInput({
      candidateEntities: [
        {
          id: 'ste-runtime:ADR-L-0013',
          version: '1',
          identity_scope: 'workspace',
          corpus_scope: 'ste-runtime',
          qualified_id: 'ste-runtime:ADR-L-0013',
        },
        {
          id: 'adr-architecture-kit:ADR-L-0013',
          version: '1',
          identity_scope: 'workspace',
          corpus_scope: 'adr-architecture-kit',
          qualified_id: 'adr-architecture-kit:ADR-L-0013',
        },
      ],
      inclusionRationale: [
        {
          reason: 'Runtime ADR-L-0013 is selected through runtime corpus scope.',
          selector_path: 'workspace-federation/qualified-adrs/ste-runtime:ADR-L-0013',
          identity_scope: 'workspace',
          corpus_scope: 'ste-runtime',
          qualified_id: 'ste-runtime:ADR-L-0013',
        },
        {
          reason: 'Kit ADR-L-0013 is selected through kit corpus scope.',
          selector_path: 'workspace-federation/qualified-adrs/adr-architecture-kit:ADR-L-0013',
          identity_scope: 'workspace',
          corpus_scope: 'adr-architecture-kit',
          qualified_id: 'adr-architecture-kit:ADR-L-0013',
        },
      ],
    }));

    assertMvcFederatedIdentity(snapshot);
    expect(snapshot.candidate_entities.map(ref => ref.qualified_id).sort()).toEqual([
      'adr-architecture-kit:ADR-L-0013',
      'ste-runtime:ADR-L-0013',
    ]);
    expect(snapshot.inclusion_rationale.map(reason => reason.corpus_scope).sort()).toEqual([
      'adr-architecture-kit',
      'ste-runtime',
    ]);
  });

  it('requires ambiguous or missing federation linkage rationale to carry negative space', async () => {
    const withoutNegativeSpace = {
      ...buildMvcSnapshotCandidate(await buildInput({
        exclusionRationale: [
          {
            reason: 'Ambiguous federation linkage for ADR-L-0013.',
            selector_path: 'workspace-federation/homonym-groups/ADR-L-0013',
          },
        ],
        negativeSpace: [],
      })),
      negative_space: [],
    } satisfies MvcSnapshot;

    expect(() => assertMvcFederatedIdentity(withoutNegativeSpace)).toThrow('negative_space');

    const withNegativeSpace = buildMvcSnapshotCandidate(await buildInput({
      exclusionRationale: [
        {
          reason: 'Ambiguous federation linkage for ADR-L-0013.',
          selector_path: 'workspace-federation/homonym-groups/ADR-L-0013',
        },
      ],
      negativeSpace: [
        {
          id: 'missing:qualified-adr-identity',
          reason: 'Ambiguous federation linkage is preserved as negative space.',
        },
      ],
    }));

    expect(() => assertMvcFederatedIdentity(withNegativeSpace)).not.toThrow();
  });

  it('preserves multiple rationale entries and negative-space observations for the same candidate', async () => {
    const candidateRef = {
      id: 'entity://ste-runtime/ADR-L-0021',
      version: '1',
      identity_scope: 'workspace' as const,
      corpus_scope: 'ste-runtime',
      qualified_id: 'ste-runtime:ADR-L-0021',
      entity_uri: 'entity://ste-runtime/ADR-L-0021',
    };
    const snapshot = buildMvcSnapshotCandidate(await buildInput({
      candidateEntities: [candidateRef, { ...candidateRef }],
      inclusionRationale: [
        {
          reason: 'Architect selected the runtime MVC contract candidate.',
          selector_path: 'persona:architect/selector:decision/entity://ste-runtime/ADR-L-0021',
          persona_ref: 'architect',
          task_ref: 'task:mvc-evolution-fixture',
          policy_ref: 'policy:preserve-rationale',
          identity_scope: 'workspace',
          corpus_scope: 'ste-runtime',
          qualified_id: 'ste-runtime:ADR-L-0021',
          entity_uri: 'entity://ste-runtime/ADR-L-0021',
          candidate_ref: candidateRef,
        },
        {
          reason: 'Governance reviewer selected the same candidate for boundary review.',
          selector_path: 'persona:governance-reviewer/selector:contract/entity://ste-runtime/ADR-L-0021',
          persona_ref: 'governance-reviewer',
          task_ref: 'task:mvc-evolution-fixture',
          policy_ref: 'policy:preserve-rationale',
          identity_scope: 'workspace',
          corpus_scope: 'ste-runtime',
          qualified_id: 'ste-runtime:ADR-L-0021',
          entity_uri: 'entity://ste-runtime/ADR-L-0021',
          candidate_ref: candidateRef,
        },
      ],
      negativeSpace: [
        {
          id: 'missing:architect-code-to-invariant',
          reason: 'Architect path lacks direct code to invariant linkage for the candidate.',
        },
        {
          id: 'missing:governance-code-to-contract',
          reason: 'Governance path lacks direct code to contract linkage for the same candidate.',
        },
      ],
    }));

    expect(snapshot.candidate_entities).toHaveLength(1);
    expect(snapshot.inclusion_rationale).toHaveLength(2);
    expect(snapshot.negative_space).toHaveLength(2);
    expect(snapshot.inclusion_rationale.map(entry => entry.selector_path).sort()).toEqual([
      'persona:architect/selector:decision/entity://ste-runtime/ADR-L-0021',
      'persona:governance-reviewer/selector:contract/entity://ste-runtime/ADR-L-0021',
    ]);
    expect(snapshot.negative_space.map(entry => entry.id).sort()).toEqual([
      'missing:architect-code-to-invariant',
      'missing:governance-code-to-contract',
    ]);
    await expectMatchesSchema('mvc-snapshot.schema.json', snapshot);
  });

  it('recommends advisory depth deterministically from supplied topology metrics', () => {
    const metrics = {
      node_count: 10,
      edge_count: 12,
      branching_factor: 1.2,
      convergence_score: 0.9,
      recommended_depth: 3,
    };

    const first = recommendMvcDepthFromTopology({ topologyMetrics: metrics });
    const second = recommendMvcDepthFromTopology({ topologyMetrics: metrics });

    expect(second).toEqual(first);
    expect(first.policyInput.topology_metrics).toEqual(metrics);
    expect(first.reason).toContain('advisory');
  });

  it('keeps depth recommendation stable across field ordering and serialization differences', () => {
    const ordered = {
      node_count: 10,
      edge_count: 12,
      branching_factor: 1.2,
      convergence_score: 0.9,
      recommended_depth: 3,
    };
    const reordered = JSON.parse(
      '{"recommended_depth":3,"convergence_score":0.9,"branching_factor":1.2,"edge_count":12,"node_count":10}',
    );

    expect(recommendMvcDepthFromTopology({ topologyMetrics: reordered })).toEqual(
      recommendMvcDepthFromTopology({ topologyMetrics: ordered }),
    );
    expect(recommendMvcDepthFromTopology(JSON.parse(JSON.stringify({ topologyMetrics: ordered })))).toEqual(
      recommendMvcDepthFromTopology({ topologyMetrics: ordered }),
    );
  });

  it('recommends shallower advisory depth for dense topology than sparse topology', () => {
    const dense = recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 8,
        edge_count: 24,
        branching_factor: 3,
        convergence_score: 0.8,
      },
    });
    const sparse = recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 8,
        edge_count: 3,
        branching_factor: 0.4,
        convergence_score: 0.2,
      },
    });

    expect(dense.recommendedDepth).toBeLessThan(sparse.recommendedDepth);
  });

  it('recommends shallower advisory depth for exploding topology than convergent topology', () => {
    const exploding = recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 10,
        edge_count: 35,
        branching_factor: 5,
        convergence_score: 0.1,
      },
    });
    const convergent = recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 10,
        edge_count: 12,
        branching_factor: 1.2,
        convergence_score: 0.9,
      },
    });

    expect(exploding.recommendedDepth).toBeLessThan(convergent.recommendedDepth);
  });

  it('never exceeds supplied advisory depth budget caps and records the cap in the reason', () => {
    const capped = recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 8,
        edge_count: 3,
        branching_factor: 0.4,
        convergence_score: 0.2,
      },
      maxDepth: 1,
    });

    expect(capped.recommendedDepth).toBeLessThanOrEqual(1);
    expect(capped.reason).toContain('budget cap');
    expect(capped.policyInput.max_depth).toBe(1);
  });

  it('handles empty and degenerate supplied metrics as deterministic minimal recommendations', () => {
    const empty = recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 0,
        edge_count: 0,
        branching_factor: 0,
        convergence_score: 0,
      },
    });
    const degenerate = recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 4,
        edge_count: 0,
        branching_factor: 0,
        convergence_score: 0,
      },
    });

    expect(empty).toEqual(recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 0,
        edge_count: 0,
        branching_factor: 0,
        convergence_score: 0,
      },
    }));
    expect(empty.recommendedDepth).toBeLessThanOrEqual(degenerate.recommendedDepth);
    expect(empty.reason).toContain('empty');
  });

  it('changes recommendation when supplied topology changes across behavioral categories', () => {
    const dense = recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 8,
        edge_count: 24,
        branching_factor: 3,
        convergence_score: 0.8,
      },
    });
    const convergent = recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 10,
        edge_count: 12,
        branching_factor: 1.2,
        convergence_score: 0.9,
      },
    });

    expect(convergent.recommendedDepth).not.toBe(dense.recommendedDepth);
    expect(convergent.reason).not.toBe(dense.reason);
  });

  it('fails explicitly for missing or malformed supplied topology metrics', () => {
    expect(() => recommendMvcDepthFromTopology({} as never)).toThrow('topologyMetrics');
    expect(() => recommendMvcDepthFromTopology({
      topologyMetrics: {
        edge_count: 1,
        branching_factor: 1,
        convergence_score: 1,
      } as never,
    })).toThrow('node_count');
    expect(() => recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: -1,
        edge_count: 1,
        branching_factor: 1,
        convergence_score: 1,
      },
    })).toThrow('node_count');
    expect(() => recommendMvcDepthFromTopology({
      topologyMetrics: {
        node_count: 1,
        edge_count: 1,
        branching_factor: Number.NaN,
        convergence_score: 1,
      },
    })).toThrow('branching_factor');
  });

  it('does not mutate supplied topology recommendation input', () => {
    const input = {
      topologyMetrics: {
        node_count: 10,
        edge_count: 12,
        branching_factor: 1.2,
        convergence_score: 0.9,
        recommended_depth: 3,
      },
      maxDepth: 2,
    };
    const before = JSON.parse(JSON.stringify(input));

    recommendMvcDepthFromTopology(input);

    expect(input).toEqual(before);
  });

  it('keeps the depth helper isolated from traversal, discovery, workspace, and kernel imports', async () => {
    const source = await readFile(path.resolve(steRuntimeRoot, 'src', 'workspace', 'mvc-evolution.ts'), 'utf8');
    const importLines = source.split('\n').filter(line => line.startsWith('import ')).join('\n');

    expect(importLines).not.toMatch(/graph-topology-analyzer|rss|kernel|workspace-recon|graph-traversal|query/i);
  });

  it('expands MVC-S candidates breadth-first over supplied relationship records only', async () => {
    const seed = { id: 'component:seed', version: '1' };
    const firstHop = { id: 'component:first-hop', version: '1' };
    const secondHop = { id: 'component:second-hop', version: '1' };
    const relationships: MvcTraversalRelationshipRecord[] = [
      { id: 'relationship:seed-to-first', version: '1', from_ref: seed, to_ref: firstHop, reason: 'Seed reaches first hop.' },
      { id: 'relationship:first-to-second', version: '1', from_ref: firstHop, to_ref: secondHop, reason: 'First hop reaches second hop.' },
    ];

    const snapshot = traverseMvcSCandidates({
      ...(await buildInput()),
      seedCandidateRefs: [seed],
      relationshipRecords: relationships,
      depth: 2,
    });

    expect(snapshot.candidate_entities).toEqual([firstHop, secondHop, seed]);
    expect(snapshot.candidate_relationships).toEqual([
      { id: 'relationship:first-to-second', version: '1' },
      { id: 'relationship:seed-to-first', version: '1' },
    ]);
    expect(snapshot.inclusion_rationale
      .map(entry => entry.selector_path)
      .filter(selectorPath => selectorPath.startsWith('supplied-relationship-traversal/'))).toEqual([
      'supplied-relationship-traversal/depth:1/relationship:relationship:seed-to-first',
      'supplied-relationship-traversal/depth:2/relationship:relationship:first-to-second',
      'supplied-relationship-traversal/seed/component:seed',
    ]);
    expect(snapshot.inclusion_rationale[0].candidate_ref).toEqual(firstHop);
    await expectMatchesSchema('mvc-snapshot.schema.json', snapshot);
  });

  it('treats depth as relationship-hop count and returns seeds only at depth zero', async () => {
    const seed = { id: 'component:seed', version: '1' };
    const firstHop = { id: 'component:first-hop', version: '1' };
    const snapshot = traverseMvcSCandidates({
      ...(await buildInput()),
      seedCandidateRefs: [seed],
      relationshipRecords: [
        { id: 'relationship:seed-to-first', version: '1', from_ref: seed, to_ref: firstHop },
      ],
      depth: 0,
    });

    expect(snapshot.candidate_entities).toEqual([seed]);
    expect(snapshot.candidate_relationships).toEqual([]);
    expect(snapshot.negative_space).toContainEqual(
      expect.objectContaining({ id: 'depth-cap:0' }),
    );
  });

  it('obeys caller-supplied traversal depth exactly without deriving or overriding it', async () => {
    const seed = { id: 'component:seed', version: '1' };
    const firstHop = { id: 'component:first-hop', version: '1' };
    const secondHop = { id: 'component:second-hop', version: '1' };
    const snapshot = traverseMvcSCandidates({
      ...(await buildInput()),
      seedCandidateRefs: [seed],
      relationshipRecords: [
        { id: 'relationship:seed-to-first', version: '1', from_ref: seed, to_ref: firstHop },
        { id: 'relationship:first-to-second', version: '1', from_ref: firstHop, to_ref: secondHop },
      ],
      depth: 1,
    });

    expect(snapshot.candidate_entities).toEqual([firstHop, seed]);
    expect(snapshot.candidate_entities).not.toContainEqual(secondHop);
    expect(snapshot.negative_space).toContainEqual(
      expect.objectContaining({ id: 'depth-cap:1' }),
    );
  });

  it('does not infer inverse relationships or derive missing edges', async () => {
    const seed = { id: 'component:seed', version: '1' };
    const target = { id: 'component:target', version: '1' };
    const snapshot = traverseMvcSCandidates({
      ...(await buildInput()),
      seedCandidateRefs: [target],
      relationshipRecords: [
        { id: 'relationship:seed-to-target', version: '1', from_ref: seed, to_ref: target },
      ],
      depth: 1,
    });

    expect(snapshot.candidate_entities).toEqual([target]);
    expect(snapshot.candidate_relationships).toEqual([]);
    expect(snapshot.negative_space).toContainEqual(
      expect.objectContaining({ id: 'missing-relationship:component:target' }),
    );
  });

  it('terminates deterministically on cyclic relationship surfaces without revisiting expanded refs', async () => {
    const a = { id: 'component:a', version: '1' };
    const b = { id: 'component:b', version: '1' };
    const first = traverseMvcSCandidates({
      ...(await buildInput()),
      seedCandidateRefs: [a],
      relationshipRecords: [
        { id: 'relationship:a-to-b', version: '1', from_ref: a, to_ref: b },
        { id: 'relationship:b-to-a', version: '1', from_ref: b, to_ref: a },
      ],
      depth: 5,
    });
    const second = traverseMvcSCandidates({
      ...(await buildInput()),
      seedCandidateRefs: [a],
      relationshipRecords: [
        { id: 'relationship:b-to-a', version: '1', from_ref: b, to_ref: a },
        { id: 'relationship:a-to-b', version: '1', from_ref: a, to_ref: b },
      ],
      depth: 5,
    });

    expect(first).toEqual(second);
    expect(first.candidate_entities).toEqual([a, b]);
    expect(first.inclusion_rationale.filter(entry => entry.candidate_ref?.id === 'component:a')).toHaveLength(1);
  });

  it('preserves exact candidate identity without aliasing bare and workspace-qualified refs', async () => {
    const repoLocal = {
      id: 'ADR-L-0021',
      version: '1',
      identity_scope: 'repo-local' as const,
      corpus_scope: 'ste-runtime',
    };
    const workspaceQualified = {
      id: 'ste-runtime:ADR-L-0021',
      version: '1',
      identity_scope: 'workspace' as const,
      corpus_scope: 'ste-runtime',
      qualified_id: 'ste-runtime:ADR-L-0021',
    };
    const target = { id: 'component:target', version: '1' };
    const snapshot = traverseMvcSCandidates({
      ...(await buildInput()),
      seedCandidateRefs: [repoLocal, workspaceQualified],
      relationshipRecords: [
        { id: 'relationship:workspace-to-target', version: '1', from_ref: workspaceQualified, to_ref: target },
      ],
      depth: 1,
    });

    expect(snapshot.candidate_entities).toContainEqual(repoLocal);
    expect(snapshot.candidate_entities).toContainEqual(target);
    expect(snapshot.candidate_entities).toContainEqual(workspaceQualified);
  });

  it('preserves workspace-qualified homonyms as distinct traversal candidates', async () => {
    const runtimeAdr = {
      id: 'ste-runtime:ADR-L-0013',
      version: '1',
      identity_scope: 'workspace' as const,
      corpus_scope: 'ste-runtime',
      qualified_id: 'ste-runtime:ADR-L-0013',
    };
    const kitAdr = {
      id: 'adr-architecture-kit:ADR-L-0013',
      version: '1',
      identity_scope: 'workspace' as const,
      corpus_scope: 'adr-architecture-kit',
      qualified_id: 'adr-architecture-kit:ADR-L-0013',
    };
    const snapshot = traverseMvcSCandidates({
      ...(await buildInput()),
      seedCandidateRefs: [runtimeAdr, kitAdr],
      relationshipRecords: [],
      depth: 1,
    });

    expect(snapshot.candidate_entities).toEqual([kitAdr, runtimeAdr]);
  });

  it('rejects traversal inputs that try to carry graph materialization artifacts', async () => {
    const input = await buildInput();
    expect(() => traverseMvcSCandidates({
      ...input,
      seedCandidateRefs: [{ id: 'component:seed', version: '1' }],
      relationshipRecords: [],
      depth: 1,
      adjacencyMap: {},
    } as never)).toThrow('adjacencyMap');
  });

  it('rejects malformed traversal depth and relationship records explicitly', async () => {
    const input = await buildInput();
    expect(() => traverseMvcSCandidates({
      ...input,
      seedCandidateRefs: [{ id: 'component:seed', version: '1' }],
      relationshipRecords: [],
      depth: -1,
    })).toThrow('depth');
    expect(() => traverseMvcSCandidates({
      ...input,
      seedCandidateRefs: [{ id: 'component:seed', version: '1' }],
      relationshipRecords: [
        { id: 'relationship:broken', version: '1', from_ref: { id: 'component:seed', version: '1' } } as never,
      ],
      depth: 1,
    })).toThrow('to_ref');
  });

  it('keeps traversal output candidate-only and schema-valid', async () => {
    const snapshot = traverseMvcSCandidates({
      ...(await buildInput()),
      seedCandidateRefs: [{ id: 'component:seed', version: '1' }],
      relationshipRecords: [],
      depth: 1,
    });

    assertMvcSnapshotCandidateOnly(snapshot);
    for (const field of [
      'admission_decision',
      'caller_facing_eligibility',
      'enforcement_outcome',
      'governance_state',
      'kernel_verdict',
      'admitted_payload',
    ]) {
      expect(snapshot).not.toHaveProperty(field);
    }
    await expectMatchesSchema('mvc-snapshot.schema.json', snapshot);
  });

  it('keeps traversal helper isolated from graph materialization, workspace state, and kernel imports', async () => {
    const source = await readFile(path.resolve(steRuntimeRoot, 'src', 'workspace', 'mvc-evolution.ts'), 'utf8');
    const importLines = source.split('\n').filter(line => line.startsWith('import ')).join('\n');

    expect(importLines).not.toMatch(/graph-domain|linkage-surface|graph-loader|workspace-graph|kernel|query|rss/i);
    expect(source).not.toMatch(/buildGraphDomain|materializeGraphDomain|loadWorkspaceGraph|loadAidocGraph|assembleContext/);
  });

  it('validates supplied Linkage Surface fixtures against the ste-spec contract', async () => {
    const linkageSurface = await linkageSurfaceFixture();

    await expectMatchesLinkageSurfaceSchema(linkageSurface);
  });

  it('expands MVC-S candidates from supplied Linkage Surface relationship records', async () => {
    const linkageSurface = await linkageSurfaceFixture();
    const relationship = linkageSurface.relationship_records[0];
    const snapshot = traverseMvcSFromLinkageSurface({
      ...(await buildInput()),
      seedCandidateRefs: [relationship.from_ref],
      linkageSurface,
      depth: 1,
    });

    expect(snapshot.candidate_entities).toContainEqual(relationship.from_ref);
    expect(snapshot.candidate_entities).toContainEqual(relationship.to_ref);
    expect(snapshot.candidate_relationships).toContainEqual({
      id: relationship.id,
      version: linkageSurface.version,
    });
    expect(snapshot.inclusion_rationale).toContainEqual(expect.objectContaining({
      candidate_ref: relationship.to_ref,
      selector_path: `supplied-relationship-traversal/depth:1/relationship:${relationship.id}`,
    }));
    expect(snapshot.inclusion_rationale.some(entry =>
      entry.reason.includes(relationship.relationship_family) && entry.reason.includes(relationship.id),
    )).toBe(true);
    await expectMatchesSchema('mvc-snapshot.schema.json', snapshot);
  });

  it('rejects invalid Linkage Surface-shaped input without auto-healing it', async () => {
    const linkageSurface = await linkageSurfaceFixture();
    const invalid = { ...linkageSurface };
    delete (invalid as Partial<MvcLinkageSurface>).relationship_records;

    await expectLinkageSurfaceSchemaRejects(invalid);
    const input = await buildInput();
    expect(() => traverseMvcSFromLinkageSurface({
      ...input,
      seedCandidateRefs: [],
      linkageSurface: invalid as MvcLinkageSurface,
      depth: 1,
    })).toThrow('relationship_records');
  });

  it('preserves Linkage Surface endpoint identity metadata and rationale context', async () => {
    const linkageSurface = await linkageSurfaceFixture();
    const relationship = linkageSurface.relationship_records[0];
    const snapshot = traverseMvcSFromLinkageSurface({
      ...(await buildInput()),
      seedCandidateRefs: [relationship.from_ref],
      linkageSurface,
      depth: 1,
    });

    expect(snapshot.candidate_entities).toContainEqual(relationship.from_ref);
    expect(snapshot.candidate_entities).toContainEqual(relationship.to_ref);
    expect(snapshot.candidate_entities).toContainEqual(
      expect.objectContaining({
        identity_scope: 'workspace',
        corpus_scope: 'ste-runtime',
        qualified_id: 'ste-runtime:ADR-L-0021',
      }),
    );
    expect(snapshot.candidate_entities).toContainEqual(
      expect.objectContaining({
        identity_scope: 'workspace',
        corpus_scope: 'ste-spec',
        entity_uri: 'entity://ste-spec/INV-0001',
      }),
    );
    expect(snapshot.inclusion_rationale).toContainEqual(expect.objectContaining({
      candidate_ref: relationship.to_ref,
    }));
  });

  it('keeps repo-local and workspace-qualified Linkage Surface endpoints distinct', async () => {
    const linkageSurface = await linkageSurfaceFixture();
    const repoLocal = {
      id: 'ADR-L-0021',
      version: '1',
      identity_scope: 'repo-local' as const,
      corpus_scope: 'ste-runtime',
    };
    linkageSurface.relationship_records = [
      {
        ...linkageSurface.relationship_records[0],
        id: 'repo-local-to-workspace-link',
        from_ref: repoLocal,
      },
    ];
    const snapshot = traverseMvcSFromLinkageSurface({
      ...(await buildInput()),
      seedCandidateRefs: [repoLocal, linkageSurface.relationship_records[0].to_ref],
      linkageSurface,
      depth: 1,
    });

    expect(snapshot.candidate_entities).toContainEqual(repoLocal);
    expect(snapshot.candidate_entities).toContainEqual(linkageSurface.relationship_records[0].to_ref);
  });

  it('records missing Linkage Surface relationship endpoints as negative space instead of inference', async () => {
    const linkageSurface = await linkageSurfaceFixture();
    const unrelatedSeed = { id: 'component:unrelated-seed', version: '1' };
    const snapshot = traverseMvcSFromLinkageSurface({
      ...(await buildInput()),
      seedCandidateRefs: [unrelatedSeed],
      linkageSurface,
      depth: 1,
    });

    expect(snapshot.candidate_entities).toEqual([unrelatedSeed]);
    expect(snapshot.candidate_relationships).toEqual([]);
    expect(snapshot.negative_space).toContainEqual(expect.objectContaining({
      id: 'missing-relationship:component:unrelated-seed',
    }));
  });

  it('keeps Linkage Surface traversal adapter isolated from materialization and state imports', async () => {
    const source = await readFile(path.resolve(steRuntimeRoot, 'src', 'workspace', 'mvc-evolution.ts'), 'utf8');
    const importLines = source.split('\n').filter(line => line.startsWith('import ')).join('\n');

    expect(importLines).not.toMatch(/graph-domain|linkage-surface|graph-loader|workspace-graph|kernel|query|rss/i);
    expect(source).not.toMatch(/readFile|\.ste-workspace|buildGraphDomain|materializeGraphDomain|loadWorkspaceGraph|assembleContext/);
  });

  it('exposes machine-readable code provenance for ADR-L-0021 and runtime invariants', () => {
    for (const target of [
      assertMvcDefinitionContract,
      assertMvcFederatedIdentity,
      assertMvcSnapshotCandidateOnly,
      buildMvcSnapshotCandidate,
      recommendMvcDepthFromTopology,
    ]) {
      const adrIds = functionAdrMetadata(target);
      expect(adrIds).toContain('ADR-L-0021');
      expect(adrIds.every(id => ADR_ID_PATTERN.test(id))).toBe(true);
    }

    expect(functionInvariantMetadata(assertMvcDefinitionContract)).toContain('INV-0030');
    expect(functionInvariantMetadata(assertMvcSnapshotCandidateOnly)).toContain('INV-0031');
    expect(functionInvariantMetadata(buildMvcSnapshotCandidate)).toEqual(['INV-0031', 'INV-0032']);
    expect(functionInvariantMetadata(recommendMvcDepthFromTopology)).toEqual(['INV-0032']);
    expect(functionAdrMetadata(traverseMvcSCandidates)).toContain('ADR-L-0023');
    expect(functionInvariantMetadata(traverseMvcSCandidates)).toEqual([
      'INV-0031',
      'INV-0035',
      'INV-0036',
      'INV-0037',
    ]);
    expect(functionAdrMetadata(traverseMvcSFromLinkageSurface)).toContain('ADR-L-0023');
    expect(functionInvariantMetadata(traverseMvcSFromLinkageSurface)).toEqual([
      'INV-0031',
      'INV-0035',
      'INV-0036',
      'INV-0037',
    ]);
  });

  it('anchors code provenance to an existing runtime ADR source', async () => {
    await expect(access(path.resolve(
      steRuntimeRoot,
      'adrs',
      'logical',
      'ADR-L-0021-experimental-mvc-d-to-mvc-s-contract-consumption.yaml',
    ))).resolves.toBeUndefined();
    await expect(access(path.resolve(
      steRuntimeRoot,
      'adrs',
      'logical',
      'ADR-L-0023-experimental-mvc-s-candidate-traversal-boundary.yaml',
    ))).resolves.toBeUndefined();
  });
});
