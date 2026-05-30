import { describe, expect, it } from 'vitest';

import type { WorkspaceGraph } from './workspace-graph-loader.js';
import type { SourceLocatorRegistry } from './source-locator-registry.js';
import { assembleCemBundle, deriveMvcBundle, validateMvcBundle } from './cem-mvc.js';

function graph(): WorkspaceGraph {
  const nodes = new Map([
    ['Lambda:repoA:fn', {
      id: 'Lambda:repoA:fn',
      type: 'Lambda',
      name: 'fn',
      repo: 'repoA',
      source_uri: 'workspace://repoA/src/fn.ts',
      source_hash: 'sha256:source',
      entity_uri: 'entity://workspace/Lambda%3ArepoA%3Afn',
    }],
    ['Database:repoA:db', {
      id: 'Database:repoA:db',
      type: 'Database',
      name: 'db',
      repo: 'repoA',
      source_uri: 'workspace://repoA/template.yaml',
      source_hash: 'sha256:template',
      entity_uri: 'entity://workspace/Database%3ArepoA%3Adb',
    }],
  ]);
  const edges = [{ from: 'Lambda:repoA:fn', to: 'Database:repoA:db', verb: 'reads' }];
  return {
    nodes,
    edges,
    outAdj: new Map([['Lambda:repoA:fn', edges]]),
    inAdj: new Map([['Database:repoA:db', edges]]),
  };
}

const registry: SourceLocatorRegistry = {
  schema_version: '1.0',
  generated_by: 'test',
  generated_at: '2026-01-01T00:00:00.000Z',
  workspace_manifest_hash: 'sha256:manifest',
  graph_snapshot_hash: 'sha256:graph',
  locator_registry_hash: 'sha256:registry',
  locators: [
    {
      entity_uri: 'entity://workspace/Lambda%3ArepoA%3Afn',
      entity_id: 'Lambda:repoA:fn',
      entity_type: 'Lambda',
      source_uri: 'workspace://repoA/src/fn.ts',
      repo: 'repoA',
      path: 'src/fn.ts',
      source_hash: 'sha256:source',
      graph_snapshot_hash: 'sha256:graph',
      canonical: true,
      authority: 'repoA',
      provenance_classification: 'derived',
    },
  ],
};

describe('CEM and MVC bundles', () => {
  it('assembles a provenance-rich CEM bundle from graph and locators', () => {
    const cem = assembleCemBundle({
      graph: graph(),
      registry,
      query: 'Lambda:repoA:fn',
      generatedAt: '2026-01-01T00:00:00.000Z',
      maxDepth: 1,
      maxNodes: 10,
    });

    expect(cem.authoritative_source_refs).toHaveLength(1);
    expect(cem.traversal_context.visited_node_ids).toEqual(['Lambda:repoA:fn', 'Database:repoA:db']);
    expect(cem.negative_space_constraints).toContainEqual(expect.objectContaining({ kind: 'unresolved_locator' }));
    expect(cem.graph_snapshot_hash).toBe('sha256:graph');
  });

  it('derives and validates MVC bundles against their parent CEM bundle', () => {
    const cem = assembleCemBundle({
      graph: graph(),
      registry,
      query: 'Lambda:repoA:fn',
      generatedAt: '2026-01-01T00:00:00.000Z',
      maxDepth: 1,
      maxNodes: 10,
    });

    const mvc = deriveMvcBundle(cem, {
      generatedAt: '2026-01-01T00:00:01.000Z',
      maxSourceRefs: 1,
    });
    const validation = validateMvcBundle(mvc, cem);

    expect(mvc.derived_from_cem_bundle_id).toBe(cem.cem_bundle_id);
    expect(mvc.selected_source_refs).toHaveLength(1);
    expect(mvc.provenance_refs.graph_snapshot_hash).toBe('sha256:graph');
    expect(validation.status).toBe('valid_with_warnings');
    expect(validation.checks.provenance_complete).toBe(true);
    expect(validation.warnings.some(w => w.includes('negative-space'))).toBe(true);
  });
});
