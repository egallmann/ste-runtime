/**
 * Full Reconciliation - Periodic State Verification
 * 
 * Catches missed file system events by periodically comparing source file
 * checksums to slice provenance checksums, automatically healing stale state.
 * 
 * Part of E-ADR-007 Phase 1: Critical Safeguards
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { globby } from 'globby';
import yaml from 'js-yaml';

interface SliceProvenance {
  extracted_at: string;
  source_checksum?: string;
  extractor_version?: string;
}

interface SliceMetadata {
  _slice: {
    id: string;
    source_files: string[];
  };
  provenance?: SliceProvenance;
}

interface ReconciliationResult {
  staleSources: string[];
  checkedSlices: number;
  staleSlices: number;
  duration: number;
}

/**
 * Computes SHA-256 checksum of a file
 */
export async function computeFileChecksum(filepath: string): Promise<string> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  } catch {
    // File doesn't exist or can't be read
    return '';
  }
}

/**
 * Load all slices from state directory
 */
async function loadAllSlices(stateDir: string): Promise<SliceMetadata[]> {
  const sliceFiles = await globby('**/*.yaml', {
    cwd: stateDir,
    absolute: true,
    ignore: ['**/conflicts/**', '**/validation/**', '**/migrations/**', '**/watchdog/**'],
  });

  const slices: SliceMetadata[] = [];

  for (const sliceFile of sliceFiles) {
    try {
      const content = await fs.readFile(sliceFile, 'utf-8');
      const slice = yaml.load(content) as SliceMetadata;

      if (slice?._slice?.id && slice?._slice?.source_files) {
        slices.push(slice);
      }
    } catch (error) {
      console.warn(`[Full Reconciliation] Failed to load slice: ${sliceFile}`, error);
    }
  }

  return slices;
}

/**
 * Compute checksums for all source files
 */
async function computeSourceChecksums(projectRoot: string): Promise<Map<string, string>> {
  const sourcePatterns = [
    '**/*.ts',
    '**/*.py',
    '**/*.yaml',
    '**/*.json',
    '**/*.html',
    '**/*.css',
    '**/*.scss',
  ];

  const ignorePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
    '**/.ste/**',
    '**/venv/**',
    '**/.venv/**',
    '**/__pycache__/**',
  ];

  const sourceFiles = await globby(sourcePatterns, {
    cwd: projectRoot,
    absolute: false,
    ignore: ignorePatterns,
  });

  const checksums = new Map<string, string>();

  for (const relPath of sourceFiles) {
    const absPath = path.join(projectRoot, relPath);
    const checksum = await computeFileChecksum(absPath);
    if (checksum) {
      checksums.set(relPath, checksum);
    }
  }

  return checksums;
}

/**
 * Run full reconciliation to detect stale slices
 * Returns list of source files that need re-extraction
 */
export async function runFullReconciliation(
  projectRoot: string,
  stateDir: string
): Promise<ReconciliationResult> {
  const startTime = Date.now();

  console.log('[Full Reconciliation] Starting periodic reconciliation...');

  try {
    // Compute checksums of all source files
    const sourceChecksums = await computeSourceChecksums(projectRoot);

    // Load all slices
    const slices = await loadAllSlices(stateDir);

    console.log(`[Full Reconciliation] Checking ${slices.length} slices...`);

    // Find mismatches (source changed but slice not updated)
    const staleSources: string[] = [];

    for (const slice of slices) {
      const sourceFile = slice._slice.source_files[0]; // Primary source file
      if (!sourceFile) continue;

      const currentChecksum = sourceChecksums.get(sourceFile);
      const sliceChecksum = slice.provenance?.source_checksum;

      if (!sliceChecksum) {
        // Slice doesn't have checksum (old format) - skip
        continue;
      }

      if (!currentChecksum) {
        // Source file doesn't exist anymore - divergence detection will handle
        continue;
      }

      if (currentChecksum !== sliceChecksum) {
        // Mismatch - source changed but slice not updated
        staleSources.push(sourceFile);
      }
    }

    const duration = Date.now() - startTime;

    if (staleSources.length > 0) {
      console.warn(
        `[Full Reconciliation] Found ${staleSources.length} stale slices (source changed, slice not updated)`
      );
      for (const source of staleSources.slice(0, 5)) {
        console.warn(`  - ${source}`);
      }
      if (staleSources.length > 5) {
        console.warn(`  ... and ${staleSources.length - 5} more`);
      }
    } else {
      console.log(`[Full Reconciliation] All slices up-to-date (${duration}ms)`);
    }

    return {
      staleSources,
      checkedSlices: slices.length,
      staleSlices: staleSources.length,
      duration,
    };
  } catch (error) {
    console.error('[Full Reconciliation] Failed:', error);
    throw error;
  }
}

/**
 * Schedule periodic full reconciliation
 * Returns cleanup function to stop the scheduler
 */
export function scheduleFullReconciliation(
  projectRoot: string,
  stateDir: string,
  intervalMs: number = 5 * 60 * 1000, // Default: 5 minutes
  onStaleDetected?: (staleSources: string[]) => Promise<void>
): () => void {
  console.log(
    `[Full Reconciliation] Scheduled every ${intervalMs / 1000}s (${intervalMs / 60000} minutes)`
  );

  const intervalId = setInterval(async () => {
    try {
      const result = await runFullReconciliation(projectRoot, stateDir);

      if (result.staleSources.length > 0 && onStaleDetected) {
        await onStaleDetected(result.staleSources);
      }
    } catch (error) {
      console.error('[Full Reconciliation] Periodic run failed:', error);
    }
  }, intervalMs);

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    console.log('[Full Reconciliation] Stopped');
  };
}
