/**
 * RSS Operations
 * 
 * Authority: E-ADR-004 (RSS CLI Implementation for Developer-Invoked Graph Traversal)
 * 
 * Per STE-Architecture Section 4.6, RSS provides these operations:
 * - lookup(domain, id) — Direct item retrieval
 * - dependencies(item, depth) — Forward traversal (what does this depend on?)
 * - dependents(item, depth) — Backward traversal (what depends on this?)
 * - blast_radius(item, depth) — Bidirectional traversal (full impact surface)
 * - by_tag(tag) — Cross-domain query
 * - assemble_context(task) — Main context assembly function
 */

import { loadAidocGraph, AidocNode, AidocGraph } from './graph-loader.js';
import path from 'node:path';

/**
 * Represents a broken/dangling edge reference encountered during traversal.
 * This occurs when an edge points to a node that doesn't exist in the graph.
 */
export interface BrokenEdge {
  /** The key of the source node containing the broken reference */
  fromKey: string;
  /** The key of the target node that doesn't exist */
  toKey: string;
  /** The type of edge (forward reference or backward referenced_by) */
  edgeType: 'references' | 'referenced_by';
}

/**
 * Represents a bidirectional inconsistency where edges aren't reciprocal.
 */
export interface BidirectionalInconsistency {
  /** The source node key */
  sourceKey: string;
  /** The target node key */
  targetKey: string;
  /** What's missing: 'forward' means source should reference target, 'backward' means target should have source in referenced_by */
  missing: 'forward' | 'backward';
}

export interface RssQueryResult {
  nodes: AidocNode[];
  traversalDepth: number;
  truncated: boolean;
  /** Edges that point to non-existent nodes (dangling references) */
  brokenEdges: BrokenEdge[];
}

export interface RssContext {
  graph: AidocGraph;
  stateRoot: string;
  graphVersion: string;
}

/**
 * Initialize RSS context by loading the AI-DOC graph
 */
export async function initRssContext(stateRoot: string = '.ste/state'): Promise<RssContext> {
  const resolvedRoot = path.resolve(stateRoot);
  const { graph, graphVersion } = await loadAidocGraph(resolvedRoot);
  return { graph, stateRoot: resolvedRoot, graphVersion };
}

/**
 * lookup(domain, id) — Direct item retrieval
 * 
 * Returns a single slice by its domain and id.
 */
export function lookup(ctx: RssContext, domain: string, id: string): AidocNode | null {
  // Try direct lookup
  for (const [, node] of ctx.graph.entries()) {
    if (node.domain === domain && node.id === id) {
      return node;
    }
  }
  return null;
}

/**
 * lookupByKey — Direct item retrieval by full key (domain/type/id)
 */
export function lookupByKey(ctx: RssContext, key: string): AidocNode | null {
  return ctx.graph.get(key) ?? null;
}

/**
 * dependencies(item, depth) — Forward traversal
 * 
 * Returns all slices that the given item depends on (follows references).
 * This answers: "What does this slice depend on?"
 */
export function dependencies(
  ctx: RssContext,
  startKey: string,
  maxDepth: number = 2,
  maxNodes: number = 100
): RssQueryResult {
  const visited = new Set<string>();
  const result: AidocNode[] = [];
  const brokenEdges: BrokenEdge[] = [];
  let truncated = false;
  
  function traverse(key: string, depth: number, fromKey: string | null) {
    if (depth > maxDepth) return;
    if (visited.has(key)) return;
    if (result.length >= maxNodes) {
      truncated = true;
      return;
    }
    
    visited.add(key);
    const node = ctx.graph.get(key);
    if (!node) {
      // Track broken edge if we got here via a reference
      if (fromKey !== null) {
        brokenEdges.push({ fromKey, toKey: key, edgeType: 'references' });
      }
      return;
    }
    
    // Don't include the start node in results
    if (depth > 0) {
      result.push(node);
    }
    
    // Follow forward edges (references)
    for (const ref of node.references) {
      const targetKey = `${ref.domain}/${ref.type}/${ref.id}`;
      traverse(targetKey, depth + 1, key);
    }
  }
  
  traverse(startKey, 0, null);
  
  return {
    nodes: result,
    traversalDepth: maxDepth,
    truncated,
    brokenEdges,
  };
}

