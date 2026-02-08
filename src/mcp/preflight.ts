/**
 * Preflight Reconciliation Module
 * 
 * Per E-ADR-014: Synchronous preflight reconciliation ensures graph freshness
 * before answering authoritative obligation projection queries.
 * 
 * Preflight is scoped to files in the declared intent's blast radius,
 * not the full graph. This keeps latency acceptable while ensuring authority.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { RssContext } from '../rss/rss-operations.js';
import { blastRadius, search, lookupByKey } from '../rss/rss-operations.js';
import { loadReconManifest, type ReconManifest, type FileFingerprint } from '../watch/change-detector.js';
import { runIncrementalRecon } from '../recon/incremental-recon.js';
import { initRssContext } from '../rss/rss-operations.js';
import type { 
  FreshnessIndicator, 
  FreshnessStatus,
  ChangeIntent,
  ChangeIntentType,
  ChangeTargetType,
} from '../rss/schema.js';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface PreflightOptions {
  /** Project root directory */
  projectRoot: string;
  
  /** State directory (resolved absolute path) */
  stateDir: string;
  
  /** Maximum staleness in seconds (0 = must be fresh) */
  maxStalenessSeconds?: number;
  
  /** Skip reconciliation even if stale (for performance) */
  skipReconciliation?: boolean;
}

export interface PreflightResult {
  /** Was reconciliation performed? */
  reconciliationPerformed: boolean;
  
  /** Files that were reconciled */
  filesReconciled: string[];
  
  /** Slices that were updated */
  slicesUpdated: string[];
  
  /** Final freshness state */
  freshness: FreshnessIndicator;
  
  /** Duration of preflight operation in milliseconds */
  durationMs: number;
}

export interface ScopeResolutionResult {
  /** Files in scope for the intent */
  files: string[];
  
  /** Target slice key (if resolved) */
  targetKey: string | null;
  
  /** Target file path */
  targetPath: string | null;
  
  /** If resolved from query, the original query */
  resolvedFromQuery?: string;
}

// ─────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────

const toPosix = (value: string) => value.replace(/\\/g, '/');

/**
 * Hash a file's contents using SHA-256.
 */
async function hashFile(filePath: string): Promise<string | null> {
  try {
    const hash = createHash('sha256');
    const file = await fs.open(filePath, 'r');
    try {
      const stream = file.createReadStream();
      for await (const chunk of stream) {
        hash.update(chunk);
      }
    } finally {
      await file.close();
    }
    return hash.digest('hex');
  } catch {
    return null;
  }
}

/**
 * Check if a file has changed since the manifest was generated.
 */
