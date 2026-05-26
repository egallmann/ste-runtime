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
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { initRssContext, type RssContext } from '../rss/rss-operations.js';
import { loadAidocGraph } from '../rss/graph-loader.js';
import { analyzeGraphTopology, saveGraphMetrics, loadGraphMetrics, type GraphMetrics } from './graph-topology-analyzer.js';
import type { ResolvedConfig } from '../config/index.js';

// Import tool handlers
import * as operationalTools from './tools-operational.js';
import * as optimizedTools from './tools-optimized.js';
import { loadWorkspaceGraph } from '../workspace/workspace-graph-loader.js';
import { systemDependencies, componentIntegration, blastRadiusWorkspace, whatCalls, whatDependsOn, blastRadiusNode } from '../workspace/canned-queries.js';
import { toMermaid, toTable, toMermaidAtResolution, toTableAtResolution } from '../workspace/projections.js';
import { compress, type ResolutionLevel } from '../workspace/compression.js';

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
   * Resolve the state root for the project graph. If projectRoot contains a
   * workspace.yaml with an output_dir, use output_dir/state/ (workspace mode).
   * Otherwise fall back to the single-project rss.stateRoot from config.
   */
  private async resolveProjectStateRoot(): Promise<string> {
    const projectRoot = this.options.projectRoot;
    for (const name of ['workspace.yaml', 'workspace.yml']) {
      try {
        const raw = await fs.readFile(path.join(projectRoot, name), 'utf-8');
        const manifest = yaml.load(raw) as Record<string, unknown> | null;
        if (manifest && typeof manifest.output_dir === 'string') {
          const wsStateRoot = path.resolve(projectRoot, manifest.output_dir, 'state');
          const stat = await fs.stat(wsStateRoot);
          if (stat.isDirectory()) {
            console.error(`[MCP Server] Workspace mode: loading graph from ${wsStateRoot}`);
            return wsStateRoot;
          }
        }
      } catch { /* no manifest or missing state dir */ }
    }
    return path.resolve(projectRoot, this.options.config.rss.stateRoot);
  }

  /**
   * Resolve the workspace output directory (the directory containing
   * workspace-index.yaml and slices/). Falls back to the project root
   * combined with workspace.yaml output_dir.
   */
  private async resolveWorkspaceOutputDir(): Promise<string> {
    const projectRoot = this.options.projectRoot;
    for (const name of ['workspace.yaml', 'workspace.yml']) {
      try {
        const raw = await fs.readFile(path.join(projectRoot, name), 'utf-8');
        const manifest = yaml.load(raw) as Record<string, unknown> | null;
        if (manifest && typeof manifest.output_dir === 'string') {
          return path.resolve(projectRoot, manifest.output_dir);
        }
      } catch { /* no manifest */ }
    }
    throw new Error('No workspace.yaml found in project root. Workspace graph tools require a workspace manifest.');
  }

  /**
   * Initialize RSS context and graph metrics
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    const stateRoot = await this.resolveProjectStateRoot();
    
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
      }
      
      console.error(`[MCP Server] Workspace context loaded (${this.rssContext.graph.size} nodes)`);
      console.error(`  - Pattern: ${this.graphMetrics.detectedPattern}`);
      console.error(`  - Components: ${this.graphMetrics.totalComponents}`);
      console.error(`  - Recommended depth: ${this.graphMetrics.recommendedDepth}`);
      
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
    const stateRoot = await this.resolveProjectStateRoot();
    
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
              repo: { type: 'string', description: 'Filter to a specific repo in workspace mode (optional)' },
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
              repo: { type: 'string', description: 'Filter to a specific repo in workspace mode (optional)' },
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
              repo: { type: 'string', description: 'Filter to a specific repo in workspace mode (optional)' },
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
              repo: { type: 'string', description: 'Filter to a specific repo in workspace mode (optional)' },
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
              repo: { type: 'string', description: 'Filter to a specific repo in workspace mode (optional)' },
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
              repo: { type: 'string', description: 'Filter to a specific repo in workspace mode (optional)' },
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

        // WORKSPACE GRAPH TOOLS (3)
        {
          name: 'ws_dependencies',
          description: 'Show system-level repo dependency map across all repos in the workspace. Returns a Mermaid diagram and structured table of cross-repo dependencies with verb labels. Supports multi-resolution output (L0-L4).',
          inputSchema: {
            type: 'object',
            properties: {
              resolution: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3', 'L4'], description: 'Resolution level for projection (L0=system context, L4=full fidelity). Defaults to L4.' },
            },
          },
        },
        {
          name: 'ws_integration',
          description: 'Show component integration map for a repo or the full workspace. Groups edges by integration pattern (HTTP API, Event Stream, Shared Database, etc.). Supports multi-resolution output (L0-L4).',
          inputSchema: {
            type: 'object',
            properties: {
              repo: { type: 'string', description: 'Filter to a specific repo (optional; omit for full workspace)' },
              resolution: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3', 'L4'], description: 'Resolution level for projection (L0=system context, L4=full fidelity). Defaults to L4.' },
            },
          },
        },
        {
          name: 'ws_blast_radius',
          description: 'Analyze blast radius of a workspace node. BFS in both directions to find all affected nodes, classified into tiers with risk assessment.',
          inputSchema: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Workspace node ID (e.g. "Lambda:myrepo:my-fn" or "Database:myrepo:my-table")' },
              depth: { type: 'number', description: 'Max BFS depth', default: 3 },
            },
            required: ['target'],
          },
        },
        {
          name: 'ws_what_calls',
          description: 'Find all nodes that call/invoke a given node (depth-1 reverse on invokes/publishes/calls/triggers/publishes_to verbs).',
          inputSchema: {
            type: 'object',
            properties: {
              node_id: { type: 'string', description: 'Target workspace node ID' },
            },
            required: ['node_id'],
          },
        },
        {
          name: 'ws_what_depends_on',
          description: 'Forward transitive closure: find all nodes that the given node depends on (reachable via outgoing edges).',
          inputSchema: {
            type: 'object',
            properties: {
              node_id: { type: 'string', description: 'Starting workspace node ID' },
            },
            required: ['node_id'],
          },
        },
        {
          name: 'ws_node_blast_radius',
          description: 'Reverse transitive closure: find all nodes that depend on the given node (reachable via incoming edges).',
          inputSchema: {
            type: 'object',
            properties: {
              node_id: { type: 'string', description: 'Target workspace node ID' },
            },
            required: ['node_id'],
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
            const overviewRoot = scope === 'self'
              ? this.options.config.runtimeDir
              : this.options.projectRoot;
            result = await optimizedTools.overview(ctx, toolArgs as any, {
              projectRoot: overviewRoot,
            });
            break;
          }
          
          case 'diagnose': {
            const ctx = this.getContextForScope(scope);
            const diagnoseRoot = scope === 'self'
              ? this.options.config.runtimeDir
              : this.options.projectRoot;
            result = await optimizedTools.diagnose(ctx, toolArgs as any, {
              projectRoot: diagnoseRoot,
            });
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
          
          case 'ws_dependencies': {
            const wsOutputDir = await this.resolveWorkspaceOutputDir();
            const wsGraph = await loadWorkspaceGraph(wsOutputDir);
            const depsResult = systemDependencies(wsGraph);
            const depsResolution = (toolArgs as any).resolution as ResolutionLevel | undefined;
            if (depsResolution && depsResolution !== 'L4') {
              const compressed = compress(depsResult, { level: depsResolution });
              result = {
                mermaid: toMermaidAtResolution(compressed),
                table: toTableAtResolution(compressed),
                resolution: depsResolution,
                metadata: compressed.metadata,
                meta: { queryTimeMs: 0, nodesTraversed: wsGraph.nodes.size, filesInScope: 0, tokensEstimate: 0, graphVersion: 'workspace' },
              };
            } else {
              result = {
                mermaid: toMermaid(depsResult),
                table: toTable(depsResult),
                resolution: 'L4',
                meta: { queryTimeMs: 0, nodesTraversed: wsGraph.nodes.size, filesInScope: 0, tokensEstimate: 0, graphVersion: 'workspace' },
              };
            }
            break;
          }

          case 'ws_integration': {
            const wsOutputDir = await this.resolveWorkspaceOutputDir();
            const wsGraph = await loadWorkspaceGraph(wsOutputDir);
            const intResult = componentIntegration(wsGraph, (toolArgs as any).repo ? { repo: (toolArgs as any).repo } : undefined);
            const intResolution = (toolArgs as any).resolution as ResolutionLevel | undefined;
            if (intResolution && intResolution !== 'L4') {
              const compressed = compress(intResult, { level: intResolution });
              result = {
                mermaid: toMermaidAtResolution(compressed),
                table: toTableAtResolution(compressed),
                resolution: intResolution,
                metadata: compressed.metadata,
                meta: { queryTimeMs: 0, nodesTraversed: wsGraph.nodes.size, filesInScope: 0, tokensEstimate: 0, graphVersion: 'workspace' },
              };
            } else {
              result = {
                mermaid: toMermaid(intResult),
                table: toTable(intResult),
                resolution: 'L4',
                meta: { queryTimeMs: 0, nodesTraversed: wsGraph.nodes.size, filesInScope: 0, tokensEstimate: 0, graphVersion: 'workspace' },
              };
            }
            break;
          }

          case 'ws_blast_radius': {
            const wsOutputDir = await this.resolveWorkspaceOutputDir();
            const wsGraph = await loadWorkspaceGraph(wsOutputDir);
            const blastResult = blastRadiusWorkspace(wsGraph, (toolArgs as any).target, { maxDepth: (toolArgs as any).depth });
            result = {
              mermaid: toMermaid(blastResult),
              table: toTable(blastResult),
              risk: blastResult.risk,
              affectedRepos: blastResult.affectedRepos,
              affectedNodeCount: blastResult.affectedNodeCount,
              meta: { queryTimeMs: 0, nodesTraversed: wsGraph.nodes.size, filesInScope: 0, tokensEstimate: 0, graphVersion: 'workspace' },
            };
            break;
          }

          case 'ws_what_calls': {
            const wsOutputDir = await this.resolveWorkspaceOutputDir();
            const wsGraph = await loadWorkspaceGraph(wsOutputDir);
            result = whatCalls(wsGraph, (toolArgs as any).node_id);
            break;
          }

          case 'ws_what_depends_on': {
            const wsOutputDir = await this.resolveWorkspaceOutputDir();
            const wsGraph = await loadWorkspaceGraph(wsOutputDir);
            result = whatDependsOn(wsGraph, (toolArgs as any).node_id);
            break;
          }

          case 'ws_node_blast_radius': {
            const wsOutputDir = await this.resolveWorkspaceOutputDir();
            const wsGraph = await loadWorkspaceGraph(wsOutputDir);
            result = blastRadiusNode(wsGraph, (toolArgs as any).node_id);
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

