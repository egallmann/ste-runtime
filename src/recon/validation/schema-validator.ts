/**
 * Schema Validator - Validate AI-DOC schema conformance
 * 
 * Authority: E-ADR-002 (RECON Self-Validation, Non-Blocking)
 * 
 * Validates minimum required structure with fallback to explicit fields.
 * Avoids brittle markdown parsing becoming fake pressure.
 */

import type { ValidationFinding, ValidatorContext } from './types.js';

// Minimal required fields based on current AI-DOC structure
// Fallback if schema parsing fails
const REQUIRED_SLICE_FIELDS = ['id', 'domain', 'type', 'source_files'];
const REQUIRED_PROVENANCE_FIELDS = ['extracted_at', 'extractor', 'file', 'line'];

// 15-domain taxonomy from STE-AI-DOC-Schema
// Extended to include frontend (E-ADR-006) and behavior (Python runtime analysis)
const VALID_DOMAINS = [
  'project',
  'entrypoints',
  'api',
  'data',
  'graph',
  'config',
  'errors',
  'testing',
  'domain',
  'conventions',
  'observability',
  'infrastructure',
  'deployment',
  'frontend',   // Angular components, services, templates, routes, styles (E-ADR-006)
  'behavior',   // Runtime behavior analysis: AWS SDK usage, env vars, function calls
];

export async function validateSchema(
  context: ValidatorContext
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = [];
  
  for (const assertion of context.assertions) {
    // Validate _slice block exists
    if (!assertion._slice) {
      findings.push({
        category: 'ERROR',
        validator: 'schema',
        affected_artifacts: ['unknown'],
        description: 'Missing _slice metadata block',
        suggested_investigation: 'Check normalization phase implementation',
      });
      continue;
    }
    
    const sliceId = assertion._slice.id;
    
    // Validate required _slice fields
    for (const field of REQUIRED_SLICE_FIELDS) {
      if (!(field in assertion._slice)) {
        findings.push({
          category: 'ERROR',
          validator: 'schema',
          affected_artifacts: [sliceId],
          description: `Missing required _slice field: ${field}`,
          suggested_investigation: 'Check normalization mapping logic',
        });
      }
    }
    
    // Validate domain against taxonomy
    if (assertion._slice.domain && !VALID_DOMAINS.includes(assertion._slice.domain)) {
      findings.push({
        category: 'WARNING',
        validator: 'schema',
        affected_artifacts: [sliceId],
        description: `Unknown domain: ${assertion._slice.domain}. Valid domains: ${VALID_DOMAINS.join(', ')}`,
        suggested_investigation: 'Verify domain taxonomy or update validator',
      });
    }
    
    // Validate source_files is an array with at least one entry
    if (assertion._slice.source_files) {
      if (!Array.isArray(assertion._slice.source_files)) {
        findings.push({
          category: 'ERROR',
          validator: 'schema',
          affected_artifacts: [sliceId],
          description: 'source_files must be an array',
        });
      } else if (assertion._slice.source_files.length === 0) {
        findings.push({
          category: 'WARNING',
          validator: 'schema',
          affected_artifacts: [sliceId],
          description: 'source_files array is empty',
          suggested_investigation: 'Verify extraction captured file path correctly',
        });
      }
    }
    
    // Validate provenance block exists
    if (!assertion.provenance) {
      findings.push({
        category: 'ERROR',
        validator: 'schema',
        affected_artifacts: [sliceId],
        description: 'Missing provenance metadata block',
        suggested_investigation: 'Check normalization phase implementation',
      });
      continue;
    }
    
    // Validate required provenance fields
    for (const field of REQUIRED_PROVENANCE_FIELDS) {
      if (!(field in assertion.provenance)) {
        findings.push({
          category: 'ERROR',
          validator: 'schema',
          affected_artifacts: [sliceId],
          description: `Missing required provenance field: ${field}`,
          suggested_investigation: 'Check normalization mapping logic',
        });
      }
    }
    
    // Validate timestamp format
    if (assertion.provenance.extracted_at) {
      const timestamp = assertion.provenance.extracted_at;
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
      if (!isoDateRegex.test(timestamp)) {
        findings.push({
          category: 'WARNING',
          validator: 'schema',
          affected_artifacts: [sliceId],
          description: `extracted_at timestamp not in ISO-8601 format: ${timestamp}`,
          suggested_investigation: 'Use new Date().toISOString() for timestamps',
        });
      }
    }
    
    // Validate element block exists
    if (!assertion.element || typeof assertion.element !== 'object') {
      findings.push({
        category: 'WARNING',
        validator: 'schema',
        affected_artifacts: [sliceId],
        description: 'Missing or invalid element block',
        suggested_investigation: 'Check that element-specific data is being extracted',
      });
    }
  }
  
  return findings;
}
