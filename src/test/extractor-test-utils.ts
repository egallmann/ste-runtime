/**
 * Test utilities for extractor validation (E-ADR-013)
 * 
 * These helpers reduce boilerplate when testing that extractors
 * properly create graph edges from relationship metadata.
 */

import { expect } from 'vitest';
import type { NormalizedAssertion, RawAssertion } from '../recon/phases/index.js';
import { inferRelationships } from '../recon/phases/inference.js';

/**
 * Assert that a node has the expected outgoing references (edges).
 * 
 * @example
 * expectGraphEdges(result, 'module-src-a', ['module-src-b', 'module-src-c']);
 */
export function expectGraphEdges(
  result: NormalizedAssertion[],
  fromId: string,
  toIds: string[]
): void {
  const node = result.find((a) => a._slice.id === fromId);
  expect(node, `Node ${fromId} not found in result`).toBeDefined();

  const refs = node!._slice.references || [];
  const refIds = refs.map((r) => r.id);

  for (const toId of toIds) {
    expect(
      refIds,
      `Node ${fromId} should reference ${toId}, but references are: ${refIds.join(', ')}`
    ).toContain(toId);
  }
}

/**
 * Assert that bidirectional edges exist between two nodes.
 * Verifies both A->B (via references) and B->A (via referenced_by).
 * 
 * @example
 * expectBidirectionalEdges(result, 'module-src-a', 'module-src-b');
 */
export function expectBidirectionalEdges(
  result: NormalizedAssertion[],
  nodeA: string,
  nodeB: string
): void {
  // Check A -> B
  const a = result.find((n) => n._slice.id === nodeA);
  expect(a, `Node ${nodeA} not found`).toBeDefined();

  const aRefs = a!._slice.references || [];
  const aRefIds = aRefs.map((r) => r.id);
  expect(
    aRefIds,
    `Node ${nodeA} should reference ${nodeB}`
  ).toContain(nodeB);

  // Check B -> A (via referenced_by)
  const b = result.find((n) => n._slice.id === nodeB);
  expect(b, `Node ${nodeB} not found`).toBeDefined();

  const bRefBy = b!._slice.referenced_by || [];
  const bRefByIds = bRefBy.map((r) => r.id);
  expect(
    bRefByIds,
    `Node ${nodeB} should be referenced by ${nodeA}`
  ).toContain(nodeA);
}

/**
 * Create a raw import assertion for testing.
 * 
 * @example
 * const rawImport = createRawImportAssertion(
 *   'src/app.ts',
 *   './utils.js',
 *   ['foo', 'bar']
 * );
 */
export function createRawImportAssertion(
  file: string,
  module: string,
  names: string[] = [],
  elementId?: string
): RawAssertion {
  return {
    elementId: elementId || `import-${Math.random().toString(36).slice(2)}`,
    elementType: 'import',
    file,
    line: 1,
    language: 'typescript',
    metadata: {
      module,
      names,
    },
  };
}

/**
 * Run inference and assert that edges are created correctly.
 * This is the core validation that extractors must pass.
 * 
 * @example
 * await assertInferenceCreatesEdges(
 *   normalizedAssertions,
 *   rawImportAssertions,
 *   'module-src-a',
 *   ['module-src-b', 'module-src-c']
 * );
 */
export function assertInferenceCreatesEdges(
  normalized: NormalizedAssertion[],
  rawAssertions: RawAssertion[],
  fromId: string,
  toIds: string[]
): NormalizedAssertion[] {
  // Run inference
  const result = inferRelationships(normalized, rawAssertions);

  // Assert edges exist
  expectGraphEdges(result, fromId, toIds);

  // Assert bidirectional consistency
  for (const toId of toIds) {
    const to = result.find((n) => n._slice.id === toId);
    if (to) {
      const refBy = to._slice.referenced_by || [];
      const refByIds = refBy.map((r) => r.id);
      expect(
        refByIds,
        `Node ${toId} should be referenced by ${fromId} (bidirectional edge)`
      ).toContain(fromId);
    }
  }

  return result;
}

/**
 * Create a minimal module assertion for testing.
 * 
 * @example
 * const moduleA = createModuleAssertion('src/a.ts', 'module-src-a');
 */
