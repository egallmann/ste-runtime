/**
 * Writes workspace-index.yaml summarizing per-repository RECON results.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import yaml from 'js-yaml';

import { enforces_invariant, implements_adr } from '../architecture/intent-decorators.js';

export interface RepoIndexError {
  stage: string;
  message: string;
  file?: string;
}

export interface RepoIndexEntry {
  name: string;
  status: 'success' | 'failed' | 'skipped';
  slice?: string;
  content_hash?: string;
  error?: RepoIndexError;
}

export const emitWorkspaceIndex: (
  repos: RepoIndexEntry[],
  outputDir: string,
  generatedAt: string,
) => Promise<void> = implements_adr(
  'ADR-L-0009',
)(enforces_invariant('INV-0014')(async function emitWorkspaceIndex(
  repos: RepoIndexEntry[],
  outputDir: string,
  generatedAt: string,
): Promise<void> {
  const doc = {
    schema_version: '1.0',
    generated_at: generatedAt,
    repos,
  };
  const outPath = path.join(outputDir, 'workspace-index.yaml');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, yaml.dump(doc, { lineWidth: 120, noRefs: true }), 'utf-8');
}));
