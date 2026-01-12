/**
 * RECON Phase 5: Population
 * 
 * Update AI-DOC state with normalized assertions.
 * 
 * This phase implements proper create/update/delete semantics:
 * - CREATE: New slices that don't exist in prior state
 * - UPDATE: Slices that exist but have changed
 * - DELETE: Slices from processed files that no longer exist in code
 * 
 * Key principle: For any source file that was processed, the resulting
 * slices should exactly match what was extracted. Orphaned slices
 * (from deleted code) are removed.
 * 
 * Per E-ADR-001: State is authoritative, not historical
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { createHash } from 'node:crypto';
import type { NormalizedAssertion } from './index.js';
import { computeFileChecksum } from '../../watch/full-reconciliation.js';
import { writeTracker } from '../../watch/write-tracker.js';
import { updateCoordinator } from '../../watch/update-coordinator.js';

export interface PopulationResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  priorState: Map<string, NormalizedAssertion>;
}

export interface PopulationOptions {
  /** If true, delete all state before populating (full reconciliation) */
  fullReconciliation?: boolean;
  /** Generation number for update tracking (E-ADR-007) */
  generation?: number;
}

/**
 * Populate AI-DOC state with normalized assertions.
 * 
 * Implements create/update/delete semantics:
 * - Groups assertions by source file
 * - For each processed file, removes orphaned slices
 * - Writes new/updated slices
 * - Returns detailed stats
 */
export async function populateAiDoc(
  assertions: NormalizedAssertion[],
  projectRoot: string,
  stateRoot: string,
  processedFiles: string[],
  options: PopulationOptions = {}
): Promise<PopulationResult> {
  const startTime = performance.now();
  const stateDir = path.resolve(projectRoot, stateRoot);
  
  // Ensure state directory structure exists
  await ensureStateDirectories(stateDir);
  
  // Load prior state (all existing slices)
  const priorStateStart = performance.now();
  const priorState = await loadPriorState(stateDir);
  const priorStateTime = performance.now() - priorStateStart;
  console.log(`[RECON Population] Loaded prior state (${priorState.size} slices) in ${priorStateTime.toFixed(2)}ms`);
  
  // Track stats
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let unchanged = 0;
  
  // If full reconciliation, we'll delete everything not in the new assertions
  if (options.fullReconciliation) {
    // Build set of all new slice IDs
    const newIds = new Set(assertions.map(a => a._slice.id));
    
    // Delete all prior slices not in new set
    for (const [priorId, priorAssertion] of priorState.entries()) {
      if (!newIds.has(priorId)) {
        const targetPath = getTargetPath(stateDir, priorAssertion);
        try {
          await fs.unlink(targetPath);
          deleted++;
          console.log(`[RECON Population] Deleted orphan: ${priorId}`);
        } catch (error) {
          // File might not exist, ignore
        }
      }
    }
  } else {
    // Incremental mode: only delete slices from files we processed
    // Build a map of source file -> prior slice IDs
    const priorByFile = new Map<string, Set<string>>();
    for (const [id, assertion] of priorState.entries()) {
      const sourceFiles = assertion._slice.source_files ?? [];
      for (const sourceFile of sourceFiles) {
        if (!priorByFile.has(sourceFile)) {
          priorByFile.set(sourceFile, new Set());
        }
        priorByFile.get(sourceFile)!.add(id);
      }
    }
    
    // Build a map of source file -> new slice IDs
    const newByFile = new Map<string, Set<string>>();
    for (const assertion of assertions) {
      const sourceFiles = assertion._slice.source_files ?? [];
      for (const sourceFile of sourceFiles) {
        if (!newByFile.has(sourceFile)) {
          newByFile.set(sourceFile, new Set());
        }
        newByFile.get(sourceFile)!.add(assertion._slice.id);
      }
    }
    
    // For each processed file, find orphaned slices and delete them
    for (const processedFile of processedFiles) {
      const priorIds = priorByFile.get(processedFile) ?? new Set();
      const newIds = newByFile.get(processedFile) ?? new Set();
      
      // Orphans = prior IDs not in new IDs for this file
      for (const priorId of priorIds) {
        if (!newIds.has(priorId)) {
          const priorAssertion = priorState.get(priorId);
          if (priorAssertion) {
            const targetPath = getTargetPath(stateDir, priorAssertion);
            try {
              await fs.unlink(targetPath);
              deleted++;
              console.log(`[RECON Population] Deleted orphan: ${priorId}`);
            } catch (error) {
              // File might not exist (already deleted or misnamed), log but continue
              console.warn(`[RECON Population] Could not delete orphan ${priorId}: file not found`);
            }
          }
        }
      }
    }
  }
  
  // Write each assertion as a YAML file
  const writeStart = performance.now();
  let checksumTime = 0;
  let writeTime = 0;
  let trackerTime = 0;
  
  for (const assertion of assertions) {
    try {
      const targetPath = getTargetPath(stateDir, assertion);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      
      // Compute source checksum for provenance (E-ADR-007)
      const checksumStart = performance.now();
      const sourceFile = assertion._slice.source_files?.[0];
      if (sourceFile) {
        const sourceFilePath = path.resolve(projectRoot, sourceFile);
        const sourceChecksum = await computeFileChecksum(sourceFilePath);
        
      // Add checksum to provenance
      if (!assertion.provenance) {
        assertion.provenance = {} as any;
      }
      assertion.provenance.source_checksum = sourceChecksum;
    }
    checksumTime += performance.now() - checksumStart;
    
    const yamlContent = yaml.dump(assertion, {
        noRefs: true,
        lineWidth: -1,
        sortKeys: false,
      });
      
      // Check if this is create, update, or unchanged
      const priorAssertion = priorState.get(assertion._slice.id);
      if (!priorAssertion) {
        created++;
      } else {
        // Compare semantic content (excluding provenance timestamps)
        if (hasSemanticChanges(priorAssertion, assertion)) {
          updated++;
        } else {
          unchanged++;
        }
      }
      
      const writeFileStart = performance.now();
      await fs.writeFile(targetPath, yamlContent, 'utf-8');
      writeTime += performance.now() - writeFileStart;
      
      // Track write for watchdog (E-ADR-007)
      const trackerStart = performance.now();
      await writeTracker.recordWrite(targetPath, yamlContent);
      
      // Record slice write in update coordinator (E-ADR-007)
      if (options.generation !== undefined) {
        updateCoordinator.recordSliceWrite(options.generation, targetPath);
      }
      trackerTime += performance.now() - trackerStart;
    } catch (error) {
      console.warn(`[RECON Population] Failed to write ${assertion._slice.id}:`, error);
    }
  }
  
  const totalTime = performance.now() - startTime;
  const writePhaseTime = performance.now() - writeStart;
  
  console.log(`[RECON Population] Timing breakdown:`);
  console.log(`  Prior state load: ${priorStateTime.toFixed(2)}ms`);
  console.log(`  Checksum computation: ${checksumTime.toFixed(2)}ms`);
  console.log(`  File writes: ${writeTime.toFixed(2)}ms`);
  console.log(`  Write tracking: ${trackerTime.toFixed(2)}ms`);
  console.log(`  Write phase total: ${writePhaseTime.toFixed(2)}ms`);
  console.log(`  Population total: ${totalTime.toFixed(2)}ms`);
  console.log(`  Throughput: ${(assertions.length / (totalTime / 1000)).toFixed(0)} slices/sec`);
  
  return {
    created,
    updated,
    deleted,
    unchanged,
    priorState,
  };
}

