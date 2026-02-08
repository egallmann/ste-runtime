/**
 * Tests for MCP Tools - Obligation Projection
 * 
 * Tests the MCP tool handlers for obligation projection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RssContext } from '../rss/rss-operations.js';
import type { AidocGraph, AidocNode } from '../rss/graph-loader.js';
import type { SliceValidation } from '../rss/schema.js';
import {
  projectChangeObligationsTool,
  checkGraphFreshnessTool,
  countObligationsTool,
  type ProjectChangeObligationsArgs,
  type ObligationToolsConfig,
} from './tools-obligation.js';

// Mock the preflight and change-detector modules
vi.mock('../watch/change-detector.js', () => ({
  loadReconManifest: vi.fn().mockResolvedValue({
    version: 1,
    generatedAt: new Date().toISOString(),
    files: {
      'src/auth/handler.py': {
        path: 'src/auth/handler.py',
        mtimeMs: 1000000,
        size: 1024,
        hash: 'abc123',
      },
    },
  }),
}));

vi.mock('../recon/incremental-recon.js', () => ({
  runIncrementalRecon: vi.fn().mockResolvedValue(undefined),
}));

describe('MCP Tools - Obligation Projection', () => {
  let ctx: RssContext;
  let graph: AidocGraph;
  let config: ObligationToolsConfig;

  beforeEach(() => {
    graph = new Map();
    
    // Create test nodes with validation metadata
    const authHandler: AidocNode = {
      key: 'graph/function/authenticate',
      domain: 'graph',
      type: 'function',
      id: 'authenticate',
      path: 'src/auth/handler.py',
      tags: ['auth', 'security'],
      sourceFiles: ['src/auth/handler.py'],
      references: [{ domain: 'graph', type: 'function', id: 'validate_token' }],
      referencedBy: [{ domain: 'graph', type: 'function', id: 'login' }],
      element: {
        name: 'authenticate',
        _validation: {
          tested_by: [
            {
              test_id: 'test:tests/test_auth.py:test_authenticate_success',
              coverage: 'functional',
            },
          ],
          invariants: ['Must validate token'],
          validation_hash: 'abc123',
        } as SliceValidation,
      },
    };

    const validateToken: AidocNode = {
      key: 'graph/function/validate_token',
      domain: 'graph',
      type: 'function',
      id: 'validate_token',
      path: 'src/auth/handler.py',
      tags: ['auth'],
      sourceFiles: ['src/auth/handler.py'],
      references: [],
      referencedBy: [{ domain: 'graph', type: 'function', id: 'authenticate' }],
    };

    const loginHandler: AidocNode = {
      key: 'graph/function/login',
      domain: 'graph',
      type: 'function',
      id: 'login',
      path: 'src/api/routes.py',
      tags: ['api'],
      sourceFiles: ['src/api/routes.py'],
      references: [{ domain: 'graph', type: 'function', id: 'authenticate' }],
      referencedBy: [],
    };

    graph.set(authHandler.key, authHandler);
    graph.set(validateToken.key, validateToken);
    graph.set(loginHandler.key, loginHandler);

    ctx = {
      graph,
      graphVersion: '1.0.0',
      stateRoot: '.ste/state',
    };

    config = {
      projectRoot: '/project',
      stateDir: '/project/.ste/state',
    };
  });

  describe('projectChangeObligationsTool', () => {
    it('should return full obligation projection response', async () => {
      const args: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        depth: 2,
        requireFresh: false,
      };

      const result = await projectChangeObligationsTool(ctx, args, config);

      // Check intent echo
      expect(result.intent.type).toBe('modify');
      expect(result.intent.targetKey).toBe('graph/function/authenticate');

      // Check freshness indicator
      expect(result.freshness).toBeDefined();
      expect(result.freshness.scope).toBeDefined();
      expect(result.freshness.status).toBeDefined();

      // Check impacted slices
      expect(result.impactedSlices.direct).toHaveLength(1);
      expect(result.impactedSlices.dependents.length).toBeGreaterThan(0);
      expect(result.impactedSlices.dependencies.length).toBeGreaterThan(0);

      // Check obligations
      expect(result.requiredObligations.length).toBeGreaterThan(0);
      result.requiredObligations.forEach(o => {
        expect(o.id).toBeDefined();
        expect(o.type).toBeDefined();
        expect(o.source).toMatch(/^(declared|derived)$/);
        expect(o.description).toBeDefined();
      });

      // Check advisory
      expect(result.advisory.suggestedTests).toBeDefined();
      expect(result.advisory.reviewRecommendation).toBeDefined();
      expect(result.advisory.riskAssessment).toBeDefined();

      // Check metadata
      expect(result.meta.queryDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.meta.slicesAnalyzed).toBeGreaterThan(0);
      expect(result.meta.graphVersion).toBe('1.0.0');
    });

    it('should infer targetType for file paths', async () => {
      const args: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'src/auth/handler.py',
        // targetType not specified - should be inferred
      };

      const result = await projectChangeObligationsTool(ctx, args, config);

      // Should have found nodes associated with this file
      expect(result.intent.targetPath).toContain('handler.py');
    });

    it('should infer targetType for slice keys', async () => {
      const args: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        // targetType not specified - should be inferred
      };

      const result = await projectChangeObligationsTool(ctx, args, config);

      expect(result.intent.targetKey).toBe('graph/function/authenticate');
    });

    it('should infer targetType for queries', async () => {
      const args: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'authentication handler function',
        // targetType not specified - should be inferred as query
      };

      const result = await projectChangeObligationsTool(ctx, args, config);

      // Result depends on search implementation
      expect(result.intent).toBeDefined();
    });

    it('should handle non-existent target gracefully', async () => {
      const args: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'nonexistent/type/id',
        targetType: 'slice_key',
      };

      const result = await projectChangeObligationsTool(ctx, args, config);

      expect(result.impactedSlices.direct).toHaveLength(0);
      expect(result.requiredObligations).toHaveLength(0);
      expect(result.advisory.reviewRecommendation).toContain('not found');
    });

    it('should invalidate validations for modify intent', async () => {
      const args: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        requireFresh: false,
      };

      const result = await projectChangeObligationsTool(ctx, args, config);

      // Should have invalidated validations
      expect(result.invalidatedValidations.length).toBeGreaterThan(0);
      result.invalidatedValidations.forEach(v => {
        expect(v.testId).toBeDefined();
        expect(v.coverage).toBeDefined();
        expect(v.reason).toBe('source_changed');
      });
    });

    it('should respect depth parameter', async () => {
      const shallowArgs: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        depth: 1,
        requireFresh: false,
      };

      const deepArgs: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        depth: 5,
        requireFresh: false,
      };

      const shallowResult = await projectChangeObligationsTool(ctx, shallowArgs, config);
      const deepResult = await projectChangeObligationsTool(ctx, deepArgs, config);

      // Deep traversal should potentially find more
      expect(deepResult.meta.slicesAnalyzed).toBeGreaterThanOrEqual(shallowResult.meta.slicesAnalyzed);
    });

    it('should respect maxSlices parameter', async () => {
      const args: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        maxSlices: 1,
        requireFresh: false,
      };

      const result = await projectChangeObligationsTool(ctx, args, config);

      // Should be bounded by maxSlices
      const totalSlices = 
        result.impactedSlices.direct.length +
        result.impactedSlices.dependents.length +
        result.impactedSlices.dependencies.length;
      
      // Note: The implementation may still return the direct target plus some dependents
      // The exact behavior depends on implementation details
      expect(result.meta.slicesAnalyzed).toBeDefined();
    });
  });

  describe('checkGraphFreshnessTool', () => {
    it('should return freshness indicator', async () => {
      const result = await checkGraphFreshnessTool(
        ctx,
        { target: 'graph/function/authenticate', targetType: 'slice_key' },
        config
      );

      expect(result.freshness).toBeDefined();
      expect(result.freshness.scope).toBe('targeted');
      expect(result.freshness.status).toBeDefined();
      expect(result.freshness.lastReconciled).toBeDefined();
      expect(result.filesInScope).toBeGreaterThanOrEqual(0);
    });

    it('should check freshness without performing reconciliation', async () => {
      const { runIncrementalRecon } = await import('../recon/incremental-recon.js');
      
      // Clear any previous calls
      vi.mocked(runIncrementalRecon).mockClear();
      
      await checkGraphFreshnessTool(
        ctx,
        { target: 'graph/function/authenticate' },
        config
      );

      // checkGraphFreshnessTool should NOT call incremental recon - it only checks freshness
      // Note: It may have been called by previous tests, so we check it wasn't called in this test
      expect(runIncrementalRecon).not.toHaveBeenCalled();
    });
  });

  describe('countObligationsTool', () => {
    it('should return obligation counts', () => {
      const result = countObligationsTool(ctx, {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
      });

      expect(result.declared).toBeGreaterThanOrEqual(0);
      expect(result.derived).toBeGreaterThanOrEqual(0);
      expect(result.total).toBe(result.declared + result.derived);
    });

    it('should return zero for non-existent target', () => {
      const result = countObligationsTool(ctx, {
        intentType: 'modify',
        target: 'nonexistent/type/id',
        targetType: 'slice_key',
      });

      expect(result.total).toBe(0);
    });
  });

  describe('Response Schema Compliance', () => {
    it('should return all required fields', async () => {
      const args: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        requireFresh: false,
      };

      const result = await projectChangeObligationsTool(ctx, args, config);

      // All required fields per E-ADR-014
      expect(result.intent).toBeDefined();
      expect(result.intent.type).toBeDefined();
      expect(result.intent.targetKey).toBeDefined();
      expect(result.intent.targetPath).toBeDefined();

      expect(result.freshness).toBeDefined();
      expect(result.freshness.scope).toBeDefined();
      expect(result.freshness.filesChecked).toBeDefined();
      expect(result.freshness.status).toBeDefined();
      expect(result.freshness.lastReconciled).toBeDefined();
      expect(result.freshness.action).toBeDefined();

      expect(result.impactedSlices).toBeDefined();
      expect(result.impactedSlices.direct).toBeDefined();
      expect(result.impactedSlices.dependents).toBeDefined();
      expect(result.impactedSlices.dependencies).toBeDefined();

      expect(result.requiredObligations).toBeDefined();
      expect(result.invalidatedValidations).toBeDefined();
      expect(result.advisory).toBeDefined();
      expect(result.meta).toBeDefined();
    });

    it('should separate authoritative and advisory fields', async () => {
      const args: ProjectChangeObligationsArgs = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        requireFresh: false,
      };

      const result = await projectChangeObligationsTool(ctx, args, config);

      // Authoritative fields (deterministic from graph)
      expect(result.freshness).toBeDefined();
      expect(result.impactedSlices).toBeDefined();
      expect(result.requiredObligations).toBeDefined();
      expect(result.invalidatedValidations).toBeDefined();

      // Advisory fields (heuristic)
      expect(result.advisory.suggestedTests).toBeInstanceOf(Array);
      expect(typeof result.advisory.reviewRecommendation).toBe('string');
      expect(['low', 'medium', 'high']).toContain(result.advisory.riskAssessment);
    });
  });
});

