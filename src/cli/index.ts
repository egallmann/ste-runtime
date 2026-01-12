#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRecon } from '../recon/index.js';
import { loadConfig, loadConfigFromFile } from '../config/index.js';
import { runRssTraversal } from '../rss/graph-traversal.js';
import { 
  initRssContext, 
  dependencies, 
  dependents, 
  blastRadius, 
  byTag, 
  getGraphStats,
  lookupByKey,
  search,
  findEntryPoints,
  assembleContext
} from '../rss/rss-operations.js';
import { runTaskAnalyze } from '../task/task-analysis.js';
import { startWatch } from '../watch/file-watcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program.name('ste-runtime').description('STE runtime CLI').version('0.1.0');

/**
 * Resolve state directory from config file or explicit path.
 * Priority: --state > --config stateDir > default .ste/state
 */
async function resolveStatePath(options: { state?: string; config?: string }): Promise<string> {
  const runtimeDir = path.resolve(__dirname, '../..');
  
  // Explicit state path takes precedence
  if (options.state) {
    return path.resolve(options.state);
  }
  
  // Load from config file if specified
  if (options.config) {
    const configPath = path.resolve(options.config);
    const config = await loadConfigFromFile(configPath, path.dirname(configPath));
    return path.resolve(config.projectRoot, config.stateDir);
  }
  
  // Default: project's .ste/state
  return path.join(runtimeDir, '.ste/state');
}

program
  .command('recon')
  .description('Run RECON and emit AI-DOC state')
  .option('--config <configFile>', 'Config file to use (default: ste.config.json, use ste-self.config.json for self-analysis)')
  .option('--mode <mode>', 'Recon mode: full | incremental', 'full')
  .action(async (options) => {
    const runtimeDir = path.resolve(__dirname, '../..');
    
    let config;
    if (options.config) {
      const configPath = path.resolve(options.config);
      console.log(`[RECON] Using config: ${configPath}`);
      config = await loadConfigFromFile(configPath, path.dirname(configPath));
    } else {
      // Default: load from project's ste.config.json
      config = await loadConfig(runtimeDir);
    }
    
    console.log(`[RECON] Project root: ${config.projectRoot}`);
    console.log(`[RECON] Source dirs: ${config.sourceDirs.join(', ')}`);
    console.log(`[RECON] State dir: ${config.stateDir}`);
    console.log(`[RECON] Languages: ${config.languages.join(', ')}`);
    
    const result = await executeRecon({
      projectRoot: config.projectRoot,
      sourceRoot: config.sourceDirs[0] || '.',
      stateRoot: config.stateDir,
      mode: options.mode as 'full' | 'incremental',
      config,
    });
    
    // Print summary
    console.log('\n=== RECON Summary ===');
    console.log(`Success: ${result.success}`);
    console.log(`Created: ${result.aiDocCreated}`);
    console.log(`Updated: ${result.aiDocModified}`);
    console.log(`Deleted: ${result.aiDocDeleted}`);
    console.log(`Unchanged: ${result.aiDocUnchanged}`);
    console.log(`Conflicts: ${result.conflictsDetected}`);
    console.log(`Validation Errors: ${result.validationErrors}`);
    console.log(`Validation Warnings: ${result.validationWarnings}`);
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }
  });

program
  .command('rss <task>')
  .description('Run RSS traversal and emit context bundle (JSON)')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .option('--depth <depth>', 'Traversal depth limit (integer)', (value) => Number.parseInt(value, 10), undefined)
  .option('--top <top>', 'Max number of entry points from Task Analysis', (value) => Number.parseInt(value, 10), undefined)
  .option(
    '--threshold <threshold>',
    'Minimum score threshold from Task Analysis',
    (value) => Number.parseFloat(value),
    undefined,
  )
  .option('--format <format>', 'Output format: json | pretty', 'pretty')
  .action(async (task: string, options) => {
    const statePath = await resolveStatePath(options);
    await runRssTraversal(task, {
      stateRoot: statePath,
      depthLimit: options.depth,
      top: options.top,
      threshold: options.threshold,
      format: options.format,
    });
  });

program
  .command('task-analyze <task>')
  .description('Analyze a task and suggest AI-DOC entry points with scores')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .option('--format <format>', 'Output format: table | json | both', 'table')
  .option('--top <top>', 'Max number of candidates', (value) => Number.parseInt(value, 10), 5)
  .option('--threshold <threshold>', 'Minimum score threshold', (value) => Number.parseFloat(value), 0.05)
  .action(async (task: string, options) => {
    const statePath = await resolveStatePath(options);
    await runTaskAnalyze(task, {
      stateRoot: statePath,
      format: options.format,
      top: options.top,
      threshold: options.threshold,
    });
  });

