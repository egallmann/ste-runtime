/**
 * RECON Phase Orchestration
 * 
 * Executes 7 phases per E-ADR-001 and E-ADR-002:
 * 1. Discovery - Identify files to process
 * 2. Extraction - Extract semantic assertions
 * 3. Inference - Infer relationships (DEFERRED)
 * 4. Normalization - Map to AI-DOC schema
 * 5. Population - Update AI-DOC state
 * 6. Divergence - Detect and record conflicts
 * 7. Self-Validation - Validate AI-DOC state (non-blocking)
 */

import type { ReconOptions, ReconResult } from '../index.js';
import type { SupportedLanguage } from '../../config/index.js';
import { ProjectDiscovery } from '../../discovery/index.js';
import { discoverFiles, discoverFilesLegacy } from './discovery.js';
import { extractAssertions } from './extraction.js';
import { inferRelationships } from './inference.js';
import { normalizeAssertions } from './normalization.js';
import { populateAiDoc } from './population.js';
import { detectDivergence } from './divergence.js';
import { runSelfValidation } from './self-validation.js';
import { updateCoordinator } from '../../watch/update-coordinator.js';
import { buildFullManifest, writeReconManifest, type ManifestLanguage } from '../../watch/change-detector.js';
import { log } from '../../utils/logger.js';
import path from 'node:path';

/**
 * Determine the manifest language from config languages.
 * If multiple languages, use 'all'. Otherwise use the specific language.
 */
function determineManifestLanguage(languages?: SupportedLanguage[]): ManifestLanguage {
  if (!languages || languages.length === 0) {
    return 'python'; // Default for backwards compatibility
  }
  
  const hasPython = languages.includes('python');
  const hasTypeScript = languages.includes('typescript');
  
  if (hasPython && hasTypeScript) {
    return 'all';
  } else if (hasTypeScript) {
    return 'typescript';
  } else {
    return 'python';
  }
}

/**
 * Normalize state root to avoid accidental filesystem-root writes.
 * RECON state paths are expected to be project-relative.
 */
function normalizeStateRoot(stateRoot: string): string {
  if (!path.isAbsolute(stateRoot)) {
    return stateRoot;
  }
  // Convert "/foo" or "\foo" style absolute roots to relative "foo".
  return stateRoot.replace(/^[\\/]+/, '');
}

export interface DiscoveredFile {
  path: string;
  relativePath: string;
  language: SupportedLanguage;
  changeType: 'added' | 'modified' | 'deleted' | 'unchanged';
}

export interface RawAssertion {
  elementId: string;
  elementType: 
    | 'function' 
    | 'class' 
    | 'variable' 
    | 'import' 
    | 'export' 
    | 'api_endpoint' 
    | 'data_model'
    | 'dependency'         // Generic dependency (DependsOn, injection, template usage, etc.)
    // CloudFormation element types
    | 'cfn_template'
    | 'cfn_resource'
    | 'cfn_parameter'
    | 'cfn_output'
    | 'cfn_gsi'
    | 'cfn_trigger'          // EventSourceMapping, EventBridge Rules → Lambda
    // Python behavioral extraction types
    | 'aws_sdk_usage'      // boto3/botocore SDK calls
    | 'env_var_access'     // os.environ/os.getenv usage
    | 'function_calls'     // Call graph within functions
    // Angular element types (E-ADR-006)
    | 'angular_component'  // @Component decorated classes
    | 'angular_service'    // @Injectable decorated classes
    | 'angular_pipe'       // @Pipe decorated classes
    | 'angular_directive'  // @Directive decorated classes
    | 'angular_guard'      // Guards (canActivate, canDeactivate, etc.)
    | 'angular_routes'     // Route definitions
    | 'angular_template'   // Component HTML templates
    // CSS/SCSS element types (E-ADR-006)
    | 'styles'             // Component styles
    | 'design_tokens';     // CSS variables, SCSS variables, animations
  file: string;
  line: number;
  end_line?: number;
  language: SupportedLanguage;
  signature?: string;
  metadata: Record<string, unknown>;
  /** Embedded source code for this element (Pillar 1: Rich Slices) */
  source?: string;
}

/**
 * Reference edge for AI-DOC graph traversal (RSS)
 * Per STE-Architecture Section 4.6: RSS Operations
 */
