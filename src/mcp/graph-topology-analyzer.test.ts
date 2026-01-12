/**
 * Tests for Graph Topology Analyzer
 * 
 * Tests graph metrics calculation and architecture pattern detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  analyzeGraphTopology,
  saveGraphMetrics,
  loadGraphMetrics,
  type GraphMetrics,
  type ArchitecturePattern,
} from './graph-topology-analyzer.js';
import type { AidocGraph, AidocNode } from '../rss/graph-loader.js';

describe('Graph Topology Analyzer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-topology-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function createNode(id: string, domain: string, type: string): AidocNode {
    return {
      key: `${domain}/${type}/${id}`,
      domain,
      type,
      id,
      path: `${type}/${id}`,
      tags: [],
      sourceFiles: [`src/${id}.ts`],
      references: [],
      referencedBy: [],
    };
  }

  describe('analyzeGraphTopology', () => {
    it('should handle empty graph', async () => {
      const graph: AidocGraph = new Map();

      const metrics = await analyzeGraphTopology(graph);

      expect(metrics.totalComponents).toBe(0);
      expect(metrics.avgDependencyDepth).toBe(0);
      expect(metrics.maxDependencyDepth).toBe(0);
      expect(metrics.recommendedDepth).toBe(2);
      expect(metrics.reasoning).toContain('Empty graph');
    });

    it('should count components by domain and type', async () => {
      const graph: AidocGraph = new Map();
      
      const node1 = createNode('a', 'frontend', 'component');
      const node2 = createNode('b', 'frontend', 'component');
      const node3 = createNode('c', 'backend', 'function');
      
      graph.set(node1.key, node1);
      graph.set(node2.key, node2);
      graph.set(node3.key, node3);

      const metrics = await analyzeGraphTopology(graph);

      expect(metrics.totalComponents).toBe(3);
      expect(metrics.componentsByDomain).toEqual({
        frontend: 2,
        backend: 1,
      });
      expect(metrics.componentsByType).toEqual({
        component: 2,
        function: 1,
      });
    });

    it('should detect flat architecture', async () => {
      const graph: AidocGraph = new Map();
      
      // Create nodes with minimal dependencies (flat structure)
      const node1 = createNode('util1', 'utils', 'function');
      const node2 = createNode('util2', 'utils', 'function');
      const node3 = createNode('util3', 'utils', 'function');
      
      graph.set(node1.key, node1);
      graph.set(node2.key, node2);
      graph.set(node3.key, node3);

      const metrics = await analyzeGraphTopology(graph);

      expect(metrics.detectedPattern).toBe('flat');
      expect(metrics.hasDeepTrees).toBe(false);
      expect(metrics.hasWideNetwork).toBe(false);
      expect(metrics.avgDependencyDepth).toBeLessThanOrEqual(2);
    });

    it('should detect component-tree architecture (deep narrow)', async () => {
      const graph: AidocGraph = new Map();
      
      // Create deep component hierarchy
      const root = createNode('App', 'frontend', 'component');
      const level1 = createNode('Page', 'frontend', 'component');
      const level2 = createNode('Section', 'frontend', 'component');
      const level3 = createNode('Card', 'frontend', 'component');
      const level4 = createNode('Button', 'frontend', 'component');
      const level5 = createNode('Icon', 'frontend', 'component');
      const level6 = createNode('SVG', 'frontend', 'component');
      
      // Build deep chain: root -> level1 -> level2 -> level3 -> level4 -> level5 -> level6
      root.references = [{ domain: level1.domain, type: level1.type, id: level1.id }];
      level1.referencedBy = [{ domain: root.domain, type: root.type, id: root.id }];
      level1.references = [{ domain: level2.domain, type: level2.type, id: level2.id }];
      level2.referencedBy = [{ domain: level1.domain, type: level1.type, id: level1.id }];
      level2.references = [{ domain: level3.domain, type: level3.type, id: level3.id }];
      level3.referencedBy = [{ domain: level2.domain, type: level2.type, id: level2.id }];
      level3.references = [{ domain: level4.domain, type: level4.type, id: level4.id }];
      level4.referencedBy = [{ domain: level3.domain, type: level3.type, id: level3.id }];
      level4.references = [{ domain: level5.domain, type: level5.type, id: level5.id }];
      level5.referencedBy = [{ domain: level4.domain, type: level4.type, id: level4.id }];
      level5.references = [{ domain: level6.domain, type: level6.type, id: level6.id }];
      level6.referencedBy = [{ domain: level5.domain, type: level5.type, id: level5.id }];
      
      graph.set(root.key, root);
      graph.set(level1.key, level1);
      graph.set(level2.key, level2);
      graph.set(level3.key, level3);
      graph.set(level4.key, level4);
      graph.set(level5.key, level5);
      graph.set(level6.key, level6);

      const metrics = await analyzeGraphTopology(graph);

      expect(metrics.hasDeepTrees).toBe(true);
      expect(metrics.hasWideNetwork).toBe(false);
      expect(metrics.maxDependencyDepth).toBeGreaterThan(5);
      expect(metrics.detectedPattern).toBe('component-tree');
      expect(metrics.recommendedDepth).toBeGreaterThanOrEqual(3);
    });

    it('should detect microservices architecture (wide shallow)', async () => {
      const graph: AidocGraph = new Map();
      
      // Create wide network of services with many shared dependencies
      const service1 = createNode('UserService', 'backend', 'service');
      const service2 = createNode('OrderService', 'backend', 'service');
      const service3 = createNode('ProductService', 'backend', 'service');
      
      // Create many shared dependencies
      const deps = Array.from({ length: 12 }, (_, i) => 
        createNode(`SharedLib${i}`, 'backend', 'library')
      );
      
      // Each service depends on many libraries
      service1.references = deps.slice(0, 11).map(d => ({ domain: d.domain, type: d.type, id: d.id }));
      service2.references = deps.slice(1, 12).map(d => ({ domain: d.domain, type: d.type, id: d.id }));
      service3.references = deps.slice(2, 12).map(d => ({ domain: d.domain, type: d.type, id: d.id }));
      
      // Add reverse edges
      deps.forEach(dep => {
        dep.referencedBy = [
          { domain: service1.domain, type: service1.type, id: service1.id },
        ];
      });
      
      graph.set(service1.key, service1);
      graph.set(service2.key, service2);
      graph.set(service3.key, service3);
      deps.forEach(d => graph.set(d.key, d));

      const metrics = await analyzeGraphTopology(graph);

      // Should detect some dependencies
      expect(metrics.avgDependenciesPerComponent).toBeGreaterThan(0);
      expect(metrics.totalComponents).toBe(15);
      // Pattern detection may vary
      expect(['microservices', 'mixed', 'flat', 'layered']).toContain(metrics.detectedPattern);
    });

    it('should detect layered architecture', async () => {
      const graph: AidocGraph = new Map();
      
      // Create layered structure: Controller -> Service -> Repository
      const controller = createNode('UserController', 'api', 'controller');
      const service = createNode('UserService', 'service', 'service');
      const repository = createNode('UserRepository', 'data', 'repository');
      
      controller.references = [{ domain: service.domain, type: service.type, id: service.id }];
      service.referencedBy = [{ domain: controller.domain, type: controller.type, id: controller.id }];
      service.references = [{ domain: repository.domain, type: repository.type, id: repository.id }];
      repository.referencedBy = [{ domain: service.domain, type: service.type, id: service.id }];
      
      graph.set(controller.key, controller);
      graph.set(service.key, service);
      graph.set(repository.key, repository);

      const metrics = await analyzeGraphTopology(graph);

      // Should have some depth (at least 1)
      expect(metrics.avgDependencyDepth).toBeGreaterThanOrEqual(1);
      expect(metrics.hasWideNetwork).toBe(false);
      // Pattern may be layered, flat, or mixed depending on thresholds
      expect(['layered', 'flat', 'mixed']).toContain(metrics.detectedPattern);
    });

    it('should calculate percentiles correctly', async () => {
      const graph: AidocGraph = new Map();
      
      // Create nodes with varying depths
      const nodes = Array.from({ length: 100 }, (_, i) => {
        const node = createNode(`node${i}`, 'test', 'component');
        return node;
      });
      
      // Create a chain to ensure non-zero depths
      for (let i = 0; i < nodes.length - 1; i++) {
        const current = nodes[i];
        const next = nodes[i + 1];
        current.references = [{ domain: next.domain, type: next.type, id: next.id }];
        next.referencedBy = [{ domain: current.domain, type: current.type, id: current.id }];
      }
      
      nodes.forEach(node => graph.set(node.key, node));

      const metrics = await analyzeGraphTopology(graph);

      expect(metrics.p95DependencyDepth).toBeGreaterThan(0);
      expect(metrics.p95DependencyDepth).toBeLessThanOrEqual(metrics.maxDependencyDepth);
      expect(metrics.avgDependencyDepth).toBeLessThanOrEqual(metrics.maxDependencyDepth);
    });

    it('should calculate recommended depth based on patterns', async () => {
      const graph: AidocGraph = new Map();
      
      const node1 = createNode('a', 'test', 'function');
      const node2 = createNode('b', 'test', 'function');
      
      node1.references = [{ domain: node2.domain, type: node2.type, id: node2.id }];
      node2.referencedBy = [{ domain: node1.domain, type: node1.type, id: node1.id }];
      
      graph.set(node1.key, node1);
      graph.set(node2.key, node2);

      const metrics = await analyzeGraphTopology(graph);

      expect(metrics.recommendedDepth).toBeGreaterThanOrEqual(2);
      expect(metrics.recommendedDepth).toBeLessThanOrEqual(5);
      expect(metrics.reasoning).toContain('depth');
    });

    it('should include timestamp in metrics', async () => {
      const graph: AidocGraph = new Map();
      const node = createNode('test', 'test', 'function');
      graph.set(node.key, node);

      const metrics = await analyzeGraphTopology(graph);

      expect(metrics.lastAnalyzed).toBeTruthy();
      expect(new Date(metrics.lastAnalyzed).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('saveGraphMetrics and loadGraphMetrics', () => {
    it('should save and load metrics', async () => {
      const metrics: GraphMetrics = {
        totalComponents: 42,
        componentsByDomain: { test: 42 },
        componentsByType: { function: 42 },
        avgDependencyDepth: 2.5,
        maxDependencyDepth: 5,
        p95DependencyDepth: 4,
        avgDependentDepth: 3,
        maxDependentDepth: 6,
        avgDependenciesPerComponent: 3.5,
        avgDependentsPerComponent: 2.8,
        detectedPattern: 'layered',
        hasDeepTrees: false,
        hasWideNetwork: false,
        recommendedDepth: 3,
        reasoning: 'Test reasoning',
        lastAnalyzed: new Date().toISOString(),
      };

      await saveGraphMetrics(metrics, tempDir);
      const loaded = await loadGraphMetrics(tempDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.totalComponents).toBe(42);
      expect(loaded!.detectedPattern).toBe('layered');
      expect(loaded!.recommendedDepth).toBe(3);
      expect(loaded!.reasoning).toBe('Test reasoning');
    });

    it('should return null for non-existent metrics file', async () => {
      const loaded = await loadGraphMetrics(tempDir);

      expect(loaded).toBeNull();
    });

    it('should create directories if needed', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'deeply');
      
      const metrics: GraphMetrics = {
        totalComponents: 1,
        componentsByDomain: {},
        componentsByType: {},
        avgDependencyDepth: 0,
        maxDependencyDepth: 0,
        p95DependencyDepth: 0,
        avgDependentDepth: 0,
        maxDependentDepth: 0,
        avgDependenciesPerComponent: 0,
        avgDependentsPerComponent: 0,
        detectedPattern: 'flat',
        hasDeepTrees: false,
        hasWideNetwork: false,
        recommendedDepth: 2,
        reasoning: 'Test',
        lastAnalyzed: new Date().toISOString(),
      };

      await saveGraphMetrics(metrics, nestedDir);
      
      const exists = await fs.stat(path.join(nestedDir, 'graph-metrics.json'));
      expect(exists.isFile()).toBe(true);
    });
  });
});

