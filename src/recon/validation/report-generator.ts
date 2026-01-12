/**
 * Report Generator - Generate validation reports
 * 
 * Authority: E-ADR-002 (RECON Self-Validation, Non-Blocking)
 * 
 * Dual output: latest.yaml (overwritable) + runs/<timestamp>.yaml (immutable).
 * Configurable verbosity: summary (default), detailed, silent.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { ValidationFinding, ValidationReport } from './types.js';
import { pruneOldReports } from './history-manager.js';

export type ReportVerbosity = 'summary' | 'detailed' | 'silent';

/**
 * Generate and write validation report.
 */
export async function generateReport(
  stateDir: string,
  runId: string,
  findings: ValidationFinding[],
  verbosity: ReportVerbosity = 'summary'
): Promise<void> {
  try {
    // Calculate summary statistics
    const summary = {
      total_findings: findings.length,
      errors: findings.filter(f => f.category === 'ERROR').length,
      warnings: findings.filter(f => f.category === 'WARNING').length,
      info: findings.filter(f => f.category === 'INFO').length,
    };
    
    // Build report structure
    const report: ValidationReport = {
      validation_run: {
        timestamp: new Date().toISOString(),
        recon_run_id: runId,
        validation_version: '0.1.0',
      },
      summary,
      findings,
    };
    
    // Ensure validation directory structure exists
    const validationDir = path.join(stateDir, 'validation');
    const runsDir = path.join(validationDir, 'runs');
    await fs.mkdir(validationDir, { recursive: true });
    await fs.mkdir(runsDir, { recursive: true });
    
    // Write latest.yaml (overwritable)
    const latestPath = path.join(validationDir, 'latest.yaml');
    const yamlContent = yaml.dump(report, {
      noRefs: true,
      lineWidth: -1,
      sortKeys: false,
    });
    await fs.writeFile(latestPath, yamlContent, 'utf-8');
    
    // Write timestamped run report (immutable)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const runReportPath = path.join(runsDir, `${timestamp}.yaml`);
    await fs.writeFile(runReportPath, yamlContent, 'utf-8');
    
    // Prune old reports (keep last 10)
    await pruneOldReports(stateDir);
    
    // Console output based on verbosity
    if (verbosity !== 'silent') {
      console.log('[RECON Validation] Report generated');
      console.log(`[RECON Validation] Findings: ${summary.total_findings} total (${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} info)`);
      
      if (verbosity === 'detailed') {
        // Print detailed findings
        if (findings.length > 0) {
          console.log('[RECON Validation] Detailed findings:');
          
          // Group by category
          const byCategory = {
            ERROR: findings.filter(f => f.category === 'ERROR'),
            WARNING: findings.filter(f => f.category === 'WARNING'),
            INFO: findings.filter(f => f.category === 'INFO'),
          };
          
          for (const [category, categoryFindings] of Object.entries(byCategory)) {
            if (categoryFindings.length > 0) {
              console.log(`\n  ${category}:`);
              for (const finding of categoryFindings) {
                console.log(`    [${finding.validator}] ${finding.description}`);
                if (finding.affected_artifacts.length > 0 && finding.affected_artifacts.length <= 3) {
                  console.log(`      Artifacts: ${finding.affected_artifacts.join(', ')}`);
                } else if (finding.affected_artifacts.length > 3) {
                  console.log(`      Artifacts: ${finding.affected_artifacts.length} affected`);
                }
                if (finding.suggested_investigation) {
                  console.log(`      → ${finding.suggested_investigation}`);
                }
              }
            }
          }
        }
      }
      
      console.log(`[RECON Validation] Reports written to:`);
      console.log(`  - ${path.relative(process.cwd(), latestPath)}`);
      console.log(`  - ${path.relative(process.cwd(), runReportPath)}`);
    }
  } catch (error) {
    // Non-blocking: log error but don't throw
    console.error('[RECON Validation] Failed to generate report:', error);
  }
}

/**
 * Print summary to console (for non-silent modes).
 */
export function printSummary(findings: ValidationFinding[]): void {
  const summary = {
    total: findings.length,
    errors: findings.filter(f => f.category === 'ERROR').length,
    warnings: findings.filter(f => f.category === 'WARNING').length,
    info: findings.filter(f => f.category === 'INFO').length,
  };
  
  console.log(`[RECON Validation] Summary: ${summary.total} findings (${summary.errors} ERROR, ${summary.warnings} WARNING, ${summary.info} INFO)`);
  
  if (summary.errors > 0) {
    console.log('[RECON Validation] Errors detected (non-blocking)');
  }
}