export interface SliceReference {
  domain: string;
  type: string;
  id: string;
}

export interface NormalizedAssertion {
  _slice: {
    id: string;
    domain: string;
    type: string;
    source_files: string[];
    /** Forward references - what this slice depends on */
    references?: SliceReference[];
    /** Reverse references - what depends on this slice (SYS-13 compliance) */
    referenced_by?: SliceReference[];
    /** Cross-domain tags for by_tag queries */
    tags?: string[];
    /** Embedded source code (Pillar 1: Rich Slices) */
    source?: string;
  };
  element: Record<string, unknown>;
  provenance: {
    extracted_at: string;
    extractor: string;
    file: string;
    line: number;
    end_line?: number;
    language: SupportedLanguage;
    /** SHA-256 checksum of source file at extraction time (E-ADR-007) */
    source_checksum?: string;
  };
}

// Conflict interface removed - conflicts don't exist under corrected model
// See E-ADR-001 §5.4 (corrected 2026-01-07): Slices are pure derived artifacts

export async function runReconPhases(options: ReconOptions): Promise<ReconResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Start update batch for tracking (E-ADR-007)
  const generation = updateCoordinator.startUpdate([]);
  
  try {
    // Phase 0: Project Structure Discovery (E-ADR-009)
    log('[RECON Phase 0] Discovering project structure...');
    const projectDiscovery = new ProjectDiscovery(options.projectRoot);
    const projectStructure = await projectDiscovery.discover();
    
    log(`[RECON Phase 0] Architecture: ${projectStructure.architecture}`);
    log(`[RECON Phase 0] Discovered ${projectStructure.domains.length} domains:`);
    projectStructure.domains.slice(0, 10).forEach(d => {
      log(`  - ${d.name} (${d.type}${d.framework ? `, ${d.framework}` : ''})`);
    });
    if (projectStructure.domains.length > 10) {
      log(`  ... and ${projectStructure.domains.length - 10} more`);
    }
    
    // Phase 1: Discovery
    log('[RECON Phase 1] Discovering files...');
    
    let discoveredFiles: DiscoveredFile[];
    
    if (options.config) {
      // New config-based discovery
      discoveredFiles = await discoverFiles({
        projectRoot: options.config.projectRoot,
        sourceDirs: options.config.sourceDirs,
        languages: options.config.languages,
        ignorePatterns: options.config.ignorePatterns,
      });
    } else {
      // Legacy mode for backward compatibility
      const legacyFiles = await discoverFilesLegacy(options.projectRoot, options.sourceRoot);
      discoveredFiles = legacyFiles.map(f => ({
        ...f,
        language: 'typescript' as SupportedLanguage,
      }));
    }
    
    log(`[RECON Phase 1] Found ${discoveredFiles.length} files`);
  
  if (discoveredFiles.length === 0) {
    warnings.push('No files discovered for processing');
    return {
      success: true,
      conflictsDetected: 0,
      aiDocUpdated: 0,
      aiDocCreated: 0,
      aiDocModified: 0,
      aiDocDeleted: 0,
      aiDocUnchanged: 0,
      validationErrors: 0,
      validationWarnings: 0,
      validationInfo: 0,
      errors,
      warnings,
    };
  }
  
  // Phase 2: Extraction
  log('[RECON Phase 2] Extracting assertions...');
  const rawAssertions = await extractAssertions(discoveredFiles);
  log(`[RECON Phase 2] Extracted ${rawAssertions.length} assertions`);
  
  // Phase 4: Normalization (before inference to build lookup structures)
  log('[RECON Phase 4] Normalizing assertions...');
  const normalizedAssertions = await normalizeAssertions(rawAssertions, options.projectRoot);
  log(`[RECON Phase 4] Normalized ${normalizedAssertions.length} assertions`);
  
  // Phase 3: Inference - Build relationships for RSS traversal
  log('[RECON Phase 3] Inferring relationships for RSS graph...');
  const enrichedAssertions = inferRelationships(normalizedAssertions, rawAssertions);
  const totalRefs = enrichedAssertions.reduce((sum, a) => sum + (a._slice.references?.length ?? 0), 0);
  const totalTags = enrichedAssertions.reduce((sum, a) => sum + (a._slice.tags?.length ?? 0), 0);
  log(`[RECON Phase 3] Inferred ${totalRefs} relationships, ${totalTags} tags`);
  
  // Determine state root
  const rawStateRoot = options.config?.stateDir ?? options.stateRoot;
  const stateRoot = normalizeStateRoot(rawStateRoot);
  if (rawStateRoot !== stateRoot) {
    warnings.push(`Absolute state root '${rawStateRoot}' normalized to '${stateRoot}'`);
  }
  
  // Collect list of processed source files for orphan detection
  const processedFiles = discoveredFiles.map(f => f.relativePath);
  
    // Phase 5: Population (with create/update/delete semantics)
    log('[RECON Phase 5] Populating AI-DOC state...');
    const populationResult = await populateAiDoc(
      enrichedAssertions,
      options.projectRoot,
      stateRoot,
      processedFiles,
      { 
        fullReconciliation: options.mode === 'full',
        generation, // E-ADR-007: Track writes for watchdog
      }
    );
    log(`[RECON Phase 5] Created: ${populationResult.created}, Updated: ${populationResult.updated}, Deleted: ${populationResult.deleted}, Unchanged: ${populationResult.unchanged}`);
  
  // Phase 6: State Validation & Self-Healing
  log('[RECON Phase 6] State validation & self-healing...');
  const validationResult = await detectDivergence(
    enrichedAssertions,
    populationResult.priorState,
    options.projectRoot,
    stateRoot
  );
  
  // Log semantic enrichments (informational)
  if (validationResult.semanticEnrichments.length > 0) {
    log(`[RECON Phase 6] Semantic enrichment: ${validationResult.semanticEnrichments.length} elements refined`);
  }
  
  // Log orphaned slices (source deleted)
  if (validationResult.orphanedSlices.length > 0) {
    log(`[RECON Phase 6] Orphaned slices: ${validationResult.orphanedSlices.length} (source deleted)`);
  }
  
  log(`[RECON Phase 6] Conflicts: 0 (slices are pure derived artifacts)`);
  
  // Phase 7: Self-Validation (non-blocking)
  log('[RECON Phase 7] Self-validation...');
  const selfValidationResult = await runSelfValidation(
    enrichedAssertions,
    options.projectRoot,
    stateRoot,
    options.sourceRoot,
    {
      validationVerbosity: options.validationVerbosity,
      repeatabilityCheck: options.repeatabilityCheck,
    }
  );
  log(`[RECON Phase 7] Validation complete: ${selfValidationResult.summary.total_findings} findings`);
  
  // Phase 8: Write manifest for freshness tracking (non-blocking)
  log('[RECON Phase 8] Writing manifest for freshness tracking...');
  const resolvedStateDir = path.resolve(options.projectRoot, stateRoot);
  
  try {
    // Determine manifest language from config
    const manifestLanguage: ManifestLanguage = determineManifestLanguage(options.config?.languages);
    const manifest = await buildFullManifest(options.projectRoot, manifestLanguage);
    await writeReconManifest(resolvedStateDir, manifest);
    log(`[RECON Phase 8] Manifest written with ${Object.keys(manifest.files).length} file fingerprints (language: ${manifestLanguage})`);
  } catch (manifestError) {
    const detail = manifestError instanceof Error ? manifestError.message : String(manifestError);
    warnings.push(`Manifest write skipped: ${detail}`);
    log(`[RECON Phase 8] Manifest write skipped: ${detail}`);
  }
  
  // Complete update batch (E-ADR-007)
  updateCoordinator.completeUpdate(generation);
  
  return {
    success: true,
    conflictsDetected: 0, // No conflicts under corrected model
    aiDocUpdated: populationResult.created + populationResult.updated,
    aiDocCreated: populationResult.created,
    aiDocModified: populationResult.updated,
    aiDocDeleted: populationResult.deleted,
    aiDocUnchanged: populationResult.unchanged,
    validationErrors: selfValidationResult.summary.errors,
    validationWarnings: selfValidationResult.summary.warnings,
    validationInfo: selfValidationResult.summary.info,
    errors,
    warnings,
  };
  } catch (error) {
    // Complete update batch even on error
    updateCoordinator.completeUpdate(generation);
    throw error;
  }
}
