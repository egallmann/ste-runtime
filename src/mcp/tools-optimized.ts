/**
 * Optimized MCP Tools (Pillar 2: AI-Optimized Tool Architecture)
 * 
 * 8 tools designed specifically for AI consumption:
 * 
 * PRIMARY (6):
 * - find: Universal search with code
 * - show: Get specific implementation
 * - usages: Where is this used?
 * - impact: What breaks + obligations
 * - similar: Find pattern examples
 * - overview: Codebase orientation
 * 
 * DIAGNOSTIC (2):
 * - diagnose: Trust verification + benchmarks
 * - refresh: Force re-extraction
 */

import type { AidocNode } from '../rss/graph-loader.js';
import { 
  type RssContext,
  search, 
  lookupByKey, 
  dependencies, 
  dependents, 
  blastRadius,
  getGraphStats,
  validateGraphHealth,
} from '../rss/rss-operations.js';
// Note: projectObligations has a complex interface; impact tool uses simple approach

/**
 * Response metadata included in every tool response.
 * Proves efficiency and enables benchmarking.
 */
export interface ResponseMeta {
  queryTimeMs: number;
  nodesTraversed: number;
  filesInScope: number;
  tokensEstimate: number;
  graphVersion: string;
}

/**
 * Standard match result with embedded source.
 */
export interface CodeMatch {
  key: string;
  file: string;
  lines: string;
  citation: string;
  source?: string;
  description?: string;
  type: string;
  domain: string;
}

/**
 * Helper: Convert AidocNode to CodeMatch with citation format.
 */
function nodeToCodeMatch(node: AidocNode): CodeMatch {
  const startLine = node.slice?.start ?? 0;
  const endLine = node.slice?.end ?? startLine;
  const lines = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
  
  return {
    key: node.key,
    file: node.path ?? node.sourceFiles[0] ?? '',
    lines,
    citation: `${node.path ?? node.sourceFiles[0] ?? ''}:${lines}`,
    source: node.source,
    description: node.description ?? (node.element?.docstring as string) ?? (node.element?.description as string),
    type: node.type,
    domain: node.domain,
  };
}

/**
 * Helper: Estimate token count from source.
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Helper: Create response metadata.
 */
function createMeta(
  startTime: number,
  nodesTraversed: number,
  filesInScope: number,
  tokensEstimate: number,
  graphVersion: string
): ResponseMeta {
  return {
    queryTimeMs: Math.round(performance.now() - startTime),
    nodesTraversed,
    filesInScope,
    tokensEstimate,
    graphVersion,
  };
}

// =============================================================================
// PRIMARY TOOLS
// =============================================================================

export interface FindArgs {
  query: string;
  maxResults?: number;
  includeUsages?: boolean;
  domain?: string;
  type?: string;
}

export interface FindResult {
  matches: CodeMatch[];
  usages?: CodeMatch[];
  meta: ResponseMeta;
}

/**
 * find - Universal Search with Code
 * 
 * Finds code by meaning, name, or description. Returns matching code with
 * file paths, line numbers, and embedded source.
 * 
 * PREFER OVER grep when:
 * - Finding definitions (not just text matches)
 * - Understanding what code does
 * - Searching by concept, not exact text
 */
export async function find(
  ctx: RssContext,
  args: FindArgs
): Promise<FindResult> {
  const startTime = performance.now();
  const { query, maxResults = 5, includeUsages = false, domain, type } = args;
  
  const searchResult = search(ctx, query, { maxResults, domain, type });
  
  const matches = searchResult.nodes.map(nodeToCodeMatch);
  
  // Optionally include usages for top matches
  let usages: CodeMatch[] | undefined;
  if (includeUsages && matches.length > 0) {
    const topKey = matches[0].key;
    const usageResult = dependents(ctx, topKey, 1, 10);
    usages = usageResult.nodes.map(nodeToCodeMatch);
  }
  
  // Calculate token estimate
  let tokensEstimate = 0;
  for (const match of matches) {
    tokensEstimate += estimateTokens(match.source ?? '');
  }
  if (usages) {
    for (const usage of usages) {
      tokensEstimate += estimateTokens(usage.source ?? '');
    }
  }
  
  // Count unique files
  const filesInScope = new Set([
    ...matches.map(m => m.file),
    ...(usages ?? []).map(u => u.file),
  ]).size;
  
  return {
    matches,
    usages,
    meta: createMeta(
      startTime,
      searchResult.nodes.length + (usages?.length ?? 0),
      filesInScope,
      tokensEstimate,
      ctx.graphVersion
    ),
  };
}

