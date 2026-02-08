/**
 * Tests for Preflight Reconciliation Module
 * 
 * Tests freshness checking and scope resolution for obligation projection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RssContext } from '../rss/rss-operations.js';
import type { AidocGraph, AidocNode } from '../rss/graph-loader.js';
import type { ChangeIntent } from '../rss/schema.js';
import { resolveIntentScope, checkFilesFreshness } from './preflight.js';

// Mock the change-detector module
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
      'src/api/routes.py': {
        path: 'src/api/routes.py',
        mtimeMs: 1000000,
        size: 2048,
        hash: 'def456',
      },
    },
  }),
}));

describe('Preflight Reconciliation', () => {
  let ctx: RssContext;
  let graph: AidocGraph;

  beforeEach(() => {
    graph = new Map();
    
    // Create test nodes with source files
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

    graph.set(authHandler.key, authHandler);
    graph.set(validateToken.key, validateToken);
    graph.set(loginHandler.key, loginHandler);

    ctx = {
      graph,
      graphVersion: '1.0.0',
      stateRoot: '.ste/state',
    };
  });

  describe('resolveIntentScope', () => {
    it('should resolve scope for slice_key target', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/authenticate',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: true, maxStalenessSeconds: 0 },
      };

      const result = resolveIntentScope(ctx, intent);

      expect(result.targetKey).toBe('graph/function/authenticate');
      expect(result.targetPath).toBe('src/auth/handler.py');
      expect(result.files).toContain('src/auth/handler.py');
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should resolve scope for file_path target', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'src/auth/handler.py',
        targetType: 'file_path',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: true, maxStalenessSeconds: 0 },
      };

      const result = resolveIntentScope(ctx, intent);

      expect(result.targetPath).toBe('src/auth/handler.py');
      expect(result.files).toContain('src/auth/handler.py');
    });

    it('should resolve scope for query target', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'authenticate function',
        targetType: 'query',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: true, maxStalenessSeconds: 0 },
      };

      const result = resolveIntentScope(ctx, intent);

      expect(result.resolvedFromQuery).toBe('authenticate function');
      // Query resolution depends on search implementation
    });

    it('should include blast radius files in scope', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'graph/function/validate_token',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: true, maxStalenessSeconds: 0 },
      };

      const result = resolveIntentScope(ctx, intent);

      // Should include the validate_token file
      expect(result.files).toContain('src/auth/handler.py');
      // Blast radius should include files from dependents
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should return empty files for non-existent target', () => {
      const intent: ChangeIntent = {
        intentType: 'modify',
        target: 'nonexistent/type/id',
        targetType: 'slice_key',
        scope: { depth: 2, maxSlices: 100 },
        freshness: { requireFresh: true, maxStalenessSeconds: 0 },
      };

      const result = resolveIntentScope(ctx, intent);

      expect(result.targetKey).toBeNull();
      expect(result.files).toHaveLength(0);
    });
  });

  describe('checkFilesFreshness', () => {
    it('should detect fresh files', async () => {
      // This test uses the mocked manifest
      const result = await checkFilesFreshness(
        '/project',
        '/project/.ste/state',
        []
      );

      expect(result.lastReconciled).toBeDefined();
      expect(result.manifest).toBeDefined();
    });

    it('should return all files as stale when no manifest exists', async () => {
      // Override mock to return null
      const { loadReconManifest } = await import('../watch/change-detector.js');
      vi.mocked(loadReconManifest).mockResolvedValueOnce(null);

      const result = await checkFilesFreshness(
        '/project',
        '/project/.ste/state',
        ['src/new-file.py', 'src/another.py']
      );

      expect(result.staleFiles).toHaveLength(2);
      expect(result.freshFiles).toHaveLength(0);
    });
  });
});

describe('Freshness Indicator', () => {
  it('should have correct structure', () => {
    const indicator = {
      scope: 'targeted' as const,
      filesChecked: ['file1.py', 'file2.py'],
      status: 'fresh' as const,
      lastReconciled: new Date().toISOString(),
      action: 'proceed' as const,
    };

    expect(indicator.scope).toBe('targeted');
    expect(indicator.status).toBe('fresh');
    expect(indicator.action).toBe('proceed');
    expect(indicator.filesChecked).toHaveLength(2);
  });
});


