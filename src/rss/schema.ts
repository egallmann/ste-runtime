import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────
// Core Slice Schemas
// ─────────────────────────────────────────────────────────────────

export const sliceSchema = z
  .object({
    start: z.number().int().nonnegative().optional(),
    end: z.number().int().nonnegative().optional(),
  })
  .partial();

export const entryPointSchema = z.object({
    domain: z.string(),
    type: z.string(),
    id: z.string(),
    role: z.string().optional(),
    confidence: z.string().optional(),
  });

export const bundleNodeSchema = z.object({
    nodeId: z.string(),
    domain: z.string(),
    type: z.string(),
    id: z.string(),
    order: z.number().int().nonnegative(),
    depth: z.number().int().nonnegative(),
    path: z.string().optional(),
    slice: sliceSchema.nullable().optional(),
    tier: z.union([z.string(), z.number()]),
    confidence: z.number().min(0).max(1).nullable().optional(),
    edgeFrom: z.string().nullable().optional(),
    edgeType: z.string().nullable().optional(),
  });

export const rssBundleSchema = z.object({
    task: z.string(),
    graphVersion: z.string().optional(),
    entryPoints: z.array(entryPointSchema),
    depthLimit: z.number().int().nonnegative(),
    nodes: z.array(bundleNodeSchema),
  });

export type Slice = z.infer<typeof sliceSchema>;
export type EntryPoint = z.infer<typeof entryPointSchema>;
export type BundleNode = z.infer<typeof bundleNodeSchema>;
export type RssBundle = z.infer<typeof rssBundleSchema>;

export const DEFAULT_DEPTH_LIMIT = 2;
export const DEFAULT_GRAPH_VERSION = 'unknown';

// ─────────────────────────────────────────────────────────────────
// Validation Metadata Schemas (E-ADR-014)
// ─────────────────────────────────────────────────────────────────

/**
 * Coverage types for validation claims.
 * Describes what aspect of the slice the test covers.
 */
export const coverageTypeSchema = z.enum([
  'functional',    // Tests expected behavior
  'unit',          // Isolated unit test
  'integration',   // Tests with dependencies
  'edge-case',     // Tests boundary conditions
  'regression',    // Prevents known bug recurrence
  'security',      // Security-focused test
  'performance',   // Performance-focused test
]);

/**
 * A single validation claim linking a test to a slice.
 * Represents evidence that a test exercises this slice.
 */
export const validationClaimSchema = z.object({
  // Reference to the test slice
  test_id: z.string(),
  
  // What aspect of the slice does this test cover?
  coverage: coverageTypeSchema,
  
  // When was this claim last verified (test last passed)?
  last_verified: z.string().optional(),
});

/**
 * Validation metadata attached to a slice.
 * Per E-ADR-014: Approach A (validation as slice metadata).
 */
