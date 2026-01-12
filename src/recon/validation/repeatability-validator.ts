/**
 * Repeatability Validator - Detect non-deterministic extraction
 * 
 * Authority: E-ADR-002 (RECON Self-Validation, Non-Blocking)
 * 
 * Default: Hash-based comparison against historical checksums.
 * Opt-in: Immediate re-run comparison (doubles runtime).
 */

import crypto from 'node:crypto';
import type { NormalizedAssertion } from '../phases/index.js';
import type { ValidationFinding, ValidatorContext, ChecksumEntry } from './types.js';
import { loadChecksumHistory, saveChecksumEntry } from './history-manager.js';

/**
 * Normalize assertion for deterministic hashing.
 * Excludes non-deterministic fields like timestamps and run IDs.
 */
function normalizeForHashing(assertion: NormalizedAssertion): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    _slice: {
      id: assertion._slice.id,
      domain: assertion._slice.domain,
      type: assertion._slice.type,
      source_files: assertion._slice.source_files,
    },
    element: assertion.element,
  };
  
  // Include stable provenance fields only (exclude timestamp)
  if (assertion.provenance) {
    normalized.provenance = {
      extractor: assertion.provenance.extractor,
      file: assertion.provenance.file,
      line: assertion.provenance.line,
    };
  }
  
  return normalized;
}

/**
 * Compute deterministic hash of normalized assertion.
 */
function computeChecksum(assertion: NormalizedAssertion): string {
  const normalized = normalizeForHashing(assertion);
  const json = JSON.stringify(normalized, Object.keys(normalized).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

export async function validateRepeatability(
  context: ValidatorContext,
  runId: string
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = [];
  
  try {
    // Compute checksums for current run
    const currentChecksums = new Map<string, ChecksumEntry>();
    
    for (const assertion of context.assertions) {
      const checksum = computeChecksum(assertion);
      const entry: ChecksumEntry = {
        artifact_id: assertion._slice.id,
        file_path: assertion.provenance.file,
        checksum,
        timestamp: new Date().toISOString(),
        extractor_version: assertion.provenance.extractor,
      };
      currentChecksums.set(assertion._slice.id, entry);
    }
    
    // Load historical checksums
    const history = await loadChecksumHistory(context.stateDir);
    
    // Compare against most recent historical run (if exists)
    if (history.runs.length > 0) {
      const lastRun = history.runs[history.runs.length - 1];
      const lastChecksums = new Map(
        lastRun.checksums.map(c => [c.artifact_id, c])
      );
      
      // Check for changed checksums (potential non-determinism)
      for (const [id, currentEntry] of currentChecksums.entries()) {
        const historicalEntry = lastChecksums.get(id);
        
        if (historicalEntry) {
          // Same file path, different checksum = potential drift
          if (
            historicalEntry.file_path === currentEntry.file_path &&
            historicalEntry.checksum !== currentEntry.checksum
          ) {
            // Check if extractor version changed
            if (historicalEntry.extractor_version !== currentEntry.extractor_version) {
              findings.push({
                category: 'INFO',
                validator: 'repeatability',
                affected_artifacts: [id],
                description: `Checksum changed due to extractor version update (${historicalEntry.extractor_version} → ${currentEntry.extractor_version})`,
                suggested_investigation: 'Expected behavior for extractor updates',
              });
            } else {
              findings.push({
                category: 'WARNING',
                validator: 'repeatability',
                affected_artifacts: [id],
                description: `Checksum changed for same file path without extractor version change`,
                suggested_investigation: 'Possible non-deterministic extraction or file content change',
              });
            }
          }
        }
      }
      
      // Check for new artifacts
      const newArtifacts = Array.from(currentChecksums.keys()).filter(
        id => !lastChecksums.has(id)
      );
      if (newArtifacts.length > 0) {
        findings.push({
          category: 'INFO',
          validator: 'repeatability',
          affected_artifacts: newArtifacts,
          description: `${newArtifacts.length} new artifact(s) detected since last run`,
        });
      }
      
      // Check for removed artifacts
      const removedArtifacts = Array.from(lastChecksums.keys()).filter(
        id => !currentChecksums.has(id)
      );
      if (removedArtifacts.length > 0) {
        findings.push({
          category: 'INFO',
          validator: 'repeatability',
          affected_artifacts: removedArtifacts,
          description: `${removedArtifacts.length} artifact(s) removed since last run`,
        });
      }
    }
    
    // Save current run checksums to history
    await saveChecksumEntry(
      context.stateDir,
      runId,
      Array.from(currentChecksums.values())
    );
    
    // Optional: Immediate re-run check (opt-in only)
    if (context.repeatabilityCheck) {
      findings.push({
        category: 'INFO',
        validator: 'repeatability',
        affected_artifacts: [],
        description: 'Immediate re-run repeatability check is enabled',
        suggested_investigation: 'Not implemented yet - requires re-running normalization phase',
      });
    }
  } catch (error) {
    findings.push({
      category: 'ERROR',
      validator: 'repeatability',
      affected_artifacts: [],
      description: `Repeatability validation failed: ${error instanceof Error ? error.message : String(error)}`,
      suggested_investigation: 'Check history-manager implementation and file permissions',
    });
  }
  
  return findings;
}


