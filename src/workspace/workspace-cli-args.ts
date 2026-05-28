/**
 * RECON CLI workspace path parsing and resolution (agnostic defaults).
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { discoverWorkspaceRoot } from './manifest.js';

/** Sentinel: user passed --workspace with no path or --workspace=auto */
export const WORKSPACE_CLI_AUTO = '__STE_WORKSPACE_AUTO__' as const;

export type ParsedWorkspaceCli =
  | null
  | typeof WORKSPACE_CLI_AUTO
  | string;

/**
 * Parse `--workspace` / `--workspace=` from argv.
 * - Omitted → null (single-repo mode)
 * - `--workspace`, `--workspace=`, `--workspace=auto` → {@link WORKSPACE_CLI_AUTO}
 * - `--workspace /abs/path` or `--workspace=rel/path` → explicit path string
 */
export function parseWorkspaceArgv(argv: string[]): ParsedWorkspaceCli {
  const eq = argv.find(a => a.startsWith('--workspace='));
  if (eq !== undefined) {
    const v = eq.slice('--workspace='.length).trim();
    if (v.length === 0 || v.toLowerCase() === 'auto') {
      return WORKSPACE_CLI_AUTO;
    }
    return v;
  }
  const idx = argv.indexOf('--workspace');
  if (idx !== -1) {
    const next = idx + 1 < argv.length ? argv[idx + 1] : undefined;
    if (next === undefined || next.startsWith('--')) {
      return WORKSPACE_CLI_AUTO;
    }
    return next;
  }
  return null;
}

/**
 * Resolve CLI workspace selection to an absolute directory (manifest lives inside).
 * {@link WORKSPACE_CLI_AUTO} resolution order:
 *   1. `STE_WORKSPACE_ROOT` env var
 *   2. `ste.config.json` `projectRoot` (if runtimeDir provided and manifest exists there)
 *   3. Walk upward from cwd for `workspace.yaml` / `workspace.yml`
 */
export async function resolveWorkspaceDirectory(
  parsed: ParsedWorkspaceCli,
  cwd: string,
  runtimeDir?: string,
): Promise<string | null> {
  if (parsed === null) {
    return null;
  }
  if (parsed !== WORKSPACE_CLI_AUTO) {
    return path.resolve(parsed);
  }
  const env = process.env.STE_WORKSPACE_ROOT?.trim();
  if (env && env.length > 0) {
    return path.resolve(env);
  }
  if (runtimeDir) {
    const configHint = await resolveFromConfig(runtimeDir);
    if (configHint !== null) {
      return configHint;
    }
  }
  const discovered = await discoverWorkspaceRoot(cwd);
  return discovered !== null ? path.resolve(discovered) : null;
}

const MANIFEST_FILENAMES = ['workspace.yaml', 'workspace.yml'] as const;

/**
 * Read ste.config.json from runtimeDir and check whether the configured
 * projectRoot contains a workspace manifest. Uses fs.readFile + JSON.parse
 * directly (not loadConfig) to avoid circular dependencies.
 */
async function resolveFromConfig(runtimeDir: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(runtimeDir, 'ste.config.json'), 'utf-8');
    const config = JSON.parse(raw);
    if (typeof config.projectRoot !== 'string') {
      return null;
    }
    const resolved = path.resolve(runtimeDir, config.projectRoot);
    for (const name of MANIFEST_FILENAMES) {
      try {
        const st = await fs.stat(path.join(resolved, name));
        if (st.isFile()) return resolved;
      } catch { /* missing */ }
    }
  } catch { /* missing or unparseable config */ }
  return null;
}
