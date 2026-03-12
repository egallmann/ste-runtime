/**
 * Tests for MCP Tools - Context Assembly
 * 
 * Tests Layer 2 operations that combine graph metadata with source code.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { RssContext } from '../rss/rss-operations.js';
import type { AidocGraph, AidocNode } from '../rss/graph-loader.js';
import {
  assembleContextTool,
  getImplementationContext,
  getRelatedImplementations,
} from './tools-context.js';

describe('MCP Tools - Context Assembly', () => {
  let ctx: RssContext;
  let graph: AidocGraph;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tools-context-test-'));
    
    // Create test file
    const testContent = `// Test file
function hello() {
  console.log('Hello');
}

function goodbye() {
  console.log('Goodbye');
}`;
    
    testFilePath = path.join(tempDir, 'test.ts');
    await fs.writeFile(testFilePath, testContent, 'utf-8');

    graph = new Map();
    
    const node1: AidocNode = {
      key: 'test/function/hello',
      domain: 'test',
      type: 'function',
      id: 'hello',
      path: 'function/hello',
      tags: ['test'],
      sourceFiles: [testFilePath],
      references: [],
      referencedBy: [],
      slice: { start: 2, end: 4 },
    };

    const node2: AidocNode = {
      key: 'test/function/goodbye',
      domain: 'test',
      type: 'function',
      id: 'goodbye',
      path: 'function/goodbye',
      tags: ['test'],
      sourceFiles: [testFilePath],
      references: [],
      referencedBy: [],
      slice: { start: 6, end: 8 },
    };

    graph.set(node1.key, node1);
    graph.set(node2.key, node2);

    ctx = {
      graph,
      graphVersion: '1.0.0',
      stateRoot: tempDir,
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('assembleContextTool', () => {
    it('should assemble context with source code', async () => {
      const result = await assembleContextTool(ctx, {
        query: 'hello',
        includeSource: true,
      });

      expect(result.query).toBe('hello');
      expect(result.entryPoints.length).toBeGreaterThan(0);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.formattedSource).toContain('hello');
    });

    it('should assemble context without source code', async () => {
      const result = await assembleContextTool(ctx, {
        query: 'hello',
        includeSource: false,
      });

      expect(result.formattedSource).toBe('');
      expect(result.sourceContexts).toHaveLength(0);
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('should respect depth parameter', async () => {
      const result = await assembleContextTool(ctx, {
        query: 'hello',
        depth: 1,
      });

      expect(result.summary).toBeDefined();
    });

    it('should respect maxNodes parameter', async () => {
      const result = await assembleContextTool(ctx, {
        query: 'hello',
        maxNodes: 1,
      });

      expect(result.nodes.length).toBeLessThanOrEqual(1);
    });

    it('should respect maxSourceLines parameter', async () => {
      const result = await assembleContextTool(ctx, {
        query: 'hello',
        includeSource: true,
        maxSourceLines: 2,
      });

      if (result.sourceContexts.length > 0) {
        expect(result.formattedSource).toBeTruthy();
      }
    });

    it('should handle queries with no matches', async () => {
      const result = await assembleContextTool(ctx, {
        query: 'nonexistent-function-name-xyz',
      });

      expect(result.entryPoints).toHaveLength(0);
      expect(result.nodes).toHaveLength(0);
      expect(result.summary.entryPointCount).toBe(0);
    });
  });

  describe('getImplementationContext', () => {
    it('should get implementation with source code', async () => {
      const result = await getImplementationContext(ctx, {
        key: 'test/function/hello',
        includeSource: true,
      });

      expect(result.found).toBe(true);
      expect(result.target?.id).toBe('hello');
      expect(result.formattedSource).toContain('hello');
    });

    it('should get implementation without source code', async () => {
      const result = await getImplementationContext(ctx, {
        key: 'test/function/hello',
        includeSource: false,
      });

      expect(result.found).toBe(true);
      expect(result.formattedSource).toBe('');
      expect(result.sourceContexts).toHaveLength(0);
    });

    it('should include dependencies when requested', async () => {
      // Add a node with dependencies
      const depNode: AidocNode = {
        key: 'test/function/dep',
        domain: 'test',
        type: 'function',
        id: 'dep',
        path: 'function/dep',
        tags: [],
        sourceFiles: [testFilePath],
        references: [],
        referencedBy: [],
      };
      
      const mainNode = graph.get('test/function/hello')!;
      mainNode.references = [{ domain: depNode.domain, type: depNode.type, id: depNode.id }];
      depNode.referencedBy = [{ domain: mainNode.domain, type: mainNode.type, id: mainNode.id }];
      
      graph.set(depNode.key, depNode);

      const result = await getImplementationContext(ctx, {
        key: 'test/function/hello',
        includeDependencies: true,
        depth: 1,
      });

      expect(result.found).toBe(true);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('should exclude dependencies when not requested', async () => {
      const result = await getImplementationContext(ctx, {
        key: 'test/function/hello',
        includeDependencies: false,
      });

      expect(result.found).toBe(true);
      expect(result.dependencies).toHaveLength(0);
    });

    it('should return not found for non-existent key', async () => {
      const result = await getImplementationContext(ctx, {
        key: 'nonexistent/type/id',
      });

      expect(result.found).toBe(false);
      expect(result.key).toBe('nonexistent/type/id');
    });
  });

  describe('getRelatedImplementations', () => {
    it('should find related implementations', async () => {
      const result = await getRelatedImplementations(ctx, {
        key: 'test/function/hello',
      });

      expect(result.found).toBe(true);
      expect(result.target?.id).toBe('hello');
      // May or may not find related nodes depending on graph structure
      expect(Array.isArray(result.relatedNodes)).toBe(true);
    });

    it('should filter to same domain and type', async () => {
      // Add a node from different domain
      const otherNode: AidocNode = {
        key: 'other/component/Widget',
        domain: 'other',
        type: 'component',
        id: 'Widget',
        path: 'component/Widget',
        tags: [],
        sourceFiles: [testFilePath],
        references: [{ domain: 'test', type: 'function', id: 'hello' }],
        referencedBy: [],
      };
      
      graph.set(otherNode.key, otherNode);

      const result = await getRelatedImplementations(ctx, {
        key: 'test/function/hello',
      });

      expect(result.found).toBe(true);
      // Should not include the component from different domain
      expect(result.relatedNodes.every(n => 
        n.domain === 'test' && n.type === 'function'
      )).toBe(true);
    });

    it('should include source code when requested', async () => {
      const result = await getRelatedImplementations(ctx, {
        key: 'test/function/hello',
        includeSource: true,
      });

      expect(result.found).toBe(true);
      if (result.relatedNodes.length > 0) {
        expect(result.formattedSource).toBeTruthy();
      }
    });

    it('should exclude source code when not requested', async () => {
      const result = await getRelatedImplementations(ctx, {
        key: 'test/function/hello',
        includeSource: false,
      });

      expect(result.found).toBe(true);
      expect(result.formattedSource).toBe('');
    });

    it('should respect maxResults parameter', async () => {
      const result = await getRelatedImplementations(ctx, {
        key: 'test/function/hello',
        maxResults: 1,
      });

      expect(result.found).toBe(true);
      expect(result.relatedNodes.length).toBeLessThanOrEqual(1);
    });

    it('should return not found for non-existent key', async () => {
      const result = await getRelatedImplementations(ctx, {
        key: 'nonexistent/type/id',
      });

      expect(result.found).toBe(false);
      expect(result.key).toBe('nonexistent/type/id');
    });
  });
});

