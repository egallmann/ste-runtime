import path from 'node:path';

import { execa } from 'execa';

import { implements_adr } from '../architecture/intent-decorators.js';
import { log, warn } from '../utils/logger.js';

/**
 * Invoke adr-architecture-kit to emit workspace-attribution-federation.yaml.
 * Federation merge authority lives in adr-kit (ADR-L-0012); ste-runtime orchestrates only.
 */
export const runWorkspaceAttributionFederation: (workspaceRoot: string) => Promise<void> = implements_adr(
  'ADR-L-0022',
)(async function runWorkspaceAttributionFederation(workspaceRoot: string): Promise<void> {
  const resolvedRoot = path.resolve(workspaceRoot);
  const adrCommand = process.env.ADR_CLI?.trim() || 'adr';
  try {
    const { stdout } = await execa(
      adrCommand,
      ['attribution', 'workspace-report', '--workspace-root', resolvedRoot],
      { cwd: resolvedRoot },
    );
    if (stdout.trim()) {
      log(`[workspace-recon] Attribution federation: ${stdout.trim().split('\n')[0]}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(
      `[workspace-recon] Workspace attribution federation failed (non-fatal): ${message}. ` +
        'Ensure adr-architecture-kit is installed and `adr` is on PATH (or set ADR_CLI).',
    );
  }
});
