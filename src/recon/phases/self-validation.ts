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
  
  console.log('[RECON Phase 7] Self-validation (non-blocking)...');
  
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
    // Run all validators (wrapped in try-catch to ensure non-blocking)
    
    // 1. Schema Integrity
    try {
      if (verbosity !== 'silent') {
        console.log('[RECON Phase 7] Running schema validation...');
      }
      const schemaFindings = await validateSchema(context);
      allFindings.push(...schemaFindings);
    } catch (error) {
      allFindings.push({
        category: 'ERROR',
        validator: 'schema',
        affected_artifacts: [],
        description: `Schema validation crashed: ${error instanceof Error ? error.message : String(error)}`,
        suggested_investigation: 'Check schema-validator.ts implementation',
      });
    }
    
    // 2. Repeatability
    try {
      if (verbosity !== 'silent') {
        console.log('[RECON Phase 7] Running repeatability validation...');
      }
      const repeatabilityFindings = await validateRepeatability(context, runId);
      allFindings.push(...repeatabilityFindings);
    } catch (error) {
      allFindings.push({
        category: 'ERROR',
        validator: 'repeatability',
        affected_artifacts: [],
        description: `Repeatability validation crashed: ${error instanceof Error ? error.message : String(error)}`,
        suggested_investigation: 'Check repeatability-validator.ts implementation',
      });
    }
    
    // 3. Graph Consistency
    try {
      if (verbosity !== 'silent') {
        console.log('[RECON Phase 7] Running graph validation...');
      }
      const graphFindings = await validateGraph(context);
      allFindings.push(...graphFindings);
    } catch (error) {
      allFindings.push({
        category: 'ERROR',
        validator: 'graph',
        affected_artifacts: [],
        description: `Graph validation crashed: ${error instanceof Error ? error.message : String(error)}`,
        suggested_investigation: 'Check graph-validator.ts implementation',
      });
    }
    
    // 4. Identity Stability
    try {
      if (verbosity !== 'silent') {
        console.log('[RECON Phase 7] Running identity validation...');
      }
      const identityFindings = await validateIdentity(context);
      allFindings.push(...identityFindings);
    } catch (error) {
      allFindings.push({
        category: 'ERROR',
        validator: 'identity',
        affected_artifacts: [],
        description: `Identity validation crashed: ${error instanceof Error ? error.message : String(error)}`,
        suggested_investigation: 'Check identity-validator.ts implementation',
      });
    }
    
    // 5. Extraction Coverage
    try {
      if (verbosity !== 'silent') {
        console.log('[RECON Phase 7] Running coverage validation...');
      }
      const coverageFindings = await validateCoverage(context);
      allFindings.push(...coverageFindings);
    } catch (error) {
      allFindings.push({
        category: 'ERROR',
        validator: 'coverage',
        affected_artifacts: [],
        description: `Coverage validation crashed: ${error instanceof Error ? error.message : String(error)}`,
        suggested_investigation: 'Check coverage-validator.ts implementation',
      });
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
    
    console.log(`[RECON Phase 7] Validation complete: ${summary.total_findings} findings (${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} info)`);
    
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

