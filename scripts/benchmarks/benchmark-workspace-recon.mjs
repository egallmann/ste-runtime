/**
 * Repeatable workspace RECON benchmark.
 *
 * Usage:
 *   node scripts/benchmarks/benchmark-workspace-recon.mjs
 *   node scripts/benchmarks/benchmark-workspace-recon.mjs --mode=incremental
 *   node scripts/benchmarks/benchmark-workspace-recon.mjs --workspace=../..
 *   node scripts/benchmarks/benchmark-workspace-recon.mjs --out=./benchmark-results/latest.json
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(__dirname, '../..');
const defaultWorkspaceRoot = path.resolve(runtimeDir, '..');

function parseArg(name, fallback = null) {
  const eq = process.argv.find(a => a.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

const mode = parseArg('--mode', 'full');
const workspaceArg = parseArg('--workspace', defaultWorkspaceRoot);
const skipBuild = process.argv.includes('--skip-build');
const outArg = parseArg('--out', null);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultsDir = path.join(runtimeDir, 'benchmark-results');
ensureDir(resultsDir);

const outPath =
  outArg != null
    ? path.resolve(process.cwd(), outArg)
    : path.join(resultsDir, `workspace-recon-${stamp}.json`);

if (!skipBuild) {
  console.log('Building ste-runtime...');
  run('npm', ['run', 'build'], runtimeDir);
}

console.log('');
console.log('Running workspace RECON benchmark...');
console.log(`  Workspace: ${workspaceArg}`);
console.log(`  Mode:      ${mode}`);
console.log(`  Output:    ${outPath}`);
console.log('');

run(
  'node',
  [
    'dist/cli/recon-cli.js',
    '--workspace',
    workspaceArg,
    `--mode=${mode}`,
    '--benchmark',
    `--benchmark-out=${outPath}`,
  ],
  runtimeDir,
);

console.log('');
console.log(`Benchmark complete: ${outPath}`);
