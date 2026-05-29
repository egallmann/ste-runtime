/**
 * Atomic file write utility (MP-4e: Self-Pass Concurrency Safety).
 *
 * Prevents corruption when two workspaces sharing the same ste-runtime
 * installation run concurrent RECON passes that write to .ste-self/state.
 *
 * Strategy: write to a sibling temp file, then rename.  On POSIX the rename
 * is atomic.  On Windows it is "replace" semantics (not guaranteed atomic
 * across power loss, but sufficient against concurrent process races because
 * NTFS rename is a single metadata operation).
 *
 * The rename is retried on transient Windows lock errors (EPERM, EACCES,
 * EBUSY) with exponential backoff + jitter to handle AV scanners, IDE
 * indexers, and concurrent RECON passes racing on directory metadata.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const RETRYABLE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
export const MAX_RETRIES = 3;
export const BASE_DELAY_MS = 50;

/**
 * Write `content` to `filePath` atomically via write-to-temp + rename.
 *
 * 1. Write to `<filePath>.<random>.tmp` in the same directory.
 * 2. Rename (replace) the temp file to `filePath`, retrying up to
 *    MAX_RETRIES times on transient Windows lock errors.
 * 3. On failure, attempt to clean up the temp file.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  encoding: BufferEncoding = 'utf-8',
): Promise<void> {
  const dir = path.dirname(filePath);
  const suffix = crypto.randomBytes(6).toString('hex');
  const tmpPath = path.join(dir, `${path.basename(filePath)}.${suffix}.tmp`);

  await fs.mkdir(dir, { recursive: true });

  try {
    await fs.writeFile(tmpPath, content, encoding);
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmpPath, filePath);
        return;
      } catch (renameErr: unknown) {
        const code = (renameErr as NodeJS.ErrnoException).code;
        if (!code || !RETRYABLE_CODES.has(code) || attempt >= MAX_RETRIES) throw renameErr;
        const delay = BASE_DELAY_MS * 2 ** attempt;
        const jitter = Math.random() * delay * 0.5;
        await new Promise(r => setTimeout(r, delay + jitter));
      }
    }
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* best-effort cleanup */ }
    throw err;
  }
}
