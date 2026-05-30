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
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { executeRecon } from '../recon/index.js';
import { loadConfig, loadConfigFromFile, initConfig } from '../config/index.js';
import { executeWorkspaceRecon, type WorkspaceReconResult } from '../workspace/workspace-recon.js';
import {
  buildWorkspaceReconBenchmarkReport,
  formatBenchmarkJson,
  printBenchmarkSummary,
} from './benchmark-report.js';
import {
  parseWorkspaceArgv,
  resolveWorkspaceDirectory,
  WORKSPACE_CLI_AUTO,
  type ParsedWorkspaceCli,
} from '../workspace/workspace-cli-args.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadRuntimeVersion(runtimeDir: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(runtimeDir, 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === 'string' ? parsed.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function writeBenchmarkReport(
  reportPath: string,
  json: string,
): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
  await fs.writeFile(reportPath, json, 'utf-8');
}

function parseTimeoutPerRepoMs(args: string[]): number {
  const eq = args.find(a => a.startsWith('--timeout-per-repo='));
  const fromEq =
    eq !== undefined ? Number(eq.slice('--timeout-per-repo='.length).trim()) : Number.NaN;
  if (!Number.isNaN(fromEq) && eq !== undefined) {
    if (fromEq < 0 || !Number.isFinite(fromEq) || !Number.isInteger(fromEq)) {
      return Number.NaN;
    }
    return fromEq;
  }
  const idx = args.indexOf('--timeout-per-repo');
  if (idx !== -1 && idx + 1 < args.length) {
    const v = Number(args[idx + 1]);
    if (Number.isFinite(v) && Number.isInteger(v) && v >= 0) {
      return v;
    }
    return Number.NaN;
  }
  return 0;
}

function parseBenchmarkOut(args: string[]): string | null {
  const eq = args.find(a => a.startsWith('--benchmark-out='));
  if (eq !== undefined) {
    const value = eq.slice('--benchmark-out='.length).trim();
    return value.length > 0 ? value : null;
  }
  const idx = args.indexOf('--benchmark-out');
  if (idx !== -1 && idx + 1 < args.length) {
    const value = args[idx + 1]?.trim();
    return value && value.length > 0 ? value : null;
  }
  return null;
}

