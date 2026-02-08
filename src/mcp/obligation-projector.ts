/**
 * Obligation Projection Engine
 * 
 * Per E-ADR-014: Projects obligations (tests, invariants, review requirements)
 * for impacted slices based on change intent.
 * 
 * Obligations can be:
 * - Declared: Explicit _validation metadata on slices
 * - Derived: Computed from graph structure (dependencies, dependents)
 */

import type { AidocNode } from '../rss/graph-loader.js';
import type { RssContext } from '../rss/rss-operations.js';
import { 
  blastRadius, 
  dependencies, 
  dependents, 
  lookupByKey,
  search,
} from '../rss/rss-operations.js';
import type {
  ChangeIntent,
  ChangeIntentType,
  Obligation,
  ObligationType,
  ObligationStatus,
  SliceReference,
  InvalidatedValidation,
  SliceValidation,
  ValidationClaim,
  Advisory,
} from '../rss/schema.js';
import { resolveIntentScope, type ScopeResolutionResult } from './preflight.js';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface ObligationProjectionOptions {
  /** Maximum depth for graph traversal */
  depth?: number;
  
  /** Maximum slices to analyze */
  maxSlices?: number;
  
  /** Domains to include in analysis */
  includeDomains?: string[];
}

export interface ImpactedSlices {
  /** Direct target of the change */
  direct: SliceReference[];
  
  /** Slices that depend on the target */
  dependents: SliceReference[];
  
  /** Slices the target depends on */
  dependencies: SliceReference[];
}

export interface ObligationProjectionResult {
  /** Resolved intent information */
  resolvedIntent: {
    type: ChangeIntentType;
    targetKey: string;
    targetPath: string;
    resolvedFromQuery?: string;
  };
  
  /** Impacted slices */
  impactedSlices: ImpactedSlices;
  
  /** Required obligations (declared + derived) */
  requiredObligations: Obligation[];
  
  /** Validations invalidated by this change */
  invalidatedValidations: InvalidatedValidation[];
  
  /** Advisory suggestions (heuristic, not authoritative) */
  advisory: Advisory;
  
  /** Count of slices analyzed */
  slicesAnalyzed: number;
}

// ─────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────

/**
 * Convert an AidocNode to a SliceReference.
 */
function nodeToReference(node: AidocNode): SliceReference {
  return {
    key: node.key,
    domain: node.domain,
    type: node.type,
    id: node.id,
    path: node.path,
  };
}

/**
 * Generate a unique obligation ID.
 */
function generateObligationId(
  type: ObligationType,
  targetKey: string,
  suffix?: string
): string {
  const base = `${type}:${targetKey}`;
  return suffix ? `${base}:${suffix}` : base;
}

/**
 * Extract validation metadata from a node's raw element.
 * 
 * Looks for _validation block in the slice data.
 */
function extractValidationMetadata(node: AidocNode): SliceValidation | null {
  // The validation metadata would be stored in the slice's element
  // For now, we check if there's a _validation property
  const element = node.element as Record<string, unknown> | undefined;
  
  if (!element) {
    return null;
  }
  
  // Check for _validation in the element (would be populated by RECON)
  const validation = (element as any)._validation as SliceValidation | undefined;
  
  if (!validation) {
    return null;
  }
  
  return validation;
}

// ─────────────────────────────────────────────────────────────────
// Obligation Extraction
// ─────────────────────────────────────────────────────────────────

/**
 * Extract declared obligations from a slice's validation metadata.
 */
function extractDeclaredObligations(
  node: AidocNode,
  validation: SliceValidation | null
): Obligation[] {
  const obligations: Obligation[] = [];
  const targetRef = nodeToReference(node);
  
  if (!validation) {
    return obligations;
  }
  
  // Extract test coverage obligations
  if (validation.tested_by && validation.tested_by.length > 0) {
    for (const claim of validation.tested_by) {
      obligations.push({
        id: generateObligationId('test_coverage', node.key, claim.test_id),
        type: 'test_coverage',
        targetSlice: targetRef,
        source: 'declared',
        declaredIn: claim.test_id,
        description: `Test coverage by ${claim.test_id} (${claim.coverage})`,
        status: 'satisfied', // Declared tests are assumed satisfied until proven otherwise
      });
    }
  }
  
  // Extract invariant obligations
  if (validation.invariants && validation.invariants.length > 0) {
    for (let i = 0; i < validation.invariants.length; i++) {
      const invariant = validation.invariants[i];
      obligations.push({
        id: generateObligationId('invariant', node.key, `inv-${i}`),
        type: 'invariant',
        targetSlice: targetRef,
        source: 'declared',
        declaredIn: node.key,
        description: invariant,
        status: 'unknown', // Invariants need verification
      });
    }
  }
  
  return obligations;
}

