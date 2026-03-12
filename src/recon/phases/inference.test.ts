import { describe, it, expect } from 'vitest';
import { inferRelationships } from './inference.js';
import type { NormalizedAssertion, RawAssertion } from './index.js';
import {
  createRawImportAssertion,
  createModuleAssertion,
  assertInferenceCreatesEdges,
  assertNoOrphanedReferences,
  assertBidirectionalConsistency,
} from '../../test/extractor-test-utils.js';

describe('inferRelationships - Module Import Edges', () => {
  it('should create module->module references from imports', () => {
    // Given: Two modules where one imports the other
    const assertions: NormalizedAssertion[] = [
      {
        _slice: {
          domain: 'graph',
          type: 'module',
          id: 'module-src-mcp-mcp-server',
          source_files: ['src/mcp/mcp-server.ts'],
        },
        element: {
          id: 'module-src-mcp-mcp-server',
          path: 'src/mcp/mcp-server.ts',
          name: 'mcp-server',
          language: 'typescript',
          layer: 'util',
          imports: {
            internal: [
              {
                module: './tools-structural.js',
                names: ['structuralTools'],
              },
              {
                module: './tools-context.js',
                names: ['contextTools'],
              },
              {
                module: '../rss/rss-operations.js',
                names: ['initRssContext'],
              },
            ],
            external: [],
          },
        },
      },
      {
        _slice: {
          domain: 'graph',
          type: 'module',
          id: 'module-src-mcp-tools-structural',
          source_files: ['src/mcp/tools-structural.ts'],
        },
        element: {
          id: 'module-src-mcp-tools-structural',
          path: 'src/mcp/tools-structural.ts',
          name: 'tools-structural',
          language: 'typescript',
          layer: 'util',
        },
      },
      {
        _slice: {
          domain: 'graph',
          type: 'module',
          id: 'module-src-mcp-tools-context',
          source_files: ['src/mcp/tools-context.ts'],
        },
        element: {
          id: 'module-src-mcp-tools-context',
          path: 'src/mcp/tools-context.ts',
          name: 'tools-context',
          language: 'typescript',
          layer: 'util',
        },
      },
      {
        _slice: {
          domain: 'graph',
          type: 'module',
          id: 'module-src-rss-rss-operations',
          source_files: ['src/rss/rss-operations.ts'],
        },
        element: {
          id: 'module-src-rss-rss-operations',
          path: 'src/rss/rss-operations.ts',
          name: 'rss-operations',
          language: 'typescript',
          layer: 'util',
        },
      },
    ];

    // Raw assertions with import metadata
    const rawAssertions: RawAssertion[] = [
      {
        elementId: 'import-0',
        elementType: 'import',
        file: 'src/mcp/mcp-server.ts',
        metadata: {
          module: './tools-structural.js',
          names: ['structuralTools'],
        },
      },
      {
        elementId: 'import-1',
        elementType: 'import',
        file: 'src/mcp/mcp-server.ts',
        metadata: {
          module: './tools-context.js',
          names: ['contextTools'],
        },
      },
      {
        elementId: 'import-2',
        elementType: 'import',
        file: 'src/mcp/mcp-server.ts',
        metadata: {
          module: '../rss/rss-operations.js',
          names: ['initRssContext'],
        },
      },
    ];

    // When: Inference runs
    const result = inferRelationships(assertions, rawAssertions);

    // Then: The mcp-server module should reference its imports
    const mcpServer = result.find((a) => a._slice.id === 'module-src-mcp-mcp-server');
    expect(mcpServer).toBeDefined();
    expect(mcpServer!._slice.references).toBeDefined();
    
    const refs = mcpServer!._slice.references || [];
    
    // Should reference tools-structural
    expect(refs).toContainEqual({
      domain: 'graph',
      type: 'module',
      id: 'module-src-mcp-tools-structural',
    });
    
    // Should reference tools-context
    expect(refs).toContainEqual({
      domain: 'graph',
      type: 'module',
      id: 'module-src-mcp-tools-context',
    });
    
    // Should reference rss-operations
    expect(refs).toContainEqual({
      domain: 'graph',
      type: 'module',
      id: 'module-src-rss-rss-operations',
    });
  });

  it('should create bidirectional edges (referenced_by)', () => {
    // Given: Same setup as above
    const assertions: NormalizedAssertion[] = [
      {
        _slice: {
          domain: 'graph',
          type: 'module',
          id: 'module-src-mcp-mcp-server',
          source_files: ['src/mcp/mcp-server.ts'],
        },
        element: {
          id: 'module-src-mcp-mcp-server',
          path: 'src/mcp/mcp-server.ts',
          name: 'mcp-server',
          language: 'typescript',
          layer: 'util',
        },
      },
      {
        _slice: {
          domain: 'graph',
          type: 'module',
          id: 'module-src-mcp-tools-structural',
          source_files: ['src/mcp/tools-structural.ts'],
        },
        element: {
          id: 'module-src-mcp-tools-structural',
          path: 'src/mcp/tools-structural.ts',
          name: 'tools-structural',
          language: 'typescript',
          layer: 'util',
        },
      },
    ];

    const rawAssertions: RawAssertion[] = [
      {
        elementId: 'import-0',
        elementType: 'import',
        file: 'src/mcp/mcp-server.ts',
        metadata: {
          module: './tools-structural.js',
          names: ['structuralTools'],
        },
      },
    ];

    // When: Inference runs
    const result = inferRelationships(assertions, rawAssertions);

    // Then: tools-structural should be referenced_by mcp-server
    const toolsStructural = result.find((a) => a._slice.id === 'module-src-mcp-tools-structural');
    expect(toolsStructural).toBeDefined();
    expect(toolsStructural!._slice.referenced_by).toBeDefined();
    
    const referencedBy = toolsStructural!._slice.referenced_by || [];
    expect(referencedBy).toContainEqual({
      domain: 'graph',
      type: 'module',
      id: 'module-src-mcp-mcp-server',
    });
  });

  it('should work with test utilities (simplified)', () => {
    // Given: Two modules
    const moduleA = createModuleAssertion('src/mcp/mcp-server.ts', 'module-src-mcp-mcp-server');
    const moduleB = createModuleAssertion('src/mcp/tools-structural.ts', 'module-src-mcp-tools-structural');

    const rawImport = createRawImportAssertion(
      'src/mcp/mcp-server.ts',
      './tools-structural.js',
      ['structuralTools']
    );

    // When: Inference runs
    const result = assertInferenceCreatesEdges(
      [moduleA, moduleB],
      [rawImport],
      'module-src-mcp-mcp-server',
      ['module-src-mcp-tools-structural']
    );

    // Then: Both assertions pass (forward and bidirectional)
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });
});
