/**
 * Type definitions for RECON self-validation (E-ADR-002)
 * 
 * Authority: E-ADR-002 (RECON Self-Validation, Non-Blocking)
 * 
 * All validation is non-blocking, report-only, and exploratory.
 */

import type { NormalizedAssertion } from '../phases/index.js';

export type ValidationCategory = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationFinding {
  category: ValidationCategory;
  validator: 'schema' | 'repeatability' | 'graph' | 'identity' | 'coverage';
  affected_artifacts: string[];
  description: string;
  suggested_investigation?: string;
}

export interface ValidationResult {
  success: boolean;
  summary: {
    total_findings: number;
    errors: number;
    warnings: number;
    info: number;
  };
  findings: ValidationFinding[];
}

export interface ValidationReport {
  validation_run: {
    timestamp: string;
    recon_run_id: string;
    validation_version: string;
  };
  summary: {
    total_findings: number;
    errors: number;
    warnings: number;
    info: number;
  };
  findings: ValidationFinding[];
}

export interface ChecksumEntry {
  artifact_id: string;
  file_path: string;
  checksum: string;
  timestamp: string;
  extractor_version: string;
}

export interface ChecksumHistory {
  runs: {
    run_id: string;
    timestamp: string;
    checksums: ChecksumEntry[];
  }[];
}

export interface ValidatorContext {
  assertions: NormalizedAssertion[];
  projectRoot: string;
  sourceRoot: string;
  stateDir: string;
  repeatabilityCheck: boolean;
}