/**
 * Derive obligations from graph structure.
 * 
 * If a slice has dependents, changing it creates review obligations
 * for those dependents.
 */
function deriveDependentObligations(
  ctx: RssContext,
  targetNode: AidocNode,
  intent: ChangeIntent,
  options: ObligationProjectionOptions
): Obligation[] {
  const obligations: Obligation[] = [];
  const depth = options.depth ?? 2;
  const maxSlices = options.maxSlices ?? 100;
  
  // Get dependents (what depends on this slice)
  const deps = dependents(ctx, targetNode.key, depth, maxSlices);
  
  for (const depNode of deps.nodes) {
    // Skip if domain filtering is active and this domain is excluded
    if (options.includeDomains && !options.includeDomains.includes(depNode.domain)) {
      continue;
    }
    
    // Create a review obligation for each dependent
    obligations.push({
      id: generateObligationId('derived_dependency', depNode.key, targetNode.key),
      type: 'derived_dependency',
      targetSlice: nodeToReference(depNode),
      source: 'derived',
      derivedFrom: {
        relationship: 'dependent',
        originSlice: nodeToReference(targetNode),
        depth: 1, // Direct dependent
      },
      description: `Review required: depends on ${targetNode.id} which is being modified`,
      status: 'unsatisfied',
    });
  }
  
  return obligations;
}

/**
 * Derive review obligations based on change type.
 */
function deriveChangeTypeObligations(
  targetNode: AidocNode,
  intentType: ChangeIntentType
): Obligation[] {
  const obligations: Obligation[] = [];
  const targetRef = nodeToReference(targetNode);
  
  // Different change types have different review requirements
  switch (intentType) {
    case 'delete':
      obligations.push({
        id: generateObligationId('review', targetNode.key, 'deletion'),
        type: 'review',
        targetSlice: targetRef,
        source: 'derived',
        description: 'Deletion requires verification that all dependents are updated',
        status: 'unsatisfied',
      });
      break;
      
    case 'rename':
      obligations.push({
        id: generateObligationId('review', targetNode.key, 'rename'),
        type: 'review',
        targetSlice: targetRef,
        source: 'derived',
        description: 'Rename requires updating all references to this element',
        status: 'unsatisfied',
      });
      break;
      
    case 'refactor':
      obligations.push({
        id: generateObligationId('review', targetNode.key, 'refactor'),
        type: 'review',
        targetSlice: targetRef,
        source: 'derived',
        description: 'Refactoring requires verification that behavior is preserved',
        status: 'unsatisfied',
      });
      break;
      
    // 'modify' and 'add' don't create additional review obligations by default
  }
  
  return obligations;
}

// ─────────────────────────────────────────────────────────────────
// Validation Invalidation
// ─────────────────────────────────────────────────────────────────

/**
 * Identify validations that are invalidated by the change.
 * 
 * A validation is invalidated if:
 * 1. The target slice's source has changed (hash mismatch)
 * 2. A dependency's source has changed
 */
function identifyInvalidatedValidations(
  ctx: RssContext,
  targetNode: AidocNode,
  intentType: ChangeIntentType
): InvalidatedValidation[] {
  const invalidated: InvalidatedValidation[] = [];
  const validation = extractValidationMetadata(targetNode);
  
  if (!validation || !validation.tested_by) {
    return invalidated;
  }
  
  // For modify/refactor/delete/rename, existing test validations are invalidated
  const invalidatingIntents: ChangeIntentType[] = ['modify', 'refactor', 'delete', 'rename'];
  
  if (invalidatingIntents.includes(intentType)) {
    for (const claim of validation.tested_by) {
      invalidated.push({
        claim: {
          test_id: claim.test_id,
          coverage: claim.coverage,
          last_verified: claim.last_verified,
        },
        targetSlice: nodeToReference(targetNode),
        reason: 'source_changed',
        previousHash: validation.validation_hash,
        currentHash: undefined, // Would be computed from current source
      });
    }
  }
  
  return invalidated;
}