async function hasFileChanged(
  projectRoot: string,
  relPath: string,
  manifest: ReconManifest
): Promise<boolean> {
  const absPath = path.resolve(projectRoot, relPath);
  const prev = manifest.files[relPath];
  
  if (!prev) {
    // File not in manifest - it's new
    return true;
  }
  
  try {
    const stat = await fs.stat(absPath);
    
    // Quick check: mtime and size
    if (prev.mtimeMs !== stat.mtimeMs || prev.size !== stat.size) {
      // Might have changed - verify with hash
      const currentHash = await hashFile(absPath);
      return currentHash !== prev.hash;
    }
    
    // mtime and size match - assume unchanged
    return false;
  } catch {
    // File doesn't exist or can't be read - consider changed
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────
// Scope Resolution
// ─────────────────────────────────────────────────────────────────

/**
 * Resolve the scope of files affected by a change intent.
 * 
 * This determines which files need freshness checking based on:
 * 1. The target of the intent (slice key, file path, or query)
 * 2. The blast radius of affected slices
 */
export function resolveIntentScope(
  ctx: RssContext,
  intent: ChangeIntent
): ScopeResolutionResult {
  const files = new Set<string>();
  let targetKey: string | null = null;
  let targetPath: string | null = null;
  let resolvedFromQuery: string | undefined;
  
  const depth = intent.scope?.depth ?? 2;
  const maxSlices = intent.scope?.maxSlices ?? 100;
  
  switch (intent.targetType) {
    case 'slice_key': {
      // Direct slice key reference
      const node = lookupByKey(ctx, intent.target);
      if (node) {
        targetKey = intent.target;
        targetPath = node.path ?? node.sourceFiles[0] ?? null;
        
        // Add target's source files
        for (const file of node.sourceFiles) {
          files.add(file);
        }
        
        // Add blast radius source files
        const blast = blastRadius(ctx, intent.target, depth, maxSlices);
        for (const blastNode of blast.nodes) {
          for (const file of blastNode.sourceFiles) {
            files.add(file);
          }
        }
      }
      break;
    }
    
    case 'file_path': {
      // File path - find slices that reference this file
      targetPath = intent.target;
      files.add(intent.target);
      
      // Find slices with this source file
      for (const node of ctx.graph.values()) {
        if (node.sourceFiles.some(f => f === intent.target || f.endsWith(intent.target))) {
          targetKey = targetKey ?? node.key;
          
          // Add this node's files
          for (const file of node.sourceFiles) {
            files.add(file);
          }
          
          // Add blast radius
          const blast = blastRadius(ctx, node.key, depth, maxSlices);
          for (const blastNode of blast.nodes) {
            for (const file of blastNode.sourceFiles) {
              files.add(file);
            }
          }
        }
      }
      break;
    }
    
    case 'query': {
      // Natural language query - search for matching slices
      resolvedFromQuery = intent.target;
      const results = search(ctx, intent.target, { maxResults: 10 });
      
      for (const node of results.nodes) {
        targetKey = targetKey ?? node.key;
        targetPath = targetPath ?? node.path ?? node.sourceFiles[0] ?? null;
        
        // Add source files
        for (const file of node.sourceFiles) {
          files.add(file);
        }
        
        // Add blast radius
        const blast = blastRadius(ctx, node.key, depth, maxSlices);
        for (const blastNode of blast.nodes) {
          for (const file of blastNode.sourceFiles) {
            files.add(file);
          }
        }
      }
      break;
    }
  }
  
  return {
    files: Array.from(files),
    targetKey,
    targetPath,
    resolvedFromQuery,
  };
}

// ─────────────────────────────────────────────────────────────────
// Freshness Checking
// ─────────────────────────────────────────────────────────────────

/**
 * Check freshness of specific files against the manifest.
 * 
 * Returns which files are stale and need reconciliation.
 */
export async function checkFilesFreshness(
  projectRoot: string,
  stateDir: string,
  files: string[]
): Promise<{
  staleFiles: string[];
  freshFiles: string[];
  manifest: ReconManifest | null;
  lastReconciled: string;
}> {
  const manifest = await loadReconManifest(stateDir);
  const staleFiles: string[] = [];
  const freshFiles: string[] = [];
  const lastReconciled = manifest?.generatedAt ?? new Date(0).toISOString();
  
  if (!manifest) {
    // No manifest - all files are stale
    return {
      staleFiles: files,
      freshFiles: [],
      manifest: null,
      lastReconciled,
    };
  }
  
  for (const file of files) {
    const relPath = toPosix(file);
    const changed = await hasFileChanged(projectRoot, relPath, manifest);
    
    if (changed) {
      staleFiles.push(file);
    } else {
      freshFiles.push(file);
    }
  }
  
  return {
    staleFiles,
    freshFiles,
    manifest,
    lastReconciled,
  };
}

/**
 * Build a freshness indicator from check results.
 */
function buildFreshnessIndicator(
  filesChecked: string[],
  staleFiles: string[],
  lastReconciled: string,
  scope: 'full' | 'targeted'
): FreshnessIndicator {
  let status: FreshnessStatus;
  let action: 'proceed' | 'reconcile_first' | 'manual_review';
  
  if (staleFiles.length === 0) {
    status = 'fresh';
    action = 'proceed';
  } else if (staleFiles.length === filesChecked.length) {
    status = 'stale';
    action = 'reconcile_first';
  } else {
    status = 'partial';
    action = 'reconcile_first';
  }
  
  return {
    scope,
    filesChecked,
    status,
    staleFiles: staleFiles.length > 0 ? staleFiles : undefined,
    lastReconciled,
    action,
  };
}

// ─────────────────────────────────────────────────────────────────
// Main Preflight Function
// ─────────────────────────────────────────────────────────────────

/**
 * Perform preflight reconciliation for a change intent.
 * 
 * This is the main entry point for preflight. It:
 * 1. Resolves the scope of files affected by the intent
 * 2. Checks freshness of those files against the manifest
 * 3. Runs targeted incremental RECON if files are stale
 * 4. Returns freshness indicators for the response
 * 
 * @param ctx - RSS context
 * @param intent - The change intent to preflight
 * @param options - Preflight configuration
 * @returns Preflight result with freshness indicators
 */
export async function preflightReconciliation(
  ctx: RssContext,
  intent: ChangeIntent,
  options: PreflightOptions
): Promise<PreflightResult> {
  const startTime = Date.now();
  const { projectRoot, stateDir, maxStalenessSeconds = 0, skipReconciliation = false } = options;
  
  // 1. Resolve intent scope to files
  const scope = resolveIntentScope(ctx, intent);
  
  if (scope.files.length === 0) {
    // No files in scope - return fresh indicator
    return {
      reconciliationPerformed: false,
      filesReconciled: [],
      slicesUpdated: [],
      freshness: {
        scope: 'targeted',
        filesChecked: [],
        status: 'unknown',
        lastReconciled: new Date().toISOString(),
        action: 'proceed',
      },
      durationMs: Date.now() - startTime,
    };
  }
  
  // 2. Check freshness of files in scope
  const freshnessCheck = await checkFilesFreshness(projectRoot, stateDir, scope.files);
  
  // 3. Determine if reconciliation is needed
  const needsReconciliation = 
    freshnessCheck.staleFiles.length > 0 && 
    !skipReconciliation;
  
  // Check staleness threshold
  if (needsReconciliation && maxStalenessSeconds > 0 && freshnessCheck.manifest) {
    const lastReconTime = new Date(freshnessCheck.lastReconciled).getTime();
    const ageSeconds = (Date.now() - lastReconTime) / 1000;
    
    if (ageSeconds <= maxStalenessSeconds) {
      // Within acceptable staleness - skip reconciliation
      return {
        reconciliationPerformed: false,
        filesReconciled: [],
        slicesUpdated: [],
        freshness: buildFreshnessIndicator(
          scope.files,
          freshnessCheck.staleFiles,
          freshnessCheck.lastReconciled,
          'targeted'
        ),
        durationMs: Date.now() - startTime,
      };
    }
  }
  
  // 4. Run incremental RECON if needed
  let slicesUpdated: string[] = [];
  
  if (needsReconciliation) {
    try {
      await runIncrementalRecon(projectRoot, { stateDir });
      
      // Note: We don't have direct access to which slices were updated
      // from runIncrementalRecon. In a future enhancement, we could
      // track this more precisely.
      slicesUpdated = freshnessCheck.staleFiles.map(f => `updated:${f}`);
    } catch (error) {
      // Reconciliation failed - return stale indicator
      console.error('[Preflight] Incremental RECON failed:', error);
      
      return {
        reconciliationPerformed: false,
        filesReconciled: [],
        slicesUpdated: [],
        freshness: {
          scope: 'targeted',
          filesChecked: scope.files,
          status: 'stale',
          staleFiles: freshnessCheck.staleFiles,
          lastReconciled: freshnessCheck.lastReconciled,
          action: 'manual_review',
        },
        durationMs: Date.now() - startTime,
      };
    }
  }
  
  // 5. Build final freshness indicator
  const finalFreshness: FreshnessIndicator = needsReconciliation
    ? {
        scope: 'targeted',
        filesChecked: scope.files,
        status: 'fresh',
        lastReconciled: new Date().toISOString(),
        action: 'proceed',
      }
    : buildFreshnessIndicator(
        scope.files,
        freshnessCheck.staleFiles,
        freshnessCheck.lastReconciled,
        'targeted'
      );
  
  return {
    reconciliationPerformed: needsReconciliation,
    filesReconciled: needsReconciliation ? freshnessCheck.staleFiles : [],
    slicesUpdated,
    freshness: finalFreshness,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Quick freshness check without reconciliation.
 * 
 * Use this when you just want to know the freshness status
 * without triggering any updates.
 */
export async function checkFreshness(
  ctx: RssContext,
  intent: ChangeIntent,
  options: Pick<PreflightOptions, 'projectRoot' | 'stateDir'>
): Promise<FreshnessIndicator> {
  const scope = resolveIntentScope(ctx, intent);
  
  if (scope.files.length === 0) {
    return {
      scope: 'targeted',
      filesChecked: [],
      status: 'unknown',
      lastReconciled: new Date().toISOString(),
      action: 'proceed',
    };
  }
  
  const freshnessCheck = await checkFilesFreshness(
    options.projectRoot, 
    options.stateDir, 
    scope.files
  );
  
  return buildFreshnessIndicator(
    scope.files,
    freshnessCheck.staleFiles,
    freshnessCheck.lastReconciled,
    'targeted'
  );
}

