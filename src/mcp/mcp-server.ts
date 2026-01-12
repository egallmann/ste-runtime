/**
 * MCP Server Core
 * 
 * Main MCP server with stdio transport.
 * Per E-ADR-011: Unified process exposing RSS operations via MCP protocol.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import { initRssContext, type RssContext } from '../rss/rss-operations.js';
import { loadAidocGraph } from '../rss/graph-loader.js';
import { analyzeGraphTopology, saveGraphMetrics, loadGraphMetrics, type GraphMetrics } from './graph-topology-analyzer.js';
import type { ResolvedConfig } from '../config/index.js';

// Import tool handlers
import * as structuralTools from './tools-structural.js';
import * as contextTools from './tools-context.js';
import * as operationalTools from './tools-operational.js';

export interface McpServerOptions {
  config: ResolvedConfig;
  projectRoot: string;
}

/**
 * MCP Server
 * 
 * Exposes RSS operations and context assembly via MCP protocol.
 */
export class McpServer {
  private server: Server;
  private options: McpServerOptions;
  private rssContext: RssContext | null = null;
  private graphMetrics: GraphMetrics | null = null;
  private isInitialized = false;
  
  constructor(options: McpServerOptions) {
    this.options = options;
    
    // Create MCP server
    this.server = new Server(
      {
        name: 'ste-runtime',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    // Register handlers
    this.registerHandlers();
  }
  
  /**
   * Initialize RSS context and graph metrics
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    const stateRoot = path.resolve(this.options.projectRoot, this.options.config.rss.stateRoot);
    
    try {
      // Load RSS context
      this.rssContext = await initRssContext(stateRoot);
      
      // Try to load existing graph metrics
      this.graphMetrics = await loadGraphMetrics(stateRoot);
      
      // If no metrics exist or they're stale, analyze graph
      if (!this.graphMetrics) {
        console.error('[MCP Server] Analyzing graph topology...');
        const { graph } = await loadAidocGraph(stateRoot);
        this.graphMetrics = await analyzeGraphTopology(graph);
        await saveGraphMetrics(this.graphMetrics, stateRoot);
        
        console.error(`[MCP Server] Graph analysis complete:`);
        console.error(`  - Pattern: ${this.graphMetrics.detectedPattern}`);
        console.error(`  - Components: ${this.graphMetrics.totalComponents}`);
        console.error(`  - Recommended depth: ${this.graphMetrics.recommendedDepth}`);
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('[MCP Server] Failed to initialize:', error);
      throw error;
    }
  }
  
  /**
   * Reload RSS context (called after RECON updates)
   */
  async reloadContext(): Promise<void> {
    const stateRoot = path.resolve(this.options.projectRoot, this.options.config.rss.stateRoot);
    
    try {
      // Reload RSS context
      this.rssContext = await initRssContext(stateRoot);
      
      // Reanalyze graph topology
      const { graph } = await loadAidocGraph(stateRoot);
      const newMetrics = await analyzeGraphTopology(graph);
      
      // Check if recommended depth changed significantly
      if (this.graphMetrics && Math.abs(newMetrics.recommendedDepth - this.graphMetrics.recommendedDepth) >= 1) {
      console.error(`[MCP Server] Graph structure changed:`);
      console.error(`  - Old depth: ${this.graphMetrics.recommendedDepth}`);
      console.error(`  - New depth: ${newMetrics.recommendedDepth}`);
      }
      
      this.graphMetrics = newMetrics;
      await saveGraphMetrics(newMetrics, stateRoot);
      
      console.error('[MCP Server] Context reloaded');
    } catch (error) {
      console.error('[MCP Server] Failed to reload context:', error);
    }
  }
  
  /**
   * Register MCP handlers
   */
  private registerHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Layer 1: Structural queries
        {
          name: 'search_semantic_graph',
          description: 'Search the semantic graph for components, functions, entities',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query (natural language)' },
              maxResults: { type: 'number', description: 'Maximum results to return', default: 50 },
              domain: { type: 'string', description: 'Filter by domain (optional)' },
              type: { type: 'string', description: 'Filter by type (optional)' },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_dependencies',
          description: 'Find what a component depends on (forward traversal)',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Component key (domain/type/id)' },
              depth: { type: 'number', description: 'Traversal depth', default: this.graphMetrics?.recommendedDepth ?? 2 },
              maxNodes: { type: 'number', description: 'Maximum nodes to return', default: 100 },
            },
            required: ['key'],
          },
        },
        {
          name: 'get_dependents',
          description: 'Find what depends on this component (backward traversal)',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Component key (domain/type/id)' },
              depth: { type: 'number', description: 'Traversal depth', default: this.graphMetrics?.recommendedDepth ?? 2 },
              maxNodes: { type: 'number', description: 'Maximum nodes to return', default: 100 },
            },
            required: ['key'],
          },
        },
        {
          name: 'get_blast_radius',
          description: 'Analyze full impact surface of changing this component',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Component key (domain/type/id)' },
              depth: { type: 'number', description: 'Traversal depth', default: this.graphMetrics?.recommendedDepth ?? 2 },
              maxNodes: { type: 'number', description: 'Maximum nodes to return', default: 100 },
            },
            required: ['key'],
          },
        },
        {
          name: 'lookup_by_key',
          description: 'Direct retrieval of component by full key',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Full key (domain/type/id)' },
            },
            required: ['key'],
          },
        },
        {
          name: 'lookup',
          description: 'Direct retrieval of component by domain and id',
          inputSchema: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'AI-DOC domain' },
              id: { type: 'string', description: 'Component ID' },
            },
            required: ['domain', 'id'],
          },
        },
        {
          name: 'by_tag',
          description: 'Find all components with a specific tag',
          inputSchema: {
            type: 'object',
            properties: {
              tag: { type: 'string', description: 'Tag to search for' },
              maxResults: { type: 'number', description: 'Maximum results', default: 50 },
            },
            required: ['tag'],
          },
        },
        {
          name: 'get_graph_stats',
          description: 'Get statistics about the semantic graph',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        // Layer 2: Context assembly
        {
          name: 'assemble_context',
          description: 'Assemble task-relevant context for LLM reasoning',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Task description (natural language)' },
              includeSource: { type: 'boolean', description: 'Include source code', default: true },
              includeInvariants: { type: 'boolean', description: 'Include domain invariants', default: true },
              depth: { type: 'number', description: 'Dependency traversal depth', default: this.graphMetrics?.recommendedDepth ?? 2 },
              maxNodes: { type: 'number', description: 'Max components to return', default: 50 },
              maxSourceLines: { type: 'number', description: 'Max lines per file', default: 100 },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_implementation_context',
          description: 'Get full implementation context for a specific component',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Component key (domain/type/id)' },
              includeSource: { type: 'boolean', description: 'Include source code', default: true },
              includeDependencies: { type: 'boolean', description: 'Include dependencies', default: true },
              depth: { type: 'number', description: 'Dependency depth', default: 1 },
              maxSourceLines: { type: 'number', description: 'Max lines per file', default: 100 },
            },
            required: ['key'],
          },
        },
        {
          name: 'get_related_implementations',
          description: 'Find similar code patterns in the codebase',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Component key (domain/type/id)' },
              includeSource: { type: 'boolean', description: 'Include source code', default: true },
              maxResults: { type: 'number', description: 'Maximum results', default: 10 },
              maxSourceLines: { type: 'number', description: 'Max lines per file', default: 100 },
            },
            required: ['key'],
          },
        },
        // Operational tools
        {
          name: 'detect_missing_extractors',
          description: 'Analyze project and identify missing language/framework extractors',
          inputSchema: {
            type: 'object',
            properties: {
              projectRoot: { type: 'string', description: 'Project root path (optional)' },
            },
          },
        },
        {
          name: 'get_graph_health',
          description: 'Get validation status and health metrics',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'trigger_full_recon',
          description: 'Manually trigger full RECON (fallback for errors)',
          inputSchema: {
            type: 'object',
            properties: {
              projectRoot: { type: 'string', description: 'Project root path (optional)' },
            },
          },
        },
        {
          name: 'trigger_self_recon',
          description: 'Manually trigger full RECON for ste-runtime itself (self-documentation). Rebuilds the semantic graph of the runtime\'s own source code.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));
    
    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.rssContext) {
        throw new Error('RSS context not initialized');
      }
      
      const { name, arguments: args } = request.params;
      const toolArgs = args || {};
      
      try {
        let result: any;
        
        // Route to appropriate handler
        switch (name) {
          // Layer 1: Structural
          case 'search_semantic_graph':
            result = await structuralTools.searchSemanticGraph(this.rssContext, toolArgs as any);
            break;
          case 'get_dependencies':
            result = await structuralTools.getDependencies(this.rssContext, toolArgs as any);
            break;
          case 'get_dependents':
            result = await structuralTools.getDependents(this.rssContext, toolArgs as any);
            break;
          case 'get_blast_radius':
            result = await structuralTools.getBlastRadius(this.rssContext, toolArgs as any);
            break;
          case 'lookup_by_key':
            result = await structuralTools.lookupByKeyTool(this.rssContext, toolArgs as any);
            break;
          case 'lookup':
            result = await structuralTools.lookupTool(this.rssContext, toolArgs as any);
            break;
          case 'by_tag':
            result = await structuralTools.byTagTool(this.rssContext, toolArgs as any);
            break;
          case 'get_graph_stats':
            result = await structuralTools.getGraphStatsTool(this.rssContext);
            break;
          
          // Layer 2: Context assembly
          case 'assemble_context':
            result = await contextTools.assembleContextTool(this.rssContext, toolArgs as any);
            break;
          case 'get_implementation_context':
            result = await contextTools.getImplementationContext(this.rssContext, toolArgs as any);
            break;
          case 'get_related_implementations':
            result = await contextTools.getRelatedImplementations(this.rssContext, toolArgs as any);
            break;
          
          // Operational
          case 'detect_missing_extractors':
            result = await operationalTools.detectMissingExtractors({
              projectRoot: (toolArgs as any).projectRoot || this.options.projectRoot,
            });
            break;
          case 'get_graph_health':
            result = await operationalTools.getGraphHealth(this.rssContext);
            break;
          case 'trigger_full_recon':
            result = await operationalTools.triggerFullRecon({
              projectRoot: (toolArgs as any).projectRoot || this.options.projectRoot,
            });
            // Reload context after full RECON
            if (result.success) {
              await this.reloadContext();
            }
            break;
          case 'trigger_self_recon':
            result = await operationalTools.triggerSelfRecon();
            // Reload context after self RECON
            if (result.success) {
              await this.reloadContext();
            }
            break;
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
                tool: name,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }
  
  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Initialize RSS context
    await this.initialize();
    
    // Create stdio transport
    const transport = new StdioServerTransport();
    
    // Connect server to transport
    await this.server.connect(transport);
    
    console.error('[MCP Server] Started on stdio');
  }
  
  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    await this.server.close();
    console.error('[MCP Server] Stopped');
  }
}

