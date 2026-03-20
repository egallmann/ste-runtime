#!/usr/bin/env node
/**
 * Phase 8 proof: compile architecture from ADR YAML + PROJECT.yaml only (no adr-kit compiler).
 * Run from repo root after `npm run build`.
 */
import { compileArchitecture } from '../dist/architecture/compile-architecture.js';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const result = await compileArchitecture({ scopeRoot: root, dryRun: true });
if (!result.success) {
  for (const e of result.errors) process.stderr.write(`${e}\n`);
  process.exit(1);
}
process.stdout.write('prove-architecture-compile: OK (dry-run pipeline succeeded)\n');
