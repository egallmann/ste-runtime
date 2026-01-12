/**
 * Tests for MCP Tools - Operational
 * 
 * Tests health checks, diagnostics, and operational tools.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { RssContext } from '../rss/rss-operations.js';
import type { AidocGraph, AidocNode } from '../rss/graph-loader.js';
import {
  detectMissingExtractors,
  getGraphHealth,
  getGraphDiagnostics,
} from './tools-operational.js';

describe('MCP Tools - Operational', () => {
  let ctx: RssContext;
  let graph: AidocGraph;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tools-operational-test-'));
    
    graph = new Map();
    ctx = {
      graph,
      graphVersion: '1.0.0',
      stateRoot: tempDir,
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('detectMissingExtractors', () => {
    it('should detect Python files', async () => {
      // Create a Python file
      await fs.writeFile(path.join(tempDir, 'test.py'), 'print("hello")', 'utf-8');

      const result = await detectMissingExtractors({ projectRoot: tempDir });

      expect(result.detectedLanguages).toContain('python');
      expect(result.availableExtractors).toContain('python');
    });

    it('should detect TypeScript/JavaScript files', async () => {
      await fs.writeFile(path.join(tempDir, 'test.ts'), 'const x = 42;', 'utf-8');
      await fs.writeFile(path.join(tempDir, 'test.js'), 'const y = 43;', 'utf-8');

      const result = await detectMissingExtractors({ projectRoot: tempDir });

      expect(result.detectedLanguages).toContain('typescript');
      expect(result.availableExtractors).toContain('typescript');
    });

    it('should detect Java files and flag as missing', async () => {
      await fs.writeFile(path.join(tempDir, 'Test.java'), 'public class Test {}', 'utf-8');

      const result = await detectMissingExtractors({ projectRoot: tempDir });

      expect(result.detectedLanguages).toContain('java');
      expect(result.missingExtractors).toContain('java');
    });

    it('should detect Go files and flag as missing', async () => {
      await fs.writeFile(path.join(tempDir, 'main.go'), 'package main', 'utf-8');

      const result = await detectMissingExtractors({ projectRoot: tempDir });

      expect(result.detectedLanguages).toContain('go');
      expect(result.missingExtractors).toContain('go');
    });

    it('should detect Rust files and flag as missing', async () => {
      await fs.writeFile(path.join(tempDir, 'main.rs'), 'fn main() {}', 'utf-8');

      const result = await detectMissingExtractors({ projectRoot: tempDir });

      expect(result.detectedLanguages).toContain('rust');
      expect(result.missingExtractors).toContain('rust');
    });

    it('should detect C# files and flag as missing', async () => {
      await fs.writeFile(path.join(tempDir, 'Program.cs'), 'class Program {}', 'utf-8');

      const result = await detectMissingExtractors({ projectRoot: tempDir });

      expect(result.detectedLanguages).toContain('csharp');
      expect(result.missingExtractors).toContain('csharp');
    });

    it('should detect Ruby files and flag as missing', async () => {
      await fs.writeFile(path.join(tempDir, 'script.rb'), 'puts "hello"', 'utf-8');

      const result = await detectMissingExtractors({ projectRoot: tempDir });

      expect(result.detectedLanguages).toContain('ruby');
      expect(result.missingExtractors).toContain('ruby');
    });

    it('should provide recommendations for missing extractors', async () => {
      await fs.writeFile(path.join(tempDir, 'Test.java'), 'public class Test {}', 'utf-8');

      const result = await detectMissingExtractors({ projectRoot: tempDir });

      expect(result.recommendations).toContain('java');
    });

    it('should handle projects with no source files', async () => {
      const result = await detectMissingExtractors({ projectRoot: tempDir });

      expect(result.detectedLanguages).toHaveLength(0);
      expect(result.missingExtractors).toHaveLength(0);
    });

    it('should use current directory as default projectRoot', async () => {
      const result = await detectMissingExtractors({});

      expect(result.projectRoot).toBeTruthy();
    });
  });

  describe('getGraphHealth', () => {
    it('should report healthy graph', async () => {
      // Add connected nodes
      const node1: AidocNode = {
        key: 'test/function/a',
        domain: 'test',
        type: 'function',
        id: 'a',
        path: 'function/a',
        tags: [],
        sourceFiles: ['a.ts'],
        references: [{ domain: 'test', type: 'function', id: 'b' }],
        referencedBy: [],
      };

      const node2: AidocNode = {
        key: 'test/function/b',
        domain: 'test',
        type: 'function',
        id: 'b',
        path: 'function/b',
        tags: [],
        sourceFiles: ['b.ts'],
        references: [],
        referencedBy: [{ domain: 'test', type: 'function', id: 'a' }],
      };

      graph.set(node1.key, node1);
      graph.set(node2.key, node2);

      const result = await getGraphHealth(ctx);

      expect(result.isHealthy).toBe(true);
      expect(result.summary.totalNodes).toBe(2);
      expect(result.summary.brokenEdgeCount).toBe(0);
      expect(result.graphVersion).toBe('1.0.0');
    });

    it('should detect broken edges', async () => {
      // Add node with broken reference
      const node1: AidocNode = {
        key: 'test/function/a',
        domain: 'test',
        type: 'function',
        id: 'a',
        path: 'function/a',
        tags: [],
        sourceFiles: ['a.ts'],
        references: [{ domain: 'test', type: 'function', id: 'nonexistent' }],
        referencedBy: [],
      };

      graph.set(node1.key, node1);

      const result = await getGraphHealth(ctx);

      expect(result.isHealthy).toBe(false);
      expect(result.summary.brokenEdgeCount).toBeGreaterThan(0);
    });

    it('should detect orphaned nodes', async () => {
      // Add isolated node
      const orphan: AidocNode = {
        key: 'test/function/orphan',
        domain: 'test',
        type: 'function',
        id: 'orphan',
        path: 'function/orphan',
        tags: [],
        sourceFiles: ['orphan.ts'],
        references: [],
        referencedBy: [],
      };

      graph.set(orphan.key, orphan);

      const result = await getGraphHealth(ctx);

      expect(result.summary.orphanCount).toBeGreaterThan(0);
    });

    it('should include sample broken edges', async () => {
      const node1: AidocNode = {
        key: 'test/function/a',
        domain: 'test',
        type: 'function',
        id: 'a',
        path: 'function/a',
        tags: [],
        sourceFiles: ['a.ts'],
        references: [{ domain: 'test', type: 'function', id: 'missing' }],
        referencedBy: [],
      };

      graph.set(node1.key, node1);

      const result = await getGraphHealth(ctx);

      expect(result.brokenEdges.length).toBeGreaterThan(0);
      expect(result.brokenEdges[0].toKey).toContain('missing');
    });
  });

  describe('getGraphDiagnostics', () => {
    it('should calculate connectivity metrics', async () => {
      const node1: AidocNode = {
        key: 'test/function/a',
        domain: 'test',
        type: 'function',
        id: 'a',
        path: 'function/a',
        tags: [],
        sourceFiles: ['a.ts'],
        references: [{ domain: 'test', type: 'function', id: 'b' }],
        referencedBy: [],
      };

      const node2: AidocNode = {
        key: 'test/function/b',
        domain: 'test',
        type: 'function',
        id: 'b',
        path: 'function/b',
        tags: [],
        sourceFiles: ['b.ts'],
        references: [],
        referencedBy: [{ domain: 'test', type: 'function', id: 'a' }],
      };

      graph.set(node1.key, node1);
      graph.set(node2.key, node2);

      const result = await getGraphDiagnostics(ctx);

      expect(result.totalNodes).toBe(2);
      expect(result.connectedNodes).toBe(2);
      expect(result.connectivityRatio).toBe(1.0);
      expect(result.avgDegree).toBeGreaterThan(0);
    });

    it('should provide recommendations for broken edges', async () => {
      const node1: AidocNode = {
        key: 'test/function/a',
        domain: 'test',
        type: 'function',
        id: 'a',
        path: 'function/a',
        tags: [],
        sourceFiles: ['a.ts'],
        references: [{ domain: 'test', type: 'function', id: 'missing' }],
        referencedBy: [],
      };

      graph.set(node1.key, node1);

      const result = await getGraphDiagnostics(ctx);

      expect(result.brokenEdgeCount).toBeGreaterThan(0);
      expect(result.recommendations.some(r => r.includes('broken'))).toBe(true);
    });

    it('should provide recommendations for many orphaned nodes', async () => {
      // Add 15 orphaned nodes
      for (let i = 0; i < 15; i++) {
        const orphan: AidocNode = {
          key: `test/function/orphan${i}`,
          domain: 'test',
          type: 'function',
          id: `orphan${i}`,
          path: `function/orphan${i}`,
          tags: [],
          sourceFiles: [`orphan${i}.ts`],
          references: [],
          referencedBy: [],
        };
        graph.set(orphan.key, orphan);
      }

      const result = await getGraphDiagnostics(ctx);

      expect(result.orphanedNodes).toBeGreaterThan(10);
      expect(result.recommendations.some(r => r.includes('orphaned'))).toBe(true);
    });

    it('should provide positive feedback for healthy graph', async () => {
      const node1: AidocNode = {
        key: 'test/function/a',
        domain: 'test',
        type: 'function',
        id: 'a',
        path: 'function/a',
        tags: [],
        sourceFiles: ['a.ts'],
        references: [{ domain: 'test', type: 'function', id: 'b' }],
        referencedBy: [],
      };

      const node2: AidocNode = {
        key: 'test/function/b',
        domain: 'test',
        type: 'function',
        id: 'b',
        path: 'function/b',
        tags: [],
        sourceFiles: ['b.ts'],
        references: [],
        referencedBy: [{ domain: 'test', type: 'function', id: 'a' }],
      };

      graph.set(node1.key, node1);
      graph.set(node2.key, node2);

      const result = await getGraphDiagnostics(ctx);

      expect(result.recommendations.some(r => r.includes('good'))).toBe(true);
    });

    it('should handle empty graph', async () => {
      const result = await getGraphDiagnostics(ctx);

      expect(result.totalNodes).toBe(0);
      expect(result.connectedNodes).toBe(0);
      expect(result.connectivityRatio).toBe(0);
    });
  });
});