/**
 * dependents(item, depth) — Backward traversal
 * 
 * Returns all slices that depend on the given item (follows referenced_by).
 * This answers: "What depends on this slice?"
 */
export function dependents(
  ctx: RssContext,
  startKey: string,
  maxDepth: number = 2,
  maxNodes: number = 100
): RssQueryResult {
  const visited = new Set<string>();
  const result: AidocNode[] = [];
  const brokenEdges: BrokenEdge[] = [];
  let truncated = false;
  
  function traverse(key: string, depth: number, fromKey: string | null) {
    if (depth > maxDepth) return;
    if (visited.has(key)) return;
    if (result.length >= maxNodes) {
      truncated = true;
      return;
    }
    
    visited.add(key);
    const node = ctx.graph.get(key);
    if (!node) {
      // Track broken edge if we got here via a referenced_by
      if (fromKey !== null) {
        brokenEdges.push({ fromKey, toKey: key, edgeType: 'referenced_by' });
      }
      return;
    }
    
    // Don't include the start node in results
    if (depth > 0) {
      result.push(node);
    }
    
    // Follow backward edges (referenced_by)
    for (const ref of node.referencedBy) {
      const targetKey = `${ref.domain}/${ref.type}/${ref.id}`;
      traverse(targetKey, depth + 1, key);
    }
  }
  
  traverse(startKey, 0, null);
  
  return {
    nodes: result,
    traversalDepth: maxDepth,
    truncated,
    brokenEdges,
  };
}

/**
 * blast_radius(item, depth) — Bidirectional traversal
 * 
 * Returns all slices connected to the given item in either direction.
 * This answers: "What is the full impact surface of this slice?"
 */
export function blastRadius(
  ctx: RssContext,
  startKey: string,
  maxDepth: number = 2,
  maxNodes: number = 100
): RssQueryResult {
  const visited = new Set<string>();
  const result: AidocNode[] = [];
  const brokenEdges: BrokenEdge[] = [];
  let truncated = false;
  
  function traverse(key: string, depth: number, fromKey: string | null, edgeType: 'references' | 'referenced_by' | null) {
    if (depth > maxDepth) return;
    if (visited.has(key)) return;
    if (result.length >= maxNodes) {
      truncated = true;
      return;
    }
    
    visited.add(key);
    const node = ctx.graph.get(key);
    if (!node) {
      // Track broken edge if we got here via an edge
      if (fromKey !== null && edgeType !== null) {
        brokenEdges.push({ fromKey, toKey: key, edgeType });
      }
      return;
    }
    
    // Don't include the start node in results
    if (depth > 0) {
      result.push(node);
    }
    
    // Follow both forward and backward edges
    for (const ref of node.references) {
      const targetKey = `${ref.domain}/${ref.type}/${ref.id}`;
      traverse(targetKey, depth + 1, key, 'references');
    }
    for (const ref of node.referencedBy) {
      const targetKey = `${ref.domain}/${ref.type}/${ref.id}`;
      traverse(targetKey, depth + 1, key, 'referenced_by');
    }
  }
  
  traverse(startKey, 0, null, null);
  
  return {
    nodes: result,
    traversalDepth: maxDepth,
    truncated,
    brokenEdges,
  };
}

/**
 * by_tag(tag) — Cross-domain query
 * 
 * Returns all slices that have the specified tag.
 * This enables cross-cutting queries like "all lambda handlers" or "all DynamoDB tables".
 * 
 * Tags are now loaded from YAML _slice.tags arrays. Falls back to pattern matching
 * for backwards compatibility with nodes that don't have explicit tags.
 */