/**
 * Ensure all state directories exist
 */
async function ensureStateDirectories(stateDir: string): Promise<void> {
  const directories = [
    stateDir,
    path.join(stateDir, 'graph'),
    path.join(stateDir, 'graph', 'modules'),
    path.join(stateDir, 'graph', 'functions'),
    path.join(stateDir, 'graph', 'classes'),
    path.join(stateDir, 'api'),
    path.join(stateDir, 'api', 'endpoints'),
    path.join(stateDir, 'data'),
    path.join(stateDir, 'data', 'entities'),
    path.join(stateDir, 'infrastructure'),
    path.join(stateDir, 'infrastructure', 'templates'),
    path.join(stateDir, 'infrastructure', 'resources'),
    path.join(stateDir, 'infrastructure', 'parameters'),
    path.join(stateDir, 'infrastructure', 'outputs'),
    path.join(stateDir, 'infrastructure', 'gsis'),
    path.join(stateDir, 'validation'),
    path.join(stateDir, 'validation', 'runs'),
    path.join(stateDir, 'conflicts'),
    path.join(stateDir, 'conflicts', 'active'),
  ];
  
  for (const dir of directories) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Load all existing slices from state directory
 */
async function loadPriorState(stateDir: string): Promise<Map<string, NormalizedAssertion>> {
  const priorState = new Map<string, NormalizedAssertion>();
  
  // Directories to scan for existing slices
  const sliceDirs = [
    path.join(stateDir, 'graph', 'modules'),
    path.join(stateDir, 'graph', 'functions'),
    path.join(stateDir, 'graph', 'classes'),
    path.join(stateDir, 'api', 'endpoints'),
    path.join(stateDir, 'data', 'entities'),
    path.join(stateDir, 'infrastructure', 'templates'),
    path.join(stateDir, 'infrastructure', 'resources'),
    path.join(stateDir, 'infrastructure', 'parameters'),
    path.join(stateDir, 'infrastructure', 'outputs'),
    path.join(stateDir, 'infrastructure', 'gsis'),
  ];
  
  for (const dir of sliceDirs) {
    try {
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        if (!file.endsWith('.yaml')) continue;
        
        try {
          const filePath = path.join(dir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const assertion = yaml.load(content) as NormalizedAssertion;
          
          if (assertion && assertion._slice && assertion._slice.id) {
            priorState.set(assertion._slice.id, assertion);
          }
        } catch (error) {
          // Skip malformed files
          console.warn(`[RECON Population] Failed to load prior state from ${file}:`, error);
        }
      }
    } catch (error) {
      // Directory doesn't exist yet, no prior state
    }
  }
  
  return priorState;
}

/**
 * Compare two assertions for semantic changes.
 * Ignores provenance timestamps which change on every run.
 */
function hasSemanticChanges(prior: NormalizedAssertion, current: NormalizedAssertion): boolean {
  // Compare _slice (should be identical if same ID)
  if (JSON.stringify(prior._slice) !== JSON.stringify(current._slice)) {
    return true;
  }
  
  // Compare element content (the actual semantic data)
  if (JSON.stringify(prior.element) !== JSON.stringify(current.element)) {
    return true;
  }
  
  // Ignore provenance.extracted_at - it changes every run
  // Compare other provenance fields
  const priorProvenance = { ...prior.provenance, extracted_at: '' };
  const currentProvenance = { ...current.provenance, extracted_at: '' };
  
  if (JSON.stringify(priorProvenance) !== JSON.stringify(currentProvenance)) {
    return true;
  }
  
  return false;
}

/**
 * Get the target file path for a slice using content-addressable hashing.
 * 
 * Filenames are hashed because:
 * - AI-DOC is machine-readable, not human-edited
 * - Avoids filesystem length limits (Windows 260 char, Unix 255 char)
 * - Prevents special character issues
 * - Slice ID is the source of truth, not filename
 */
function getTargetPath(stateDir: string, assertion: NormalizedAssertion): string {
  const { domain, type, id } = assertion._slice;
  
  // Hash the slice ID to create a short, safe filename
  // Use first 16 chars of SHA-256 (64 bits, extremely low collision probability)
  const hash = createHash('sha256')
    .update(id)
    .digest('hex')
    .substring(0, 16);
  
  const filename = `${hash}.yaml`;
  
  if (domain === 'graph') {
    if (type === 'module') {
      return path.join(stateDir, 'graph', 'modules', filename);
    }
    if (type === 'function') {
      return path.join(stateDir, 'graph', 'functions', filename);
    }
    if (type === 'class') {
      return path.join(stateDir, 'graph', 'classes', filename);
    }
  }
  
  if (domain === 'api') {
    return path.join(stateDir, 'api', 'endpoints', filename);
  }
  
  if (domain === 'data') {
    return path.join(stateDir, 'data', 'entities', filename);
  }
  
  // Infrastructure domain (CloudFormation)
  if (domain === 'infrastructure') {
    if (type === 'template') {
      return path.join(stateDir, 'infrastructure', 'templates', filename);
    }
    if (type === 'resource') {
      return path.join(stateDir, 'infrastructure', 'resources', filename);
    }
    if (type === 'parameter') {
      return path.join(stateDir, 'infrastructure', 'parameters', filename);
    }
    if (type === 'output') {
      return path.join(stateDir, 'infrastructure', 'outputs', filename);
    }
    if (type === 'gsi') {
      return path.join(stateDir, 'infrastructure', 'gsis', filename);
    }
    if (type === 'trigger') {
      return path.join(stateDir, 'infrastructure', 'triggers', filename);
    }
  }
  
  // Behavior domain (Python SDK usage, env vars, function calls)
  if (domain === 'behavior') {
    if (type === 'aws_sdk_usage') {
      return path.join(stateDir, 'behavior', 'sdk_usage', filename);
    }
    if (type === 'env_var_access') {
      return path.join(stateDir, 'behavior', 'env_vars', filename);
    }
    if (type === 'function_calls') {
      return path.join(stateDir, 'behavior', 'call_graph', filename);
    }
  }
  
  // Fallback
  return path.join(stateDir, domain, type, filename);
}
