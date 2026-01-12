/**
 * JSON Data Model Extractor
 * 
 * Authority: E-ADR-005 (JSON Data Model and Configuration Extraction)
 * 
 * Extracts semantic JSON files:
 * - Controls catalog (security controls, compliance rules)
 * - Data schemas (entity definitions, API contracts)
 * - CFN parameters (deployment configuration)
 */

export { extractFromJson } from './json-extractor.js';
export type { JsonExtractionResult, ControlDefinition, SchemaDefinition, ParameterConfig } from './json-extractor.js';