export function byTag(ctx: RssContext, tag: string, maxNodes: number = 100): RssQueryResult {
  const result: AidocNode[] = [];
  let truncated = false;
  const tagLower = tag.toLowerCase();
  
  for (const node of ctx.graph.values()) {
    if (result.length >= maxNodes) {
      truncated = true;
      break;
    }
    
    // Primary: Check actual tags loaded from YAML
    const hasExplicitTag = node.tags.some(t => t.toLowerCase() === tagLower);
    
    // Fallback: Check pattern matching for backwards compatibility
    const matchesPattern = matchesTagPattern(node, tag);
    
    if (hasExplicitTag || matchesPattern) {
      result.push(node);
    }
  }
  
  return {
    nodes: result,
    traversalDepth: 0,
    truncated,
    brokenEdges: [], // No edge traversal in tag queries
  };
}

// ─────────────────────────────────────────────────────────────────
// Fuzzy Matching Utilities
// ─────────────────────────────────────────────────────────────────

/**
 * Calculate Levenshtein (edit) distance between two strings.
 * 
 * The edit distance is the minimum number of single-character edits
 * (insertions, deletions, substitutions) required to transform one
 * string into the other.
 * 
 * @example
 * levenshteinDistance('UserService', 'UserServce') // → 1 (missing 'i')
 * levenshteinDistance('handler', 'hnadler') // → 2 (transposition)
 */
function levenshteinDistance(a: string, b: string): number {
  // Early exit for identical strings
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two-row optimization instead of full matrix (O(n) space vs O(m*n))
  let prevRow = new Array(b.length + 1);
  let currRow = new Array(b.length + 1);

  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      );
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[b.length];
}

/**
 * Calculate similarity ratio between two strings (0 to 1).
 * 
 * Returns 1.0 for identical strings, 0.0 for completely different strings.
 * Based on normalized Levenshtein distance.
 * 
 * @example
 * similarity('UserService', 'UserService') // → 1.0
 * similarity('UserService', 'UserServce')  // → 0.91 (1 edit in 11 chars)
 * similarity('abc', 'xyz')                 // → 0.0
 */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Match a node against a tag pattern
 * 
 * Supported patterns:
 * - handler:lambda - Functions with lambda_handler in name
 * - layer:api - Modules in api layer
 * - lang:python - Python language elements
 * - aws:dynamodb - DynamoDB resources
 * - storage:dynamodb - DynamoDB data models
 */
function matchesTagPattern(node: AidocNode, tag: string): boolean {
  const [category, value] = tag.split(':');
  
  switch (category) {
    case 'handler':
      if (value === 'lambda') {
        return node.type === 'function' && node.id.includes('lambda_handler');
      }
      break;
    case 'layer':
      // Check path for layer patterns
      if (node.path) {
        return node.path.toLowerCase().includes(`/${value}/`);
      }
      break;
    case 'lang':
      // Check file extension
      if (node.path) {
        const ext = node.path.split('.').pop()?.toLowerCase();
        if (value === 'python') return ext === 'py';
        if (value === 'typescript') return ext === 'ts' || ext === 'tsx';
      }
      break;
    case 'aws':
    case 'kind':
      // Check infrastructure domain
      if (node.domain === 'infrastructure') {
        return node.key.toLowerCase().includes(value.toLowerCase());
      }
      break;
    case 'storage':
      if (value === 'dynamodb' && node.domain === 'data') {
        return node.type === 'entity';
      }
      break;
  }
  
  return false;
}

/**
 * Default fuzzy matching threshold (0.0 to 1.0).
 * 0.6 means 60% similarity required for a fuzzy match.
 * This catches common typos (1-2 chars off in a 10+ char string).
 */
const DEFAULT_FUZZY_THRESHOLD = 0.6;

export interface SearchOptions {
  domain?: string;
  type?: string;
  maxResults?: number;
  /** Enable fuzzy matching as fallback when exact search returns no results. Default: true */
  fuzzy?: boolean;
  /** Minimum similarity threshold for fuzzy matches (0.0 to 1.0). Default: 0.6 */
  fuzzyThreshold?: number;
}