program
  .command('watch')
  .description('Start MCP server with optional file watching')
  .option('--mcp', 'Enable MCP mode (default)', true)
  .option('--no-watch', 'Disable file watching (MCP server only)')
  .option('--config <path>', 'Custom config file path')
  .action(async (options) => {
    // Import and run watch logic directly
    const { McpServer } = await import('../mcp/mcp-server.js');
    const { Watchdog } = await import('../watch/watchdog.js');
    const { loadConfig, loadConfigFromFile } = await import('../config/index.js');
    const { runFullRecon } = await import('../recon/full-recon.js');
    const { loadReconManifest } = await import('../watch/change-detector.js');
    const fs = await import('fs/promises');
    
    // In MCP mode, redirect console.log to stderr (MCP uses stdout for JSON protocol)
    const isMcpMode = options.mcp !== false;
    const log = isMcpMode ? (...args: any[]) => console.error(...args) : console.log;
    const logError = console.error;
    
    try {
      // Determine project root and config path
      // In MCP mode, use cwd directly as project root (Cursor sets this to workspace folder)
      let cwd = process.cwd();
      
      // Detect if cwd is wrong (happens when Cursor doesn't set cwd correctly)
      // If cwd is a parent directory, try to find ste-runtime
      const runtimeDir = path.resolve(__dirname, '../..');
      const runtimeParent = path.dirname(runtimeDir);
      
      // If cwd is not the runtime dir and not a subdirectory of runtime parent, 
      // and runtime dir exists, use runtime's parent as project root
      if (cwd !== runtimeDir && !cwd.startsWith(runtimeParent + path.sep) && cwd !== runtimeParent) {
        // Check if runtime dir is a subdirectory of cwd
        if (runtimeDir.startsWith(cwd + path.sep)) {
          // cwd is a parent of runtime, which is wrong - use runtime's parent instead
          cwd = runtimeParent;
        } else {
          // Try to detect: if we're in a weird location, use runtime's parent
          // This handles the case where Cursor sets cwd to user home instead of workspace
          if (cwd === path.dirname(cwd) || cwd === path.parse(cwd).root) {
            // cwd is root or weird - use runtime parent
            cwd = runtimeParent;
          }
        }
      }
      let projectRoot = cwd;
      let config: any;
      
      if (options.config) {
        // User specified a config file path
        let configPath = path.resolve(cwd, options.config);
        try {
          await fs.access(configPath);
          // Config exists, load it
          config = await loadConfigFromFile(configPath, cwd);
          projectRoot = config.projectRoot;
        } catch {
          // Config not found in cwd, try relative to ste-runtime installation
          const runtimeDir = path.resolve(__dirname, '../..');
          configPath = path.resolve(runtimeDir, options.config);
          try {
            await fs.access(configPath);
            config = await loadConfigFromFile(configPath, runtimeDir);
            projectRoot = config.projectRoot;
          } catch {
            throw new Error(`Config file not found: ${options.config}`);
          }
        }
      } else {
        // No config specified, check for ste.config.json in cwd
        const configPath = path.join(cwd, 'ste.config.json');
        try {
          await fs.access(configPath);
          // Config exists, load it - use cwd as project root
          config = await loadConfigFromFile(configPath, cwd);
          projectRoot = config.projectRoot;
        } catch {
          // No config file found - auto-create one for zero-configuration experience
          // Config search order (per loadConfigFile):
          // 1. Project root (cwd) - authoritative, what we create here
          // 2. Inside ste-runtime/ - fallback for portability
          // This makes ste-runtime truly "drop in and run" per E-ADR-009
          const runtimeDir = path.resolve(__dirname, '../..');
          
          // Always use loadConfig which has proper self-analysis detection
          // This ensures correct project root detection regardless of cwd
          config = await loadConfig(runtimeDir);
          projectRoot = config.projectRoot;
          
          // CRITICAL: For self-analysis, projectRoot MUST equal runtimeDir
          if (projectRoot !== runtimeDir) {
            log(`[ste watch] WARNING: Self-analysis detected but project root was ${projectRoot}, correcting to ${runtimeDir}`);
            projectRoot = runtimeDir;
            config = {
              ...config,
              projectRoot: runtimeDir,
              runtimeDir: runtimeDir,
            };
          }
        }
      }
      
      log(`[ste watch] Project root: ${projectRoot}`);
      log(`[ste watch] State directory: ${config.stateDir}`);
      
      // Check if manifest exists, run full RECON if not
      const manifest = await loadReconManifest(projectRoot);
      if (!manifest) {
        log('[ste watch] No manifest found, running initial RECON...');
        await runFullRecon(projectRoot);
        log('[ste watch] Initial RECON complete');
      }
      
      // Create MCP server
      const mcpServer = new McpServer({
        config,
        projectRoot: projectRoot,
      });
      
      // Create watchdog if file watching is enabled
      let watchdog = null;
      
      if (options.watch && config.watchdog.enabled) {
        watchdog = new Watchdog({
          projectRoot: projectRoot,
          config,
          onReconComplete: async () => {
            // Reload MCP server context after RECON
            await mcpServer.reloadContext();
          },
          onError: (error) => {
            logError('[ste watch] Watchdog error:', error);
          },
        });
        
        // Start watchdog
        await watchdog.start();
        log('[ste watch] File watching enabled');
      } else if (options.watch && !config.watchdog.enabled) {
        log('[ste watch] File watching disabled in config (set watchdog.enabled: true to enable)');
      } else {
        log('[ste watch] File watching disabled (--no-watch)');
      }
      
      // Start MCP server
      await mcpServer.start();
      
      // Handle shutdown
      const shutdown = async () => {
        log('\n[ste watch] Shutting down...');
        
        if (watchdog) {
          await watchdog.stop();
        }
        
        await mcpServer.stop();
        
        process.exit(0);
      };
      
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      
      // Keep process alive
      log('[ste watch] Ready (press Ctrl+C to stop)');
      
    } catch (error) {
      logError('[ste watch] Fatal error:', error);
      if (error instanceof Error) {
        logError('[ste watch] Error message:', error.message);
        if (error.stack) {
          logError('[ste watch] Stack trace:', error.stack);
        }
      }
      process.exit(1);
    }
  });

