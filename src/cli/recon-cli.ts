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
 *   node dist/cli/recon-cli.js --self             # Self-documentation mode
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRecon } from '../recon/index.js';
import { loadConfig, loadConfigFromFile, initConfig } from '../config/index.js';

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
  
  // Normal operation: auto-detect project and use config
  console.log('='.repeat(60));
  console.log(args.self
    ? 'RECON - Self-Documentation Mode (E-ADR-001, E-ADR-002)'
    : 'RECON - Reconciliation Engine (E-ADR-001, E-ADR-002)');
  console.log('='.repeat(60));
  console.log('');
  
  // Load configuration (use specific file if --config provided)
  const config = args.config
    ? await loadConfigFromFile(path.resolve(runtimeDir, args.config), runtimeDir)
    : await loadConfig(runtimeDir, { selfMode: args.self });
  
  const isSelfAnalysis = config.projectRoot === config.runtimeDir;
  
  console.log('Configuration:');
  console.log(`  Project Root: ${config.projectRoot}`);
  console.log(`  Runtime Dir:  ${config.runtimeDir}`);
  console.log(`  Languages:    ${config.languages.join(', ')}`);
  console.log(`  Self-Analysis: ${isSelfAnalysis}`);
  
  const result = await executeRecon({
    projectRoot: config.projectRoot,
    sourceRoot: config.sourceDirs[0] ?? '.',
    stateRoot: config.stateDir,
    mode: args.mode,
    config,
  });

  printResult(result, config.projectRoot, config.stateDir);
  process.exit(result.success ? 0 : 1);
}

function printResult(result: Awaited<ReturnType<typeof executeRecon>>, _projectRoot: string, _stateRoot: string) {
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