/**
 * search(query) — Entry Point Discovery with Fuzzy Fallback
 * 
 * Finds nodes matching a search query by scanning names, IDs, and metadata.
 * This is the RSS "insertion protocol" - how an agent enters the graph.
 * 
 * Search strategy (tiered):
 * 
 * **Tier 1 - Exact matching (fast path):**
 * 1. Exact ID match (score: 100)
 * 2. ID contains query (score: 80)
 * 3. Path contains query (score: 60)
 * 4. Key contains query (score: 40)
 * 
 * **Tier 2 - Fuzzy matching (fallback for typos):**
 * If Tier 1 returns no results and fuzzy is enabled (default), uses
 * Levenshtein distance-based similarity matching with configurable threshold.
 * 
 * @example
 * // Exact match
 * search(ctx, 'UserService')  // finds UserService
 * 
 * // Fuzzy fallback (typo)
 * search(ctx, 'UserServce')   // finds UserService via fuzzy match
 * 
 * // Disable fuzzy
 * search(ctx, 'UserServce', { fuzzy: false })  // returns empty
 */
export function search(
  ctx: RssContext, 
  query: string, 
  options: SearchOptions = {}
): RssQueryResult {
  const { 
    domain, 
    type, 
    maxResults = 50,
    fuzzy = true,
    fuzzyThreshold = DEFAULT_FUZZY_THRESHOLD,
  } = options;
  
  // Tier 1: Exact/substring matching (fast path)
  const exactResult = exactSearch(ctx, query, { domain, type, maxResults });
  
  if (exactResult.nodes.length > 0) {
    return exactResult;
  }
  
  // Tier 2: Fuzzy matching (fallback for typos)
  if (fuzzy) {
    return fuzzySearch(ctx, query, { domain, type, maxResults, threshold: fuzzyThreshold });
  }
  
  return exactResult;
}

/**
 * Compute score for a single search term against a node.
 * Returns 0 if no match, higher scores for better matches.
 */
function scoreNodeForTerm(node: AidocNode, termLower: string): number {
  // Exact ID match (highest score)
  if (node.id.toLowerCase() === termLower) {
    return 100;
  }
  // ID contains query
  if (node.id.toLowerCase().includes(termLower)) {
    return 80;
  }
  // Name field exact match (functions, classes have names separate from IDs)
  if (node.element?.name && 
      typeof node.element.name === 'string' &&
      node.element.name.toLowerCase() === termLower) {
    return 75;
  }
  // Name field contains query (partial match on function/class name)
  if (node.element?.name && 
      typeof node.element.name === 'string' &&
      node.element.name.toLowerCase().includes(termLower)) {
    return 72;
  }
  // Description match (high priority for semantic search)
  if (node.element?.description && 
      typeof node.element.description === 'string' &&
      node.element.description.toLowerCase().includes(termLower)) {
    return 70;
  }
  // Path contains query
  if (node.path?.toLowerCase().includes(termLower)) {
    return 60;
  }
  // Docstring match (medium priority)
  if (node.element?.docstring && 
      typeof node.element.docstring === 'string' &&
      node.element.docstring.toLowerCase().includes(termLower)) {
    return 50;
  }
  // Key contains query
  if (node.key.toLowerCase().includes(termLower)) {
    return 40;
  }
  // Tags match
  if (node.tags.some(tag => tag.toLowerCase().includes(termLower))) {
    return 35;
  }
  return 0;
}

/**
 * Exact/substring search (Tier 1).
 * 
 * This is the original search logic - fast substring matching.
 * Now enhanced to:
 * 1. Search through documentation fields (description, docstring)
 * 2. Support multi-term queries (natural language)
 * 3. Boost scores when multiple terms match the same node
 */