function parseArgs(args: string[]): {
  mode: 'incremental' | 'full';
  init: boolean;
  self: boolean;
  help: boolean;
  config: string | null;
  workspace: ParsedWorkspaceCli;
  failOnAnyError: boolean;
  skipUnchanged: boolean;
  timeoutPerRepoMs: number;
  benchmark: boolean;
  benchmarkOut: string | null;
  parseError: string | null;
} {
  const rawMode = args.find(a => a.startsWith('--mode='))?.split('=')[1] ?? 'incremental';
  const mode = rawMode === 'full' ? 'full' : 'incremental';
  const timeoutPerRepoMs = parseTimeoutPerRepoMs(args);
  let parseError: string | null = null;
  if (Number.isNaN(timeoutPerRepoMs)) {
    parseError =
      'recon: invalid --timeout-per-repo (expected non-negative integer milliseconds, ' +
      'e.g. --timeout-per-repo=60000)';
  }
  return {
    mode,
    init: args.includes('--init'),
    self: args.includes('--self'),
    help: args.includes('--help') || args.includes('-h'),
    config: args.find(a => a.startsWith('--config='))?.split('=')[1] ?? null,
    workspace: parseWorkspaceArgv(args),
    failOnAnyError: args.includes('--fail-on-any-error'),
    skipUnchanged: args.includes('--skip-unchanged'),
    timeoutPerRepoMs: Number.isNaN(timeoutPerRepoMs) ? 0 : timeoutPerRepoMs,
    benchmark: args.includes('--benchmark') || parseBenchmarkOut(args) !== null,
    benchmarkOut: parseBenchmarkOut(args),
    parseError,
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
  --self               Self-documentation mode (scan ste-runtime only, skip project)
  --workspace=<path>   Multi-repository mode: path to workspace directory or workspace.yaml
  --workspace <path>   Same as --workspace=<path>
  --workspace          Discover workspace.yaml / workspace.yml upward from cwd (or use STE_WORKSPACE_ROOT)
  --workspace=auto     Same as bare --workspace
  --fail-on-any-error  Strict mode: fail workspace run if any repo fails
                       (default: succeed if at least one repo succeeds)
  --skip-unchanged     Workspace only: skip repos unchanged since last successful run with matching sentinel
  --timeout-per-repo=<ms>
                       Workspace only: per-repo ceiling in ms (omit or use 0 to disable). Example: --timeout-per-repo=60000
  --timeout-per-repo <ms>
  --benchmark          Workspace mode: emit structured benchmark summary (+ JSON when used with --benchmark-out)
  --benchmark-out=<file>
                       Write benchmark JSON report to file (implies --benchmark)
  --benchmark-out <file>
  --help, -h           Show this help message

Self-pass:
  Every RECON invocation automatically includes a self-pass that
  updates ste-runtime's own graph in .ste-self/state (dogfooding).
  This runs after the primary target (project, workspace, or --self).

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

Workspace examples (paths illustrative only):
  recon --workspace /path/to/workspace-root
  recon --workspace              # discovers workspace.yaml upward from cwd
  STE_WORKSPACE_ROOT=/path/to/root recon --workspace

  Reads workspace.yaml (or workspace.yml); writes output under manifest output_dir

Environment:
  STE_WORKSPACE_ROOT   When set, used by bare --workspace / --workspace=auto instead of discovery.
Output:
  AI-DOC state is written to .ste/state/ (or configured stateDir)
  Validation reports are written to .ste/state/validation/

Per E-ADR-001 §5.4: Slices are pure derived artifacts, always regenerated.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.parseError) {
    console.error(args.parseError);
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (
    args.workspace !== null &&
    (args.self || args.init || args.config !== null)
  ) {
    console.error('recon: --workspace cannot be used with --self, --init, or --config.');
    process.exit(1);
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

  const workspaceResolved = await resolveWorkspaceDirectory(args.workspace, process.cwd(), runtimeDir);
  if (args.workspace !== null && workspaceResolved === null) {
    console.error(
      'recon: workspace mode could not resolve a manifest directory. Pass --workspace <path>, set STE_WORKSPACE_ROOT, or run from a directory tree that contains workspace.yaml (or workspace.yml).',
    );
    process.exit(1);
  }

  if (workspaceResolved !== null) {
    if (args.workspace === WORKSPACE_CLI_AUTO) {
      console.log(`recon: workspace root (resolved): ${workspaceResolved}`);
    }
    console.log('='.repeat(60));
    console.log('RECON - Workspace Mode (workspace.yaml)');
    if (args.failOnAnyError) {
      console.log('  Mode: STRICT (--fail-on-any-error)');
    }
    if (args.skipUnchanged) {
      console.log('  Incremental: --skip-unchanged enabled');
    }
    if (args.timeoutPerRepoMs > 0) {
      console.log(`  Timeout: ${args.timeoutPerRepoMs}ms per repo (--timeout-per-repo)`);
    }
    if (args.benchmark) {
      console.log('  Benchmark: enabled (--benchmark)');
    }
    console.log('='.repeat(60));
    console.log('');
    const benchmarkStartMs = performance.now();
    const wsResult = await executeWorkspaceRecon({
      workspacePath: workspaceResolved,
      mode: args.mode,
      runtimeDir,
      failOnAnyError: args.failOnAnyError,
      skipUnchanged: args.skipUnchanged,
      timeoutPerRepoMs: args.timeoutPerRepoMs,
    });
    const workspacePassMs = performance.now() - benchmarkStartMs;
    console.log(`Workspace index: ${wsResult.workspaceIndexPath}`);
    console.log('');
    for (const r of wsResult.repos) {
      if (r.status === 'success') {
        console.log(
          `  [${r.name}] OK  nodes=${r.nodeCount ?? 0} edges=${r.edgeCount ?? 0} slice=${r.slicePath ?? ''}`,
        );
      } else if (r.status === 'skipped') {
        console.log(`  [${r.name}] SKIPPED (unchanged)`);
      } else if (r.status === 'timed_out') {
        console.log(`  [${r.name}] TIMEOUT  stage=${r.error?.stage ?? '?'}  ${r.error?.message ?? ''}`);
      } else {
        console.log(`  [${r.name}] FAILED  stage=${r.error?.stage ?? '?'}  ${r.error?.message ?? ''}`);
      }
    }

    if (wsResult.projectionResult) {
      console.log(`  Projections: ${wsResult.projectionResult.fileCount} files written to projections/`);
    }

    printWorkspaceResult(wsResult);

    const selfPassStartMs = performance.now();
    const selfResult = await runSelfPass(runtimeDir, false, args.mode);
    const selfPassMs = selfResult ? performance.now() - selfPassStartMs : null;
    if (selfResult) {
      printSelfResult(selfResult);
    }

    if (args.benchmark) {
      const totalMs = performance.now() - benchmarkStartMs;
      const runtimeVersion = await loadRuntimeVersion(runtimeDir);
      const report = buildWorkspaceReconBenchmarkReport({
        wsResult,
        mode: args.mode,
        steRuntimeVersion: runtimeVersion,
        wallClockMs: {
          workspacePass: workspacePassMs,
          selfPass: selfPassMs,
          total: totalMs,
        },
        selfResult,
      });
      printBenchmarkSummary(report);
      const json = formatBenchmarkJson(report);
      if (args.benchmarkOut) {
        const outPath = path.resolve(args.benchmarkOut);
        await writeBenchmarkReport(outPath, json);
        console.log(`Benchmark JSON: ${outPath}`);
      } else {
        console.log('');
        console.log('=== BENCHMARK JSON ===');
        process.stdout.write(json);
      }
    }

    console.log('');
    const allSuccess = wsResult.success && (!selfResult || selfResult.success);
    process.exit(allSuccess ? 0 : 1);
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

  // Always run self-pass (dogfooding) unless the primary run already was self
  const selfResult = await runSelfPass(runtimeDir, isSelfAnalysis, args.mode);
  if (selfResult) {
    printSelfResult(selfResult);
  }

  const allSuccess = result.success && (!selfResult || selfResult.success);
  process.exit(allSuccess ? 0 : 1);
}

/**
 * Run RECON self-pass on ste-runtime itself into .ste-self/state.
 * Skipped when the primary RECON already targeted ste-runtime (isSelfAnalysis).
 */
async function runSelfPass(
  runtimeDir: string,
  isSelfAnalysis: boolean,
  mode: 'incremental' | 'full',
): Promise<Awaited<ReturnType<typeof executeRecon>> | null> {
  if (isSelfAnalysis) {
    return null;
  }

  console.log('');
  console.log('-'.repeat(60));
  console.log('RECON - Self-Pass (ste-runtime dogfooding)');
  console.log('-'.repeat(60));

  const selfConfig = await loadConfig(runtimeDir, { selfMode: true });
  return executeRecon({
    projectRoot: selfConfig.projectRoot,
    sourceRoot: selfConfig.sourceDirs[0] ?? 'src',
    stateRoot: selfConfig.stateDir,
    mode,
    config: selfConfig,
  });
}

function printSelfResult(result: Awaited<ReturnType<typeof executeRecon>>) {
  console.log('');
  console.log('Self-Pass (.ste-self/state):');
  console.log(`  Created:   ${result.aiDocCreated}`);
  console.log(`  Modified:  ${result.aiDocModified}`);
  console.log(`  Deleted:   ${result.aiDocDeleted}`);
  console.log(`  Unchanged: ${result.aiDocUnchanged}`);
  if (!result.success) {
    console.log(`  Errors: ${result.errors.join('; ')}`);
  }
}

function printWorkspaceResult(wsResult: WorkspaceReconResult) {
  const succeeded = wsResult.repos.filter(r => r.status === 'success');
  const failed = wsResult.repos.filter(r => r.status === 'failed' || r.status === 'timed_out');
  const skipped = wsResult.repos.filter(r => r.status === 'skipped');

  const totalNodes = succeeded.reduce((sum, r) => sum + (r.nodeCount ?? 0), 0);
  const totalEdges = succeeded.reduce((sum, r) => sum + (r.edgeCount ?? 0), 0);

  let created = 0, modified = 0, deleted = 0, unchanged = 0;
  for (const r of succeeded) {
    if (r.reconResult) {
      created += r.reconResult.aiDocCreated;
      modified += r.reconResult.aiDocModified;
      deleted += r.reconResult.aiDocDeleted;
      unchanged += r.reconResult.aiDocUnchanged;
    }
  }

  console.log('');
  console.log('Workspace-Pass (.workspace-graph/):');
  console.log(`  Repos:       ${succeeded.length} succeeded, ${failed.length} failed, ${skipped.length} skipped`);
  console.log(`  Graph:       ${totalNodes} nodes, ${totalEdges} edges`);
  console.log(`  Created:     ${created}`);
  console.log(`  Modified:    ${modified}`);
  console.log(`  Deleted:     ${deleted}`);
  console.log(`  Unchanged:   ${unchanged}`);
  if (!wsResult.success) {
    console.log(`  Result:      FAILED`);
  }
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
