/**
 * Conversational Query Interface
 * 
 * Optimized for human-AI interaction patterns like:
 * - "Tell me about X"
 * - "What does Y do?"
 * - "How does Z work?"
 * - "Show me the relationship between A and B"
 * 
 * Authority: E-ADR-004 (RSS CLI Implementation)
 * 
 * Design Goals:
 * 1. Sub-5ms response for cached queries
 * 2. Tiered responses (summary → details → full context)
 * 3. Intent classification for routing
 * 4. Structured output for both human and machine consumption
 */

import {
  RssContext,
  initRssContext,
  search,
  lookupByKey,
  dependencies,
  dependents,
  blastRadius,
  byTag,
  findEntryPoints,
  assembleContext,
  getGraphStats,
  extractFilePaths,
  type RssQueryResult,
} from './rss-operations.js';
import type { AidocNode } from './graph-loader.js';
import { LRUCache } from 'lru-cache';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type QueryIntent =
  | 'describe'      // "Tell me about X", "What is X?"
  | 'explain'       // "How does X work?", "Explain X"
  | 'list'          // "Show all X", "List the X"
  | 'relationship'  // "How are X and Y related?"
  | 'impact'        // "What would be affected by changing X?"
  | 'dependencies'  // "What does X depend on?"
  | 'dependents'    // "What depends on X?"
  | 'locate'        // "Where is X?", "Find X"
  | 'unknown';      // Fallback

export interface ConversationalResponse {
  /** Original query */
  query: string;
  
  /** Detected intent */
  intent: QueryIntent;
  
  /** Processing time in milliseconds */
  timeMs: number;
  
  /** Quick summary suitable for immediate display */
  summary: string;
  
  /** Primary node(s) found */
  primaryNodes: NodeSummary[];
  
  /** Related nodes (via traversal) */
  relatedNodes: NodeSummary[];
  
  /** File paths in scope */
  filePaths: string[];
  
  /** Suggested follow-up queries */
  suggestedQueries: string[];
  
  /** Metrics for benchmarking */
  metrics: {
    searchTimeMs: number;
    traversalTimeMs: number;
    totalNodes: number;
    fromCache: boolean;
  };
}

export interface NodeSummary {
  key: string;
  domain: string;
  type: string;
  id: string;
  path?: string;
  description?: string;
  tags: string[];
  connectionCount: number;
}

interface CachedQuery {
  response: ConversationalResponse;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────
// Conversational Query Engine
// ─────────────────────────────────────────────────────────────────

export class ConversationalQueryEngine {
  private ctx!: RssContext;
  private cache: LRUCache<string, CachedQuery>;
  private initialized: boolean = false;
  
  constructor(private stateRoot: string = '.ste/state') {
    this.cache = new LRUCache<string, CachedQuery>({
      max: 100,
      ttl: 1000 * 60 * 5, // 5 minute TTL
    });
  }
  
  async initialize(): Promise<void> {
    if (!this.initialized) {
      this.ctx = await initRssContext(this.stateRoot);
      this.initialized = true;
    }
  }
  
  /**
   * Process a natural language query and return structured context.
   * 
   * This is the main entry point for conversational queries.
   * 
   * @example
   * const engine = new ConversationalQueryEngine();
   * await engine.initialize();
   * const result = await engine.query("Tell me about the finding processor");
   * console.log(result.summary);
   */
  async query(input: string): Promise<ConversationalResponse> {
    const startTime = performance.now();
    
    await this.initialize();
    
    // Check cache first
    const cacheKey = this.normalizeCacheKey(input);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        ...cached.response,
        metrics: { ...cached.response.metrics, fromCache: true },
        timeMs: performance.now() - startTime,
      };
    }
    
    // Classify intent
    const intent = this.classifyIntent(input);
    
    // Route to appropriate handler
    let response: ConversationalResponse;
    
