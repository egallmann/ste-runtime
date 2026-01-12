/**
 * Tests for rss-operations.ts
 * 
 * Tests RSS query operations: lookup, dependencies, dependents, blastRadius, byTag, search, etc.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  initRssContext,
  lookup,
  lookupByKey,
  dependencies,
  dependents,
  blastRadius,
  byTag,
  search,
  findEntryPoints,
  assembleContext,
  getGraphStats,
  validateBidirectionalEdges,
  findOrphanedNodes,
  findAllBrokenEdges,
  validateGraphHealth,
  type RssContext,
  type BrokenEdge,
  type BidirectionalInconsistency,
} from './rss-operations.js';

let tempDir: string;
let ctx: RssContext;

async function writeYaml(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

async function setupTestGraph(): Promise<void> {
  // Create a simple test graph:
  // api/endpoint/get-users -> graph/module/user-service -> data/entity/user
  //                       \-> data/entity/user
  
  await writeYaml('api/endpoints/get-users.yaml', `
_slice:
  id: get-users
  domain: api
  type: endpoint
  source_files:
    - src/api/users.ts
  references:
    - domain: graph
      type: module
      id: user-service
    - domain: data
      type: entity
      id: user
  referenced_by: []
`);

  await writeYaml('graph/modules/user-service.yaml', `
_slice:
  id: user-service
  domain: graph
  type: module
  source_files:
    - src/services/user.service.ts
  references:
    - domain: data
      type: entity
      id: user
  referenced_by:
    - domain: api
      type: endpoint
      id: get-users
`);

  await writeYaml('data/entities/user.yaml', `
_slice:
  id: user
  domain: data
  type: entity
  source_files:
    - src/models/user.ts
  references: []
  referenced_by:
    - domain: graph
      type: module
      id: user-service
    - domain: api
      type: endpoint
      id: get-users
    - domain: api
      type: endpoint
      id: create-user
`);

  await writeYaml('api/endpoints/create-user.yaml', `
_slice:
  id: create-user
  domain: api
  type: endpoint
  source_files:
    - src/api/users.ts
  references:
    - domain: data
      type: entity
      id: user
  referenced_by: []
`);

  ctx = await initRssContext(tempDir);
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'rss-ops-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('initRssContext', () => {
  it('should initialize context with empty graph', async () => {
    ctx = await initRssContext(tempDir);

    expect(ctx.graph.size).toBe(0);
    expect(ctx.stateRoot).toBe(path.resolve(tempDir));
  });

  it('should load graph from state directory', async () => {
    await setupTestGraph();

    expect(ctx.graph.size).toBe(4);
  });
});

describe('lookup', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should find node by domain and id', () => {
    const node = lookup(ctx, 'data', 'user');

    expect(node).toBeDefined();
    expect(node?.id).toBe('user');
    expect(node?.domain).toBe('data');
  });

  it('should return null for non-existent node', () => {
    const node = lookup(ctx, 'data', 'non-existent');

    expect(node).toBeNull();
  });
});

describe('lookupByKey', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should find node by full key', () => {
    const node = lookupByKey(ctx, 'data/entity/user');

    expect(node).toBeDefined();
    expect(node?.id).toBe('user');
  });

  it('should return null for invalid key', () => {
    const node = lookupByKey(ctx, 'invalid/key/here');

    expect(node).toBeNull();
  });
});

describe('dependencies', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should traverse forward references', () => {
    const result = dependencies(ctx, 'api/endpoint/get-users', 2);

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
    
    // Should include user-service and user entity
    const ids = result.nodes.map(n => n.id);
    expect(ids).toContain('user-service');
    expect(ids).toContain('user');
  });

  it('should respect depth limit', () => {
    const result = dependencies(ctx, 'api/endpoint/get-users', 1);

    // At depth 1, should only get direct references
    const ids = result.nodes.map(n => n.id);
    expect(ids).toContain('user-service');
    expect(ids).toContain('user');
  });

  it('should not include start node in results', () => {
    const result = dependencies(ctx, 'api/endpoint/get-users', 2);

    const ids = result.nodes.map(n => n.id);
    expect(ids).not.toContain('get-users');
  });

  it('should respect max nodes limit', () => {
    const result = dependencies(ctx, 'api/endpoint/get-users', 10, 1);

    expect(result.nodes.length).toBeLessThanOrEqual(1);
    expect(result.truncated).toBe(true);
  });
});

describe('dependents', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should traverse backward references', () => {
    const result = dependents(ctx, 'data/entity/user', 2);

    expect(result.nodes.length).toBeGreaterThan(0);
    
    // Should include nodes that reference user
    const ids = result.nodes.map(n => n.id);
    expect(ids).toContain('user-service');
    expect(ids).toContain('get-users');
  });

  it('should not include start node', () => {
    const result = dependents(ctx, 'data/entity/user', 2);

    const ids = result.nodes.map(n => n.id);
    expect(ids).not.toContain('user');
  });
});

describe('blastRadius', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should traverse both directions', () => {
    const result = blastRadius(ctx, 'graph/module/user-service', 2);

    expect(result.nodes.length).toBeGreaterThan(0);
    
    // Should include both forward (user entity) and backward (get-users) references
    const ids = result.nodes.map(n => n.id);
    expect(ids).toContain('user');
    expect(ids).toContain('get-users');
  });

  it('should not include start node', () => {
    const result = blastRadius(ctx, 'graph/module/user-service', 2);

    const ids = result.nodes.map(n => n.id);
    expect(ids).not.toContain('user-service');
  });

  it('should handle isolated nodes', async () => {
    await writeYaml('graph/modules/isolated.yaml', `
_slice:
  id: isolated
  domain: graph
  type: module
  source_files:
    - isolated.ts
  references: []
  referenced_by: []
`);
    ctx = await initRssContext(tempDir);

    const result = blastRadius(ctx, 'graph/module/isolated', 2);

    expect(result.nodes).toHaveLength(0);
  });
});

describe('byTag', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should find nodes matching lang:python pattern', async () => {
    await writeYaml('graph/modules/python-module.yaml', `
_slice:
  id: python-module
  domain: graph
  type: module
  source_files:
    - src/module.py
  references: []
  referenced_by: []
`);
    ctx = await initRssContext(tempDir);

    const result = byTag(ctx, 'lang:python');

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes[0].path).toContain('.py');
  });

  it('should return empty for no matches', () => {
    const result = byTag(ctx, 'nonexistent:tag');

    expect(result.nodes).toHaveLength(0);
  });
});

describe('search', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should find nodes by exact ID match', () => {
    const result = search(ctx, 'user');

    expect(result.nodes.length).toBeGreaterThan(0);
    
    // Exact match should be first (highest score)
    expect(result.nodes[0].id).toBe('user');
  });

  it('should find nodes by partial ID match', () => {
    const result = search(ctx, 'service');

    expect(result.nodes.length).toBeGreaterThan(0);
    const ids = result.nodes.map(n => n.id);
    expect(ids).toContain('user-service');
  });

  it('should filter by domain', () => {
    const result = search(ctx, 'user', { domain: 'data' });

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes.every(n => n.domain === 'data')).toBe(true);
  });

  it('should filter by type', () => {
    const result = search(ctx, 'user', { type: 'endpoint' });

    // Should find get-users and create-user endpoints
    expect(result.nodes.every(n => n.type === 'endpoint')).toBe(true);
  });

  it('should respect maxResults', () => {
    const result = search(ctx, 'user', { maxResults: 1 });

    expect(result.nodes.length).toBeLessThanOrEqual(1);
  });

  it('should return empty for no matches', () => {
    const result = search(ctx, 'xyznonexistent');

    expect(result.nodes).toHaveLength(0);
  });
});

describe('findEntryPoints', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should extract search terms from natural language', () => {
    const result = findEntryPoints(ctx, 'Find the user service that handles authentication');

    expect(result.searchTerms).toContain('user');
    expect(result.searchTerms).toContain('service');
    expect(result.searchTerms).toContain('authentication');
  });

  it('should find entry points matching query', () => {
    const result = findEntryPoints(ctx, 'user service');

    expect(result.entryPoints.length).toBeGreaterThan(0);
    const ids = result.entryPoints.map(ep => ep.id);
    expect(ids).toContain('user-service');
  });

  it('should filter out stop words', () => {
    const result = findEntryPoints(ctx, 'the user service is what I need');

    // Should not contain stop words
    expect(result.searchTerms).not.toContain('the');
    expect(result.searchTerms).not.toContain('is');
    expect(result.searchTerms).not.toContain('what');
  });

  it('should respect maxEntryPoints', () => {
    const result = findEntryPoints(ctx, 'user', 1);

    expect(result.entryPoints.length).toBeLessThanOrEqual(1);
  });
});

describe('assembleContext', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should assemble context from entry points', () => {
    const userService = lookupByKey(ctx, 'graph/module/user-service')!;
    const result = assembleContext(ctx, [userService]);

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.summary.entryPointCount).toBe(1);
    expect(result.summary.totalNodes).toBeGreaterThan(0);
  });

  it('should include entry point in results', () => {
    const userService = lookupByKey(ctx, 'graph/module/user-service')!;
    const result = assembleContext(ctx, [userService]);

    const ids = result.nodes.map(n => n.id);
    expect(ids).toContain('user-service');
  });

  it('should expand via blast radius', () => {
    const userService = lookupByKey(ctx, 'graph/module/user-service')!;
    const result = assembleContext(ctx, [userService], { maxDepth: 2 });

    const ids = result.nodes.map(n => n.id);
    expect(ids).toContain('user'); // Forward reference
    expect(ids).toContain('get-users'); // Backward reference
  });

  it('should track nodes by domain', () => {
    const userService = lookupByKey(ctx, 'graph/module/user-service')!;
    const result = assembleContext(ctx, [userService]);

    expect(result.summary.byDomain).toHaveProperty('graph');
  });

  it('should respect maxNodes limit', () => {
    const userService = lookupByKey(ctx, 'graph/module/user-service')!;
    const result = assembleContext(ctx, [userService], { maxNodes: 2 });

    expect(result.nodes.length).toBeLessThanOrEqual(2);
  });
});

describe('getGraphStats', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should return accurate node count', () => {
    const stats = getGraphStats(ctx);

    expect(stats.totalNodes).toBe(4);
  });

  it('should count nodes by domain', () => {
    const stats = getGraphStats(ctx);

    expect(stats.byDomain.api).toBe(2); // get-users, create-user
    expect(stats.byDomain.graph).toBe(1); // user-service
    expect(stats.byDomain.data).toBe(1); // user
  });

  it('should count nodes by type', () => {
    const stats = getGraphStats(ctx);

    expect(stats.byType.endpoint).toBe(2);
    expect(stats.byType.module).toBe(1);
    expect(stats.byType.entity).toBe(1);
  });

  it('should count total edges', () => {
    const stats = getGraphStats(ctx);

    // get-users: 2 refs, create-user: 1 ref, user-service: 1 ref, user: 0 refs
    expect(stats.totalEdges).toBe(4);
  });
});

describe('brokenEdges tracking', () => {
  beforeEach(async () => {
    // Create a graph with broken edges
    await writeYaml('graph/modules/broken-refs.yaml', `
_slice:
  id: broken-refs
  domain: graph
  type: module
  source_files:
    - src/broken.ts
  references:
    - domain: data
      type: entity
      id: nonexistent-entity
    - domain: api
      type: endpoint
      id: valid-endpoint
  referenced_by: []
`);

    await writeYaml('api/endpoints/valid-endpoint.yaml', `
_slice:
  id: valid-endpoint
  domain: api
  type: endpoint
  source_files:
    - src/api.ts
  references: []
  referenced_by:
    - domain: graph
      type: module
      id: broken-refs
`);

    ctx = await initRssContext(tempDir);
  });

  it('should track broken edges during dependencies traversal', () => {
    const result = dependencies(ctx, 'graph/module/broken-refs', 2);

    expect(result.brokenEdges.length).toBeGreaterThan(0);
    expect(result.brokenEdges[0].toKey).toBe('data/entity/nonexistent-entity');
    expect(result.brokenEdges[0].edgeType).toBe('references');
  });

  it('should include valid nodes in results even with broken edges', () => {
    const result = dependencies(ctx, 'graph/module/broken-refs', 2);

    // Should still include the valid endpoint
    const ids = result.nodes.map(n => n.id);
    expect(ids).toContain('valid-endpoint');
  });

  it('should track broken edges in blastRadius', () => {
    const result = blastRadius(ctx, 'graph/module/broken-refs', 2);

    expect(result.brokenEdges.length).toBeGreaterThan(0);
  });

  it('should return empty brokenEdges for clean traversal', async () => {
    await setupTestGraph();

    const result = dependencies(ctx, 'api/endpoint/get-users', 2);

    expect(result.brokenEdges).toEqual([]);
  });
});

describe('validateBidirectionalEdges', () => {
  it('should detect missing backward reference', async () => {
    // A references B, but B doesn't have A in referenced_by
    await writeYaml('graph/modules/source.yaml', `
_slice:
  id: source
  domain: graph
  type: module
  source_files:
    - src/source.ts
  references:
    - domain: data
      type: entity
      id: target
  referenced_by: []
`);

    await writeYaml('data/entities/target.yaml', `
_slice:
  id: target
  domain: data
  type: entity
  source_files:
    - src/target.ts
  references: []
  referenced_by: []
`);

    ctx = await initRssContext(tempDir);
    const inconsistencies = validateBidirectionalEdges(ctx);

    expect(inconsistencies.length).toBeGreaterThan(0);
    expect(inconsistencies[0].missing).toBe('backward');
  });

  it('should detect missing forward reference', async () => {
    // B claims A references it, but A doesn't actually reference B
    await writeYaml('graph/modules/claimed-source.yaml', `
_slice:
  id: claimed-source
  domain: graph
  type: module
  source_files:
    - src/source.ts
  references: []
  referenced_by: []
`);

    await writeYaml('data/entities/claims-reference.yaml', `
_slice:
  id: claims-reference
  domain: data
  type: entity
  source_files:
    - src/target.ts
  references: []
  referenced_by:
    - domain: graph
      type: module
      id: claimed-source
`);

    ctx = await initRssContext(tempDir);
    const inconsistencies = validateBidirectionalEdges(ctx);

    expect(inconsistencies.length).toBeGreaterThan(0);
    expect(inconsistencies[0].missing).toBe('forward');
  });

  it('should return empty for consistent graph', async () => {
    await setupTestGraph();

    const inconsistencies = validateBidirectionalEdges(ctx);

    expect(inconsistencies).toEqual([]);
  });
});

describe('findOrphanedNodes', () => {
  beforeEach(async () => {
    await setupTestGraph();
  });

  it('should find nodes with no references', async () => {
    await writeYaml('graph/modules/orphan.yaml', `
_slice:
  id: orphan
  domain: graph
  type: module
  source_files:
    - src/orphan.ts
  references: []
  referenced_by: []
`);
    ctx = await initRssContext(tempDir);

    const orphans = findOrphanedNodes(ctx);

    expect(orphans.length).toBeGreaterThan(0);
    const ids = orphans.map(n => n.id);
    expect(ids).toContain('orphan');
  });

  it('should not include connected nodes', async () => {
    const orphans = findOrphanedNodes(ctx);

    const ids = orphans.map(n => n.id);
    expect(ids).not.toContain('user-service');
    expect(ids).not.toContain('user');
    expect(ids).not.toContain('get-users');
  });
});

describe('findAllBrokenEdges', () => {
  it('should find all broken edges in graph', async () => {
    await writeYaml('graph/modules/broken1.yaml', `
_slice:
  id: broken1
  domain: graph
  type: module
  source_files:
    - src/broken1.ts
  references:
    - domain: data
      type: entity
      id: missing1
  referenced_by: []
`);

    await writeYaml('graph/modules/broken2.yaml', `
_slice:
  id: broken2
  domain: graph
  type: module
  source_files:
    - src/broken2.ts
  references: []
  referenced_by:
    - domain: api
      type: endpoint
      id: missing2
`);

    ctx = await initRssContext(tempDir);
    const brokenEdges = findAllBrokenEdges(ctx);

    expect(brokenEdges.length).toBe(2);
    const toKeys = brokenEdges.map(e => e.toKey);
    expect(toKeys).toContain('data/entity/missing1');
    expect(toKeys).toContain('api/endpoint/missing2');
  });

  it('should return empty for clean graph', async () => {
    await setupTestGraph();

    const brokenEdges = findAllBrokenEdges(ctx);

    expect(brokenEdges).toEqual([]);
  });
});

describe('validateGraphHealth', () => {
  it('should return healthy status for clean graph', async () => {
    await setupTestGraph();

    const health = validateGraphHealth(ctx);

    expect(health.summary.isHealthy).toBe(true);
    expect(health.summary.brokenEdgeCount).toBe(0);
    expect(health.summary.inconsistencyCount).toBe(0);
  });

  it('should detect all issues in unhealthy graph', async () => {
    // Create graph with multiple issues
    await writeYaml('graph/modules/unhealthy.yaml', `
_slice:
  id: unhealthy
  domain: graph
  type: module
  source_files:
    - src/unhealthy.ts
  references:
    - domain: data
      type: entity
      id: missing
  referenced_by: []
`);

    await writeYaml('graph/modules/orphan.yaml', `
_slice:
  id: orphan
  domain: graph
  type: module
  source_files:
    - src/orphan.ts
  references: []
  referenced_by: []
`);

    ctx = await initRssContext(tempDir);
    const health = validateGraphHealth(ctx);

    expect(health.summary.isHealthy).toBe(false);
    expect(health.summary.brokenEdgeCount).toBeGreaterThan(0);
    expect(health.summary.orphanCount).toBeGreaterThan(0);
  });

  it('should provide complete summary stats', async () => {
    await setupTestGraph();

    const health = validateGraphHealth(ctx);

    expect(health.summary.totalNodes).toBe(4);
    expect(health.summary.totalEdges).toBe(4);
  });
});

describe('byTag with actual tags', () => {
  it('should find nodes by explicit tags', async () => {
    await writeYaml('graph/modules/tagged-lambda.yaml', `
_slice:
  id: tagged-lambda
  domain: graph
  type: function
  source_files:
    - src/lambda.py
  references: []
  referenced_by: []
  tags:
    - handler:lambda
    - aws:lambda
`);

    ctx = await initRssContext(tempDir);
    const result = byTag(ctx, 'handler:lambda');

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.nodes[0].id).toBe('tagged-lambda');
  });

  it('should be case-insensitive for tag matching', async () => {
    await writeYaml('graph/modules/case-tagged.yaml', `
_slice:
  id: case-tagged
  domain: graph
  type: module
  source_files:
    - src/module.ts
  references: []
  referenced_by: []
  tags:
    - Layer:API
`);

    ctx = await initRssContext(tempDir);
    const result = byTag(ctx, 'layer:api');

    expect(result.nodes.length).toBeGreaterThan(0);
  });

  it('should include brokenEdges as empty array', async () => {
    await setupTestGraph();
    
    const result = byTag(ctx, 'lang:typescript');

    expect(result.brokenEdges).toEqual([]);
  });
});