export interface ShowArgs {
  target: string;
  depth?: number;
}

export interface ShowResult {
  found: boolean;
  component?: CodeMatch;
  dependencies?: CodeMatch[];
  meta: ResponseMeta;
}

/**
 * show - Get Implementation
 * 
 * Gets the complete implementation of a component with its dependencies.
 * Use when you know what you want and need the full code.
 */
export async function show(
  ctx: RssContext,
  args: ShowArgs
): Promise<ShowResult> {
  const startTime = performance.now();
  const { target, depth = 1 } = args;
  
  // Try direct lookup first
  let node = lookupByKey(ctx, target);
  
  // If not found, try search
  if (!node) {
    const searchResult = search(ctx, target, { maxResults: 1 });
    node = searchResult.nodes[0] ?? null;
  }
  
  if (!node) {
    return {
      found: false,
      meta: createMeta(startTime, 0, 0, 0, ctx.graphVersion),
    };
  }
  
  const component = nodeToCodeMatch(node);
  
  // Get dependencies
  const depsResult = dependencies(ctx, node.key, depth, 20);
  const deps = depsResult.nodes
    .filter(n => n.key !== node!.key)
    .map(nodeToCodeMatch);
  
  // Calculate tokens
  let tokensEstimate = estimateTokens(component.source ?? '');
  for (const dep of deps) {
    tokensEstimate += estimateTokens(dep.source ?? '');
  }
  
  const filesInScope = new Set([component.file, ...deps.map(d => d.file)]).size;
  
  return {
    found: true,
    component,
    dependencies: deps.length > 0 ? deps : undefined,
    meta: createMeta(
      startTime,
      1 + depsResult.nodes.length,
      filesInScope,
      tokensEstimate,
      ctx.graphVersion
    ),
  };
}

export interface UsagesArgs {
  target: string;
  maxResults?: number;
}

export interface UsageMatch extends CodeMatch {
  context?: string;
}

export interface UsagesResult {
  found: boolean;
  target?: CodeMatch;
  usages: UsageMatch[];
  meta: ResponseMeta;
}

/**
 * usages - Where Is This Used?
 * 
 * Finds all places that use this code, with snippets showing HOW it's used.
 * Essential before refactoring.
 */
export async function usages(
  ctx: RssContext,
  args: UsagesArgs
): Promise<UsagesResult> {
  const startTime = performance.now();
  const { target, maxResults = 10 } = args;
  
  // Find the target
  let node = lookupByKey(ctx, target);
  if (!node) {
    const searchResult = search(ctx, target, { maxResults: 1 });
    node = searchResult.nodes[0] ?? null;
  }
  
  if (!node) {
    return {
      found: false,
      usages: [],
      meta: createMeta(startTime, 0, 0, 0, ctx.graphVersion),
    };
  }
  
  const targetMatch = nodeToCodeMatch(node);
  
  // Get dependents (what uses this)
  const depsResult = dependents(ctx, node.key, 1, maxResults);
  
  const usageMatches: UsageMatch[] = depsResult.nodes.map(n => ({
    ...nodeToCodeMatch(n),
    context: n.element?.docstring as string ?? undefined,
  }));
  
  // Calculate tokens
  let tokensEstimate = estimateTokens(targetMatch.source ?? '');
  for (const usage of usageMatches) {
    tokensEstimate += estimateTokens(usage.source ?? '');
  }
  
  const filesInScope = new Set([
    targetMatch.file,
    ...usageMatches.map(u => u.file),
  ]).size;
  
  return {
    found: true,
    target: targetMatch,
    usages: usageMatches,
    meta: createMeta(
      startTime,
      1 + depsResult.nodes.length,
      filesInScope,
      tokensEstimate,
      ctx.graphVersion
    ),
  };
}

export interface ImpactArgs {
  target: string;
  depth?: number;
}

export interface Obligations {
  testsToRun?: string[];
  reviewRequired?: string;
  invariants?: string[];
}

export interface ImpactResult {
  found: boolean;
  target?: CodeMatch;
  affected: CodeMatch[];
  obligations: Obligations;
  guidance?: string;
  meta: ResponseMeta;
}

/**
 * impact - What Breaks If I Change This?
 * 
 * Analyzes full impact of changing this code: affected components,
 * tests to run, and safe modification guidance.
 */