    switch (intent) {
      case 'describe':
      case 'explain':
        response = await this.handleDescribe(input, intent, startTime);
        break;
      case 'list':
        response = await this.handleList(input, startTime);
        break;
      case 'impact':
        response = await this.handleImpact(input, startTime);
        break;
      case 'dependencies':
        response = await this.handleDependencies(input, startTime);
        break;
      case 'dependents':
        response = await this.handleDependents(input, startTime);
        break;
      case 'relationship':
        response = await this.handleRelationship(input, startTime);
        break;
      case 'locate':
        response = await this.handleLocate(input, startTime);
        break;
      default:
        response = await this.handleGeneric(input, startTime);
    }
    
    // Cache the response
    this.cache.set(cacheKey, { response, timestamp: Date.now() });
    
    return response;
  }
  
  /**
   * Invalidate cache (call after RECON updates the graph)
   */
  invalidateCache(): void {
    this.cache.clear();
    this.initialized = false;
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Intent Classification
  // ─────────────────────────────────────────────────────────────────
  
  private classifyIntent(query: string): QueryIntent {
    const q = query.toLowerCase().trim();
    
    // Pattern matching for intent classification
    const patterns: Array<{ intent: QueryIntent; patterns: RegExp[] }> = [
      {
        intent: 'describe',
        patterns: [
          /^tell me about/,
          /^what is/,
          /^describe/,
          /^what does .+ do/,
          /^show me/,
        ],
      },
      {
        intent: 'explain',
        patterns: [
          /^how does .+ work/,
          /^explain/,
          /^walk me through/,
          /^help me understand/,
        ],
      },
      {
        intent: 'list',
        patterns: [
          /^list( all)?/,
          /^show( all)?/,
          /^what are the/,
          /^get all/,
          /^find all/,
        ],
      },
      {
        intent: 'impact',
        patterns: [
          /^what would be affected/,
          /^impact of/,
          /^blast radius/,
          /^what changes if/,
          /^ripple effect/,
        ],
      },
      {
        intent: 'dependencies',
        patterns: [
          /^what does .+ depend on/,
          /^dependencies of/,
          /^what .+ needs/,
          /^requires/,
        ],
      },
      {
        intent: 'dependents',
        patterns: [
          /^what depends on/,
          /^dependents of/,
          /^what uses/,
          /^who calls/,
          /^consumers of/,
        ],
      },
      {
        intent: 'relationship',
        patterns: [
          /^how are .+ and .+ related/,
          /^relationship between/,
          /^connection between/,
          /^link between/,
        ],
      },
      {
        intent: 'locate',
        patterns: [
          /^where is/,
          /^find/,
          /^locate/,
          /^search for/,
        ],
      },
    ];
    
    for (const { intent, patterns: regexes } of patterns) {
      if (regexes.some(r => r.test(q))) {
        return intent;
      }
    }
    
    return 'unknown';
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Intent Handlers
  // ─────────────────────────────────────────────────────────────────
  
  private async handleDescribe(
    query: string,
    intent: QueryIntent,
    startTime: number
  ): Promise<ConversationalResponse> {
    const searchStart = performance.now();
    const { entryPoints, searchTerms } = findEntryPoints(this.ctx, query, 5);
    const searchTime = performance.now() - searchStart;
    
    if (entryPoints.length === 0) {
      return this.buildNoResultsResponse(query, intent, startTime, searchTime);
    }
    
    const traversalStart = performance.now();
    const primary = entryPoints[0];
    const impact = blastRadius(this.ctx, primary.key, 2, 50);
    const traversalTime = performance.now() - traversalStart;
    
    const filePaths = extractFilePaths([primary, ...impact.nodes]);
    
    const summary = this.buildDescriptionSummary(primary, impact.nodes, searchTerms);
    
    return {
      query,
      intent,
      timeMs: performance.now() - startTime,
      summary,
      primaryNodes: [this.nodeToSummary(primary)],
      relatedNodes: impact.nodes.slice(0, 10).map(n => this.nodeToSummary(n)),
      filePaths,
      suggestedQueries: this.generateSuggestions(primary, intent),
      metrics: {
        searchTimeMs: searchTime,
        traversalTimeMs: traversalTime,
        totalNodes: 1 + impact.nodes.length,
        fromCache: false,
      },
    };
  }
  
  private async handleList(
    query: string,
    startTime: number
  ): Promise<ConversationalResponse> {
    const searchStart = performance.now();
    
    // Extract what to list from query
    const listTarget = this.extractListTarget(query);
    
    let results: RssQueryResult;
    
    if (listTarget.isTag) {
      results = byTag(this.ctx, listTarget.term, 50);
    } else {
      results = search(this.ctx, listTarget.term, { maxResults: 50 });
    }
    
    const searchTime = performance.now() - searchStart;
    
    const summary = `Found ${results.nodes.length} ${listTarget.term} items`;
    
    return {
      query,
      intent: 'list',
      timeMs: performance.now() - startTime,
      summary,
      primaryNodes: results.nodes.slice(0, 20).map(n => this.nodeToSummary(n)),
      relatedNodes: [],
      filePaths: extractFilePaths(results.nodes),
      suggestedQueries: [
        `Tell me about ${results.nodes[0]?.id || listTarget.term}`,
        `What does ${results.nodes[0]?.id || listTarget.term} depend on?`,
      ],
      metrics: {
        searchTimeMs: searchTime,
        traversalTimeMs: 0,
        totalNodes: results.nodes.length,
        fromCache: false,
      },
    };
  }
  
  private async handleImpact(
    query: string,
    startTime: number
  ): Promise<ConversationalResponse> {
    const searchStart = performance.now();
    const { entryPoints } = findEntryPoints(this.ctx, query, 1);
    const searchTime = performance.now() - searchStart;
    
    if (entryPoints.length === 0) {
      return this.buildNoResultsResponse(query, 'impact', startTime, searchTime);
    }
    
    const traversalStart = performance.now();
    const impact = blastRadius(this.ctx, entryPoints[0].key, 3, 100);
    const traversalTime = performance.now() - traversalStart;
    
    const filePaths = extractFilePaths(impact.nodes);
    
    const summary = `Changing ${entryPoints[0].id} would affect ${impact.nodes.length} components across ${filePaths.length} files`;
    
    return {
      query,
      intent: 'impact',
      timeMs: performance.now() - startTime,
      summary,
      primaryNodes: [this.nodeToSummary(entryPoints[0])],
      relatedNodes: impact.nodes.slice(0, 20).map(n => this.nodeToSummary(n)),
      filePaths,
      suggestedQueries: [
        `What does ${entryPoints[0].id} depend on?`,
        `Tell me about ${entryPoints[0].id}`,
      ],
      metrics: {
        searchTimeMs: searchTime,
        traversalTimeMs: traversalTime,
        totalNodes: 1 + impact.nodes.length,
        fromCache: false,
      },
    };
  }
  
  private async handleDependencies(
    query: string,
    startTime: number
  ): Promise<ConversationalResponse> {
    const searchStart = performance.now();
    const { entryPoints } = findEntryPoints(this.ctx, query, 1);
    const searchTime = performance.now() - searchStart;
    
    if (entryPoints.length === 0) {
      return this.buildNoResultsResponse(query, 'dependencies', startTime, searchTime);
    }
    
    const traversalStart = performance.now();
    const deps = dependencies(this.ctx, entryPoints[0].key, 2, 50);
    const traversalTime = performance.now() - traversalStart;
    
    const summary = `${entryPoints[0].id} depends on ${deps.nodes.length} components`;
    
    return {
      query,
      intent: 'dependencies',
      timeMs: performance.now() - startTime,
      summary,
      primaryNodes: [this.nodeToSummary(entryPoints[0])],
      relatedNodes: deps.nodes.map(n => this.nodeToSummary(n)),
      filePaths: extractFilePaths([entryPoints[0], ...deps.nodes]),
      suggestedQueries: [
        `What depends on ${entryPoints[0].id}?`,
        `Impact of changing ${entryPoints[0].id}`,
      ],
      metrics: {
        searchTimeMs: searchTime,
        traversalTimeMs: traversalTime,
        totalNodes: 1 + deps.nodes.length,
        fromCache: false,
      },
    };
  }
  
  private async handleDependents(
    query: string,
    startTime: number
  ): Promise<ConversationalResponse> {
    const searchStart = performance.now();
    const { entryPoints } = findEntryPoints(this.ctx, query, 1);
    const searchTime = performance.now() - searchStart;
    
    if (entryPoints.length === 0) {
      return this.buildNoResultsResponse(query, 'dependents', startTime, searchTime);
    }
    
    const traversalStart = performance.now();
    const deps = dependents(this.ctx, entryPoints[0].key, 2, 50);
    const traversalTime = performance.now() - traversalStart;
    
    const summary = `${deps.nodes.length} components depend on ${entryPoints[0].id}`;
    
    return {
      query,
      intent: 'dependents',
      timeMs: performance.now() - startTime,
      summary,
      primaryNodes: [this.nodeToSummary(entryPoints[0])],
      relatedNodes: deps.nodes.map(n => this.nodeToSummary(n)),
      filePaths: extractFilePaths([entryPoints[0], ...deps.nodes]),
      suggestedQueries: [
        `What does ${entryPoints[0].id} depend on?`,
        `Tell me about ${entryPoints[0].id}`,
      ],
      metrics: {
        searchTimeMs: searchTime,
        traversalTimeMs: traversalTime,
        totalNodes: 1 + deps.nodes.length,
        fromCache: false,
      },
    };
  }
  
  private async handleRelationship(
    query: string,
    startTime: number
  ): Promise<ConversationalResponse> {
    // Extract the two entities from the query
    const match = query.match(/between\s+(.+?)\s+and\s+(.+?)(?:\?|$)/i);
    
    if (!match) {
      return this.handleGeneric(query, startTime);
    }
    
    const [, entity1, entity2] = match;
    
    const searchStart = performance.now();
    const results1 = search(this.ctx, entity1, { maxResults: 1 });
    const results2 = search(this.ctx, entity2, { maxResults: 1 });
    const searchTime = performance.now() - searchStart;
    
    if (results1.nodes.length === 0 || results2.nodes.length === 0) {
      return this.buildNoResultsResponse(query, 'relationship', startTime, searchTime);
    }
    
    const node1 = results1.nodes[0];
    const node2 = results2.nodes[0];
    
    // Find common connections
    const traversalStart = performance.now();
    const blast1 = blastRadius(this.ctx, node1.key, 2, 50);
    const blast2 = blastRadius(this.ctx, node2.key, 2, 50);
    const traversalTime = performance.now() - traversalStart;
    
    const keys1 = new Set(blast1.nodes.map(n => n.key));
    const commonNodes = blast2.nodes.filter(n => keys1.has(n.key));
    
    const summary = commonNodes.length > 0
      ? `${node1.id} and ${node2.id} share ${commonNodes.length} common connections`
      : `No direct relationship found between ${node1.id} and ${node2.id}`;
    
    return {
      query,
      intent: 'relationship',
      timeMs: performance.now() - startTime,
      summary,
      primaryNodes: [this.nodeToSummary(node1), this.nodeToSummary(node2)],
      relatedNodes: commonNodes.map(n => this.nodeToSummary(n)),
      filePaths: extractFilePaths([node1, node2, ...commonNodes]),
      suggestedQueries: [
        `Tell me about ${node1.id}`,
        `Tell me about ${node2.id}`,
      ],
      metrics: {
        searchTimeMs: searchTime,
        traversalTimeMs: traversalTime,
        totalNodes: 2 + commonNodes.length,
        fromCache: false,
      },
    };
  }
  
  private async handleLocate(
    query: string,
    startTime: number
  ): Promise<ConversationalResponse> {
    const searchStart = performance.now();
    const results = search(this.ctx, query, { maxResults: 10 });
    const searchTime = performance.now() - searchStart;
    
    if (results.nodes.length === 0) {
      return this.buildNoResultsResponse(query, 'locate', startTime, searchTime);
    }
    
    const filePaths = extractFilePaths(results.nodes);
    const summary = `Found ${results.nodes.length} matches in ${filePaths.length} files`;
    
    return {
      query,
      intent: 'locate',
      timeMs: performance.now() - startTime,
      summary,
      primaryNodes: results.nodes.map(n => this.nodeToSummary(n)),
      relatedNodes: [],
      filePaths,
      suggestedQueries: [
        `Tell me about ${results.nodes[0].id}`,
        `What depends on ${results.nodes[0].id}?`,
      ],
      metrics: {
        searchTimeMs: searchTime,
        traversalTimeMs: 0,
        totalNodes: results.nodes.length,
        fromCache: false,
      },
    };
  }
  
  private async handleGeneric(
    query: string,
    startTime: number
  ): Promise<ConversationalResponse> {
    const searchStart = performance.now();
    const { entryPoints, searchTerms } = findEntryPoints(this.ctx, query, 10);
    const searchTime = performance.now() - searchStart;
    
    if (entryPoints.length === 0) {
      return this.buildNoResultsResponse(query, 'unknown', startTime, searchTime);
    }
    
    const traversalStart = performance.now();
    const context = assembleContext(this.ctx, entryPoints, { maxDepth: 2, maxNodes: 50 });
    const traversalTime = performance.now() - traversalStart;
    
    const filePaths = extractFilePaths(context.nodes);
    
    const summary = `Found ${entryPoints.length} entry points, ${context.summary.totalNodes} total nodes`;
    
    return {
      query,
      intent: 'unknown',
      timeMs: performance.now() - startTime,
      summary,
      primaryNodes: entryPoints.map(n => this.nodeToSummary(n)),
      relatedNodes: context.nodes
        .filter(n => !entryPoints.some(ep => ep.key === n.key))
        .slice(0, 10)
        .map(n => this.nodeToSummary(n)),
      filePaths,
      suggestedQueries: this.generateGenericSuggestions(entryPoints),
      metrics: {
        searchTimeMs: searchTime,
        traversalTimeMs: traversalTime,
        totalNodes: context.summary.totalNodes,
        fromCache: false,
      },
    };
  }
  
  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────
  
  private nodeToSummary(node: AidocNode): NodeSummary {
    return {
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
      path: node.path,
      tags: node.tags,
      connectionCount: node.references.length + node.referencedBy.length,
    };
  }
  
  private normalizeCacheKey(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }
  
  private extractListTarget(query: string): { term: string; isTag: boolean } {
    const q = query.toLowerCase();
    
    // Check for tag patterns
    if (q.includes('lambda') || q.includes('handlers')) {
      return { term: 'handler:lambda', isTag: true };
    }
    if (q.includes('dynamodb') || q.includes('tables')) {
      return { term: 'aws:dynamodb', isTag: true };
    }
    if (q.includes('api') || q.includes('endpoints')) {
      return { term: 'layer:api', isTag: true };
    }
    if (q.includes('python')) {
      return { term: 'lang:python', isTag: true };
    }
    
    // Extract noun from query
    const words = q.replace(/^(list|show|get|find)(\s+all)?/i, '').trim().split(/\s+/);
    return { term: words[0] || 'function', isTag: false };
  }
  
  private buildDescriptionSummary(
    primary: AidocNode,
    related: AidocNode[],
    searchTerms: string[]
  ): string {
    const typeLabel = primary.type.replace(/_/g, ' ');
    const connectionCount = primary.references.length + primary.referencedBy.length;
    
    return `${primary.id} is a ${typeLabel} in the ${primary.domain} domain. ` +
      `It has ${connectionCount} connections to other components. ` +
      `Found ${related.length} related nodes.`;
  }
  
  private generateSuggestions(primary: AidocNode, intent: QueryIntent): string[] {
    const suggestions: string[] = [];
    
    if (intent !== 'dependencies') {
      suggestions.push(`What does ${primary.id} depend on?`);
    }
    if (intent !== 'dependents') {
      suggestions.push(`What depends on ${primary.id}?`);
    }
    if (intent !== 'impact') {
      suggestions.push(`Impact of changing ${primary.id}`);
    }
    
    return suggestions.slice(0, 3);
  }
  
  private generateGenericSuggestions(entryPoints: AidocNode[]): string[] {
    if (entryPoints.length === 0) return [];
    
    const first = entryPoints[0];
    return [
      `Tell me about ${first.id}`,
      `What does ${first.id} depend on?`,
      `What depends on ${first.id}?`,
    ];
  }
  
  private buildNoResultsResponse(
    query: string,
    intent: QueryIntent,
    startTime: number,
    searchTime: number
  ): ConversationalResponse {
    return {
      query,
      intent,
      timeMs: performance.now() - startTime,
      summary: `No results found for "${query}". Try a different search term.`,
      primaryNodes: [],
      relatedNodes: [],
      filePaths: [],
      suggestedQueries: [
        'List all Lambda handlers',
        'Show all DynamoDB tables',
        'What are the API endpoints?',
      ],
      metrics: {
        searchTimeMs: searchTime,
        traversalTimeMs: 0,
        totalNodes: 0,
        fromCache: false,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────

let defaultEngine: ConversationalQueryEngine | null = null;

/**
 * Quick query function for one-off conversational queries.
 * 
 * @example
 * const result = await ask("Tell me about the finding processor");
 * console.log(result.summary);
 * console.log(result.filePaths);
 */
export async function ask(query: string, stateRoot?: string): Promise<ConversationalResponse> {
  if (!defaultEngine || (stateRoot && stateRoot !== '.ste/state')) {
    defaultEngine = new ConversationalQueryEngine(stateRoot);
  }
  return defaultEngine.query(query);
}

/**
 * Format response for human display (terminal/console)
 */
export function formatForHuman(response: ConversationalResponse): string {
  const lines: string[] = [];
  
  lines.push('═'.repeat(60));
  lines.push(`Query: "${response.query}"`);
  lines.push(`Intent: ${response.intent} | Time: ${response.timeMs.toFixed(1)}ms`);
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`📋 ${response.summary}`);
  lines.push('');
  
  if (response.primaryNodes.length > 0) {
    lines.push('Primary Results:');
    for (const node of response.primaryNodes.slice(0, 5)) {
      lines.push(`  • ${node.id} (${node.domain}/${node.type})`);
      if (node.path) {
        lines.push(`    └─ ${node.path}`);
      }
    }
    lines.push('');
  }
  
  if (response.filePaths.length > 0) {
    lines.push(`Files in scope (${response.filePaths.length}):`);
    for (const path of response.filePaths.slice(0, 10)) {
      lines.push(`  📄 ${path}`);
    }
    if (response.filePaths.length > 10) {
      lines.push(`  ... and ${response.filePaths.length - 10} more`);
    }
    lines.push('');
  }
  
  if (response.suggestedQueries.length > 0) {
    lines.push('Suggested follow-ups:');
    for (const q of response.suggestedQueries) {
      lines.push(`  → ${q}`);
    }
  }
  
  lines.push('');
  lines.push(`[${response.metrics.totalNodes} nodes | ` +
    `search: ${response.metrics.searchTimeMs.toFixed(1)}ms | ` +
    `traversal: ${response.metrics.traversalTimeMs.toFixed(1)}ms | ` +
    `cache: ${response.metrics.fromCache}]`);
  
  return lines.join('\n');
}

/**
 * Format response for AI agent consumption (structured JSON)
 */
export function formatForAgent(response: ConversationalResponse): object {
  return {
    query: response.query,
    intent: response.intent,
    summary: response.summary,
    primaryNodes: response.primaryNodes,
    filePaths: response.filePaths,
    relatedNodeCount: response.relatedNodes.length,
    suggestedQueries: response.suggestedQueries,
    performance: {
      totalMs: response.timeMs,
      searchMs: response.metrics.searchTimeMs,
      traversalMs: response.metrics.traversalTimeMs,
      cached: response.metrics.fromCache,
    },
  };
}

