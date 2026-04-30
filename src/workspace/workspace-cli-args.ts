/**
 * RECON CLI workspace path parsing and resolution (agnostic defaults).
 */

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
 * {@link WORKSPACE_CLI_AUTO}: uses `STE_WORKSPACE_ROOT` when set, otherwise walks up from {@code cwd}
 * for `workspace.yaml` / `workspace.yml`.
 */
export async function resolveWorkspaceDirectory(
  parsed: ParsedWorkspaceCli,
  cwd: string,
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
  const discovered = await discoverWorkspaceRoot(cwd);
  return discovered !== null ? path.resolve(discovered) : null;
}