function exactSearch(
  ctx: RssContext,
  query: string,
  options: { domain?: string; type?: string; maxResults: number }
): RssQueryResult {
  const { domain, type, maxResults } = options;
  const queryLower = query.toLowerCase();
  const result: AidocNode[] = [];
  let truncated = false;
  
  // Score matches for relevance ranking
  const scored: Array<{ node: AidocNode; score: number }> = [];
  
  // Check if this looks like a natural language query (contains spaces or question mark)
  const isNaturalLanguage = query.includes(' ') || query.includes('?');
  
  if (isNaturalLanguage) {
    // Multi-term search: extract keywords and score each term
    const terms = extractNLSearchTerms(query);
    
    if (terms.length === 0) {
      return { nodes: [], traversalDepth: 0, truncated: false, brokenEdges: [] };
    }
    
    for (const node of ctx.graph.values()) {
      // Apply domain/type filters if specified
      if (domain && node.domain !== domain) continue;
      if (type && node.type !== type) continue;
      
      let totalScore = 0;
      let matchedTerms = 0;
      
      for (const term of terms) {
        const termScore = scoreNodeForTerm(node, term);
        if (termScore > 0) {
          totalScore += termScore;
          matchedTerms++;
        }
      }
      
      if (totalScore > 0) {
        // Boost score for nodes matching multiple terms
        const multiTermBonus = matchedTerms > 1 ? (matchedTerms - 1) * 20 : 0;
        scored.push({ node, score: totalScore + multiTermBonus });
      }
    }
  } else {
    // Single term search: use exact substring matching
    for (const node of ctx.graph.values()) {
      // Apply domain/type filters if specified
      if (domain && node.domain !== domain) continue;
      if (type && node.type !== type) continue;
      
      const score = scoreNodeForTerm(node, queryLower);
      if (score > 0) {
        scored.push({ node, score });
      }
    }
  }
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Take top results
  for (const { node } of scored.slice(0, maxResults)) {
    result.push(node);
  }
  
  if (scored.length > maxResults) {
    truncated = true;
  }
  
  return {
    nodes: result,
    traversalDepth: 0,
    truncated,
    brokenEdges: [],
  };
}

/**
 * Extract search terms from a natural language query.
 * Removes stop words and question words, extracts meaningful keywords.
 */
function extractNLSearchTerms(query: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'to', 'from', 'in', 'on', 'at', 'by', 'for', 'with', 'about',
    'it', 'its', 'me', 'my', 'i', 'you', 'your', 'we', 'our', 'they', 'their',
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
    'tell', 'explain', 'describe', 'show', 'list', 'find', 'get',
  ]);
  
  // Split on whitespace and punctuation
  const words = query.toLowerCase()
    .replace(/[^\w\s-_]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  return [...new Set(words)];
}

/**
 * Fuzzy search using Levenshtein distance (Tier 2).
 * 
 * Used as fallback when exact search returns no results.
 * Scores are based on similarity ratio (0-1) scaled to 0-39 range
 * to indicate they're lower priority than exact matches.
 * 
 * @param threshold Minimum similarity required (0.0 to 1.0)
 */
function fuzzySearch(
  ctx: RssContext,
  query: string,
  options: { domain?: string; type?: string; maxResults: number; threshold: number }
): RssQueryResult {
  const { domain, type, maxResults, threshold } = options;
  const queryLower = query.toLowerCase();
  const result: AidocNode[] = [];
  let truncated = false;
  
  const scored: Array<{ node: AidocNode; score: number; similarity: number }> = [];
  
  for (const node of ctx.graph.values()) {
    // Apply domain/type filters if specified
    if (domain && node.domain !== domain) continue;
    if (type && node.type !== type) continue;
    
    // Calculate similarity against ID (primary) and path (secondary)
    const idSimilarity = similarity(node.id.toLowerCase(), queryLower);
    const pathSimilarity = node.path 
      ? similarity(node.path.toLowerCase().split('/').pop() || '', queryLower)
      : 0;
    
    // Take the best similarity
    const bestSimilarity = Math.max(idSimilarity, pathSimilarity);
    
    if (bestSimilarity >= threshold) {
      // Score fuzzy matches in 0-39 range (below exact matches)
      // This ensures exact matches always rank higher
      const score = Math.floor(bestSimilarity * 39);
      scored.push({ node, score, similarity: bestSimilarity });
    }
  }
  
  // Sort by score (and similarity as tiebreaker)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.similarity - a.similarity;
  });
  
  // Take top results
  for (const { node } of scored.slice(0, maxResults)) {
    result.push(node);
  }
  
  if (scored.length > maxResults) {
    truncated = true;
  }
  
  return {
    nodes: result,
    traversalDepth: 0,
    truncated,
    brokenEdges: [],
  };
}

