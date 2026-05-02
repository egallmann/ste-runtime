/**
 * Concurrency budget, phase timing, and memory guardrails for RECON operations.
 *
 * All pLimit usage across the codebase MUST use shared limiters from this module
 * or derive sub-budgets from these constants. Direct pLimit() construction
 * outside this module is prohibited (Hard Gate G-6).
 */

import os from 'node:os';
import pLimit from 'p-limit';

/** Return type of {@link pLimit} — p-limit v6 no longer exports `LimitFunction`. */
export type LimitFunction = ReturnType<typeof pLimit>;

const cpuCount = os.cpus().length;

// ---------------------------------------------------------------------------
// Concurrency Budget Constants
// ---------------------------------------------------------------------------

/**
 * Composition example (worst case):
 *   MAX_REPO_CONCURRENCY repos x MAX_PYTHON_WORKERS workers
 *   = 3 x 4 = 12 Python processes (fits an 8-core machine with headroom)
 *   MAX_REPO_CONCURRENCY repos x MAX_IO_CONCURRENCY reads
 *   = 3 x 16 = 48 concurrent fd opens (well within OS ulimit defaults)
 */

export const MAX_REPO_CONCURRENCY = 3;
export const MAX_CPU_CONCURRENCY = Math.max(cpuCount, 2);
export const MAX_IO_CONCURRENCY = 16;
export const MAX_PYTHON_WORKERS = Math.min(cpuCount, 4);
export const MAX_FILES_PER_CHUNK = 250;
export const MAX_STDIN_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Shared Limiter Instances
// ---------------------------------------------------------------------------

export const cpuLimiter: LimitFunction = pLimit(MAX_CPU_CONCURRENCY);
export const ioLimiter: LimitFunction = pLimit(MAX_IO_CONCURRENCY);
export const repoLimiter: LimitFunction = pLimit(MAX_REPO_CONCURRENCY);

export function createLimiter(concurrency: number): LimitFunction {
  return pLimit(concurrency);
}

// ---------------------------------------------------------------------------
// Memory Pressure Guardrail
// ---------------------------------------------------------------------------

export const MAX_CACHE_BYTES = 100 * 1024 * 1024;

export class BoundedCache<V> {
  private map = new Map<string, V>();
  private totalBytes = 0;
  private warned = false;
  private readonly label: string;
  private readonly sizeOf: (value: V) => number;

  constructor(label: string, sizeOf: (value: V) => number) {
    this.label = label;
    this.sizeOf = sizeOf;
  }

  get(key: string): V | undefined {
    return this.map.get(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: V): boolean {
    if (this.map.has(key)) return true;
    const entryBytes = this.sizeOf(value);
    if (this.totalBytes + entryBytes > MAX_CACHE_BYTES) {
      if (!this.warned) {
        console.warn(
          `[${this.label}] Memory budget exceeded (${(this.totalBytes / 1024 / 1024).toFixed(1)}MB / ` +
          `${(MAX_CACHE_BYTES / 1024 / 1024).toFixed(0)}MB). New entries will not be cached.`
        );
        this.warned = true;
      }
      return false;
    }
    this.map.set(key, value);
    this.totalBytes += entryBytes;
    return true;
  }

  get size(): number { return this.map.size; }
  get bytes(): number { return this.totalBytes; }

  clear(): void {
    this.map.clear();
    this.totalBytes = 0;
    this.warned = false;
  }
}

// ---------------------------------------------------------------------------
// Phase Timing Contract
// ---------------------------------------------------------------------------

export interface PhaseTimingRecord {
  phase: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  itemCount: number;
  throughput: number; // items/sec
}

export class PhaseTimer {
  private startMs = 0;
  private phaseName: string;

  constructor(phase: string) {
    this.phaseName = phase;
  }

  start(): void {
    this.startMs = performance.now();
  }

  stop(itemCount: number): PhaseTimingRecord {
    const endMs = performance.now();
    const durationMs = endMs - this.startMs;
    const throughput = durationMs > 0 ? itemCount / (durationMs / 1000) : 0;
    return {
      phase: this.phaseName,
      startMs: this.startMs,
      endMs,
      durationMs,
      itemCount,
      throughput,
    };
  }
}

/**
 * Phases that MUST have timing records after a RECON run.
 * Missing entries cause a loud warning in the RECON summary.
 */
export const REQUIRED_TIMED_PHASES = [
  'Phase 2: Extraction',
  'Phase 4: Normalization',
  'Phase 5: Population',
  'Phase 7: Validation',
] as const;

/**
 * Optional phases that emit timing when applicable.
 * Not required -- workspace mode may not run, slice emission
 * may be skipped on empty repos.
 */
export const OPTIONAL_TIMED_PHASES = [
  'Phase 3: Inference',
  'Slice Emission',
  'Workspace Orchestration',
] as const;
