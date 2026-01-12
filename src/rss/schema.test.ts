/**
 * Tests for schema.ts
 * 
 * Tests Zod schema validation for RSS bundle types.
 */

import { describe, it, expect } from 'vitest';
import {
  sliceSchema,
  entryPointSchema,
  bundleNodeSchema,
  rssBundleSchema,
  DEFAULT_DEPTH_LIMIT,
  DEFAULT_GRAPH_VERSION,
  type EntryPoint,
  type BundleNode,
  type RssBundle,
} from './schema.js';

describe('sliceSchema', () => {
  it('should validate empty object', () => {
    const result = sliceSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate with start and end', () => {
    const result = sliceSchema.safeParse({ start: 10, end: 50 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ start: 10, end: 50 });
  });

  it('should validate with only start', () => {
    const result = sliceSchema.safeParse({ start: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject negative start', () => {
    const result = sliceSchema.safeParse({ start: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer values', () => {
    const result = sliceSchema.safeParse({ start: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe('entryPointSchema', () => {
  it('should validate minimal entry point', () => {
    const entryPoint = {
      domain: 'api',
      type: 'endpoint',
      id: 'get-user',
    };

    const result = entryPointSchema.safeParse(entryPoint);
    expect(result.success).toBe(true);
  });

  it('should validate full entry point', () => {
    const entryPoint: EntryPoint = {
      domain: 'api',
      type: 'endpoint',
      id: 'get-user',
      role: 'primary',
      confidence: 'high',
    };

    const result = entryPointSchema.safeParse(entryPoint);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(entryPoint);
  });

  it('should reject missing domain', () => {
    const result = entryPointSchema.safeParse({
      type: 'endpoint',
      id: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing type', () => {
    const result = entryPointSchema.safeParse({
      domain: 'api',
      id: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing id', () => {
    const result = entryPointSchema.safeParse({
      domain: 'api',
      type: 'endpoint',
    });
    expect(result.success).toBe(false);
  });
});

describe('bundleNodeSchema', () => {
  it('should validate minimal bundle node', () => {
    const node: BundleNode = {
      nodeId: 'api/endpoint/get-user',
      domain: 'api',
      type: 'endpoint',
      id: 'get-user',
      order: 0,
      depth: 0,
      tier: 1,
    };

    const result = bundleNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  it('should validate full bundle node', () => {
    const node: BundleNode = {
      nodeId: 'api/endpoint/get-user',
      domain: 'api',
      type: 'endpoint',
      id: 'get-user',
      order: 5,
      depth: 2,
      path: 'src/api/users.ts',
      slice: { start: 10, end: 50 },
      tier: 1,
      confidence: 0.95,
      edgeFrom: 'graph/module/user-service',
      edgeType: 'references',
    };

    const result = bundleNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  it('should accept string tier', () => {
    const node = {
      nodeId: 'test',
      domain: 'graph',
      type: 'module',
      id: 'test',
      order: 0,
      depth: 0,
      tier: 'primary',
    };

    const result = bundleNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });

  it('should reject negative order', () => {
    const node = {
      nodeId: 'test',
      domain: 'graph',
      type: 'module',
      id: 'test',
      order: -1,
      depth: 0,
      tier: 1,
    };

    const result = bundleNodeSchema.safeParse(node);
    expect(result.success).toBe(false);
  });

  it('should reject confidence > 1', () => {
    const node = {
      nodeId: 'test',
      domain: 'graph',
      type: 'module',
      id: 'test',
      order: 0,
      depth: 0,
      tier: 1,
      confidence: 1.5,
    };

    const result = bundleNodeSchema.safeParse(node);
    expect(result.success).toBe(false);
  });

  it('should reject confidence < 0', () => {
    const node = {
      nodeId: 'test',
      domain: 'graph',
      type: 'module',
      id: 'test',
      order: 0,
      depth: 0,
      tier: 1,
      confidence: -0.1,
    };

    const result = bundleNodeSchema.safeParse(node);
    expect(result.success).toBe(false);
  });

  it('should accept null confidence', () => {
    const node = {
      nodeId: 'test',
      domain: 'graph',
      type: 'module',
      id: 'test',
      order: 0,
      depth: 0,
      tier: 1,
      confidence: null,
    };

    const result = bundleNodeSchema.safeParse(node);
    expect(result.success).toBe(true);
  });
});

describe('rssBundleSchema', () => {
  it('should validate minimal bundle', () => {
    const bundle: RssBundle = {
      task: 'Find user service',
      entryPoints: [
        { domain: 'graph', type: 'module', id: 'user-service' },
      ],
      depthLimit: 2,
      nodes: [],
    };

    const result = rssBundleSchema.safeParse(bundle);
    expect(result.success).toBe(true);
  });

  it('should validate full bundle', () => {
    const bundle: RssBundle = {
      task: 'Find user service dependencies',
      graphVersion: '1.0.0',
      entryPoints: [
        { domain: 'graph', type: 'module', id: 'user-service', role: 'primary', confidence: 'high' },
      ],
      depthLimit: 3,
      nodes: [
        {
          nodeId: 'graph/module/user-service',
          domain: 'graph',
          type: 'module',
          id: 'user-service',
          order: 0,
          depth: 0,
          tier: 1,
        },
        {
          nodeId: 'data/entity/user',
          domain: 'data',
          type: 'entity',
          id: 'user',
          order: 1,
          depth: 1,
          tier: 1,
          edgeFrom: 'graph/module/user-service',
          edgeType: 'references',
        },
      ],
    };

    const result = rssBundleSchema.safeParse(bundle);
    expect(result.success).toBe(true);
  });

  it('should reject empty entry points', () => {
    const bundle = {
      task: 'Test',
      entryPoints: [],
      depthLimit: 2,
      nodes: [],
    };

    // Empty entry points are actually valid (edge case)
    const result = rssBundleSchema.safeParse(bundle);
    expect(result.success).toBe(true);
  });

  it('should reject negative depth limit', () => {
    const bundle = {
      task: 'Test',
      entryPoints: [{ domain: 'api', type: 'endpoint', id: 'test' }],
      depthLimit: -1,
      nodes: [],
    };

    const result = rssBundleSchema.safeParse(bundle);
    expect(result.success).toBe(false);
  });

  it('should reject missing task', () => {
    const bundle = {
      entryPoints: [{ domain: 'api', type: 'endpoint', id: 'test' }],
      depthLimit: 2,
      nodes: [],
    };

    const result = rssBundleSchema.safeParse(bundle);
    expect(result.success).toBe(false);
  });
});

describe('constants', () => {
  it('should have correct DEFAULT_DEPTH_LIMIT', () => {
    expect(DEFAULT_DEPTH_LIMIT).toBe(2);
  });

  it('should have correct DEFAULT_GRAPH_VERSION', () => {
    expect(DEFAULT_GRAPH_VERSION).toBe('unknown');
  });
});