export async function impact(
  ctx: RssContext,
  args: ImpactArgs
): Promise<ImpactResult> {
  const startTime = performance.now();
  const { target, depth = 2 } = args;
  
  // Find the target
  let node = lookupByKey(ctx, target);
  if (!node) {
    const searchResult = search(ctx, target, { maxResults: 1 });
    node = searchResult.nodes[0] ?? null;
  }
  
  if (!node) {
    return {
      found: false,
      affected: [],
      obligations: {},
      meta: createMeta(startTime, 0, 0, 0, ctx.graphVersion),
    };
  }
  
  const targetMatch = nodeToCodeMatch(node);
  
  // Get blast radius
  const blastResult = blastRadius(ctx, node.key, depth, 50);
  
  const affected = blastResult.nodes
    .filter(n => n.key !== node!.key)
    .map(nodeToCodeMatch);
  
  // Extract obligations from affected components
  const obligations: Obligations = {};
  
  // Find test files in affected set
  const testFiles = affected
    .filter((a: CodeMatch) => a.file.includes('.test.') || a.file.includes('.spec.'))
    .map((a: CodeMatch) => a.file);
  
  if (testFiles.length > 0) {
    obligations.testsToRun = testFiles;
  }
  
  // Generate guidance
  const guidance = affected.length > 5
    ? `This change affects ${affected.length} components. Consider incremental refactoring.`
    : undefined;
  
  // Calculate tokens
  let tokensEstimate = estimateTokens(targetMatch.source ?? '');
  for (const a of affected) {
    tokensEstimate += estimateTokens(a.source ?? '');
  }
  
  const filesInScope = new Set([
    targetMatch.file,
    ...affected.map(a => a.file),
  ]).size;
  
  return {
    found: true,
    target: targetMatch,
    affected,
    obligations,
    guidance,
    meta: createMeta(
      startTime,
      1 + blastResult.nodes.length,
      filesInScope,
      tokensEstimate,
      ctx.graphVersion
    ),
  };
}

export interface SimilarArgs {
  target: string;
  maxResults?: number;
}

export interface SimilarResult {
  found: boolean;
  target?: CodeMatch;
  similar: CodeMatch[];
  meta: ResponseMeta;
}

/**
 * similar - Find Patterns
 * 
 * Finds similar code patterns in the codebase.
 * Use to learn how this codebase does things.
 */
export async function similar(
  ctx: RssContext,
  args: SimilarArgs
): Promise<SimilarResult> {
  const startTime = performance.now();
  const { target, maxResults = 5 } = args;
  
  // Find the target
  let node = lookupByKey(ctx, target);
  if (!node) {
    const searchResult = search(ctx, target, { maxResults: 1 });
    node = searchResult.nodes[0] ?? null;
  }
  
  if (!node) {
    return {
      found: false,
      similar: [],
      meta: createMeta(startTime, 0, 0, 0, ctx.graphVersion),
    };
  }
  
  const targetMatch = nodeToCodeMatch(node);
  
  // Find similar by type and tags
  const similarNodes: AidocNode[] = [];
  
  for (const candidate of ctx.graph.values()) {
    if (candidate.key === node.key) continue;
    if (candidate.type !== node.type) continue;
    
    // Score by tag overlap
    const sharedTags = candidate.tags.filter(t => node!.tags.includes(t));
    if (sharedTags.length > 0 || candidate.domain === node.domain) {
      similarNodes.push(candidate);
    }
  }
  
  // Sort by similarity (more shared tags = more similar)
  similarNodes.sort((a, b) => {
    const aShared = a.tags.filter(t => node!.tags.includes(t)).length;
    const bShared = b.tags.filter(t => node!.tags.includes(t)).length;
    return bShared - aShared;
  });
  
  const similar = similarNodes.slice(0, maxResults).map(nodeToCodeMatch);
  
  // Calculate tokens
  let tokensEstimate = estimateTokens(targetMatch.source ?? '');
  for (const s of similar) {
    tokensEstimate += estimateTokens(s.source ?? '');
  }
  
  const filesInScope = new Set([
    targetMatch.file,
    ...similar.map(s => s.file),
  ]).size;
  
  return {
    found: true,
    target: targetMatch,
    similar,
    meta: createMeta(
      startTime,
      1 + similarNodes.length,
      filesInScope,
      tokensEstimate,
      ctx.graphVersion
    ),
  };
}

