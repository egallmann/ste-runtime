#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRecon } from '../recon/index.js';
import { loadConfig, loadConfigFromFile } from '../config/index.js';
import { runRssTraversal } from '../rss/graph-traversal.js';
import { runArchitectureEvidenceCommand } from './evidence-command.js';
import { compileArchitecture } from '../architecture/compile-architecture.js';
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

const evidence = program
  .command('evidence')
  .description('Emit normalized runtime evidence as JSON');

evidence
  .command('architecture')
  .description('Emit architecture bundle evidence as JSON only')
  .requiredOption('--project-root <path>', 'Project root containing canonical ADR artifacts')
  .action(async (options) => {
    const exitCode = await runArchitectureEvidenceCommand(path.resolve(options.projectRoot));
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  });

const architecture = program
  .command('architecture')
  .description('Architecture bundle tooling (public contracts owned by ste-spec)');

architecture
  .command('compile')
  .description('Compile ADR YAML into registries, architecture index, manifest, and legacy entity registry')
  .requiredOption('--project-root <path>', 'Project root containing adrs/ and PROJECT.yaml')
  .option('--dry-run', 'Run pipeline without writing files', false)
  .action(async (options: { projectRoot: string; dryRun: boolean }) => {
    const result = await compileArchitecture({
      scopeRoot: path.resolve(options.projectRoot),
      dryRun: Boolean(options.dryRun),
    });
    if (!result.success) {
      for (const err of result.errors) {
        process.stderr.write(`${err}\n`);
      }
      process.exit(1);
    }
    if (result.written.length) {
      for (const rel of result.written) {
        process.stdout.write(`Wrote ${rel}\n`);
      }
    } else if (options.dryRun) {
      process.stdout.write('Dry run OK (no files written).\n');
    }
  });

