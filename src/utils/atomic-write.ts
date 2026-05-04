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
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Write `content` to `filePath` atomically via write-to-temp + rename.
 *
 * 1. Write to `<filePath>.<random>.tmp` in the same directory.
 * 2. Rename (replace) the temp file to `filePath`.
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
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* best-effort cleanup */ }
    throw err;
  }
}
