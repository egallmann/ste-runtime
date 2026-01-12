/**
 * JSON Data Model Extractor
 * 
 * Authority: E-ADR-005 (JSON Data Model and Configuration Extraction)
 * 
 * Extracts semantic JSON files based on path patterns:
 * - Controls catalog → data/control slices
 * - Data schemas → data/schema slices
 * - CFN parameters → infrastructure/config slices
 * 
 * Per E-ADR-005: JSON files are identified by path pattern, not content inspection.
 */

import fs from 'node:fs/promises';
import type { DiscoveredFile, RawAssertion } from '../../recon/phases/index.js';
import type { JsonPatterns } from '../../config/index.js';
import { toPosixPath } from '../../utils/paths.js';

/**
 * Control definition extracted from JSON
 */
export interface ControlDefinition {
  controlId: string;
  title?: string;
  severity?: string;
  service?: string;
  complianceFrameworks?: string[];
  description?: string;
  remediationGuidance?: string;
}

/**
 * Schema definition extracted from JSON
 */
export interface SchemaDefinition {
  entity: string;
  tableName?: string;
  attributes?: Array<{
    name: string;
    type?: string;
    required?: boolean;
  }>;
  keys?: {
    partitionKey?: string;
    sortKey?: string;
  };
}

/**
 * Parameter configuration extracted from JSON
 */
export interface ParameterConfig {
  environment?: string;
  parameters: Record<string, string>;
}

/**
 * Result of JSON extraction
 */
export interface JsonExtractionResult {
  type: 'control' | 'schema' | 'config' | 'reference';
  data: ControlDefinition | SchemaDefinition | ParameterConfig | Record<string, unknown>;
}

/**
 * Determine the JSON category based on file path
 */
function categorizeJsonFile(
  relativePath: string,
  patterns: JsonPatterns
): 'control' | 'schema' | 'config' | 'reference' | null {
  const posixPath = toPosixPath(relativePath);
  
  // Check against configured patterns
  if (patterns?.controls && matchesPattern(posixPath, patterns.controls)) {
    return 'control';
  }
  if (patterns?.schemas && matchesPattern(posixPath, patterns.schemas)) {
    return 'schema';
  }
  if (patterns?.parameters && matchesPattern(posixPath, patterns.parameters)) {
    return 'config';
  }
  
  // Default pattern matching based on directory structure
  if (posixPath.includes('/controls/') || posixPath.includes('/controls-catalog/')) {
    return 'control';
  }
  if (posixPath.includes('/schemas/') || posixPath.includes('/schema/')) {
    return 'schema';
  }
  if (posixPath.includes('/parameters/') || posixPath.includes('/params/')) {
    return 'config';
  }
  if (posixPath.includes('/seed-data/') || posixPath.includes('/reference/')) {
    return 'reference';
  }
  
  return null; // Not a semantic JSON file
}

/**
 * Simple glob-like pattern matching
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\//g, '\\/');
  
  const regex = new RegExp(regexPattern);
  return regex.test(filePath);
}

/**
 * Extract control definition from JSON content
 */
function extractControl(content: Record<string, unknown>, relativePath: string): RawAssertion | null {
  // Try to find controlId in various formats
  const controlId = 
    content.controlId as string ||
    content.ControlId as string ||
    content.control_id as string ||
    content.id as string;
  
  if (!controlId) {
    return null;
  }
  
  const control: ControlDefinition = {
    controlId,
    title: content.title as string || content.Title as string,
    severity: content.severity as string || content.Severity as string,
    service: content.service as string || content.Service as string,
    complianceFrameworks: content.complianceFrameworks as string[] || 
                          content.ComplianceFrameworks as string[] ||
                          content.frameworks as string[],
    description: content.description as string || content.Description as string,
    remediationGuidance: content.remediationGuidance as string || 
                         content.Remediation as string ||
                         content.remediation as string,
  };
  
  return {
    elementId: `control:${controlId}`,
    elementType: 'data_model',
    file: relativePath,
    line: 1,
    language: 'json',
    metadata: {
      jsonCategory: 'control',
      ...control,
    },
  };
}

/**
 * Extract schema definition from JSON content
 */
