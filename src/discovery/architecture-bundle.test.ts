import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadArchitectureBundle } from './architecture-bundle.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'architecture-bundle-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeYaml(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

async function writeRequiredBundle(_options: Record<string, unknown> = {}): Promise<void> {
  await writeYaml('adrs/index/architecture-index.yaml', `
schema_version: '1.1'
type: architecture_index
architecture_namespace: sample-runtime
generated_at: '2026-03-19T00:00:00Z'
entity_registry_path: adrs/index/entity-registry.yaml
relationship_registry_path: adrs/index/relationship-registry.yaml
unresolved_registry_path: adrs/index/unresolved-registry.yaml
decision_registry_path: adrs/index/decision-registry.yaml
`);
  await writeYaml('adrs/manifest.yaml', `
schema_version: '1.0'
type: manifest
generated_date: '2026-03-19T00:00:00Z'
adrs:
  - id: ADR-L-0013
`);
  await writeYaml('adrs/index/entity-registry.yaml', `
entities:
  - entity_id: CAP-0001
`);
  await writeYaml('adrs/index/relationship-registry.yaml', `
relationships:
  - relationship_id: REL-0001
`);
  await writeYaml('adrs/index/unresolved-registry.yaml', `
unresolved: []
`);
  await writeYaml('adrs/index/decision-registry.yaml', `
decisions:
  - decision_id: DEC-0001
`);

}

describe('loadArchitectureBundle', () => {
  it('loads the required bundle and reports a valid status when additive artifacts are present', async () => {
    await writeRequiredBundle();

    const result = await loadArchitectureBundle(tempDir);

    expect(result.status).toBe('valid');
    expect(result.index.architectureNamespace).toBe('sample-runtime');
    expect(result.manifest.generatedDate).toBe('2026-03-19T00:00:00Z');
    expect(result.manifest.adrCount).toBe(1);
    expect(result.requiredArtifacts.entityRegistry.exists).toBe(true);
  });

  it('returns invalid when a required registry is missing', async () => {
    await writeRequiredBundle();
    await rm(path.join(tempDir, 'adrs/index/relationship-registry.yaml'));

    const result = await loadArchitectureBundle(tempDir);

    expect(result.status).toBe('invalid');
    expect(result.errors.some((error) => error.includes('relationship-registry.yaml'))).toBe(true);
  });

  it('returns valid when only required artifacts are present', async () => {
    await writeRequiredBundle();

    const result = await loadArchitectureBundle(tempDir);

    expect(result.status).toBe('valid');
    expect(result.errors).toEqual([]);
  });

  it('does not consult the legacy compatibility registry', async () => {
    await writeRequiredBundle();
    await writeYaml('adrs/entities/registry.yaml', 'this: [is: not-valid-yaml');

    const result = await loadArchitectureBundle(tempDir);

    expect(result.status).toBe('valid');
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes('intentionally not consulted'))).toBe(true);
  });
});
