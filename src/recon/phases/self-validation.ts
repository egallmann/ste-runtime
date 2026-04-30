/**
 * RECON Phase 7: Self-Validation
 * 
 * Authority: E-ADR-002 (RECON Self-Validation, Non-Blocking)
 * 
 * Orchestrates all validation categories and generates reports.
 * Never throws exceptions - all validation is non-blocking.
 */

import path from 'node:path';
import type { NormalizedAssertion } from './index.js';
import type { ValidationFinding, ValidationResult, ValidatorContext } from '../validation/types.js';
import { validateSchema } from '../validation/schema-validator.js';
import { validateRepeatability } from '../validation/repeatability-validator.js';
import { validateGraph } from '../validation/graph-validator.js';
import { validateIdentity } from '../validation/identity-validator.js';
import { validateCoverage } from '../validation/coverage-validator.js';
import { generateReport, type ReportVerbosity } from '../validation/report-generator.js';
import { log } from '../../utils/logger.js';

export interface SelfValidationOptions {
  validationVerbosity?: ReportVerbosity;
  repeatabilityCheck?: boolean;
}

/**
 * Execute self-validation as Phase 7.
 * 
 * This phase runs after divergence detection and validates
 * RECON-generated AI-DOC state for internal consistency.
 * 
 * Per E-ADR-002:
 * - Non-blocking: never throws, never halts execution
 * - Report-only: generates evidence, not verdicts
 * - Categorized: all findings are ERROR/WARNING/INFO
 */
export async function runSelfValidation(
  assertions: NormalizedAssertion[],
  projectRoot: string,
  stateRoot: string,
  sourceRoot: string,
  options: SelfValidationOptions = {}
): Promise<ValidationResult> {
  const verbosity = options.validationVerbosity ?? 'summary';
  const repeatabilityCheck = options.repeatabilityCheck ?? false;
  
  log('[RECON Phase 7] Self-validation (non-blocking)...');
  
  // Generate run ID for this validation
  const runId = `recon-${Date.now()}`;
  
  const stateDir = path.resolve(projectRoot, stateRoot);
  
  const context: ValidatorContext = {
    assertions,
    projectRoot,
    sourceRoot,
    stateDir,
    repeatabilityCheck,
  };
  
  const allFindings: ValidationFinding[] = [];
  
  try {
    // Run all validators concurrently (each is independently error-isolated)
    const validators: Array<{
      name: string;
      run: () => Promise<ValidationFinding[]>;
    }> = [
      { name: 'schema', run: () => validateSchema(context) },
      { name: 'repeatability', run: () => validateRepeatability(context, runId) },
      { name: 'graph', run: () => validateGraph(context) },
      { name: 'identity', run: () => validateIdentity(context) },
      { name: 'coverage', run: () => validateCoverage(context) },
    ];

    if (verbosity !== 'silent') {
      log(`[RECON Phase 7] Running ${validators.length} validators in parallel...`);
    }

    const results = await Promise.allSettled(
      validators.map(v => v.run())
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const validatorName = validators[i].name;
      if (result.status === 'fulfilled') {
        allFindings.push(...result.value);
      } else {
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        allFindings.push({
          category: 'ERROR',
          validator: validatorName as ValidationFinding['validator'],
          affected_artifacts: [],
          description: `${validatorName} validation crashed: ${msg}`,
          suggested_investigation: `Check ${validatorName}-validator.ts implementation`,
        });
      }
    }
    
    // Calculate summary
    const summary = {
      total_findings: allFindings.length,
      errors: allFindings.filter(f => f.category === 'ERROR').length,
      warnings: allFindings.filter(f => f.category === 'WARNING').length,
      info: allFindings.filter(f => f.category === 'INFO').length,
    };
    
    // Generate report
    await generateReport(stateDir, runId, allFindings, verbosity);
    
    log(`[RECON Phase 7] Validation complete: ${summary.total_findings} findings (${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} info)`);
    
    // Return result (success = true even with errors, non-blocking)
    return {
      success: true,
      summary,
      findings: allFindings,
    };
  } catch (error) {
    // Catastrophic failure in validation orchestration
    // Still non-blocking: log and return failure result
    console.error('[RECON Phase 7] Validation orchestration failed:', error);
    
    return {
      success: false,
      summary: {
        total_findings: allFindings.length + 1,
        errors: allFindings.filter(f => f.category === 'ERROR').length + 1,
        warnings: allFindings.filter(f => f.category === 'WARNING').length,
        info: allFindings.filter(f => f.category === 'INFO').length,
      },
      findings: [
        ...allFindings,
        {
          category: 'ERROR',
          validator: 'schema',
          affected_artifacts: [],
          description: `Validation orchestration failed: ${error instanceof Error ? error.message : String(error)}`,
          suggested_investigation: 'Check self-validation.ts implementation',
        },
      ],
    };
  }
}