export interface OverviewArgs {
  focus?: string;
}

export interface DomainSummary {
  components: number;
  entryPoints: string[];
}

export interface OverviewResult {
  domains: Record<string, DomainSummary>;
  architecture: string;
  keyComponents: string[];
  totalNodes: number;
  meta: ResponseMeta;
}

/**
 * overview - Codebase Orientation
 * 
 * Understands codebase structure: domains, layers, entry points, and architecture.
 */
export async function overview(
  ctx: RssContext,
  args: OverviewArgs
): Promise<OverviewResult> {
  const startTime = performance.now();
  const { focus } = args;
  
  const stats = getGraphStats(ctx);
  
  // Group by domain
  const domains: Record<string, DomainSummary> = {};
  const domainCounts: Record<string, number> = {};
  const domainEntryPoints: Record<string, string[]> = {};
  
  for (const node of ctx.graph.values()) {
    // Apply focus filter if specified
    if (focus && !node.path?.includes(focus) && !node.domain.includes(focus)) {
      continue;
    }
    
    if (!domainCounts[node.domain]) {
      domainCounts[node.domain] = 0;
      domainEntryPoints[node.domain] = [];
    }
    
    domainCounts[node.domain]++;
    
    // Identify entry points (exported functions, API endpoints)
    if (node.tags.includes('exported') || node.domain === 'api') {
      if (domainEntryPoints[node.domain].length < 5) {
        const name = (node.element?.name as string) ?? node.id;
        domainEntryPoints[node.domain].push(name);
      }
    }
  }
  
  for (const [domain, count] of Object.entries(domainCounts)) {
    domains[domain] = {
      components: count,
      entryPoints: domainEntryPoints[domain] ?? [],
    };
  }
  
  // Identify key components (most referenced)
  const keyComponents = Array.from(ctx.graph.values())
    .filter(n => n.referencedBy.length > 3)
    .sort((a, b) => b.referencedBy.length - a.referencedBy.length)
    .slice(0, 10)
    .map(n => (n.element?.name as string) ?? n.id);
  
  // Infer architecture
  const hasFrontend = 'frontend' in domains;
  const hasApi = 'api' in domains;
  const hasInfrastructure = 'infrastructure' in domains;
  const hasData = 'data' in domains;
  
  let architecture = 'Unknown';
  if (hasFrontend && hasApi && hasData) {
    architecture = 'Full-stack (frontend → api → data)';
  } else if (hasApi && hasData) {
    architecture = 'Backend (api → data)';
  } else if (hasInfrastructure) {
    architecture = 'Infrastructure-as-code';
  } else if (Object.keys(domains).length > 3) {
    architecture = 'Multi-domain';
  }
  
  return {
    domains,
    architecture,
    keyComponents,
    totalNodes: stats.totalNodes,
    meta: createMeta(
      startTime,
      ctx.graph.size,
      new Set(Array.from(ctx.graph.values()).map(n => n.path ?? '')).size,
      0,
      ctx.graphVersion
    ),
  };
}

// =============================================================================
// DIAGNOSTIC TOOLS
// =============================================================================

export interface DiagnoseArgs {
  target?: string;
  mode?: 'health' | 'coverage' | 'benchmark';
}

export interface DiagnoseResult {
  healthy: boolean;
  summary: string;
  details: Record<string, unknown>;
  meta: ResponseMeta;
}

/**
 * diagnose - Trust Verification
 * 
 * Verifies graph health and accuracy.
 * Use when results seem wrong or before critical decisions.
 * 
 * Modes:
 * - health (default): Quick confidence check
 * - coverage: What's indexed, what's missing
 * - benchmark: Performance metrics for proving value
 */