export const sliceValidationSchema = z.object({
  // Tests that exercise this slice
  tested_by: z.array(validationClaimSchema).optional(),
  
  // Invariants that must hold for this slice
  invariants: z.array(z.string()).optional(),
  
  // When was validation metadata last updated?
  last_validated: z.string().optional(),
  
  // Hash of source at validation time (for drift detection)
  validation_hash: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────
// Obligation Projection Schemas (E-ADR-014)
// ─────────────────────────────────────────────────────────────────

/**
 * Freshness status of the semantic graph.
 */
export const freshnessStatusSchema = z.enum([
  'fresh',    // Graph reflects current source state
  'stale',    // Graph is out of date
  'partial',  // Some files are fresh, some stale
  'unknown',  // Cannot determine freshness
]);

/**
 * Freshness indicator returned with authoritative responses.
 * Tells the caller whether to trust the response.
 */
export const freshnessIndicatorSchema = z.object({
  // Scope of freshness check
  scope: z.enum(['full', 'targeted']),
  
  // Files checked for changes
  filesChecked: z.array(z.string()),
  
  // Freshness result
  status: freshnessStatusSchema,
  
  // If stale, which files changed
  staleFiles: z.array(z.string()).optional(),
  
  // Timestamp of last known-good state
  lastReconciled: z.string(),
  
  // Recommendation for caller
  action: z.enum(['proceed', 'reconcile_first', 'manual_review']),
});

/**
 * Reference to a slice (lightweight, for obligation responses).
 */
export const sliceReferenceSchema = z.object({
  key: z.string(),
  domain: z.string(),
  type: z.string(),
  id: z.string(),
  path: z.string().optional(),
});

/**
 * Types of obligations that can be projected.
 */
export const obligationTypeSchema = z.enum([
  'test_coverage',      // A test must exist for this slice
  'invariant',          // A constraint must hold
  'review',             // Human review required
  'derived_dependency', // Change in dependency requires attention
]);

/**
 * Status of an obligation.
 */
export const obligationStatusSchema = z.enum([
  'satisfied',    // Obligation is met
  'unsatisfied',  // Obligation is not met
  'unknown',      // Cannot determine status
  'invalidated',  // Previously satisfied, now invalid due to change
]);

/**
 * Source of a derived obligation (how it was computed).
 */
export const derivedObligationSourceSchema = z.object({
  relationship: z.enum(['dependent', 'dependency', 'blast_radius']),
  originSlice: sliceReferenceSchema,
  depth: z.number().int().nonnegative(),
});

/**
 * An obligation projected for a slice.
 * Per E-ADR-014: Obligations are semantic claims that something must be true.
 */
export const obligationSchema = z.object({
  // Unique identifier for this obligation
  id: z.string(),
  
  // Type of obligation
  type: obligationTypeSchema,
  
  // The slice this obligation applies to
  targetSlice: sliceReferenceSchema,
  
  // Source of the obligation
  source: z.enum(['declared', 'derived']),
  
  // If declared, where it came from
  declaredIn: z.string().optional(),
  
  // If derived, how it was computed
  derivedFrom: derivedObligationSourceSchema.optional(),
  
  // Human-readable description
  description: z.string(),
  
  // Current status
  status: obligationStatusSchema,
});

/**
 * A validation that has been invalidated by a change.
 */
export const invalidatedValidationSchema = z.object({
  // The validation claim that was invalidated
  claim: validationClaimSchema,
  
  // The slice whose validation is now invalid
  targetSlice: sliceReferenceSchema,
  
  // Why it was invalidated
  reason: z.enum(['source_changed', 'dependency_changed', 'test_changed', 'manual']),
  
  // Hash of source when validation was valid
  previousHash: z.string().optional(),
  
  // Current hash of source
  currentHash: z.string().optional(),
});

/**
 * Intent types for change projection.
 */
export const changeIntentTypeSchema = z.enum([
  'modify',    // Changing existing code
  'add',       // Adding new code
  'delete',    // Removing code
  'refactor',  // Restructuring without behavior change
  'rename',    // Renaming identifiers
]);

/**
 * Target type for change intent.
 */
export const changeTargetTypeSchema = z.enum([
  'slice_key',   // Direct slice key reference
  'file_path',   // File path
  'query',       // Natural language query
]);

/**
 * Change intent request schema.
 * Input to the project_change_obligations MCP tool.
 */
export const changeIntentSchema = z.object({
  // What kind of change?
  intentType: changeIntentTypeSchema,
  
  // Target of the change
  target: z.string(),
  targetType: changeTargetTypeSchema,
  
  // Scope configuration
  scope: z.object({
    depth: z.number().int().nonnegative().default(2),
    includeDomains: z.array(z.string()).optional(),
    maxSlices: z.number().int().positive().default(100),
  }).default({}),
  
  // Freshness handling
  freshness: z.object({
    requireFresh: z.boolean().default(true),
    maxStalenessSeconds: z.number().int().nonnegative().default(0),
  }).default({}),
});

/**
 * Advisory suggestions (not authoritative).
 */
export const advisorySchema = z.object({
  suggestedTests: z.array(z.string()),
  reviewRecommendation: z.string(),
  riskAssessment: z.enum(['low', 'medium', 'high']),
});

/**
 * Response metadata for debugging and auditing.
 */
export const obligationResponseMetaSchema = z.object({
  queryDurationMs: z.number().nonnegative(),
  preflightPerformed: z.boolean(),
  slicesAnalyzed: z.number().int().nonnegative(),
  graphVersion: z.string(),
});

/**
 * Full response schema for project_change_obligations.
 */
export const obligationProjectionResponseSchema = z.object({
  // Echo the interpreted intent
  intent: z.object({
    type: changeIntentTypeSchema,
    targetKey: z.string(),
    targetPath: z.string(),
    resolvedFromQuery: z.string().optional(),
  }),
  
  // AUTHORITATIVE: Freshness state
  freshness: freshnessIndicatorSchema,
  
  // AUTHORITATIVE: Impacted slices
  impactedSlices: z.object({
    direct: z.array(sliceReferenceSchema),
    dependents: z.array(sliceReferenceSchema),
    dependencies: z.array(sliceReferenceSchema),
  }),
  
  // AUTHORITATIVE: Required obligations
  requiredObligations: z.array(obligationSchema),
  
  // AUTHORITATIVE: Invalidated validations
  invalidatedValidations: z.array(invalidatedValidationSchema),
  
  // ADVISORY: Suggestions (not authoritative)
  advisory: advisorySchema,
  
  // Metadata
  meta: obligationResponseMetaSchema,
});

// ─────────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────────

export type CoverageType = z.infer<typeof coverageTypeSchema>;
export type ValidationClaim = z.infer<typeof validationClaimSchema>;
export type SliceValidation = z.infer<typeof sliceValidationSchema>;
export type FreshnessStatus = z.infer<typeof freshnessStatusSchema>;
export type FreshnessIndicator = z.infer<typeof freshnessIndicatorSchema>;
export type SliceReference = z.infer<typeof sliceReferenceSchema>;
export type ObligationType = z.infer<typeof obligationTypeSchema>;
export type ObligationStatus = z.infer<typeof obligationStatusSchema>;
export type DerivedObligationSource = z.infer<typeof derivedObligationSourceSchema>;
export type Obligation = z.infer<typeof obligationSchema>;
export type InvalidatedValidation = z.infer<typeof invalidatedValidationSchema>;
export type ChangeIntentType = z.infer<typeof changeIntentTypeSchema>;
export type ChangeTargetType = z.infer<typeof changeTargetTypeSchema>;
export type ChangeIntent = z.infer<typeof changeIntentSchema>;
export type Advisory = z.infer<typeof advisorySchema>;
export type ObligationResponseMeta = z.infer<typeof obligationResponseMetaSchema>;
export type ObligationProjectionResponse = z.infer<typeof obligationProjectionResponseSchema>;



