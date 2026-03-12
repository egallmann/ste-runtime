/**
 * Identity Validator - Detect ID stability issues
 * 
 * Authority: E-ADR-002 (RECON Self-Validation, Non-Blocking)
 * 
 * Detects identity drift for same file paths across runs.
 * Tracks extractor version changes.
 */

import type { ValidationFinding, ValidatorContext } from './types.js';
import { loadChecksumHistory } from './history-manager.js';

export async function validateIdentity(
  context: ValidatorContext
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = [];
  
  try {
    // Build current identity map: file_path -> { id, extractor_version }
    const currentIdentities = new Map<string, { id: string; extractor: string }>();
    
    for (const assertion of context.assertions) {
      const filePath = assertion.provenance.file;
      const id = assertion._slice.id;
      const extractor = assertion.provenance.extractor;
      
      currentIdentities.set(filePath, { id, extractor });
    }
    
    // Load historical checksums to get previous identities
    const history = await loadChecksumHistory(context.stateDir);
    
    if (history.runs.length > 0) {
      const lastRun = history.runs[history.runs.length - 1];
      
      // Build historical identity map: file_path -> { id, extractor_version }
      const historicalIdentities = new Map<string, { id: string; extractor: string }>();
      for (const entry of lastRun.checksums) {
        historicalIdentities.set(entry.file_path, {
          id: entry.artifact_id,
          extractor: entry.extractor_version,
        });
      }
      
      // Compare identities for same file paths
      for (const [filePath, current] of currentIdentities.entries()) {
        const historical = historicalIdentities.get(filePath);
        
        if (historical) {
          // Check if ID changed for the same file path
          if (historical.id !== current.id) {
            // Determine if this is due to extractor version change
            if (historical.extractor !== current.extractor) {
              findings.push({
                category: 'INFO',
                validator: 'identity',
                affected_artifacts: [current.id, historical.id],
                description: `ID changed for ${filePath} due to extractor version change (${historical.extractor} → ${current.extractor}): ${historical.id} → ${current.id}`,
                suggested_investigation: 'Expected behavior when extractor version changes',
              });
            } else {
              findings.push({
                category: 'ERROR',
                validator: 'identity',
                affected_artifacts: [current.id, historical.id],
                description: `ID instability detected for ${filePath}: ${historical.id} → ${current.id} (same extractor version)`,
                suggested_investigation: 'ID generation logic may be non-deterministic',
              });
            }
          }
        }
      }
      
      // Track extractor version changes per extractor name (not across all languages)
      // Different language extractors are expected (e.g., typescript-v1, python-v1)
      // But same language with multiple versions is a concern
      
      // Group by extractor base name (e.g., "recon-typescript-extractor" without version)
      const extractorsByBase = new Map<string, Set<string>>();
      for (const { extractor } of currentIdentities.values()) {
        // Extract base name: "recon-typescript-extractor-v1" -> "recon-typescript-extractor"
        const baseName = extractor.replace(/-v\d+$/, '');
        if (!extractorsByBase.has(baseName)) {
          extractorsByBase.set(baseName, new Set());
        }
        extractorsByBase.get(baseName)!.add(extractor);
      }
      
      // Check for version conflicts within the same extractor type
      for (const [baseName, versions] of extractorsByBase) {
        if (versions.size > 1) {
          findings.push({
            category: 'WARNING',
            validator: 'identity',
            affected_artifacts: [],
            description: `Multiple versions of ${baseName} in use: ${Array.from(versions).join(', ')}`,
            suggested_investigation: 'Should typically use single version per extractor type',
          });
        }
      }
      
      // Historical version change detection (for single-extractor projects)
      const historicalExtractorVersions = new Set(
        Array.from(historicalIdentities.values()).map(v => v.extractor)
      );
      
      // Note: Multi-extractor projects (TypeScript, Python, etc.) are expected
      // Only report version changes for single-extractor projects
      const currentVersions = new Set(Array.from(currentIdentities.values()).map(v => v.extractor));
      if (currentVersions.size === 1 && historicalExtractorVersions.size === 1) {
        const currentVersion = Array.from(currentVersions)[0];
        const historicalVersion = Array.from(historicalExtractorVersions)[0];
        if (currentVersion !== historicalVersion) {
          findings.push({
            category: 'INFO',
            validator: 'identity',
            affected_artifacts: [],
            description: `Extractor version changed: ${historicalVersion} → ${currentVersion}`,
            suggested_investigation: 'Expected when updating extractor implementation',
          });
        }
      }
    }
    
    // Check for duplicate IDs with different file paths (serious issue)
    const idToFilePaths = new Map<string, string[]>();
    for (const [filePath, { id }] of currentIdentities.entries()) {
      if (!idToFilePaths.has(id)) {
        idToFilePaths.set(id, []);
      }
      idToFilePaths.get(id)!.push(filePath);
    }
    
    for (const [id, filePaths] of idToFilePaths.entries()) {
      if (filePaths.length > 1) {
        findings.push({
          category: 'ERROR',
          validator: 'identity',
          affected_artifacts: [id],
          description: `Duplicate ID across multiple files: ${id} appears in ${filePaths.join(', ')}`,
          suggested_investigation: 'ID generation must be unique per artifact',
        });
      }
    }
  } catch (error) {
    findings.push({
      category: 'ERROR',
      validator: 'identity',
      affected_artifacts: [],
      description: `Identity validation failed: ${error instanceof Error ? error.message : String(error)}`,
      suggested_investigation: 'Check history-manager implementation',
    });
  }
  
  return findings;
}

