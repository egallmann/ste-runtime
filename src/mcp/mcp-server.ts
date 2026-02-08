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
import * as operationalTools from './tools-operational.js';
import * as optimizedTools from './tools-optimized.js';

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
  private rssContext: RssContext | null = null;      // Parent project context (.ste/state)
  private selfContext: RssContext | null = null;     // Self-analysis context (.ste-self/state)
  private graphMetrics: GraphMetrics | null = null;
  private selfGraphMetrics: GraphMetrics | null = null;
  private isInitialized = false;
  
  /**
   * Get the appropriate RSS context based on scope.
   * @param scope 'project' for parent project, 'self' for ste-runtime self-analysis
   */
  private getContextForScope(scope: 'project' | 'self' = 'project'): RssContext {
    if (scope === 'self') {
      if (!this.selfContext) {
        throw new Error('Self-analysis context not initialized. Run trigger_self_recon first.');
      }
      return this.selfContext;
    }
    if (!this.rssContext) {
      throw new Error('RSS context not initialized');
    }
    return this.rssContext;
  }
  
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
      // Load parent project RSS context
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
      
      // Load self-analysis context (.ste-self/state) - optional, may not exist
      const selfStateRoot = path.resolve(this.options.config.runtimeDir, '.ste-self', 'state');
      try {
        this.selfContext = await initRssContext(selfStateRoot);
        this.selfGraphMetrics = await loadGraphMetrics(selfStateRoot);
        
        if (!this.selfGraphMetrics) {
          const { graph } = await loadAidocGraph(selfStateRoot);
          this.selfGraphMetrics = await analyzeGraphTopology(graph);
          await saveGraphMetrics(this.selfGraphMetrics, selfStateRoot);
        }
        
        console.error(`[MCP Server] Self-analysis context loaded (${this.selfContext.graph.size} nodes)`);
      } catch {
        console.error('[MCP Server] Self-analysis context not available (run trigger_self_recon to enable)');
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
      // Reload parent project RSS context
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
      
      // Reload self-analysis context if it was previously loaded
      const selfStateRoot = path.resolve(this.options.config.runtimeDir, '.ste-self', 'state');
      try {
        this.selfContext = await initRssContext(selfStateRoot);
        const { graph: selfGraph } = await loadAidocGraph(selfStateRoot);
        this.selfGraphMetrics = await analyzeGraphTopology(selfGraph);
        await saveGraphMetrics(this.selfGraphMetrics, selfStateRoot);
      } catch {
        // Self-analysis not available, that's OK
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
    // List available tools - 8 AI-optimized tools (Pillar 2)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // PRIMARY TOOLS (6)
        {
          name: 'find',
          description: 'Find code by meaning, name, or description. Returns matching code with file paths, line numbers, and embedded source. PREFER OVER grep when finding definitions, understanding what code does, or searching by concept.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Symbol name or natural language query' },
              maxResults: { type: 'number', description: 'Maximum results', default: 5 },
              includeUsages: { type: 'boolean', description: 'Also show where top result is used', default: false },
              domain: { type: 'string', description: 'Filter by domain (optional)' },
              type: { type: 'string', description: 'Filter by type (optional)' },
              scope: { type: 'string', enum: ['project', 'self'], default: 'project' },
            },
            required: ['query'],
          },
        },
        {
          name: 'show',
          description: 'Get complete implementation of a component with its dependencies. Use when you know what you want and need the full code.',
          inputSchema: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Key, file path, or symbol name' },
              depth: { type: 'number', description: 'Dependency depth to include', default: 1 },
              scope: { type: 'string', enum: ['project', 'self'], default: 'project' },
            },
            required: ['target'],
          },
        },
        {
          name: 'usages',
          description: 'Find all places that use this code, with snippets showing HOW it is used. Essential before refactoring.',
          inputSchema: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Key or symbol name' },
              maxResults: { type: 'number', description: 'Maximum usages to return', default: 10 },
              scope: { type: 'string', enum: ['project', 'self'], default: 'project' },
            },
            required: ['target'],
          },
        },
        {
          name: 'impact',
          description: 'Analyze full impact of changing this code: affected components, tests to run, and safe modification guidance.',
          inputSchema: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Key or symbol name to analyze' },
              depth: { type: 'number', description: 'Impact depth', default: 2 },
              scope: { type: 'string', enum: ['project', 'self'], default: 'project' },
            },
            required: ['target'],
          },
        },
        {
          name: 'similar',
          description: 'Find similar code patterns in the codebase. Use to learn how this codebase does things.',
          inputSchema: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Key or description of pattern' },
              maxResults: { type: 'number', description: 'Maximum results', default: 5 },
              scope: { type: 'string', enum: ['project', 'self'], default: 'project' },
            },
            required: ['target'],
          },
        },
        {
          name: 'overview',
          description: 'Understand codebase structure: domains, layers, entry points, and architecture.',
          inputSchema: {
            type: 'object',
            properties: {
              focus: { type: 'string', description: 'Area to focus on (optional)' },
              scope: { type: 'string', enum: ['project', 'self'], default: 'project' },
            },
          },
        },
        
        // DIAGNOSTIC TOOLS (2)
        {
          name: 'diagnose',
          description: 'Verify graph health and accuracy. Use when results seem wrong or before critical decisions. Modes: health (default), coverage, benchmark.',
          inputSchema: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Specific file/key to validate (optional)' },
              mode: { type: 'string', enum: ['health', 'coverage', 'benchmark'], default: 'health' },
              scope: { type: 'string', enum: ['project', 'self'], default: 'project' },
            },
          },
        },
        {
          name: 'refresh',
          description: 'Force re-extraction of semantic graph. Use when files have changed or graph seems stale.',
          inputSchema: {
            type: 'object',
            properties: {
              scope: { type: 'string', enum: ['full', 'self', 'file'], default: 'full' },
              target: { type: 'string', description: 'File path if scope=file' },
            },
          },
        },
      ],
    }));
    
    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const toolArgs = args || {};
      
      // Extract scope from tool args (default to 'project')
      const scope = ((toolArgs as any).scope || 'project') as 'project' | 'self';
      
      try {
        let result: any;
        
        // Route to appropriate handler - 8 AI-optimized tools only
        switch (name) {
          case 'find': {
            const ctx = this.getContextForScope(scope);
            result = await optimizedTools.find(ctx, toolArgs as any);
            break;
          }
          
          case 'show': {
            const ctx = this.getContextForScope(scope);
            result = await optimizedTools.show(ctx, toolArgs as any);
            break;
          }
          
          case 'usages': {
            const ctx = this.getContextForScope(scope);
            result = await optimizedTools.usages(ctx, toolArgs as any);
            break;
          }
          
          case 'impact': {
            const ctx = this.getContextForScope(scope);
            result = await optimizedTools.impact(ctx, toolArgs as any);
            break;
          }
          
          case 'similar': {
            const ctx = this.getContextForScope(scope);
            result = await optimizedTools.similar(ctx, toolArgs as any);
            break;
          }
          
          case 'overview': {
            const ctx = this.getContextForScope(scope);
            result = await optimizedTools.overview(ctx, toolArgs as any);
            break;
          }
          
          case 'diagnose': {
            const ctx = this.getContextForScope(scope);
            result = await optimizedTools.diagnose(ctx, toolArgs as any);
            break;
          }
          
          case 'refresh': {
            const ctx = this.getContextForScope(scope);
            const triggerRecon = async () => {
              const refreshScope = (toolArgs as any).scope;
              if (refreshScope === 'self') {
                return operationalTools.triggerSelfRecon();
              }
              return operationalTools.triggerFullRecon({ projectRoot: this.options.projectRoot });
            };
            result = await optimizedTools.refresh(ctx, toolArgs as any, triggerRecon);
            // Reload context after refresh
            await this.reloadContext();
            break;
          }
          
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

