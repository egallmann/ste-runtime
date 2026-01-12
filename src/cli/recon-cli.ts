#!/usr/bin/env node
/**
 * RECON CLI Entry Point
 * 
 * Portable execution interface for RECON reconciliation.
 * Auto-detects parent project and applies configuration.
 * 
 * Usage:
 *   node dist/cli/recon-cli.js                    # Auto-detect project, incremental mode
 *   node dist/cli/recon-cli.js --mode=full        # Full reconciliation
 *   node dist/cli/recon-cli.js --init             # Create ste.config.json
 *   node dist/cli/recon-cli.js --self             # Self-documentation mode (legacy)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { executeRecon } from '../recon/index.js';
import { loadConfig, loadConfigFromFile, initConfig, type ResolvedConfig } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(args: string[]): {
  mode: 'incremental' | 'full';
  init: boolean;
  self: boolean;
  help: boolean;
  config: string | null;
} {
  return {
    mode: args.find(a => a.startsWith('--mode='))?.split('=')[1] as 'incremental' | 'full' ?? 'incremental',
    init: args.includes('--init'),
    self: args.includes('--self'),
    help: args.includes('--help') || args.includes('-h'),
    config: args.find(a => a.startsWith('--config='))?.split('=')[1] ?? null,
  };
}

function printHelp() {
  console.log(`
RECON - Reconciliation Engine (E-ADR-001, E-ADR-002)

Usage:
  recon [options]

Options:
  --mode=incremental   Incremental reconciliation (default)
  --mode=full          Full reconciliation
  --config=<file>      Use specific config file (e.g., ste-self.config.json)
  --init               Create ste.config.json in project root
  --self               Self-documentation mode (scan ste-runtime only)
  --help, -h           Show this help message

Configuration:
  RECON uses auto-detection by default - no config needed.
  If customization is needed, run --init to create ste.config.json
  inside ste-runtime/ (self-contained).

  Example ste.config.json:
  {
    "languages": ["typescript", "python"],
    "sourceDirs": ["src", "lib"],
    "ignorePatterns": ["**/generated/**"]
  }

Portability:
  ste-runtime can be dropped into any project. It will:
  1. Auto-detect the project root (by finding package.json, pyproject.toml, etc.)
  2. Auto-detect languages (TypeScript, Python)
  3. Scan the project and generate AI-DOC state

Output:
  AI-DOC state is written to .ste/state/ (or configured stateDir)
  Validation reports are written to .ste/state/validation/

Per E-ADR-001 §5.4: Slices are pure derived artifacts, always regenerated.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  // Determine ste-runtime directory
  // When running from dist/cli, go up 2 levels to get to ste-runtime
  const runtimeDir = path.resolve(__dirname, '..', '..');
  
  // Handle --init
  if (args.init) {
    await initConfig(runtimeDir);
    console.log('');
    console.log('Edit ste.config.json to customize RECON behavior.');
    console.log('Set sourceDirs to match your project structure.');
    process.exit(0);
  }
  
  // Handle --self (legacy self-documentation mode)
  if (args.self) {
    console.log('='.repeat(60));
    console.log('RECON - Self-Documentation Mode (Legacy)');
    console.log('='.repeat(60));
    console.log('');
    
    const projectRoot = path.resolve(runtimeDir, '..');
    const sourceRoot = 'ste-runtime/src';
    const stateRoot = 'ste-runtime/.ste/state';
    
    console.log(`  Project Root: ${projectRoot}`);
    console.log(`  Source Root: ${sourceRoot}`);
    console.log(`  State Root: ${stateRoot}`);
    console.log('');
    
    const result = await executeRecon({
      projectRoot,
      sourceRoot,
      stateRoot,
      mode: args.mode,
    });
    
    printResult(result, projectRoot, stateRoot);
    process.exit(result.success ? 0 : 1);
  }
  
  // Normal operation: auto-detect project and use config
  console.log('='.repeat(60));
  console.log('RECON - Reconciliation Engine (E-ADR-001, E-ADR-002)');
  console.log('='.repeat(60));
  console.log('');
  
  // Load configuration (use specific file if --config provided)
  const config = args.config
    ? await loadConfigFromFile(path.resolve(runtimeDir, args.config), runtimeDir)
    : await loadConfig(runtimeDir);
  
  const isSelfAnalysis = config.projectRoot === config.runtimeDir;
  
  console.log('Configuration:');
  console.log(`  Project Root: ${config.projectRoot}`);
  console.log(`  Runtime Dir:  ${config.runtimeDir}`);
  console.log(`  Languages:    ${config.languages.join(', ')}`);
  console.log(`  Self-Analysis: ${isSelfAnalysis}`);
  
  // Declare variables for both reconciliations
  let externalResult: Awaited<ReturnType<typeof executeRecon>> | null = null;
  
  // For full recon in self-analysis mode: clean up .ste/state since there's no external project
  if (args.mode === 'full' && isSelfAnalysis) {
    const steStateDir = path.resolve(runtimeDir, '.ste', 'state');
    try {
      const stats = await fs.stat(steStateDir);
      if (stats.isDirectory()) {
        console.log('');
        console.log('='.repeat(60));
        console.log('Cleaning up orphaned .ste/state (no external project detected)...');
        console.log('='.repeat(60));
        console.log('');
        
        // Directly remove all slice files in .ste/state since there's no external project
        // Keep the directory structure but remove all slice content
        const subdirs = ['graph', 'api', 'data', 'infrastructure', 'behavior'];
        let deletedCount = 0;
        
        for (const subdir of subdirs) {
          const subdirPath = path.join(steStateDir, subdir);
          try {
            const entries = await fs.readdir(subdirPath, { recursive: true, withFileTypes: true });
            for (const entry of entries) {
              if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) && entry.name !== 'index.yaml') {
                // Use parentPath if available (Node 20.1+), otherwise construct from subdirPath
                const entryPath = 'parentPath' in entry && entry.parentPath 
                  ? path.join(entry.parentPath, entry.name)
                  : path.join(subdirPath, entry.name);
                await fs.unlink(entryPath);
                deletedCount++;
              }
            }
          } catch {
            // Subdirectory doesn't exist, skip
          }
        }
        
        // Also clean up manifest and validation directories
        try {
          await fs.rm(path.join(steStateDir, 'manifest'), { recursive: true, force: true });
        } catch {}
        try {
          await fs.rm(path.join(steStateDir, 'validation'), { recursive: true, force: true });
        } catch {}
        
        // Remove graph-metrics.json if it exists
        try {
          await fs.unlink(path.join(steStateDir, 'graph-metrics.json'));
        } catch {}
        
        console.log(`[RECON] Cleaned up orphaned .ste/state: ${deletedCount} slice files deleted`);
        console.log('');
      }
    } catch (error) {
      // .ste/state doesn't exist, which is fine - nothing to clean up
    }
  }
  
  // For full recon, run BOTH external project (if exists) AND self-analysis
  if (args.mode === 'full' && !isSelfAnalysis) {
    console.log('');
    console.log('='.repeat(60));
    console.log('Step 1: Reconciling external project...');
    console.log('='.repeat(60));
    console.log('');
    
    // Run RECON for external project
    externalResult = await executeRecon({
      projectRoot: config.projectRoot,
      sourceRoot: config.sourceDirs[0] || '.',
      stateRoot: config.stateDir, // This will be .ste/state for external projects
      mode: 'full',
      config,
    });
    
    printResult(externalResult, config.projectRoot, config.stateDir);
    
    console.log('');
    console.log('='.repeat(60));
    console.log('Step 2: Reconciling ste-runtime (self-analysis)...');
    console.log('='.repeat(60));
    console.log('');
  }
  
  // Always run self-analysis (even if we just did external project)
  // Load self-analysis config
  const selfConfigPath = path.join(runtimeDir, 'ste-self.config.json');
  let selfConfig: ResolvedConfig;
  
  try {
    selfConfig = await loadConfigFromFile(selfConfigPath, runtimeDir);
  } catch {
    // No ste-self.config.json, create a default self-analysis config
    selfConfig = {
      ...config,
      projectRoot: runtimeDir,
      runtimeDir: runtimeDir,
      stateDir: '.ste-self/state',
      sourceDirs: ['src'],
      languages: ['typescript' as const],
    };
  }
  
  // Run RECON for ste-runtime self-analysis
  const selfResult = await executeRecon({
    projectRoot: selfConfig.projectRoot,
    sourceRoot: selfConfig.sourceDirs[0] ?? 'src',
    stateRoot: selfConfig.stateDir, // .ste-self/state
    mode: args.mode,
    config: selfConfig,
  });
  
  if (args.mode === 'full' && !isSelfAnalysis && externalResult) {
    printResult(selfResult, selfConfig.projectRoot, selfConfig.stateDir);
    console.log('');
    console.log('='.repeat(60));
    console.log('Full RECON Complete: Both external project and self-analysis');
    console.log('='.repeat(60));
    process.exit(externalResult.success && selfResult.success ? 0 : 1);
  } else {
    // Single recon (incremental or self-analysis only)
    printResult(selfResult, selfConfig.projectRoot, selfConfig.stateDir);
    process.exit(selfResult.success ? 0 : 1);
  }
}

function printResult(result: Awaited<ReturnType<typeof executeRecon>>, projectRoot: string, stateRoot: string) {
  console.log('');
  console.log('='.repeat(60));
  console.log('RECON EXECUTION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Success: ${result.success}`);
  console.log('');
  console.log('AI-DOC State Changes:');
  console.log(`  Created:   ${result.aiDocCreated}`);
  console.log(`  Modified:  ${result.aiDocModified}`);
  console.log(`  Deleted:   ${result.aiDocDeleted}`);
  console.log(`  Unchanged: ${result.aiDocUnchanged}`);
  console.log(`  Total:     ${result.aiDocUpdated}`);
  console.log('');
  console.log(`Conflicts: ${result.conflictsDetected} (slices are pure derived artifacts)`);
  
  if (result.validationErrors > 0 || result.validationWarnings > 0 || result.validationInfo > 0) {
    console.log('');
    console.log('Validation Summary:');
    console.log(`  Errors:   ${result.validationErrors}`);
    console.log(`  Warnings: ${result.validationWarnings}`);
    console.log(`  Info:     ${result.validationInfo}`);
  }
  
  if (result.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    result.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  if (result.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    result.warnings.forEach(warn => console.log(`  - ${warn}`));
  }
  
  console.log('');
  console.log('Per E-ADR-001 §5.4 (corrected 2026-01-07):');
  console.log('  Slices are pure derived artifacts, always regenerated from source.');
  console.log('  Changes to slices = authoritative updates or semantic enrichment.');
  console.log('');
}

main().catch(error => {
  console.error('RECON CLI failed:', error);
  process.exit(1);
});