/**
 * findEntryPoints(naturalLanguageQuery) — Task Analysis for Entry Point Discovery
 * 
 * Per ste-spec Section 4.6, RSS Phase 1 is Task Analysis.
 * This function takes a natural language query and identifies likely entry points.
 * 
 * Returns entry points ranked by relevance.
 */
export function findEntryPoints(
  ctx: RssContext,
  nlQuery: string,
  maxEntryPoints: number = 10
): { entryPoints: AidocNode[]; searchTerms: string[] } {
  // Extract key terms from natural language query
  const searchTerms = extractSearchTerms(nlQuery);
  
  // Search for each term and aggregate results
  const candidateScores = new Map<string, { node: AidocNode; score: number }>();
  
  for (const term of searchTerms) {
    const results = search(ctx, term, { maxResults: 20 });
    
    for (const node of results.nodes) {
      const existing = candidateScores.get(node.key);
      if (existing) {
        // Boost score for nodes matching multiple terms
        existing.score += 10;
      } else {
        candidateScores.set(node.key, { node, score: 10 });
      }
    }
  }
  
  // Sort by score and return top entry points
  const sorted = Array.from(candidateScores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntryPoints);
  
  return {
    entryPoints: sorted.map(s => s.node),
    searchTerms,
  };
}

/**
 * Extract search terms from a natural language query
 */
function extractSearchTerms(query: string): string[] {
  // Remove common stop words and extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'to', 'from', 'in', 'on', 'at', 'by', 'for', 'with', 'about',
    'it', 'its', 'me', 'my', 'i', 'you', 'your', 'we', 'our', 'they', 'their',
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
    'tell', 'explain', 'describe', 'show', 'list', 'find', 'get',
    'does', 'read', 'write', 'reads', 'writes', 'permissions', 'triggers', 'trigger'
  ]);
  
  // Split on whitespace and punctuation
  const words = query.toLowerCase()
    .replace(/[^\w\s-_]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  // Also look for compound terms (e.g., "finding-processor", "lambda_handler")
  const compoundTerms = query.toLowerCase()
    .match(/[\w]+-[\w]+|[\w]+_[\w]+/g) ?? [];
  
  return [...new Set([...words, ...compoundTerms])];
}

/**
 * assembleContext — Main context assembly function
 * 
 * Given entry points, traverse the graph and assemble minimal viable context.
 * This is the core RSS operation per ste-spec Section 4.6.
 */
export function assembleContext(
  ctx: RssContext,
  entryPoints: AidocNode[],
  options: {
    maxDepth?: number;
    maxNodes?: number;
    includeMetadata?: boolean;
  } = {}
): {
  nodes: AidocNode[];
  summary: {
    entryPointCount: number;
    totalNodes: number;
    byDomain: Record<string, number>;
    traversalDepth: number;
  };
} {
  const { maxDepth = 2, maxNodes = 100 } = options;
  const visited = new Set<string>();
  const result: AidocNode[] = [];
  const byDomain: Record<string, number> = {};
  
  // Start with entry points
  for (const entry of entryPoints) {
    if (result.length >= maxNodes) break;
    if (visited.has(entry.key)) continue;
    
    visited.add(entry.key);
    result.push(entry);
    byDomain[entry.domain] = (byDomain[entry.domain] ?? 0) + 1;
  }
  
  // Expand from entry points via blast radius
  for (const entry of entryPoints) {
    const blast = blastRadius(ctx, entry.key, maxDepth, maxNodes - result.length);
    
    for (const node of blast.nodes) {
      if (result.length >= maxNodes) break;
      if (visited.has(node.key)) continue;
      
      visited.add(node.key);
      result.push(node);
      byDomain[node.domain] = (byDomain[node.domain] ?? 0) + 1;
    }
  }
  
  return {
    nodes: result,
    summary: {
      entryPointCount: entryPoints.length,
      totalNodes: result.length,
      byDomain,
      traversalDepth: maxDepth,
    },
  };
}

/**
 * Get graph statistics
 */
