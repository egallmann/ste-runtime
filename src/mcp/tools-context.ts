/**
 * MCP Tools - Context Assembly (Layer 2)
 * 
 * Rich context with source code, following Cody AI's ranking phase pattern.
 * Per E-ADR-011: Context Assembly operations that combine graph metadata with source code.
 */

import type { RssContext } from '../rss/rss-operations.js';
import {
  findEntryPoints,
  assembleContext,
  blastRadius,
  dependencies,
  lookupByKey,
} from '../rss/rss-operations.js';
import {
  loadSourceForSlices,
  formatSourceForLLM,
  type LoadSourceOptions,
} from './context-source-loader.js';

/**
 * Options passed from MCP server for source loading
 */
export interface ContextToolOptions {
  /** Project root for resolving source file paths */
  projectRoot?: string;
}

/**
 * Tool: assemble_context
 * 
 * Main context assembly function for LLM reasoning (CEM Stage 2→3).
 * Strategy:
 * 1. Query RSS for relevant keys (fast, structural)
 * 2. Load source code for those keys only (targeted I/O)
 * 3. Format for LLM consumption
 */
export async function assembleContextTool(
  ctx: RssContext,
  args: {
    query: string;
    includeSource?: boolean;
    includeInvariants?: boolean;
    depth?: number;
    maxNodes?: number;
    maxSourceLines?: number;
  },
  options: ContextToolOptions = {}
) {
  const {
    query,
    includeSource = true,
    includeInvariants = true,
    depth = 2,
    maxNodes = 50,
    maxSourceLines = 100,
  } = args;
  
  // Phase 1: Find entry points (fast graph query)
  const { entryPoints, searchTerms } = findEntryPoints(ctx, query, 10);
  
  if (entryPoints.length === 0) {
    return {
      query,
      entryPoints: [],
      nodes: [],
      sourceContexts: [],
      summary: {
        entryPointCount: 0,
        totalNodes: 0,
        filesInScope: 0,
        searchTerms,
      },
    };
  }
  
  // Phase 2: Assemble context via graph traversal
  const context = assembleContext(ctx, entryPoints, {
    maxDepth: depth,
    maxNodes,
  });
  
  // Phase 3: Load source code for relevant slices (if requested)
  let sourceContexts: any[] = [];
  let formattedSource = '';
  
  if (includeSource) {
    const loadOptions: LoadSourceOptions = {
      maxLines: maxSourceLines,
      projectRoot: options.projectRoot,
    };
    
    sourceContexts = await loadSourceForSlices(context.nodes, loadOptions);
    formattedSource = formatSourceForLLM(sourceContexts, {
      includeLineNumbers: true,
      includeFilePath: true,
    });
  }
  
  // Extract unique file paths
  const filesInScope = new Set<string>();
  for (const node of context.nodes) {
    for (const file of node.sourceFiles) {
      filesInScope.add(file);
    }
  }
  
  return {
    query,
    entryPoints: entryPoints.map(ep => ({
      key: ep.key,
      domain: ep.domain,
      type: ep.type,
      id: ep.id,
      path: ep.path,
      lineRange: ep.slice ? { start: ep.slice.start, end: ep.slice.end } : undefined,
    })),
    nodes: context.nodes.map(node => ({
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
    })),
    sourceContexts: sourceContexts.map(sc => ({
      key: sc.key,
      filePath: sc.filePath,
      lineRange: sc.lineRange,
      truncated: sc.truncated,
    })),
    formattedSource,
    summary: {
      entryPointCount: entryPoints.length,
      totalNodes: context.nodes.length,
      filesInScope: filesInScope.size,
      searchTerms,
      byDomain: context.summary.byDomain,
    },
  };
}

/**
 * Tool: get_implementation_context
 * 
 * Get full implementation context for a specific component.
 * Returns the component + its dependencies with source code.
 */
