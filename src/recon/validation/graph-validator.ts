/**
 * Graph Validator - Shallow graph consistency checks
 * 
 * Authority: E-ADR-002 (RECON Self-Validation, Non-Blocking)
 * 
 * Shallow checks only: dangling references, duplicates, malformed edges.
 * Avoids premature semantics and deep bidirectional validation.
 */

import type { NormalizedAssertion } from '../phases/index.js';
import type { ValidationFinding, ValidatorContext } from './types.js';

export async function validateGraph(
  context: ValidatorContext
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = [];
  
  // Build index of all artifact IDs by domain
  const artifactsByDomain = new Map<string, Set<string>>();
  const moduleIdsByPath = new Map<string, string>();
  
  for (const assertion of context.assertions) {
    const { domain, id } = assertion._slice;
    
    if (!artifactsByDomain.has(domain)) {
      artifactsByDomain.set(domain, new Set());
    }
    
    // Check for duplicate IDs within domain
    if (artifactsByDomain.get(domain)!.has(id)) {
      findings.push({
        category: 'ERROR',
        validator: 'graph',
        affected_artifacts: [id],
        description: `Duplicate ID within domain '${domain}': ${id}`,
        suggested_investigation: 'Check ID generation logic in normalization phase',
      });
    } else {
      artifactsByDomain.get(domain)!.add(id);
    }
    
    // Build module ID index for import validation
    if (domain === 'graph' && assertion._slice.type === 'module') {
      if (assertion.element && typeof assertion.element === 'object' && 'path' in assertion.element) {
        moduleIdsByPath.set(assertion.element.path as string, id);
      }
    }
  }
  
  // Validate graph consistency for module imports
  for (const assertion of context.assertions) {
    if (assertion._slice.domain === 'graph' && assertion._slice.type === 'module') {
      const element = assertion.element as Record<string, unknown>;
      
      // Check if imports structure is valid
      if (element.imports && typeof element.imports === 'object') {
        const imports = element.imports as Record<string, unknown>;
        
        // Validate internal imports structure
        if (imports.internal && Array.isArray(imports.internal)) {
          for (const imp of imports.internal) {
            if (typeof imp !== 'object' || imp === null) {
              findings.push({
                category: 'ERROR',
                validator: 'graph',
                affected_artifacts: [assertion._slice.id],
                description: 'Malformed internal import object',
                suggested_investigation: 'Check extraction phase import parsing',
              });
              continue;
            }
            
            const importObj = imp as Record<string, unknown>;
            
            // Validate import has required fields
            if (!('module' in importObj)) {
              findings.push({
                category: 'ERROR',
                validator: 'graph',
                affected_artifacts: [assertion._slice.id],
                description: 'Internal import missing module field',
                suggested_investigation: 'Check extraction phase import parsing',
              });
            }
            
            // Note: We do NOT validate that the imported module exists
            // This would be premature semantic validation
            // We only check that the structure is valid
          }
        } else if (imports.internal !== undefined && !Array.isArray(imports.internal)) {
          findings.push({
            category: 'ERROR',
            validator: 'graph',
            affected_artifacts: [assertion._slice.id],
            description: 'imports.internal must be an array',
            suggested_investigation: 'Check normalization phase mapping',
          });
        }
        
        // Validate external imports structure
        if (imports.external && !Array.isArray(imports.external)) {
          findings.push({
            category: 'ERROR',
            validator: 'graph',
            affected_artifacts: [assertion._slice.id],
            description: 'imports.external must be an array',
            suggested_investigation: 'Check normalization phase mapping',
          });
        }
      }
      
      // Check if exports structure is valid
      if (element.exports && typeof element.exports === 'object') {
        const exports = element.exports as Record<string, unknown>;
        
        // Validate export arrays
        for (const key of ['classes', 'functions', 'constants']) {
          if (key in exports && exports[key] !== undefined && !Array.isArray(exports[key])) {
            findings.push({
              category: 'ERROR',
              validator: 'graph',
              affected_artifacts: [assertion._slice.id],
              description: `exports.${key} must be an array`,
              suggested_investigation: 'Check normalization phase mapping',
            });
          }
        }
      }
    }
  }
  
  // Check for orphaned nodes (unreferenced modules)
  // This is advisory only - entry points are expected to be unreferenced
  const referencedModules = new Set<string>();
  for (const assertion of context.assertions) {
    if (assertion._slice.domain === 'graph' && assertion._slice.type === 'module') {
      const element = assertion.element as Record<string, unknown>;
      if (element.imports && typeof element.imports === 'object') {
        const imports = element.imports as Record<string, unknown>;
        if (imports.internal && Array.isArray(imports.internal)) {
          for (const imp of imports.internal) {
            if (typeof imp === 'object' && imp !== null && 'module' in imp) {
              referencedModules.add((imp as Record<string, unknown>).module as string);
            }
          }
        }
      }
    }
  }
  
  // Count unreferenced modules (INFO only, not an error)
  const allModuleIds = artifactsByDomain.get('graph') || new Set();
  const unreferencedCount = Array.from(allModuleIds).filter(
    id => !referencedModules.has(id)
  ).length;
  
  if (unreferencedCount > 0) {
    findings.push({
      category: 'INFO',
      validator: 'graph',
      affected_artifacts: [],
      description: `${unreferencedCount} module(s) are not referenced by other modules (may be entry points)`,
      suggested_investigation: 'Expected for entry points; investigate if count seems high',
    });
  }
  
  return findings;
}

