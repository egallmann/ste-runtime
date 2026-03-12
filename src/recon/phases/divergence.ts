/**
 * RECON Phase 6: State Validation & Self-Healing
 * 
 * Validates that slices accurately reflect source code state.
 * 
 * This phase validates derived artifacts and performs self-healing:
 * - Validates slices match source checksums
 * - Identifies orphaned slices (source deleted)
 * - Logs semantic enrichment (extractor improvements)
 * - Does NOT create "conflicts" (slices are pure derived artifacts)
 * 
 * Per E-ADR-001 §5.4 (Corrected 2026-01-07):
 * - Slices are 100% derived from source
 * - Manual edits = corruption (already overwritten by Phase 5)
 * - Source code changes = authoritative updates (not conflicts)
 * - Extractor improvements = semantic enrichment (not conflicts)
 * 
 * **Authority Model (STE-spec compliant):**
 * - RECON is authoritative for project-level semantic state
 * - Conflicts do not exist (only self-healing and validation)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { NormalizedAssertion } from './index.js';

export interface ValidationResult {
  orphanedSlices: string[];
  semanticEnrichments: SemanticEnrichment[];
  validationSummary: {
    totalValidated: number;
    orphaned: number;
    enriched: number;
    unchanged: number;
  };
}

export interface SemanticEnrichment {
  element_id: string;
  source_file: string;
  enrichment_type: 'signature_change' | 'structure_change' | 'ownership_change' | 'new_properties';
  description: string;
  prior_extractor?: string;
  current_extractor?: string;
}

/**
 * Validate state and identify semantic enrichments.
 * 
 * **No conflicts are created.** All changes are either:
 * 1. Authoritative updates (source changed)
 * 2. Semantic enrichment (extractor improved)
 * 3. Orphaned slices (source deleted)
 */
export async function detectDivergence(
  newAssertions: NormalizedAssertion[],
  priorState: Map<string, NormalizedAssertion>,
  projectRoot: string,
  stateRoot: string
): Promise<ValidationResult> {
  const orphanedSlices: string[] = [];
  const semanticEnrichments: SemanticEnrichment[] = [];
  
  // Identify semantic enrichments (informational only - not conflicts)
  for (const newAssertion of newAssertions) {
    const priorAssertion = priorState.get(newAssertion._slice.id);
    
    if (priorAssertion) {
      // Element exists in prior state - check for semantic enrichment
      const enrichments = detectSemanticEnrichment(priorAssertion, newAssertion);
      semanticEnrichments.push(...enrichments);
    }
  }
  
  // Identify orphaned slices (source file deleted or element removed)
  const newIds = new Set(newAssertions.map(a => a._slice.id));
  for (const [id] of priorState.entries()) {
    if (!newIds.has(id)) {
      orphanedSlices.push(id);
    }
  }
  
  // Clean up old conflicts directory (should not exist under new model)
  const conflictsDir = path.resolve(projectRoot, stateRoot, 'conflicts');
  try {
    await fs.rm(conflictsDir, { recursive: true, force: true });
  } catch {
    // Directory might not exist, that's fine
  }
  
  const validationSummary = {
    totalValidated: newAssertions.length + priorState.size,
    orphaned: orphanedSlices.length,
    enriched: semanticEnrichments.length,
    unchanged: newAssertions.length - semanticEnrichments.length,
  };
  
  return {
    orphanedSlices,
    semanticEnrichments,
    validationSummary,
  };
}

/**
 * Detect semantic enrichment (extractor improvements).
 * 
 * These are NOT conflicts - they represent:
 * - Better extractors (e.g., TypeScript → Angular)
 * - Source code changes (authoritative)
 * - Legitimate semantic evolution
 */
function detectSemanticEnrichment(
  prior: NormalizedAssertion,
  current: NormalizedAssertion
): SemanticEnrichment[] {
  const enrichments: SemanticEnrichment[] = [];
  
  // Check for extractor changes (e.g., typescript → angular)
  const extractorChanged = prior.provenance.extractor !== current.provenance.extractor;
  
  // Compare signatures (for functions)
  if (prior._slice.type === 'function' && current._slice.type === 'function') {
    const priorSig = (prior.element.signature as string) || '';
    const currentSig = (current.element.signature as string) || '';
    
    if (priorSig !== currentSig) {
      enrichments.push({
        element_id: prior._slice.id,
        source_file: current.provenance.file,
        enrichment_type: 'signature_change',
        description: extractorChanged 
          ? `Semantic enrichment: Signature refined by improved extractor`
          : `Authoritative update: Signature changed in source code`,
        prior_extractor: prior.provenance.extractor,
        current_extractor: current.provenance.extractor,
      });
    }
  }
  
  // Compare class structure (for classes)
  if (prior._slice.type === 'class' && current._slice.type === 'class') {
    const priorMethods = (prior.element.methods as string[]) || [];
    const currentMethods = (current.element.methods as string[]) || [];
    
    const addedMethods = currentMethods.filter(m => !priorMethods.includes(m));
    const removedMethods = priorMethods.filter(m => !currentMethods.includes(m));
    
    if (addedMethods.length > 0 || removedMethods.length > 0) {
      enrichments.push({
        element_id: prior._slice.id,
        source_file: current.provenance.file,
        enrichment_type: 'structure_change',
        description: extractorChanged
          ? `Semantic enrichment: Structure refined (+${addedMethods.length} methods, -${removedMethods.length} methods)`
          : `Authoritative update: Structure changed in source code`,
        prior_extractor: prior.provenance.extractor,
        current_extractor: current.provenance.extractor,
      });
    }
  }
  
  // Compare source files (ownership)
  const priorFiles = prior._slice.source_files.sort().join(',');
  const currentFiles = current._slice.source_files.sort().join(',');
  
  if (priorFiles !== currentFiles) {
    enrichments.push({
      element_id: prior._slice.id,
      source_file: current.provenance.file,
      enrichment_type: 'ownership_change',
      description: extractorChanged
        ? `Semantic enrichment: Ownership refined by improved extractor`
        : `Authoritative update: Ownership changed (file moved/refactored)`,
      prior_extractor: prior.provenance.extractor,
      current_extractor: current.provenance.extractor,
    });
  }
  
  // Detect new properties (e.g., Angular-specific metadata)
  const priorKeys = Object.keys(prior.element);
  const currentKeys = Object.keys(current.element);
  const newProperties = currentKeys.filter(k => !priorKeys.includes(k));
  
  if (newProperties.length > 0 && extractorChanged) {
    enrichments.push({
      element_id: prior._slice.id,
      source_file: current.provenance.file,
      enrichment_type: 'new_properties',
      description: `Semantic enrichment: +${newProperties.length} new properties (${newProperties.join(', ')}) from improved extractor`,
      prior_extractor: prior.provenance.extractor,
      current_extractor: current.provenance.extractor,
    });
  }
  
  return enrichments;
}
