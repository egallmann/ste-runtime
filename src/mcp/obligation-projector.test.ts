/**
 * Tests for Obligation Projection Engine
 * 
 * Tests obligation extraction, derivation, and projection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { RssContext } from '../rss/rss-operations.js';
import type { AidocGraph, AidocNode } from '../rss/graph-loader.js';
import type { ChangeIntent, SliceValidation } from '../rss/schema.js';
import { projectObligations, countObligations } from './obligation-projector.js';

describe('Obligation Projection Engine', () => {
  let ctx: RssContext;
  let graph: AidocGraph;

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
              last_verified: '2026-01-20T10:00:00Z',
            },
            {
              test_id: 'test:tests/test_auth.py:test_authenticate_failure',
              coverage: 'edge-case',
            },
          ],
          invariants: [
            'Must validate token before database lookup',
            'Must return 401 for expired tokens',
          ],
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
      tags: ['api', 'auth'],
      sourceFiles: ['src/api/routes.py'],
      references: [{ domain: 'graph', type: 'function', id: 'authenticate' }],
      referencedBy: [],
    };

    const userService: AidocNode = {
      key: 'graph/class/UserService',
      domain: 'graph',
      type: 'class',
      id: 'UserService',
      path: 'src/services/user.py',
      tags: ['service'],
      sourceFiles: ['src/services/user.py'],
      references: [{ domain: 'graph', type: 'function', id: 'authenticate' }],
      referencedBy: [],
    };

    graph.set(authHandler.key, authHandler);
    graph.set(validateToken.key, validateToken);
    graph.set(loginHandler.key, loginHandler);
    graph.set(userService.key, userService);

    ctx = {
      graph,
      graphVersion: '1.0.0',
      stateRoot: '.ste/state',
    };
  });

  describe('projectObligations', () => {
    it('should project obligations for modify intent', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      expect(result.resolvedIntent.type).toBe('modify');
      expect(result.resolvedIntent.targetKey).toBe('graph/function/authenticate');
      expect(result.impactedSlices.direct).toHaveLength(1);
      expect(result.impactedSlices.direct[0].key).toBe('graph/function/authenticate');
    });

    it('should extract declared obligations from validation metadata', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      // Should have declared test obligations
      const testObligations = result.requiredObligations.filter(
        o => o.type === 'test_coverage' && o.source === 'declared'
      );
      expect(testObligations.length).toBe(2);
      expect(testObligations[0].status).toBe('satisfied');

      // Should have declared invariant obligations
      const invariantObligations = result.requiredObligations.filter(
        o => o.type === 'invariant' && o.source === 'declared'
      );
      expect(invariantObligations.length).toBe(2);
    });

    it('should derive obligations from dependents', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      // Should have derived obligations for dependents
      const derivedObligations = result.requiredObligations.filter(
        o => o.source === 'derived' && o.type === 'derived_dependency'
      );
      expect(derivedObligations.length).toBeGreaterThan(0);
      
      // Derived obligations should reference the changed slice
      derivedObligations.forEach(o => {
        expect(o.derivedFrom?.originSlice.key).toBe('graph/function/authenticate');
      });
    });

    it('should identify impacted dependents', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      // Should identify login as a dependent
      const dependentKeys = result.impactedSlices.dependents.map(s => s.key);
      expect(dependentKeys).toContain('graph/function/login');
    });

    it('should identify impacted dependencies', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      // Should identify validate_token as a dependency
      const dependencyKeys = result.impactedSlices.dependencies.map(s => s.key);
      expect(dependencyKeys).toContain('graph/function/validate_token');
    });

    it('should invalidate validations for modify intent', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      // Modifying should invalidate existing test validations
      expect(result.invalidatedValidations.length).toBe(2);
      result.invalidatedValidations.forEach(v => {
        expect(v.reason).toBe('source_changed');
        expect(v.targetSlice.key).toBe('graph/function/authenticate');
      });
    });

    it('should add review obligation for delete intent', () => {
      const intent: ChangeIntent = {
        intentType: 'delete',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      // Should have a review obligation for deletion
      const reviewObligations = result.requiredObligations.filter(
        o => o.type === 'review' && o.description.includes('Deletion')
      );
      expect(reviewObligations.length).toBe(1);
    });

    it('should add review obligation for rename intent', () => {
      const intent: ChangeIntent = {
        intentType: 'rename',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      // Should have a review obligation for rename
      const reviewObligations = result.requiredObligations.filter(
        o => o.type === 'review' && o.description.includes('Rename')
      );
      expect(reviewObligations.length).toBe(1);
    });

    it('should generate advisory suggestions', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      expect(result.advisory.suggestedTests).toBeDefined();
      expect(result.advisory.reviewRecommendation).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(result.advisory.riskAssessment);
    });

    it('should return empty result for non-existent target', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'nonexistent/type/id',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      expect(result.impactedSlices.direct).toHaveLength(0);
      expect(result.requiredObligations).toHaveLength(0);
      expect(result.advisory.reviewRecommendation).toContain('not found');
    });

    it('should handle node without validation metadata', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/validate_token',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      // Should still have impacted slices
      expect(result.impactedSlices.direct).toHaveLength(1);
      
      // No declared obligations (no _validation metadata)
      const declaredObligations = result.requiredObligations.filter(
        o => o.source === 'declared'
      );
      expect(declaredObligations).toHaveLength(0);

      // But should still have derived obligations
      const derivedObligations = result.requiredObligations.filter(
        o => o.source === 'derived'
      );
      expect(derivedObligations.length).toBeGreaterThan(0);
    });

    it('should respect domain filtering', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { 
          depth: 2, 
          maxSlices: 100,
          includeDomains: ['graph'],
        },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent, undefined, {
        includeDomains: ['graph'],
      });

      // All slices should be in the graph domain
      result.impactedSlices.dependents.forEach(s => {
        expect(s.domain).toBe('graph');
      });
    });
  });

  describe('countObligations', () => {
    it('should count declared and derived obligations', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = countObligations(ctx, intent);

      expect(result.declared).toBeGreaterThan(0);
      expect(result.derived).toBeGreaterThan(0);
      expect(result.total).toBe(result.declared + result.derived);
    });

    it('should return zero for non-existent target', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'nonexistent/type/id',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = countObligations(ctx, intent);

      expect(result.total).toBe(0);
    });
  });

  describe('Risk Assessment', () => {
    it('should assess high risk for delete intent', () => {
      const intent: ChangeIntent = {
        intentType: 'delete',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      expect(result.advisory.riskAssessment).toBe('high');
    });

    it('should assess low risk for isolated node', () => {
      // Add an isolated node
      const isolatedNode: AidocNode = {
        key: 'graph/function/isolated',
        domain: 'graph',
        type: 'function',
        id: 'isolated',
        path: 'src/isolated.py',
        tags: [],
        sourceFiles: ['src/isolated.py'],
        references: [],
        referencedBy: [],
      };
      graph.set(isolatedNode.key, isolatedNode);

      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/isolated',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: false, maxStalenessSeconds: 0 },
      };

      const result = projectObligations(ctx, intent);

      expect(result.advisory.riskAssessment).toBe('low');
    });
  });
});