export async function diagnose(
  ctx: RssContext,
  args: DiagnoseArgs
): Promise<DiagnoseResult> {
  const startTime = performance.now();
  const { target, mode = 'health' } = args;
  
  const stats = getGraphStats(ctx);
  const validation = validateGraphHealth(ctx);
  
  if (mode === 'health') {
    const healthy = validation.brokenEdges.length === 0 && 
                    validation.bidirectionalInconsistencies.length === 0;
    
    return {
      healthy,
      summary: healthy 
        ? `Graph is healthy: ${stats.totalNodes} nodes, ${stats.totalEdges} edges, no broken references.`
        : `Graph has issues: ${validation.brokenEdges.length} broken edges, ${validation.bidirectionalInconsistencies.length} inconsistencies.`,
      details: {
        nodeCount: stats.totalNodes,
        edgeCount: stats.totalEdges,
        brokenEdges: validation.brokenEdges.length,
        inconsistencies: validation.bidirectionalInconsistencies.length,
        graphVersion: ctx.graphVersion,
      },
      meta: createMeta(startTime, stats.totalNodes, 0, 0, ctx.graphVersion),
    };
  }
  
  if (mode === 'coverage') {
    // Count by domain and type
    const byDomain: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const files = new Set<string>();
    
    for (const node of ctx.graph.values()) {
      byDomain[node.domain] = (byDomain[node.domain] ?? 0) + 1;
      byType[node.type] = (byType[node.type] ?? 0) + 1;
      if (node.path) files.add(node.path);
    }
    
    return {
      healthy: true,
      summary: `Coverage: ${stats.totalNodes} nodes across ${Object.keys(byDomain).length} domains, ${files.size} files.`,
      details: {
        byDomain,
        byType,
        filesIndexed: files.size,
        graphVersion: ctx.graphVersion,
      },
      meta: createMeta(startTime, stats.totalNodes, files.size, 0, ctx.graphVersion),
    };
  }
  
  if (mode === 'benchmark') {
    // Run some benchmark queries
    const searchStart = performance.now();
    search(ctx, 'function', { maxResults: 10 });
    const searchTime = performance.now() - searchStart;
    
    const lookupStart = performance.now();
    const firstKey = ctx.graph.keys().next().value;
    if (firstKey) lookupByKey(ctx, firstKey);
    const lookupTime = performance.now() - lookupStart;
    
    return {
      healthy: true,
      summary: `Benchmark: Search ${searchTime.toFixed(1)}ms, Lookup ${lookupTime.toFixed(1)}ms. Graph load is cached.`,
      details: {
        searchLatencyMs: Math.round(searchTime),
        lookupLatencyMs: Math.round(lookupTime),
        nodeCount: stats.totalNodes,
        edgeCount: stats.totalEdges,
        graphVersion: ctx.graphVersion,
        advantage: `Semantic search examined ${stats.totalNodes} nodes vs grep scanning entire codebase.`,
      },
      meta: createMeta(startTime, stats.totalNodes, 0, 0, ctx.graphVersion),
    };
  }
  
  // Target-specific validation
  if (target) {
    let node = lookupByKey(ctx, target);
    if (!node) {
      const searchResult = search(ctx, target, { maxResults: 1 });
      node = searchResult.nodes[0] ?? null;
    }
    
    if (!node) {
      return {
        healthy: false,
        summary: `Target not found: ${target}`,
        details: { target, found: false },
        meta: createMeta(startTime, 0, 0, 0, ctx.graphVersion),
      };
    }
    
    return {
      healthy: true,
      summary: `Target found: ${node.key}`,
      details: {
        key: node.key,
        path: node.path,
        lineRange: node.slice,
        hasSource: !!node.source,
        references: node.references.length,
        referencedBy: node.referencedBy.length,
      },
      meta: createMeta(startTime, 1, 1, 0, ctx.graphVersion),
    };
  }
  
  return {
    healthy: true,
    summary: `Graph: ${stats.totalNodes} nodes, ${stats.totalEdges} edges.`,
    details: stats,
    meta: createMeta(startTime, stats.totalNodes, 0, 0, ctx.graphVersion),
  };
}

export interface RefreshArgs {
  scope?: 'full' | 'self' | 'file';
  target?: string;
}

export interface RefreshResult {
  success: boolean;
  message: string;
  meta: ResponseMeta;
}

/**
 * refresh - Force Re-extraction
 * 
 * Forces re-extraction of semantic graph.
 * Use when files have changed or graph seems stale.
 */
export async function refresh(
  ctx: RssContext,
  args: RefreshArgs,
  triggerRecon: () => Promise<{ success: boolean; message: string }>
): Promise<RefreshResult> {
  const startTime = performance.now();
  
  try {
    const result = await triggerRecon();
    
    return {
      success: result.success,
      message: result.message,
      meta: createMeta(startTime, 0, 0, 0, ctx.graphVersion),
    };
  } catch (error) {
    return {
      success: false,
      message: `Refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      meta: createMeta(startTime, 0, 0, 0, ctx.graphVersion),
    };
  }
}