export function getGraphStats(ctx: RssContext): {
  totalNodes: number;
  byDomain: Record<string, number>;
  byType: Record<string, number>;
  totalEdges: number;
} {
  const byDomain: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let totalEdges = 0;
  
  for (const node of ctx.graph.values()) {
    byDomain[node.domain] = (byDomain[node.domain] ?? 0) + 1;
    byType[node.type] = (byType[node.type] ?? 0) + 1;
    totalEdges += node.references.length;
  }
  
  return {
    totalNodes: ctx.graph.size,
    byDomain,
    byType,
    totalEdges,
  };
}

/**
 * Extract unique file paths from nodes
 * 
 * Utility for hybrid RSS+Grep workflow: use RSS to identify relevant nodes,
 * then extract file paths for targeted grep/read operations.
 * 
 * @example
 * const impact = blastRadius(ctx, 'graph/function/processOrder', 3);
 * const files = extractFilePaths(impact.nodes);
 * // files: ['backend/lambda/api/orders.py', 'backend/lambda/shared/db.py', ...]
 * // Now grep/read ONLY these files for deep understanding
 */
export function extractFilePaths(nodes: AidocNode[]): string[] {
  const files = new Set<string>();
  for (const node of nodes) {
    for (const file of node.sourceFiles) {
      files.add(file);
    }
  }
  return [...files].sort();
}

/**
 * Get relevant files for a task (hybrid workflow helper)
 * 
 * Combines findEntryPoints + blastRadius + file extraction into a single call.
 * Returns the deterministic set of files relevant to a natural language task.
 * 
 * Workflow:
 * 1. RSS identifies the subgraph deterministically
 * 2. Returns file paths for targeted grep/read
 * 
 * @example
 * const files = await getRelevantFiles(ctx, 'fix user authentication bug');
 * // files: ['src/auth/auth-service.ts', 'src/api/users.py', ...]
 * // Now grep/read these files for deep understanding
 */
export function getRelevantFiles(
  ctx: RssContext,
  task: string,
  options: {
    maxDepth?: number;
    maxEntryPoints?: number;
  } = {}
): string[] {
  const { maxDepth = 2, maxEntryPoints = 10 } = options;
  
  // Find entry points for the task
  const { entryPoints } = findEntryPoints(ctx, task, maxEntryPoints);
  
  // Expand to full impact surface
  const allNodes: AidocNode[] = [...entryPoints];
  
  for (const entry of entryPoints) {
    const impact = blastRadius(ctx, entry.key, maxDepth, 50);
    allNodes.push(...impact.nodes);
  }
  
  // Dedupe and extract file paths
  return extractFilePaths(allNodes);
}

/**
 * Validate bidirectional edge consistency across the entire graph.
 * 
 * Per STE-Divergence-Taxonomy Doc-Bidirectional-Inconsistency:
 * - If Item A references Item B, then B must list A in `referenced_by`
 * - If Item B lists A in `referenced_by`, then A must reference B
 * 
 * @returns Array of inconsistencies found in the graph
 */