export function createModuleAssertion(
  filePath: string,
  moduleId: string,
  language: string = 'typescript'
): NormalizedAssertion {
  return {
    _slice: {
      domain: 'graph',
      type: 'module',
      id: moduleId,
      source_files: [filePath],
    },
    element: {
      id: moduleId,
      path: filePath,
      name: filePath.split('/').pop()?.replace(/\.\w+$/, '') || 'unknown',
      language,
      layer: 'util',
    },
    provenance: {
      extracted_at: new Date().toISOString(),
      extractor: 'test-extractor',
      file: filePath,
      line: 1,
      language: language as any, // Cast to avoid type issues
    },
  };
}

/**
 * Validate that relative import resolution works correctly.
 * 
 * @example
 * assertRelativeImportResolution(
 *   'src/mcp/server.ts',
 *   './tools.js',
 *   'module-src-mcp-tools'
 * );
 */
export function assertRelativeImportResolution(
  fromFile: string,
  importPath: string,
  expectedModuleId: string
): void {
  // This would typically call the internal resolveImportToModuleId function
  // For now, we validate via inference end-to-end
  
  const fromModule = createModuleAssertion(
    fromFile,
    `module-${fromFile.replace(/\//g, '-').replace(/\.\w+$/, '')}`
  );
  
  const toModule = createModuleAssertion(
    fromFile.replace(/[^/]+$/, '') + importPath.replace('./', '').replace('../', ''),
    expectedModuleId
  );

  const rawImport = createRawImportAssertion(fromFile, importPath);

  const result = inferRelationships([fromModule, toModule], [rawImport]);

  expectGraphEdges(
    result,
    fromModule._slice.id,
    [expectedModuleId]
  );
}

/**
 * Find nodes in result that are missing expected references.
 * Useful for debugging test failures.
 */
export function findMissingReferences(
  result: NormalizedAssertion[],
  expectedEdges: Record<string, string[]>
): Array<{ from: string; missing: string[] }> {
  const missing: Array<{ from: string; missing: string[] }> = [];

  for (const [fromId, toIds] of Object.entries(expectedEdges)) {
    const node = result.find((n) => n._slice.id === fromId);
    if (!node) {
      missing.push({ from: fromId, missing: toIds });
      continue;
    }

    const refs = node._slice.references || [];
    const refIds = refs.map((r) => r.id);
    const missingIds = toIds.filter((toId) => !refIds.includes(toId));

    if (missingIds.length > 0) {
      missing.push({ from: fromId, missing: missingIds });
    }
  }

  return missing;
}

/**
 * Validate that no orphaned references exist in the graph.
 * An orphaned reference is an edge to a node that doesn't exist.
 */
export function assertNoOrphanedReferences(
  result: NormalizedAssertion[]
): void {
  const nodeIds = new Set(result.map((n) => n._slice.id));
  const orphans: Array<{ from: string; to: string }> = [];

  for (const node of result) {
    const refs = node._slice.references || [];
    for (const ref of refs) {
      const refKey = `${ref.domain}/${ref.type}/${ref.id}`;
      if (!nodeIds.has(ref.id) && !nodeIds.has(refKey)) {
        orphans.push({ from: node._slice.id, to: ref.id });
      }
    }
  }

  expect(
    orphans,
    `Found ${orphans.length} orphaned references: ${JSON.stringify(orphans, null, 2)}`
  ).toHaveLength(0);
}

/**
 * Validate bidirectional consistency across the entire graph.
 * If A references B, then B.referenced_by must include A.
 */
export function assertBidirectionalConsistency(
  result: NormalizedAssertion[]
): void {
  const inconsistencies: Array<{ source: string; target: string; issue: string }> = [];

  for (const node of result) {
    const refs = node._slice.references || [];

    for (const ref of refs) {
      // Find target node
      const target = result.find((n) => n._slice.id === ref.id);
      if (!target) {
        // Orphaned reference, caught by assertNoOrphanedReferences
        continue;
      }

      // Check if target has reciprocal edge
      const targetRefBy = target._slice.referenced_by || [];
      const hasReciprocal = targetRefBy.some((rb) => rb.id === node._slice.id);

      if (!hasReciprocal) {
        inconsistencies.push({
          source: node._slice.id,
          target: target._slice.id,
          issue: `${node._slice.id} -> ${target._slice.id} exists, but reciprocal edge missing`,
        });
      }
    }
  }

  expect(
    inconsistencies,
    `Found ${inconsistencies.length} bidirectional inconsistencies: ${JSON.stringify(
      inconsistencies,
      null,
      2
    )}`
  ).toHaveLength(0);
}