program
  .command('rss-deps <key>')
  .description('Get forward dependencies of a slice (what it depends on)')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .option('--depth <depth>', 'Traversal depth limit', (v) => parseInt(v, 10), 2)
  .action(async (key: string, options) => {
    const statePath = await resolveStatePath(options);
    const ctx = await initRssContext(statePath);
    const result = dependencies(ctx, key, options.depth);
    console.log(JSON.stringify({
      query: 'dependencies',
      startKey: key,
      depth: result.traversalDepth,
      truncated: result.truncated,
      count: result.nodes.length,
      nodes: result.nodes.map(n => ({ key: n.key, domain: n.domain, type: n.type, path: n.path })),
    }, null, 2));
  });

program
  .command('rss-dependents <key>')
  .description('Get reverse dependents of a slice (what depends on it)')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .option('--depth <depth>', 'Traversal depth limit', (v) => parseInt(v, 10), 2)
  .action(async (key: string, options) => {
    const statePath = await resolveStatePath(options);
    const ctx = await initRssContext(statePath);
    const result = dependents(ctx, key, options.depth);
    console.log(JSON.stringify({
      query: 'dependents',
      startKey: key,
      depth: result.traversalDepth,
      truncated: result.truncated,
      count: result.nodes.length,
      nodes: result.nodes.map(n => ({ key: n.key, domain: n.domain, type: n.type, path: n.path })),
    }, null, 2));
  });

program
  .command('rss-blast <key>')
  .description('Get blast radius of a slice (bidirectional traversal)')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .option('--depth <depth>', 'Traversal depth limit', (v) => parseInt(v, 10), 2)
  .action(async (key: string, options) => {
    const statePath = await resolveStatePath(options);
    const ctx = await initRssContext(statePath);
    const result = blastRadius(ctx, key, options.depth);
    console.log(JSON.stringify({
      query: 'blast_radius',
      startKey: key,
      depth: result.traversalDepth,
      truncated: result.truncated,
      count: result.nodes.length,
      nodes: result.nodes.map(n => ({ key: n.key, domain: n.domain, type: n.type, path: n.path })),
    }, null, 2));
  });

program
  .command('rss-tag <tag>')
  .description('Find all slices matching a tag (e.g., handler:lambda, layer:api)')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .action(async (tag: string, options) => {
    const statePath = await resolveStatePath(options);
    const ctx = await initRssContext(statePath);
    const result = byTag(ctx, tag);
    console.log(JSON.stringify({
      query: 'by_tag',
      tag,
      truncated: result.truncated,
      count: result.nodes.length,
      nodes: result.nodes.map(n => ({ key: n.key, domain: n.domain, type: n.type, path: n.path })),
    }, null, 2));
  });