export function validateBidirectionalEdges(ctx: RssContext): BidirectionalInconsistency[] {
  const inconsistencies: BidirectionalInconsistency[] = [];
  
  for (const [sourceKey, node] of ctx.graph.entries()) {
    // Check forward edges: if A references B, B should have A in referenced_by
    for (const ref of node.references) {
      const targetKey = `${ref.domain}/${ref.type}/${ref.id}`;
      const targetNode = ctx.graph.get(targetKey);
      
      if (targetNode) {
        // Check if target has source in its referenced_by
        const hasBackReference = targetNode.referencedBy.some(
          backRef => `${backRef.domain}/${backRef.type}/${backRef.id}` === sourceKey
        );
        
        if (!hasBackReference) {
          inconsistencies.push({
            sourceKey,
            targetKey,
            missing: 'backward', // Target is missing source in referenced_by
          });
        }
      }
      // Note: If target doesn't exist, that's a broken edge (handled by traversal)
    }
    
    // Check backward edges: if A is in B's referenced_by, A should reference B
    for (const backRef of node.referencedBy) {
      const sourceRefKey = `${backRef.domain}/${backRef.type}/${backRef.id}`;
      const sourceRefNode = ctx.graph.get(sourceRefKey);
      
      if (sourceRefNode) {
        // Check if the claimed source actually references this node
        const hasForwardReference = sourceRefNode.references.some(
          fwdRef => `${fwdRef.domain}/${fwdRef.type}/${fwdRef.id}` === sourceKey
        );
        
        if (!hasForwardReference) {
          inconsistencies.push({
            sourceKey: sourceRefKey,
            targetKey: sourceKey,
            missing: 'forward', // Source is missing forward reference to target
          });
        }
      }
    }
  }
  
  // Deduplicate (since we check both directions, we might report same issue twice)
  const seen = new Set<string>();
  return inconsistencies.filter(inc => {
    const key = `${inc.sourceKey}|${inc.targetKey}|${inc.missing}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Find orphaned nodes in the graph.
 * 
 * Per STE-Divergence-Taxonomy Doc-Orphaned-Item:
 * An orphaned node has no references AND no referenced_by, making it
 * undiscoverable by RSS traversal (only findable via direct lookup/search).
 * 
 * @returns Array of orphaned nodes
 */
export function findOrphanedNodes(ctx: RssContext): AidocNode[] {
  const orphans: AidocNode[] = [];
  
  for (const node of ctx.graph.values()) {
    if (node.references.length === 0 && node.referencedBy.length === 0) {
      orphans.push(node);
    }
  }
  
  return orphans;
}

/**
 * Find all broken edges in the graph (edges pointing to non-existent nodes).
 * 
 * This performs a full graph scan rather than discovering broken edges
 * during traversal. Useful for graph validation and health checks.
 * 
 * @returns Array of broken edges in the entire graph
 */
export function findAllBrokenEdges(ctx: RssContext): BrokenEdge[] {
  const brokenEdges: BrokenEdge[] = [];
  
  for (const [sourceKey, node] of ctx.graph.entries()) {
    // Check forward references
    for (const ref of node.references) {
      const targetKey = `${ref.domain}/${ref.type}/${ref.id}`;
      if (!ctx.graph.has(targetKey)) {
        brokenEdges.push({
          fromKey: sourceKey,
          toKey: targetKey,
          edgeType: 'references',
        });
      }
    }
    
    // Check backward references
    for (const backRef of node.referencedBy) {
      const targetKey = `${backRef.domain}/${backRef.type}/${backRef.id}`;
      if (!ctx.graph.has(targetKey)) {
        brokenEdges.push({
          fromKey: sourceKey,
          toKey: targetKey,
          edgeType: 'referenced_by',
        });
      }
    }
  }
  
  return brokenEdges;
}

/**
 * Comprehensive graph health check.
 * 
 * Validates the graph for all traversability issues:
 * - Broken edges (dangling references)
 * - Bidirectional inconsistencies
 * - Orphaned nodes
 * 
 * @returns Full health report with all issues found
 */
export function validateGraphHealth(ctx: RssContext): {
  brokenEdges: BrokenEdge[];
  bidirectionalInconsistencies: BidirectionalInconsistency[];
  orphanedNodes: AidocNode[];
  summary: {
    totalNodes: number;
    totalEdges: number;
    brokenEdgeCount: number;
    inconsistencyCount: number;
    orphanCount: number;
    isHealthy: boolean;
  };
} {
  const brokenEdges = findAllBrokenEdges(ctx);
  const bidirectionalInconsistencies = validateBidirectionalEdges(ctx);
  const orphanedNodes = findOrphanedNodes(ctx);
  const stats = getGraphStats(ctx);
  
  return {
    brokenEdges,
    bidirectionalInconsistencies,
    orphanedNodes,
    summary: {
      totalNodes: stats.totalNodes,
      totalEdges: stats.totalEdges,
      brokenEdgeCount: brokenEdges.length,
      inconsistencyCount: bidirectionalInconsistencies.length,
      orphanCount: orphanedNodes.length,
      isHealthy: brokenEdges.length === 0 && bidirectionalInconsistencies.length === 0,
    },
  };
}