program
  .command('recon')
  .description('Run RECON and emit AI-DOC state')
  .option('--config <configFile>', 'Config file to use (default: ste.config.json)')
  .option('--self', 'Self-analysis mode: analyze ste-runtime itself instead of parent project')
  .option('--mode <mode>', 'Recon mode: full | incremental', 'full')
  .action(async (options) => {
    const runtimeDir = path.resolve(__dirname, '../..');
    
    let config;
    if (options.config) {
      const configPath = path.resolve(options.config);
      console.log(`[RECON] Using config: ${configPath}`);
      config = await loadConfigFromFile(configPath, path.dirname(configPath));
    } else {
      // Load config with optional self-analysis mode
      config = await loadConfig(runtimeDir, { selfMode: options.self });
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

    // Self-pass: always keep ste-runtime's own graph fresh
    const isSelfAnalysis = config.projectRoot === config.runtimeDir;
    if (!isSelfAnalysis) {
      console.log('\n--- Self-Pass (ste-runtime) ---');
      const selfConfig = await loadConfig(runtimeDir, { selfMode: true });
      const selfResult = await executeRecon({
        projectRoot: selfConfig.projectRoot,
        sourceRoot: selfConfig.sourceDirs[0] ?? 'src',
        stateRoot: selfConfig.stateDir,
        mode: options.mode as 'full' | 'incremental',
        config: selfConfig,
      });
      console.log(`Self-pass: Created=${selfResult.aiDocCreated} Modified=${selfResult.aiDocModified} Unchanged=${selfResult.aiDocUnchanged}`);
      if (!selfResult.success) {
        console.log(`Self-pass errors: ${selfResult.errors.join('; ')}`);
      }
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
  .option('--self', 'Self-analysis mode: analyze ste-runtime itself instead of parent project')
  .option('--config <path>', 'Custom config file path')
  .option('--project-root <path>', 'Explicit project root directory (overrides cwd detection)')
  .action(async (options) => {
    // Import and run watch logic directly
    const { McpServer } = await import('../mcp/mcp-server.js');
    const { Watchdog } = await import('../watch/watchdog.js');
    const { loadConfig, loadConfigFromFile } = await import('../config/index.js');
    const { executeRecon } = await import('../recon/index.js');
    const { loadReconManifest } = await import('../watch/change-detector.js');
    const { setMcpMode, log: globalLog } = await import('../utils/logger.js');
    const fs = await import('fs/promises');
    
    // In MCP mode, redirect all logging to stderr (MCP uses stdout for JSON protocol)
    const isMcpMode = options.mcp !== false;
    setMcpMode(isMcpMode);
    const log = globalLog;
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
      if (options.projectRoot) {
        cwd = path.resolve(options.projectRoot);
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
        // No explicit config specified - use loadConfig with optional self-mode flag
        // This ensures stateDir is ALWAYS inside ste-runtime for self-containment
        const runtimeDir = path.resolve(__dirname, '../..');
        config = await loadConfig(runtimeDir, { selfMode: options.self });
        projectRoot = config.projectRoot;
      }
      
      // --project-root takes precedence over config-derived projectRoot
      if (options.projectRoot) {
        projectRoot = path.resolve(options.projectRoot);
      }
      
      log(`[ste watch] Project root: ${projectRoot}`);
      log(`[ste watch] State directory: ${config.stateDir}`);
      
      // Detect workspace mode: if projectRoot has a workspace.yaml, skip single-project RECON
      // (workspace recon is run separately via `ste recon --workspace`)
      let isWorkspaceMode = false;
      for (const wsName of ['workspace.yaml', 'workspace.yml']) {
        try {
          await fs.access(path.join(projectRoot, wsName));
          isWorkspaceMode = true;
          log(`[ste watch] Workspace mode detected (${wsName} found)`);
          break;
        } catch { /* not found */ }
      }
      
      if (!isWorkspaceMode) {
        // CRITICAL: Resolve stateDir to absolute path for manifest operations
        // The stateDir from config is relative to projectRoot, so resolve it properly
        const resolvedStateDir = path.resolve(projectRoot, config.stateDir);
        log(`[ste watch] Resolved state directory: ${resolvedStateDir}`);
        
        // Check if manifest exists, run full RECON if not
        // CRITICAL: Use resolvedStateDir, NOT projectRoot - manifest lives INSIDE stateDir
        const manifest = await loadReconManifest(resolvedStateDir);
        if (!manifest) {
          log('[ste watch] No manifest found, running initial RECON...');
          await executeRecon({
            projectRoot: config.projectRoot,
            sourceRoot: config.sourceDirs[0] ?? '.',
            stateRoot: config.stateDir,
            mode: 'full',
            config: config,
          });
          log('[ste watch] Initial RECON complete');
        }
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

// ─── ste init ───────────────────────────────────────────────
program
  .command('init')
  .description('Scaffold a workspace.yaml with discovered repos and generic defaults')
  .option('--output <file>', 'Output file path', 'workspace.yaml')
  .option('--output-dir <dir>', 'Workspace output directory', '.workspace-graph/')
  .option('--dry-run', 'Print to stdout without writing file', false)
  .action(async (options) => {
    const cwd = process.cwd();
    const fs = await import('node:fs/promises');
    const fss = await import('node:fs');

    const langHints: Record<string, string> = {
      'package.json': 'node',
      'tsconfig.json': 'node',
      'setup.py': 'python',
      'pyproject.toml': 'python',
      'requirements.txt': 'python',
    };

    const entries = await fs.readdir(cwd, { withFileTypes: true });
    const repos: Array<{ name: string; path: string; kind: string; lang: string }> = [];

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
      const dirPath = path.join(cwd, ent.name);
      const children = await fs.readdir(dirPath).catch(() => [] as string[]);

      let lang = 'unknown';
      for (const [marker, detected] of Object.entries(langHints)) {
        if (children.includes(marker)) { lang = detected; break; }
      }
      if (lang === 'unknown') {
        if (children.some(c => c.endsWith('.csproj') || c.endsWith('.sln'))) lang = 'dotnet';
        if (children.includes('sam') || children.includes('cfn_templates')) {
          if (lang === 'unknown') lang = 'python';
        }
      }

      const hasCfn = children.includes('sam') || children.includes('cfn_templates');
      const kind = hasCfn ? 'service' : 'library';
      repos.push({ name: ent.name, path: `./${ent.name}`, kind, lang });
    }

    if (repos.length === 0) {
      console.log('[ste init] No repository directories found in current directory.');
      return;
    }

    const yamlLines = [
      `schema_version: "1.0"`,
      `output_dir: ${options.outputDir}`,
      `repos:`,
    ];
    for (const r of repos) {
      const pad = Math.max(1, 30 - r.name.length);
      yamlLines.push(`  - { name: ${r.name},${' '.repeat(pad)}path: ${r.path},${' '.repeat(Math.max(1, 30 - r.path.length))}kind: ${r.kind},${' '.repeat(Math.max(1, 14 - r.kind.length))}lang: ${r.lang} }`);
    }
    const content = yamlLines.join('\n') + '\n';

    if (options.dryRun) {
      console.log(content);
    } else {
      const outPath = path.resolve(cwd, options.output);
      if (fss.existsSync(outPath)) {
        console.log(`[ste init] ${options.output} already exists. Use --dry-run to preview or delete the file first.`);
        return;
      }
      await fs.writeFile(outPath, content, 'utf-8');
      console.log(`[ste init] Created ${options.output} with ${repos.length} repos.`);
      console.log(`[ste init] Review the file, then run: ste recon --workspace`);
    }
  });

// ============================================================================
// Workspace Graph Queries (non-LLM canned traversals)
// ============================================================================

const ws = program
  .command('ws')
  .description('Workspace graph queries (non-LLM canned traversals)');

ws
  .command('deps')
  .description('Show system-level repo dependency map')
  .requiredOption('--workspace <path>', 'Path to workspace output directory (contains slices/ and workspace-index.yaml)')
  .option('--output <format>', 'Output format: mermaid | table | matrix | json', 'table')
  .option('--resolution <level>', 'Resolution level: L0 | L1 | L2 | L3 | L4 (default: L4)')
  .action(async (options: { workspace: string; output: string; resolution?: string }) => {
    const { loadWorkspaceGraph } = await import('../workspace/workspace-graph-loader.js');
    const { systemDependencies } = await import('../workspace/canned-queries.js');
    const { toMermaid, toTable, toAdjacencyMatrix, toMermaidAtResolution, toTableAtResolution } = await import('../workspace/projections.js');
    const { compress } = await import('../workspace/compression.js');
    const resLevel = (options.resolution as 'L0' | 'L1' | 'L2' | 'L3' | 'L4') ?? undefined;

    const graph = await loadWorkspaceGraph(path.resolve(options.workspace));
    const result = systemDependencies(graph);

    if (resLevel && resLevel !== 'L4') {
      const compressed = compress(result, { level: resLevel });
      switch (options.output) {
        case 'mermaid':
          console.log(toMermaidAtResolution(compressed));
          break;
        case 'json':
          console.log(JSON.stringify({ compressed: compressed.metadata, nodes: compressed.nodes.length, edges: compressed.edges.length }, null, 2));
          break;
        default:
          console.table(toTableAtResolution(compressed));
          break;
      }
    } else {
      switch (options.output) {
        case 'mermaid':
          console.log(toMermaid(result));
          break;
        case 'matrix': {
          const m = toAdjacencyMatrix(result);
          console.log(['', ...m.labels].join('\t'));
          for (let i = 0; i < m.labels.length; i++) {
            console.log([m.labels[i], ...m.matrix[i]!].join('\t'));
          }
          break;
        }
        case 'json':
          console.log(JSON.stringify(result, null, 2));
          break;
        default:
          console.table(toTable(result));
          break;
      }
    }
  });

ws
  .command('integration')
  .description('Show component integration map')
  .requiredOption('--workspace <path>', 'Path to workspace output directory')
  .option('--repo <name>', 'Filter to a specific repo')
  .option('--output <format>', 'Output format: mermaid | table | matrix | json', 'table')
  .option('--resolution <level>', 'Resolution level: L0 | L1 | L2 | L3 | L4 (default: L4)')
  .action(async (options: { workspace: string; repo?: string; output: string; resolution?: string }) => {
    const { loadWorkspaceGraph } = await import('../workspace/workspace-graph-loader.js');
    const { componentIntegration } = await import('../workspace/canned-queries.js');
    const { toMermaid, toTable, toAdjacencyMatrix, toMermaidAtResolution, toTableAtResolution } = await import('../workspace/projections.js');
    const { compress } = await import('../workspace/compression.js');
    const resLevel = (options.resolution as 'L0' | 'L1' | 'L2' | 'L3' | 'L4') ?? undefined;

    const graph = await loadWorkspaceGraph(path.resolve(options.workspace));
    const result = componentIntegration(graph, options.repo ? { repo: options.repo } : undefined);

    if (resLevel && resLevel !== 'L4') {
      const compressed = compress(result, { level: resLevel });
      switch (options.output) {
        case 'mermaid':
          console.log(toMermaidAtResolution(compressed));
          break;
        case 'json':
          console.log(JSON.stringify({ compressed: compressed.metadata, nodes: compressed.nodes.length, edges: compressed.edges.length }, null, 2));
          break;
        default:
          console.table(toTableAtResolution(compressed));
          break;
      }
    } else {
      switch (options.output) {
        case 'mermaid':
          console.log(toMermaid(result));
          break;
        case 'matrix': {
          const m = toAdjacencyMatrix(result);
          console.log(['', ...m.labels].join('\t'));
          for (let i = 0; i < m.labels.length; i++) {
            console.log([m.labels[i], ...m.matrix[i]!].join('\t'));
          }
          break;
        }
        case 'json':
          console.log(JSON.stringify(result, null, 2));
          break;
        default:
          console.table(toTable(result));
          break;
      }
    }
  });

ws
  .command('blast <target>')
  .description('Show blast radius for a workspace node')
  .requiredOption('--workspace <path>', 'Path to workspace output directory')
  .option('--output <format>', 'Output format: mermaid | table | matrix | json', 'table')
  .option('--depth <depth>', 'Max BFS depth', (v) => Number.parseInt(v, 10), 3)
  .action(async (target: string, options: { workspace: string; output: string; depth: number }) => {
    const { loadWorkspaceGraph } = await import('../workspace/workspace-graph-loader.js');
    const { blastRadiusWorkspace } = await import('../workspace/canned-queries.js');
    const { toMermaid, toTable, toAdjacencyMatrix } = await import('../workspace/projections.js');

    const graph = await loadWorkspaceGraph(path.resolve(options.workspace));
    const result = blastRadiusWorkspace(graph, target, { maxDepth: options.depth });

    console.log(`Risk: ${result.risk.toUpperCase()} (${result.affectedNodeCount} nodes, ${result.affectedRepos.length} repos)`);
    console.log('');

    switch (options.output) {
      case 'mermaid':
        console.log(toMermaid(result));
        break;
      case 'matrix': {
        const m = toAdjacencyMatrix(result);
        console.log(['', ...m.labels].join('\t'));
        for (let i = 0; i < m.labels.length; i++) {
          console.log([m.labels[i], ...m.matrix[i]!].join('\t'));
        }
        break;
      }
      case 'json':
        console.log(JSON.stringify(result, null, 2));
        break;
      default:
        console.table(toTable(result));
        break;
    }
  });


// ─── ste setup ──────────────────────────────────────────────
program
  .command('setup')
  .description('One-command workspace onboarding: detect type, scaffold config, create MCP, update .gitignore, run RECON')
  .option('--dry-run', 'Preview all changes without writing files', false)
  .option('--ste-runtime-path <path>', 'Absolute path to ste-runtime (default: auto-detect from this CLI binary)')
  .option('--skip-recon', 'Skip the initial RECON run', false)
  .option('--project-root <path>', 'Workspace root to set up (default: cwd)')
  .action(async (options: { dryRun: boolean; steRuntimePath?: string; skipRecon: boolean; projectRoot?: string }) => {
    const fs = await import('node:fs/promises');
    const fss = await import('node:fs');
    const { execSync } = await import('node:child_process');

    const cwd = options.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
    const runtimeDir = options.steRuntimePath
      ? path.resolve(options.steRuntimePath)
      : path.resolve(__dirname, '..', '..');

    const log = (msg: string) => console.log(msg);
    const ok = (msg: string) => console.log(`  [ok] ${msg}`);
    const skip = (msg: string) => console.log(`  [skip] ${msg}`);
    const action = (msg: string) => console.log(`  [+] ${msg}`);

    log('');
    log('ste setup — workspace onboarding');
    log(`  workspace:    ${cwd}`);
    log(`  ste-runtime:  ${runtimeDir}`);
    log(`  dry-run:      ${options.dryRun}`);
    log('');

    // ── Validate ste-runtime directory ──
    const runtimePkg = path.join(runtimeDir, 'package.json');
    if (!fss.existsSync(runtimePkg)) {
      console.error(`[error] Cannot find package.json in ste-runtime path: ${runtimeDir}`);
      console.error('        Use --ste-runtime-path to specify the correct location.');
      process.exitCode = 1;
      return;
    }
    const runtimeCli = path.join(runtimeDir, 'dist', 'cli', 'index.js');
    if (!fss.existsSync(runtimeCli)) {
      console.error(`[error] dist/cli/index.js not found. Run 'npm run build' in ste-runtime first.`);
      process.exitCode = 1;
      return;
    }

    // ── Step 1: Detect workspace type ──
    log('Step 1: Detecting workspace type...');
    const PROJECT_MARKERS = [
      'package.json', 'tsconfig.json', 'setup.py', 'pyproject.toml',
      'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml',
    ];
    const CSPROJ_PATTERN = /\.(csproj|sln|fsproj)$/;

    const langHints: Record<string, string> = {
      'package.json': 'node', 'tsconfig.json': 'node',
      'setup.py': 'python', 'pyproject.toml': 'python', 'requirements.txt': 'python',
      'Cargo.toml': 'rust', 'go.mod': 'go', 'pom.xml': 'java',
    };

    const entries = await fs.readdir(cwd, { withFileTypes: true });
    const repos: Array<{ name: string; path: string; kind: string; lang: string }> = [];

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
      const dirPath = path.join(cwd, ent.name);
      const children = await fs.readdir(dirPath).catch(() => [] as string[]);

      let isProject = false;
      let lang = 'unknown';

      for (const marker of PROJECT_MARKERS) {
        if (children.includes(marker)) {
          isProject = true;
          if (langHints[marker]) lang = langHints[marker]!;
          break;
        }
      }
      if (!isProject && children.some(c => CSPROJ_PATTERN.test(c))) {
        isProject = true;
        lang = 'dotnet';
      }

      if (isProject) {
        const hasCfn = children.includes('sam') || children.includes('cfn_templates');
        const kind = hasCfn ? 'service' : 'library';
        repos.push({ name: ent.name, path: `./${ent.name}`, kind, lang });
      }
    }

    const isMultiRepo = repos.length >= 2;
    const isSteRuntimeSelf = path.resolve(cwd) === path.resolve(runtimeDir);

    if (isMultiRepo) {
      log(`  Detected multi-repo workspace with ${repos.length} projects.`);
    } else if (isSteRuntimeSelf) {
      log('  Detected ste-runtime self-analysis (standalone).');
    } else {
      log('  Detected single-repo project.');
    }
    log('');

    // Collect all planned writes for dry-run preview
    const writes: Array<{ file: string; content: string; description: string }> = [];
    const appends: Array<{ file: string; lines: string[]; description: string }> = [];

    // ── Step 2: Scaffold workspace.yaml or ste.config.json ──
    log('Step 2: Scaffolding configuration...');
    if (isMultiRepo) {
      const wsYaml = path.join(cwd, 'workspace.yaml');
      if (fss.existsSync(wsYaml)) {
        skip('workspace.yaml already exists');
      } else {
        const yamlLines = [
          `schema_version: "1.0"`,
          `output_dir: .workspace-graph/`,
          `repos:`,
        ];
        for (const r of repos) {
          const pad = Math.max(1, 30 - r.name.length);
          yamlLines.push(`  - { name: ${r.name},${' '.repeat(pad)}path: ${r.path},${' '.repeat(Math.max(1, 30 - r.path.length))}kind: ${r.kind},${' '.repeat(Math.max(1, 14 - r.kind.length))}lang: ${r.lang} }`);
        }
        writes.push({
          file: wsYaml,
          content: yamlLines.join('\n') + '\n',
          description: `workspace.yaml with ${repos.length} repos`,
        });
      }
    } else if (!isSteRuntimeSelf) {
      const steConfig = path.join(cwd, 'ste.config.json');
      if (fss.existsSync(steConfig)) {
        skip('ste.config.json already exists');
      } else {
        const config = {
          projectRoot: '.',
          outputDir: '.ste/state',
          extractors: { typescript: { enabled: true }, python: { enabled: true } },
        };
        writes.push({
          file: steConfig,
          content: JSON.stringify(config, null, 2) + '\n',
          description: 'ste.config.json with auto-detected defaults',
        });
      }
    }

    // ── Step 3: Create .cursor/mcp.json ──
    log('Step 3: Creating .cursor/mcp.json...');
    const cursorDir = path.join(cwd, '.cursor');
    const mcpPath = path.join(cursorDir, 'mcp.json');

    const cliPath = path.join(runtimeDir, 'dist', 'cli', 'index.js');
    const mcpArgs = ['watch', '--mcp', '--project-root', cwd];

    const newServerConfig: Record<string, unknown> = {
      disabled: false,
      timeout: 60,
      type: 'stdio',
      command: 'node',
      args: [cliPath, ...mcpArgs],
    };

    let existingMcp: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
    if (fss.existsSync(mcpPath)) {
      try {
        existingMcp = JSON.parse(fss.readFileSync(mcpPath, 'utf8'));
        if (!existingMcp.mcpServers) existingMcp.mcpServers = {};
      } catch {
        existingMcp = { mcpServers: {} };
      }
    }

    if (existingMcp.mcpServers?.['ste-runtime']) {
      skip('.cursor/mcp.json already has ste-runtime entry');
    } else {
      existingMcp.mcpServers!['ste-runtime'] = newServerConfig;
      writes.push({
        file: mcpPath,
        content: JSON.stringify(existingMcp, null, 2) + '\n',
        description: '.cursor/mcp.json with ste-runtime MCP server',
      });
    }

    // ── Step 4: Update .gitignore ──
    log('Step 4: Updating .gitignore...');
    const gitignorePath = path.join(cwd, '.gitignore');
    const ignoreEntries = ['.ste/', '.ste-self/', '.workspace-graph/'];
    const existingGitignore = fss.existsSync(gitignorePath)
      ? fss.readFileSync(gitignorePath, 'utf8')
      : '';

    const missingEntries = ignoreEntries.filter(e => {
      const lines = existingGitignore.split('\n').map(l => l.trim());
      return !lines.includes(e) && !lines.includes(e.replace(/\/$/, ''));
    });

    if (missingEntries.length === 0) {
      skip('.gitignore already contains all required entries');
    } else {
      appends.push({
        file: gitignorePath,
        lines: ['', '# ste-runtime generated state', ...missingEntries],
        description: `.gitignore entries: ${missingEntries.join(', ')}`,
      });
    }

    // ── Preview / Write ──
    log('');
    if (writes.length === 0 && appends.length === 0) {
      log('Nothing to do — all configuration files are already in place.');
    } else if (options.dryRun) {
      log('=== DRY RUN — the following changes would be made ===');
      log('');
      for (const w of writes) {
        log(`CREATE ${w.file}`);
        log(`  ${w.description}`);
        log('  --- content preview ---');
        const lines = w.content.split('\n');
        for (const line of lines.slice(0, 20)) {
          log(`  ${line}`);
        }
        if (lines.length > 20) log(`  ... (${lines.length - 20} more lines)`);
        log('');
      }
      for (const a of appends) {
        log(`APPEND ${a.file}`);
        log(`  ${a.description}`);
        for (const line of a.lines) {
          log(`  ${line}`);
        }
        log('');
      }
      log('Re-run without --dry-run to apply.');
      return;
    } else {
      for (const w of writes) {
        const dir = path.dirname(w.file);
        if (!fss.existsSync(dir)) {
          await fs.mkdir(dir, { recursive: true });
        }
        await fs.writeFile(w.file, w.content, 'utf-8');
        action(w.description);
      }
      for (const a of appends) {
        const suffix = a.lines.join('\n') + '\n';
        await fs.appendFile(a.file, suffix, 'utf-8');
        action(a.description);
      }
    }

    // ── Step 5: Run initial RECON ──
    if (!options.skipRecon && !options.dryRun) {
      log('');
      log('Step 5: Running initial RECON...');
      const reconMode = isMultiRepo ? 'workspace' : (isSteRuntimeSelf ? 'self' : 'full');
      const reconScript = `recon:${reconMode}`;
      try {
        log(`  Running npm run ${reconScript} ...`);
        execSync(`npm run ${reconScript}`, {
          cwd: runtimeDir,
          stdio: 'inherit',
          env: { ...process.env, STE_PROJECT_ROOT: cwd },
        });
        ok('RECON complete');
      } catch {
        console.error('  [warn] RECON failed. You can retry later with:');
        console.error(`         cd ${runtimeDir} && npm run ${reconScript}`);
      }
    } else if (options.dryRun) {
      log('Step 5: (skipped in dry-run) Would run initial RECON.');
    } else {
      skip('RECON (--skip-recon)');
    }

    // ── Step 6: Verification instructions ──
    log('');
    log('Step 6: Verification');
    log('');
    log('  1. Restart Cursor (or reload the window) so it picks up .cursor/mcp.json');
    log('  2. Open the Cursor MCP panel and confirm "ste-runtime" appears');
    log('  3. In Cursor chat, ask: "call the overview tool"');
    log('     You should see a summary of the semantic graph.');
    log('');
    log('Setup complete.');
  });

ws
  .command('resolve <target>')
  .description('Resolve a workspace graph entity or source URI to authoritative source locator metadata')
  .requiredOption('--workspace <path>', 'Path to workspace output directory')
  .action(async (target: string, options: { workspace: string }) => {
    const { loadSourceLocatorRegistry, resolveLocator } = await import('../workspace/source-locator-registry.js');
    const registry = await loadSourceLocatorRegistry(path.resolve(options.workspace));
    const locator = resolveLocator(registry, target);
    if (!locator) {
      console.error(`No source locator resolved for: ${target}`);
      process.exit(1);
    }
    console.log(JSON.stringify({ status: 'resolved', locator }, null, 2));
  });

ws
  .command('source <target>')
  .description('Resolve a workspace entity/source URI and retrieve authoritative source content')
  .requiredOption('--workspace <path>', 'Path to workspace output directory')
  .option('--max-lines <n>', 'Maximum source lines to return', (v) => Number.parseInt(v, 10), 120)
  .action(async (target: string, options: { workspace: string; maxLines: number }) => {
    const fs = await import('node:fs/promises');
    const { loadSourceLocatorRegistry, resolveLocator } = await import('../workspace/source-locator-registry.js');
    const registry = await loadSourceLocatorRegistry(path.resolve(options.workspace));
    const locator = resolveLocator(registry, target);
    if (!locator) {
      console.error(`No source locator resolved for: ${target}`);
      process.exit(1);
    }
    const repoRoot = locator.repo_path ?? path.join(path.dirname(path.resolve(options.workspace)), locator.repo);
    const sourcePath = path.resolve(repoRoot, locator.path);
    const content = await fs.readFile(sourcePath, 'utf-8');
    const lines = content.split('\n').slice(0, options.maxLines);
    console.log(JSON.stringify({
      status: 'resolved',
      locator,
      content: lines.join('\n'),
      truncated: content.split('\n').length > options.maxLines,
    }, null, 2));
  });

ws
  .command('cem <target>')
  .description('Assemble a CEM bundle from workspace graph, source locators, and traversal context')
  .requiredOption('--workspace <path>', 'Path to workspace output directory')
  .option('--depth <n>', 'Traversal depth', (v) => Number.parseInt(v, 10), 2)
  .option('--max-nodes <n>', 'Maximum graph nodes', (v) => Number.parseInt(v, 10), 50)
  .action(async (target: string, options: { workspace: string; depth: number; maxNodes: number }) => {
    const { loadWorkspaceGraph } = await import('../workspace/workspace-graph-loader.js');
    const { loadSourceLocatorRegistry } = await import('../workspace/source-locator-registry.js');
    const { assembleCemBundle } = await import('../workspace/cem-mvc.js');
    const workspace = path.resolve(options.workspace);
    const graph = await loadWorkspaceGraph(workspace);
    const registry = await loadSourceLocatorRegistry(workspace);
    const cem = assembleCemBundle({
      graph,
      registry,
      query: target,
      maxDepth: options.depth,
      maxNodes: options.maxNodes,
    });
    console.log(JSON.stringify(cem, null, 2));
  });

ws
  .command('mvc <target>')
  .description('Derive and validate an MVC bundle from a CEM bundle')
  .requiredOption('--workspace <path>', 'Path to workspace output directory')
  .option('--depth <n>', 'Traversal depth', (v) => Number.parseInt(v, 10), 2)
  .option('--max-nodes <n>', 'Maximum graph nodes', (v) => Number.parseInt(v, 10), 50)
  .option('--max-source-refs <n>', 'Maximum source references in MVC', (v) => Number.parseInt(v, 10), 8)
  .action(async (target: string, options: { workspace: string; depth: number; maxNodes: number; maxSourceRefs: number }) => {
    const { loadWorkspaceGraph } = await import('../workspace/workspace-graph-loader.js');
    const { loadSourceLocatorRegistry } = await import('../workspace/source-locator-registry.js');
    const { assembleCemBundle, deriveMvcBundle, validateMvcBundle } = await import('../workspace/cem-mvc.js');
    const workspace = path.resolve(options.workspace);
    const graph = await loadWorkspaceGraph(workspace);
    const registry = await loadSourceLocatorRegistry(workspace);
    const cem = assembleCemBundle({
      graph,
      registry,
      query: target,
      maxDepth: options.depth,
      maxNodes: options.maxNodes,
    });
    const mvc = deriveMvcBundle(cem, { maxSourceRefs: options.maxSourceRefs });
    const validation = validateMvcBundle(mvc, cem);
    console.log(JSON.stringify({ cem, mvc, validation }, null, 2));
  });

ws
  .command('validate-mvc <bundle>')
  .description('Validate an MVC bundle JSON file containing { cem, mvc }')
  .action(async (bundle: string) => {
    const fs = await import('node:fs/promises');
    const { validateMvcBundle } = await import('../workspace/cem-mvc.js');
    const raw = await fs.readFile(path.resolve(bundle), 'utf-8');
    const parsed = JSON.parse(raw) as { cem?: any; mvc?: any };
    if (!parsed.cem || !parsed.mvc) {
      console.error('validate-mvc expects a JSON file with top-level { "cem": ..., "mvc": ... }');
      process.exit(1);
    }
    console.log(JSON.stringify(validateMvcBundle(parsed.mvc, parsed.cem), null, 2));
  });

ws
  .command('neighborhood <target>')
  .description('Traverse a workspace graph neighborhood and include source locator metadata')
  .requiredOption('--workspace <path>', 'Path to workspace output directory')
  .option('--depth <n>', 'Traversal depth', (v) => Number.parseInt(v, 10), 2)
  .option('--max-nodes <n>', 'Maximum graph nodes', (v) => Number.parseInt(v, 10), 50)
  .action(async (target: string, options: { workspace: string; depth: number; maxNodes: number }) => {
    const { loadWorkspaceGraph } = await import('../workspace/workspace-graph-loader.js');
    const { loadSourceLocatorRegistry, resolveLocator } = await import('../workspace/source-locator-registry.js');
    const { assembleCemBundle } = await import('../workspace/cem-mvc.js');
    const workspace = path.resolve(options.workspace);
    const graph = await loadWorkspaceGraph(workspace);
    const registry = await loadSourceLocatorRegistry(workspace);
    const cem = assembleCemBundle({
      graph,
      registry,
      query: target,
      maxDepth: options.depth,
      maxNodes: options.maxNodes,
    });
    console.log(JSON.stringify({
      target,
      nodes: cem.traversal_context.visited_node_ids.map(id => ({
        id,
        locator: resolveLocator(registry, id),
      })),
      traversal: cem.traversal_context,
      negative_space_constraints: cem.negative_space_constraints,
    }, null, 2));
  });

program.parseAsync();
