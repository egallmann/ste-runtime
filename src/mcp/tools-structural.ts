/**
 * MCP Tools - Structural Queries (Layer 1)
 * 
 * Fast graph operations following Cody AI's retrieval phase pattern.
 * Per E-ADR-011: RSS Pure Semantic Graph operations (<100ms, metadata only)
 */

import {
  type RssContext,
  search,
  lookupByKey,
  lookup,
  dependencies,
  dependents,
  blastRadius,
  byTag,
  getGraphStats,
  type SearchOptions,
} from '../rss/rss-operations.js';

/**
 * Tool: search_semantic_graph
 * 
 * Search the semantic graph for components, functions, entities.
 * This is the entry point discovery mechanism.
 */
export async function searchSemanticGraph(
  ctx: RssContext,
  args: {
    query: string;
    maxResults?: number;
    domain?: string;
    type?: string;
  }
) {
  const { query, maxResults = 50, domain, type } = args;
  
  const options: SearchOptions = {
    maxResults,
    domain,
    type,
  };
  
  const result = search(ctx, query, options);
  
  return {
    nodes: result.nodes.map(node => ({
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      sourceFiles: node.sourceFiles,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
      description: node.element?.description,
    })),
    truncated: result.truncated,
    totalFound: result.nodes.length,
  };
}

/**
 * Tool: get_dependencies
 * 
 * Find what a component depends on (forward traversal).
 * Answers: "What does this component need?"
 */
export async function getDependencies(
  ctx: RssContext,
  args: {
    key: string;
    depth?: number;
    maxNodes?: number;
  }
) {
  const { key, depth = 2, maxNodes = 100 } = args;
  
  const result = dependencies(ctx, key, depth, maxNodes);
  
  return {
    startKey: key,
    dependencies: result.nodes.map(node => ({
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
    })),
    depth,
    truncated: result.truncated,
    brokenEdges: result.brokenEdges,
  };
}

/**
 * Tool: get_dependents
 * 
 * Find what depends on this component (backward traversal).
 * Answers: "What uses this component?"
 */
export async function getDependents(
  ctx: RssContext,
  args: {
    key: string;
    depth?: number;
    maxNodes?: number;
  }
) {
  const { key, depth = 2, maxNodes = 100 } = args;
  
  const result = dependents(ctx, key, depth, maxNodes);
  
  return {
    startKey: key,
    dependents: result.nodes.map(node => ({
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
    })),
    depth,
    truncated: result.truncated,
    brokenEdges: result.brokenEdges,
  };
}

/**
 * Tool: get_blast_radius
 * 
 * Analyze full impact surface of changing this component.
 * Bidirectional traversal (both dependencies and dependents).
 */
export async function getBlastRadius(
  ctx: RssContext,
  args: {
    key: string;
    depth?: number;
    maxNodes?: number;
  }
) {
  const { key, depth = 2, maxNodes = 100 } = args;
  
  const result = blastRadius(ctx, key, depth, maxNodes);
  
  return {
    startKey: key,
    impactedNodes: result.nodes.map(node => ({
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
    })),
    depth,
    truncated: result.truncated,
    totalImpacted: result.nodes.length,
    brokenEdges: result.brokenEdges,
  };
}

/**
 * Tool: lookup_by_key
 * 
 * Direct retrieval of component by full key (domain/type/id).
 */
export async function lookupByKeyTool(
  ctx: RssContext,
  args: {
    key: string;
  }
) {
  const { key } = args;
  
  const node = lookupByKey(ctx, key);
  
  if (!node) {
    return {
      found: false,
      key,
    };
  }
  
  return {
    found: true,
    node: {
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      sourceFiles: node.sourceFiles,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
      references: node.references,
      referencedBy: node.referencedBy,
      element: node.element,
    },
  };
}

/**
 * Tool: lookup
 * 
 * Direct retrieval of component by domain and id.
 */
export async function lookupTool(
  ctx: RssContext,
  args: {
    domain: string;
    id: string;
  }
) {
  const { domain, id } = args;
  
  const node = lookup(ctx, domain, id);
  
  if (!node) {
    return {
      found: false,
      domain,
      id,
    };
  }
  
  return {
    found: true,
    node: {
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      sourceFiles: node.sourceFiles,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
      references: node.references,
      referencedBy: node.referencedBy,
      element: node.element,
    },
  };
}

/**
 * Tool: by_tag
 * 
 * Find all components with a specific tag.
 * Enables cross-cutting queries like "all lambda handlers" or "all DynamoDB tables".
 */
export async function byTagTool(
  ctx: RssContext,
  args: {
    tag: string;
    maxResults?: number;
  }
) {
  const { tag, maxResults = 50 } = args;
  
  const result = byTag(ctx, tag, maxResults);
  
  return {
    tag,
    nodes: result.nodes.map(node => ({
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
    })),
    truncated: result.truncated,
    totalFound: result.nodes.length,
  };
}

/**
 * Tool: get_graph_stats
 * 
 * Get statistics about the semantic graph.
 * 
 * Note on node counts: totalNodes represents the in-memory graph nodes loaded
 * from YAML slice files. The slice file count may differ because:
 * - Each slice file becomes one or more graph nodes
 * - Some slice types expand into multiple relationship nodes
 * - Inferred relationships may create additional edges but not nodes
 */
export async function getGraphStatsTool(ctx: RssContext) {
  const stats = getGraphStats(ctx);
  
  return {
    totalNodes: stats.totalNodes,
    byDomain: stats.byDomain,
    byType: stats.byType,
    totalEdges: stats.totalEdges,
    graphVersion: ctx.graphVersion,
    note: 'totalNodes reflects in-memory graph size. RECON slice file count may differ due to node expansion.',
  };
}



