/**
 * Tests for MCP Tools - Structural Queries
 * 
 * Tests Layer 1 fast graph operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { RssContext } from '../rss/rss-operations.js';
import type { AidocGraph, AidocNode } from '../rss/graph-loader.js';
import {
  searchSemanticGraph,
  getDependencies,
  getDependents,
  getBlastRadius,
  lookupByKeyTool,
  lookupTool,
  byTagTool,
  getGraphStatsTool,
} from './tools-structural.js';

describe('MCP Tools - Structural Queries', () => {
  let ctx: RssContext;
  let graph: AidocGraph;

  beforeEach(() => {
    graph = new Map();
    
    // Create test nodes
    const node1: AidocNode = {
      key: 'frontend/component/App',
      domain: 'frontend',
      type: 'component',
      id: 'App',
      path: 'component/App',
      tags: ['react', 'root'],
      sourceFiles: ['src/App.tsx'],
      references: [{ domain: 'frontend', type: 'component', id: 'Header' }],
      referencedBy: [],
    };

    const node2: AidocNode = {
      key: 'frontend/component/Header',
      domain: 'frontend',
      type: 'component',
      id: 'Header',
      path: 'component/Header',
      tags: ['react'],
      sourceFiles: ['src/Header.tsx'],
      references: [],
      referencedBy: [{ domain: 'frontend', type: 'component', id: 'App' }],
    };

    const node3: AidocNode = {
      key: 'backend/function/getUserData',
      domain: 'backend',
      type: 'function',
      id: 'getUserData',
      path: 'function/getUserData',
      tags: ['api', 'user'],
      sourceFiles: ['src/api.ts'],
      references: [],
      referencedBy: [],
    };

    graph.set(node1.key, node1);
    graph.set(node2.key, node2);
    graph.set(node3.key, node3);

    ctx = {
      graph,
      graphVersion: '1.0.0',
      stateRoot: '.ste/state',
    };
  });

  describe('searchSemanticGraph', () => {
    it('should search and return matching nodes', async () => {
      const result = await searchSemanticGraph(ctx, {
        query: 'App',
        maxResults: 50,
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('App');
      expect(result.nodes[0].domain).toBe('frontend');
      expect(result.truncated).toBe(false);
    });

    it('should filter by domain', async () => {
      const result = await searchSemanticGraph(ctx, {
        query: '',
        domain: 'backend',
      });

      expect(result.nodes.every(n => n.domain === 'backend')).toBe(true);
    });

    it('should filter by type', async () => {
      const result = await searchSemanticGraph(ctx, {
        query: '',
        type: 'component',
      });

      expect(result.nodes.every(n => n.type === 'component')).toBe(true);
    });

    it('should respect maxResults', async () => {
      const result = await searchSemanticGraph(ctx, {
        query: '',
        maxResults: 1,
      });

      expect(result.nodes).toHaveLength(1);
    });
  });

  describe('getDependencies', () => {
    it('should get dependencies of a node', async () => {
      const result = await getDependencies(ctx, {
        key: 'frontend/component/App',
      });

      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].id).toBe('Header');
      expect(result.startKey).toBe('frontend/component/App');
    });

    it('should respect depth parameter', async () => {
      const result = await getDependencies(ctx, {
        key: 'frontend/component/App',
        depth: 1,
      });

      expect(result.depth).toBe(1);
    });

    it('should handle nodes with no dependencies', async () => {
      const result = await getDependencies(ctx, {
        key: 'frontend/component/Header',
      });

      expect(result.dependencies).toHaveLength(0);
    });
  });

  describe('getDependents', () => {
    it('should get dependents of a node', async () => {
      const result = await getDependents(ctx, {
        key: 'frontend/component/Header',
      });

      expect(result.dependents).toHaveLength(1);
      expect(result.dependents[0].id).toBe('App');
      expect(result.startKey).toBe('frontend/component/Header');
    });

    it('should handle nodes with no dependents', async () => {
      const result = await getDependents(ctx, {
        key: 'frontend/component/App',
      });

      expect(result.dependents).toHaveLength(0);
    });
  });

  describe('getBlastRadius', () => {
    it('should get blast radius of a node', async () => {
      const result = await getBlastRadius(ctx, {
        key: 'frontend/component/Header',
      });

      expect(result.totalImpacted).toBeGreaterThan(0);
      expect(result.startKey).toBe('frontend/component/Header');
    });

    it('should respect maxNodes limit', async () => {
      const result = await getBlastRadius(ctx, {
        key: 'frontend/component/App',
        maxNodes: 1,
      });

      expect(result.impactedNodes.length).toBeLessThanOrEqual(1);
    });
  });

  describe('lookupByKeyTool', () => {
    it('should lookup node by key', async () => {
      const result = await lookupByKeyTool(ctx, {
        key: 'frontend/component/App',
      });

      expect(result.found).toBe(true);
      expect(result.node?.id).toBe('App');
      expect(result.node?.domain).toBe('frontend');
    });

    it('should return not found for non-existent key', async () => {
      const result = await lookupByKeyTool(ctx, {
        key: 'nonexistent/type/id',
      });

      expect(result.found).toBe(false);
      expect(result.key).toBe('nonexistent/type/id');
    });
  });

  describe('lookupTool', () => {
    it('should lookup node by domain and id', async () => {
      const result = await lookupTool(ctx, {
        domain: 'frontend',
        id: 'App',
      });

      expect(result.found).toBe(true);
      expect(result.node?.id).toBe('App');
      expect(result.node?.domain).toBe('frontend');
    });

    it('should return not found for non-existent node', async () => {
      const result = await lookupTool(ctx, {
        domain: 'nonexistent',
        id: 'missing',
      });

      expect(result.found).toBe(false);
    });
  });

  describe('byTagTool', () => {
    it('should find nodes by tag', async () => {
      const result = await byTagTool(ctx, {
        tag: 'react',
      });

      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.nodes.every(n => n.tags.includes('react'))).toBe(true);
      expect(result.tag).toBe('react');
    });

    it('should return empty array for non-existent tag', async () => {
      const result = await byTagTool(ctx, {
        tag: 'nonexistent-tag',
      });

      expect(result.nodes).toHaveLength(0);
    });

    it('should respect maxResults', async () => {
      const result = await byTagTool(ctx, {
        tag: 'react',
        maxResults: 1,
      });

      expect(result.nodes.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getGraphStatsTool', () => {
    it('should return graph statistics', async () => {
      const result = await getGraphStatsTool(ctx);

      expect(result.totalNodes).toBe(3);
      expect(result.byDomain).toHaveProperty('frontend');
      expect(result.byDomain).toHaveProperty('backend');
      expect(result.byType).toHaveProperty('component');
      expect(result.byType).toHaveProperty('function');
      expect(result.graphVersion).toBe('1.0.0');
    });

    it('should handle empty graph', async () => {
      const emptyCtx: RssContext = {
        graph: new Map(),
        graphVersion: '1.0.0',
        stateRoot: '.ste/state',
      };

      const result = await getGraphStatsTool(emptyCtx);

      expect(result.totalNodes).toBe(0);
      expect(result.byDomain).toEqual({});
      expect(result.byType).toEqual({});
    });
  });
});