program
  .command('rss-stats')
  .description('Display AI-DOC graph statistics')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .action(async (options) => {
    const statePath = await resolveStatePath(options);
    console.log(`[RSS] State directory: ${statePath}`);
    const ctx = await initRssContext(statePath);
    const stats = getGraphStats(ctx);
    console.log('\n=== AI-DOC Graph Statistics ===\n');
    console.log(`Graph Version: ${ctx.graphVersion}`);
    console.log(`Total Nodes: ${stats.totalNodes}`);
    console.log(`Total Edges: ${stats.totalEdges}`);
    console.log('\nBy Domain:');
    for (const [domain, count] of Object.entries(stats.byDomain).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${domain}: ${count}`);
    }
    console.log('\nBy Type:');
    for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
    console.log('');
  });

program
  .command('rss-lookup <key>')
  .description('Lookup a specific slice by key (domain/type/id)')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .action(async (key: string, options) => {
    const statePath = await resolveStatePath(options);
    const ctx = await initRssContext(statePath);
    const node = lookupByKey(ctx, key);
    if (node) {
      console.log(JSON.stringify(node, null, 2));
    } else {
      console.error(`Node not found: ${key}`);
      process.exit(1);
    }
  });

program
  .command('rss-search <query>')
  .description('Search the graph for nodes matching a query (entry point discovery)')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .option('--domain <domain>', 'Filter by domain', undefined)
  .option('--type <type>', 'Filter by type', undefined)
  .option('--max <max>', 'Maximum results', (v) => parseInt(v, 10), 20)
  .action(async (query: string, options) => {
    const statePath = await resolveStatePath(options);
    const ctx = await initRssContext(statePath);
    const result = search(ctx, query, {
      domain: options.domain,
      type: options.type,
      maxResults: options.max,
    });
    console.log(JSON.stringify({
      query: 'search',
      searchTerm: query,
      filters: { domain: options.domain, type: options.type },
      truncated: result.truncated,
      count: result.nodes.length,
      nodes: result.nodes.map(n => ({ 
        key: n.key, 
        domain: n.domain, 
        type: n.type, 
        id: n.id,
        path: n.path 
      })),
    }, null, 2));
  });

program
  .command('rss-context <query>')
  .description('Assemble context from a natural language query (full RSS pipeline)')
  .option('--state <state>', 'Path to AI-DOC state directory')
  .option('--config <configFile>', 'Config file (uses its stateDir)')
  .option('--depth <depth>', 'Traversal depth from entry points', (v) => parseInt(v, 10), 2)
  .option('--max <max>', 'Maximum nodes in context', (v) => parseInt(v, 10), 50)
  .option('--verbose', 'Show detailed output including slice content', false)
  .action(async (query: string, options) => {
    const startTime = Date.now();
    const statePath = await resolveStatePath(options);
    const ctx = await initRssContext(statePath);
    
    // Phase 1: Task Analysis / Entry Point Discovery
    const { entryPoints, searchTerms } = findEntryPoints(ctx, query);
    
    // Phase 2: Context Assembly via Graph Traversal
    const context = assembleContext(ctx, entryPoints, {
      maxDepth: options.depth,
      maxNodes: options.max,
    });
    
    const elapsed = Date.now() - startTime;
    
    console.log('\n=== RSS Context Assembly ===\n');
    console.log(`Query: "${query}"`);
    console.log(`Search Terms Extracted: ${searchTerms.join(', ')}`);
    console.log(`Entry Points Found: ${entryPoints.length}`);
    console.log(`Context Nodes: ${context.summary.totalNodes}`);
    console.log(`Traversal Depth: ${context.summary.traversalDepth}`);
    console.log(`Time: ${elapsed}ms\n`);
    
    console.log('Entry Points:');
    for (const ep of entryPoints.slice(0, 5)) {
      console.log(`  → ${ep.key}`);
    }
    if (entryPoints.length > 5) {
      console.log(`  ... and ${entryPoints.length - 5} more`);
    }
    
    console.log('\nContext by Domain:');
    for (const [domain, count] of Object.entries(context.summary.byDomain).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${domain}: ${count}`);
    }
    
    if (options.verbose) {
      console.log('\nContext Nodes:');
      for (const node of context.nodes) {
        console.log(`\n--- ${node.key} ---`);
        console.log(`  Domain: ${node.domain}`);
        console.log(`  Type: ${node.type}`);
        console.log(`  Path: ${node.path ?? 'N/A'}`);
        console.log(`  References: ${node.references.length}`);
        console.log(`  Referenced By: ${node.referencedBy.length}`);
      }
    }
    
    console.log('');
  });

program.parseAsync();