// ─────────────────────────────────────────────────────────────────
// Advisory Generation
// ─────────────────────────────────────────────────────────────────

/**
 * Generate advisory suggestions (heuristic, not authoritative).
 */
function generateAdvisory(
  targetNode: AidocNode,
  impactedSlices: ImpactedSlices,
  intentType: ChangeIntentType
): Advisory {
  const suggestedTests: string[] = [];
  
  // Heuristic: Suggest test file based on naming convention and source language
  const sourcePath = targetNode.path ?? targetNode.sourceFiles[0];
  if (sourcePath) {
    const fileName = sourcePath.split('/').pop() ?? '';
    const ext = fileName.substring(fileName.lastIndexOf('.'));
    
    // Determine test file naming based on source file extension
    if (ext === '.py') {
      // Python convention: tests/test_<module>.py
      const baseName = fileName.replace('.py', '');
      suggestedTests.push(`tests/test_${baseName}.py`);
    } else if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
      // TypeScript/JavaScript convention: <module>.test.ts or <module>.spec.ts
      const baseName = fileName.replace(/\.(ts|tsx|js|jsx)$/, '');
      suggestedTests.push(`${baseName}.test.ts`);
      suggestedTests.push(`${baseName}.spec.ts`);
    }
    
    // Also suggest based on function/class name
    if (targetNode.type === 'function') {
      suggestedTests.push(`Test for function: ${targetNode.id}`);
    } else if (targetNode.type === 'class') {
      suggestedTests.push(`Test for class: ${targetNode.id}`);
    }
  }
  
  // Generate review recommendation
  const dependentCount = impactedSlices.dependents.length;
  const dependencyCount = impactedSlices.dependencies.length;
  
  let reviewRecommendation = '';
  if (intentType === 'delete') {
    reviewRecommendation = `Deletion of ${targetNode.id}. Ensure ${dependentCount} dependent(s) are updated.`;
  } else if (intentType === 'rename') {
    reviewRecommendation = `Rename of ${targetNode.id}. Update ${dependentCount} reference(s).`;
  } else if (dependentCount > 5) {
    reviewRecommendation = `High-impact change: ${dependentCount} dependents affected. Consider incremental rollout.`;
  } else if (dependentCount > 0) {
    reviewRecommendation = `${dependentCount} dependent(s) may need review after this change.`;
  } else {
    reviewRecommendation = 'Low-impact change: No dependents identified.';
  }
  
  // Risk assessment based on blast radius
  const totalImpact = impactedSlices.direct.length + 
                      impactedSlices.dependents.length + 
                      impactedSlices.dependencies.length;
  
  let riskAssessment: 'low' | 'medium' | 'high';
  if (intentType === 'delete' || totalImpact > 20) {
    riskAssessment = 'high';
  } else if (totalImpact > 5 || intentType === 'refactor') {
    riskAssessment = 'medium';
  } else {
    riskAssessment = 'low';
  }
  
  return {
    suggestedTests,
    reviewRecommendation,
    riskAssessment,
  };
}

// ─────────────────────────────────────────────────────────────────
// Main Projection Function
// ─────────────────────────────────────────────────────────────────

/**
 * Project obligations for a change intent.
 * 
 * This is the main entry point for obligation projection. It:
 * 1. Resolves the intent target to a specific slice
 * 2. Computes impacted slices (direct, dependents, dependencies)
 * 3. Extracts declared obligations from validation metadata
 * 4. Derives obligations from graph structure
 * 5. Identifies invalidated validations
 * 6. Generates advisory suggestions
 * 
 * @param ctx - RSS context with loaded graph
 * @param intent - The change intent to project obligations for
 * @param scopeResult - Pre-resolved scope from preflight (optional)
 * @param options - Projection options
 * @returns Obligation projection result
 */
