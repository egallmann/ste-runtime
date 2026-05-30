/**
 * Sentinel file helpers for workspace RECON cross-run incremental skips.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { atomicWriteFile } from '../utils/atomic-write.js';

export interface RepoSentinel {
  schema_version: '1.0';
  source_hash: string;
  recon_version: string;
  generated_at: string;
}

export interface RepoSourceFingerprintRow {
  relativePath: string;
  mtimeMs: number;
  size: number;
}

export function computeSourceHash(entries: RepoSourceFingerprintRow[]): string {
  const sorted = [...entries].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, 'en'),
  );
  const h = crypto.createHash('sha256');
  for (const f of sorted) {
    h.update(`${f.relativePath}:${f.mtimeMs}:${f.size}`);
  }
  return h.digest('hex');
}

export async function readSentinel(sentinelPath: string): Promise<RepoSentinel | null> {
  try {
    const raw = await fs.readFile(sentinelPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { schema_version?: string }).schema_version !== '1.0' ||
      typeof (parsed as { source_hash?: unknown }).source_hash !== 'string' ||
      typeof (parsed as { recon_version?: unknown }).recon_version !== 'string' ||
      typeof (parsed as { generated_at?: unknown }).generated_at !== 'string'
    ) {
      return null;
    }
    return parsed as RepoSentinel;
  } catch {
    return null;
  }
}

export async function writeSentinel(sentinelPath: string, data: RepoSentinel): Promise<void> {
  await atomicWriteFile(sentinelPath, JSON.stringify(data));
}