function extractSchema(content: Record<string, unknown>, relativePath: string): RawAssertion | null {
  // Try to find entity name in various formats
  const entity = 
    content.entity as string ||
    content.Entity as string ||
    content.name as string ||
    content.Name as string ||
    content.title as string;
  
  if (!entity) {
    return null;
  }
  
  // Extract version from file path if available (e.g., schema-v1.0.0.json)
  const versionMatch = relativePath.match(/[_-]v?(\d+\.\d+\.\d+)/);
  const version = versionMatch?.[1] || content.$version as string || content.version as string;
  
  // Use $id from JSON Schema if available, otherwise construct from entity + file
  const schemaId = content.$id as string;
  
  const schema: SchemaDefinition = {
    entity,
    tableName: content.tableName as string || content.TableName as string,
    attributes: content.attributes as SchemaDefinition['attributes'] ||
                content.Attributes as SchemaDefinition['attributes'] ||
                content.properties as SchemaDefinition['attributes'],
    keys: content.keys as SchemaDefinition['keys'] ||
          content.Keys as SchemaDefinition['keys'],
  };
  
  // Generate unique ID: include file path to differentiate schema versions
  // This ensures controls-catalog-schema-v1.0.0.json != controls-catalog-schema-v1.1.0.json
  const posixPath = toPosixPath(relativePath);
  const uniqueId = `schema:${posixPath}`;
  
  return {
    elementId: uniqueId,
    elementType: 'data_model',
    file: relativePath,
    line: 1,
    language: 'json',
    metadata: {
      jsonCategory: 'schema',
      schemaId,  // Original $id if present
      version,   // Version extracted from filename or content
      ...schema,
    },
  };
}

/**
 * Extract CFN parameter configuration from JSON content
 */
function extractConfig(content: Record<string, unknown>, relativePath: string): RawAssertion | null {
  // Handle AWS CFN parameter format
  let parameters: Record<string, string> = {};
  let environment: string | undefined;
  
  if (Array.isArray(content.Parameters)) {
    // AWS CFN format: [{ ParameterKey, ParameterValue }]
    for (const param of content.Parameters as Array<{ ParameterKey: string; ParameterValue: string }>) {
      if (param.ParameterKey && param.ParameterValue !== undefined) {
        parameters[param.ParameterKey] = String(param.ParameterValue);
        if (param.ParameterKey === 'Environment' || param.ParameterKey === 'Env') {
          environment = String(param.ParameterValue);
        }
      }
    }
  } else if (content.Parameters && typeof content.Parameters === 'object') {
    // Simple key-value format
    parameters = content.Parameters as Record<string, string>;
    environment = parameters.Environment || parameters.Env;
  } else {
    // Top-level key-value (legacy format)
    parameters = content as Record<string, string>;
    environment = content.Environment as string || content.Env as string;
  }
  
  if (Object.keys(parameters).length === 0) {
    return null;
  }
  
  // Extract environment from filename if not in content
  if (!environment) {
    const match = relativePath.match(/(dev|prod|uat|staging|test)/i);
    if (match) {
      environment = match[1].toLowerCase();
    }
  }
  
  const configId = `config:${toPosixPath(relativePath)}`;
  
  return {
    elementId: configId,
    elementType: 'data_model',
    file: relativePath,
    line: 1,
    language: 'json',
    metadata: {
      jsonCategory: 'config',
      environment,
      parameters,
      parameterCount: Object.keys(parameters).length,
    },
  };
}

/**
 * Extract reference data from JSON content
 */
function extractReference(content: Record<string, unknown>, relativePath: string): RawAssertion | null {
  // Extract a simple reference data entry
  const id = content.id as string || content.name as string || content.key as string;
  
  if (!id) {
    return null;
  }
  
  return {
    elementId: `reference:${toPosixPath(relativePath)}:${id}`,
    elementType: 'data_model',
    file: relativePath,
    line: 1,
    language: 'json',
    metadata: {
      jsonCategory: 'reference',
      ...content,
    },
  };
}

/**
 * Extract semantic assertions from a JSON file.
 * 
 * Per E-ADR-005:
 * - Controls catalog → data/control slices
 * - Data schemas → data/schema slices
 * - CFN parameters → infrastructure/config slices
 */
export async function extractFromJson(
  file: DiscoveredFile,
  patterns?: JsonPatterns
): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  
  // Categorize the file
  const category = categorizeJsonFile(file.relativePath, patterns ?? {});
  
  if (!category) {
    // Not a semantic JSON file
    return assertions;
  }
  
  // Read and parse JSON
  let content: Record<string, unknown>;
  try {
    const rawContent = await fs.readFile(file.path, 'utf-8');
    content = JSON.parse(rawContent);
  } catch (error) {
    console.warn(`[JSON Extractor] Failed to parse ${file.relativePath}:`, error);
    return assertions;
  }
  
  // Handle arrays (e.g., array of controls or parameters)
  if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item === 'object' && item !== null) {
        const assertion = extractByCategory(category, item as Record<string, unknown>, file.relativePath);
        if (assertion) {
          assertions.push(assertion);
        }
      }
    }
    return assertions;
  }
  
  // Handle single object
  const assertion = extractByCategory(category, content, file.relativePath);
  if (assertion) {
    assertions.push(assertion);
  }
  
  return assertions;
}

/**
 * Extract assertion based on category
 */
function extractByCategory(
  category: 'control' | 'schema' | 'config' | 'reference',
  content: Record<string, unknown>,
  relativePath: string
): RawAssertion | null {
  switch (category) {
    case 'control':
      return extractControl(content, relativePath);
    case 'schema':
      return extractSchema(content, relativePath);
    case 'config':
      return extractConfig(content, relativePath);
    case 'reference':
      return extractReference(content, relativePath);
    default:
      return null;
  }
}