export function projectObligations(
  ctx: RssContext,
  intent: ChangeIntent,
  scopeResult?: ScopeResolutionResult,
  options: ObligationProjectionOptions = {}
): ObligationProjectionResult {
  const depth = options.depth ?? intent.scope?.depth ?? 2;
  const maxSlices = options.maxSlices ?? intent.scope?.maxSlices ?? 100;
  
  // Resolve scope if not provided
  const scope = scopeResult ?? resolveIntentScope(ctx, intent);
  
  // Find the primary target node
  let targetNode: AidocNode | null = null;
  
  if (scope.targetKey) {
    targetNode = lookupByKey(ctx, scope.targetKey);
  }
  
  // If no target found, return empty result
  if (!targetNode) {
    return {
      resolvedIntent: {
        type: intent.intentType,
        targetKey: scope.targetKey ?? intent.target,
        targetPath: scope.targetPath ?? intent.target,
        resolvedFromQuery: scope.resolvedFromQuery,
      },
      impactedSlices: {
        direct: [],
        dependents: [],
        dependencies: [],
      },
      requiredObligations: [],
      invalidatedValidations: [],
      advisory: {
        suggestedTests: [],
        reviewRecommendation: 'Target not found in semantic graph.',
        riskAssessment: 'low',
      },
      slicesAnalyzed: 0,
    };
  }
  
  // Compute impacted slices
  const directSlices: SliceReference[] = [nodeToReference(targetNode)];
  
  // Get dependents (what depends on this)
  const dependentResult = dependents(ctx, targetNode.key, depth, maxSlices);
  const dependentSlices: SliceReference[] = dependentResult.nodes
    .filter(n => !options.includeDomains || options.includeDomains.includes(n.domain))
    .map(nodeToReference);
  
  // Get dependencies (what this depends on)
  const dependencyResult = dependencies(ctx, targetNode.key, depth, maxSlices);
  const dependencySlices: SliceReference[] = dependencyResult.nodes
    .filter(n => !options.includeDomains || options.includeDomains.includes(n.domain))
    .map(nodeToReference);
  
  const impactedSlices: ImpactedSlices = {
    direct: directSlices,
    dependents: dependentSlices,
    dependencies: dependencySlices,
  };
  
  // Extract and derive obligations
  const validation = extractValidationMetadata(targetNode);
  const declaredObligations = extractDeclaredObligations(targetNode, validation);
  const derivedDependentObligations = deriveDependentObligations(ctx, targetNode, intent, options);
  const changeTypeObligations = deriveChangeTypeObligations(targetNode, intent.intentType);
  
  const requiredObligations: Obligation[] = [
    ...declaredObligations,
    ...derivedDependentObligations,
    ...changeTypeObligations,
  ];
  
  // Identify invalidated validations
  const invalidatedValidations = identifyInvalidatedValidations(
    ctx, 
    targetNode, 
    intent.intentType
  );
  
  // Generate advisory
  const advisory = generateAdvisory(targetNode, impactedSlices, intent.intentType);
  
  // Count slices analyzed
  const slicesAnalyzed = 1 + dependentSlices.length + dependencySlices.length;
  
  return {
    resolvedIntent: {
      type: intent.intentType,
      targetKey: targetNode.key,
      targetPath: targetNode.path ?? targetNode.sourceFiles[0] ?? '',
      resolvedFromQuery: scope.resolvedFromQuery,
    },
    impactedSlices,
    requiredObligations,
    invalidatedValidations,
    advisory,
    slicesAnalyzed,
  };
}

/**
 * Quick obligation count for a change intent.
 * 
 * Use this for lightweight queries that just need counts.
 */
export function countObligations(
  ctx: RssContext,
  intent: ChangeIntent
): { declared: number; derived: number; total: number } {
  const result = projectObligations(ctx, intent);
  
  const declared = result.requiredObligations.filter(o => o.source === 'declared').length;
  const derived = result.requiredObligations.filter(o => o.source === 'derived').length;
  
  return {
    declared,
    derived,
    total: declared + derived,
  };
}