export async function getImplementationContext(
  ctx: RssContext,
  args: {
    key: string;
    includeSource?: boolean;
    includeDependencies?: boolean;
    depth?: number;
    maxSourceLines?: number;
  },
  options: ContextToolOptions = {}
) {
  const {
    key,
    includeSource = true,
    includeDependencies = true,
    depth = 1,
    maxSourceLines = 100,
  } = args;
  
  // Get the target node
  const targetNode = lookupByKey(ctx, key);
  
  if (!targetNode) {
    return {
      found: false,
      key,
    };
  }
  
  // Collect nodes to load
  const nodesToLoad = [targetNode];
  
  // Include dependencies if requested
  if (includeDependencies) {
    const deps = dependencies(ctx, key, depth, 50);
    nodesToLoad.push(...deps.nodes);
  }
  
  // Load source code if requested
  let sourceContexts: any[] = [];
  let formattedSource = '';
  
  if (includeSource) {
    const loadOptions: LoadSourceOptions = {
      maxLines: maxSourceLines,
      projectRoot: options.projectRoot,
    };
    
    sourceContexts = await loadSourceForSlices(nodesToLoad, loadOptions);
    formattedSource = formatSourceForLLM(sourceContexts, {
      includeLineNumbers: true,
      includeFilePath: true,
    });
  }
  
  return {
    found: true,
    target: {
      key: targetNode.key,
      domain: targetNode.domain,
      type: targetNode.type,
      id: targetNode.id,
      path: targetNode.path,
      tags: targetNode.tags,
      lineRange: targetNode.slice ? { start: targetNode.slice.start, end: targetNode.slice.end } : undefined,
      element: targetNode.element,
    },
    dependencies: nodesToLoad.slice(1).map(node => ({
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
    })),
    sourceContexts: sourceContexts.map(sc => ({
      key: sc.key,
      filePath: sc.filePath,
      lineRange: sc.lineRange,
      truncated: sc.truncated,
    })),
    formattedSource,
  };
}

/**
 * Tool: get_related_implementations
 * 
 * Find similar code patterns in the codebase.
 * Uses blast radius to find connected components, then loads their source.
 */
export async function getRelatedImplementations(
  ctx: RssContext,
  args: {
    key: string;
    includeSource?: boolean;
    maxResults?: number;
    maxSourceLines?: number;
  },
  options: ContextToolOptions = {}
) {
  const {
    key,
    includeSource = true,
    maxResults = 10,
    maxSourceLines = 100,
  } = args;
  
  // Get the target node
  const targetNode = lookupByKey(ctx, key);
  
  if (!targetNode) {
    return {
      found: false,
      key,
    };
  }
  
  // Find related nodes via blast radius
  const blast = blastRadius(ctx, key, 2, maxResults);
  
  // Filter to nodes of similar type (same domain/type)
  const relatedNodes = blast.nodes.filter(
    node => node.domain === targetNode.domain && node.type === targetNode.type
  );
  
  // Load source code if requested
  let sourceContexts: any[] = [];
  let formattedSource = '';
  
  if (includeSource && relatedNodes.length > 0) {
    const loadOptions: LoadSourceOptions = {
      maxLines: maxSourceLines,
      projectRoot: options.projectRoot,
    };
    
    sourceContexts = await loadSourceForSlices(relatedNodes, loadOptions);
    formattedSource = formatSourceForLLM(sourceContexts, {
      includeLineNumbers: true,
      includeFilePath: true,
    });
  }
  
  return {
    found: true,
    target: {
      key: targetNode.key,
      domain: targetNode.domain,
      type: targetNode.type,
      id: targetNode.id,
      lineRange: targetNode.slice ? { start: targetNode.slice.start, end: targetNode.slice.end } : undefined,
    },
    relatedNodes: relatedNodes.map(node => ({
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      lineRange: node.slice ? { start: node.slice.start, end: node.slice.end } : undefined,
    })),
    sourceContexts: sourceContexts.map(sc => ({
      key: sc.key,
      filePath: sc.filePath,
      lineRange: sc.lineRange,
      truncated: sc.truncated,
    })),
    formattedSource,
    totalFound: relatedNodes.length,
  };
}



