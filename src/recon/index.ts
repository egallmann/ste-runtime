/**
 * RECON - Reconciliation Engine
 * 
 * Authority: E-ADR-001 (Provisional Execution of RECON for Project-Level Semantic State Pressure)
 * 
 * Purpose: Generate semantic pressure by executing incremental reconciliation
 * over the working tree and surfacing conflicts without assuming correctness.
 * 
 * This implementation is EXPLORATORY and REVERSIBLE.
 * It exists to force execution and generate learning pressure.
 */

import type { ResolvedConfig } from '../config/index.js';
import { runReconPhases } from './phases/index.js';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface ReconOptions {
  projectRoot: string;
  sourceRoot: string;  // Where to extract from (e.g., 'backend/lambda')
  stateRoot: string;   // Where to write AI-DOC (e.g., '.ste/state')
  mode?: 'incremental' | 'full';
  validationVerbosity?: 'summary' | 'detailed' | 'silent';
  repeatabilityCheck?: boolean;
  /**
   * Resolved configuration from ste.config.json.
   * When provided, enables multi-language and multi-directory scanning.
   */
  config?: ResolvedConfig;
}

export interface ReconResult {
  success: boolean;
  conflictsDetected: number;
  /** Total AI-DOC entries written (created + updated) */
  aiDocUpdated: number;
  /** New slices created */
  aiDocCreated: number;
  /** Existing slices modified */
  aiDocModified: number;
  /** Orphaned slices deleted */
  aiDocDeleted: number;
  /** Slices unchanged from prior state */
  aiDocUnchanged: number;
  validationErrors: number;
  validationWarnings: number;
  validationInfo: number;
  errors: string[];
  warnings: string[];
}

/**
 * Execute RECON over the working tree.
 * 
 * Per E-ADR-001 §5.4:
 * - MUST produce AI-DOC graph updates
 * - MUST produce explicit conflict records
 * - MUST NOT resolve conflicts automatically
 * - MUST NOT block commits
 * - MUST NOT halt development workflows
 */
export async function executeRecon(options: ReconOptions): Promise<ReconResult> {
  console.log('[RECON] Starting reconciliation...');
  console.log(`[RECON] Mode: ${options.mode ?? 'incremental'}`);
  console.log(`[RECON] Project root: ${options.projectRoot}`);
  
  if (options.config) {
    console.log(`[RECON] Config mode: scanning ${options.config.languages.join(', ')}`);
  } else {
    console.log(`[RECON] Legacy mode: source root: ${options.sourceRoot}`);
  }
  
  console.log(`[RECON] State root: ${options.stateRoot}`);
  
  try {
    const result = await runReconPhases(options);
    
    console.log('[RECON] Reconciliation complete');
    console.log(`[RECON] AI-DOC updates: ${result.aiDocUpdated}`);
    console.log(`[RECON] Conflicts detected: ${result.conflictsDetected}`);
    
    if (result.conflictsDetected > 0) {
      console.log(`[RECON] Conflicts surfaced. Review: ${options.stateRoot}/conflicts/`);
    }
    
    return result;
  } catch (error) {
    console.error('[RECON] Execution failed:', error);
    return {
      success: false,
      conflictsDetected: 0,
      aiDocUpdated: 0,
      aiDocCreated: 0,
      aiDocModified: 0,
      aiDocDeleted: 0,
      aiDocUnchanged: 0,
      validationErrors: 0,
      validationWarnings: 0,
      validationInfo: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
}
