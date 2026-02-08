#!/usr/bin/env node
/**
 * Watch CLI
 * 
 * CLI entry point for `ste watch` command.
 * Per E-ADR-011: Starts MCP server with optional file watching.
 */

import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { McpServer } from '../mcp/mcp-server.js';
import { Watchdog } from '../watch/watchdog.js';
import { executeRecon } from '../recon/index.js';
import { loadReconManifest } from '../watch/change-detector.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function main() {
  const program = new Command();

  program
    .name('ste watch')
    .description('Start MCP server with optional file watching')
    .option('--mcp', 'Enable MCP mode (default when run by Cursor)', true)
    .option('--no-watch', 'Disable file watching (MCP server only)')
    .option('--self', 'Self-analysis mode: analyze ste-runtime itself instead of parent project')
    .option('--config <path>', 'Custom config file path')
    .parse(process.argv);

  const options = program.opts();
  try {
    // Load configuration
    const runtimeDir = path.resolve(__dirname, '../..');
    const config = await loadConfig(runtimeDir, { selfMode: options.self });
    
    console.log(`[ste watch] Project root: ${config.projectRoot}`);
    console.log(`[ste watch] State directory: ${config.stateDir}`);
    
    // CRITICAL: Resolve stateDir to absolute path for manifest operations
    // The stateDir from config is relative to projectRoot, so resolve it properly
    const resolvedStateDir = path.resolve(config.projectRoot, config.stateDir);
    console.log(`[ste watch] Resolved state directory: ${resolvedStateDir}`);
    
    // Check if manifest exists, run full RECON if not
    // CRITICAL: Use resolvedStateDir, NOT projectRoot - manifest lives INSIDE stateDir
    const manifest = await loadReconManifest(resolvedStateDir);
    if (!manifest) {
      console.log('[ste watch] No manifest found, running initial RECON...');
      // Use executeRecon with proper config - this writes to config.stateDir (inside ste-runtime)
      await executeRecon({
        projectRoot: config.projectRoot,
        sourceRoot: config.sourceDirs[0] ?? '.',
        stateRoot: config.stateDir,
        mode: 'full',
        config: config,
      });
      console.log('[ste watch] Initial RECON complete');
    }
    
    // Create MCP server
    const mcpServer = new McpServer({
      config,
      projectRoot: config.projectRoot,
    });
    
    // Create watchdog if file watching is enabled
    let watchdog: Watchdog | null = null;
    
    if (options.watch && config.watchdog.enabled) {
      watchdog = new Watchdog({
        projectRoot: config.projectRoot,
        config,
        onReconComplete: async () => {
          // Reload MCP server context after RECON
          await mcpServer.reloadContext();
        },
        onError: (error) => {
          console.error('[ste watch] Watchdog error:', error);
        },
      });
      
      // Start watchdog
      await watchdog.start();
      console.log('[ste watch] File watching enabled');
    } else if (options.watch && !config.watchdog.enabled) {
      console.log('[ste watch] File watching disabled in config (set watchdog.enabled: true to enable)');
    } else {
      console.log('[ste watch] File watching disabled (--no-watch)');
    }
    
    // Start MCP server
    await mcpServer.start();
    
    // Handle shutdown
    const shutdown = async () => {
      console.log('\n[ste watch] Shutting down...');
      
      if (watchdog) {
        await watchdog.stop();
      }
      
      await mcpServer.stop();
      
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    // Keep process alive
    console.log('[ste watch] Ready (press Ctrl+C to stop)');
    
  } catch (error) {
    console.error('[ste watch] Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

