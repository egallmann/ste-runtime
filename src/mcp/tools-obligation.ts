/**
 * MCP Tools - Obligation Projection (E-ADR-014)
 * 
 * Intent-aware obligation projection tools for AI-assisted development.
 * These tools allow Cursor to query what obligations are created,
 * invalidated, or required by a proposed change.
 */

import type { RssContext } from '../rss/rss-operations.js';
import { initRssContext } from '../rss/rss-operations.js';
import { 
  preflightReconciliation, 
  checkFreshness,
  resolveIntentScope,
  type PreflightOptions,
} from './preflight.js';
import { 
  projectObligations,
  countObligations,
  type ObligationProjectionOptions,
} from './obligation-projector.js';
import type {
  ChangeIntent,
  ChangeIntentType,
  ChangeTargetType,
  ObligationProjectionResponse,
  FreshnessIndicator,
} from '../rss/schema.js';

// ─────────────────────────────────────────────────────────────────
// Request/Response Types
// ─────────────────────────────────────────────────────────────────

export interface ProjectChangeObligationsArgs {
  /** Type of change being proposed */
  intentType: ChangeIntentType;
  
  /** Target of the change (slice key, file path, or query) */
  target: string;
  
  /** How to interpret the target */
  targetType?: ChangeTargetType;
  
  /** Traversal depth for impact analysis */
  depth?: number;
  
  /** Maximum slices to analyze */
  maxSlices?: number;
  
  /** Domains to include in analysis */
  includeDomains?: string[];
  
  /** Whether to require fresh graph state */
  requireFresh?: boolean;
  
  /** Maximum acceptable staleness in seconds */
  maxStalenessSeconds?: number;
}

export interface ProjectChangeObligationsResult {
  /** Interpreted intent */
  intent: {
    type: ChangeIntentType;
    targetKey: string;
    targetPath: string;
    resolvedFromQuery?: string;
  };
  
  /** Graph freshness state */
  freshness: FreshnessIndicator;
  
  /** Impacted slices */
  impactedSlices: {
    direct: Array<{ key: string; domain: string; type: string; id: string; path?: string }>;
    dependents: Array<{ key: string; domain: string; type: string; id: string; path?: string }>;
    dependencies: Array<{ key: string; domain: string; type: string; id: string; path?: string }>;
  };
  
  /** Required obligations */
  requiredObligations: Array<{
    id: string;
    type: string;
    targetSlice: { key: string; path?: string };
    source: 'declared' | 'derived';
    description: string;
    status: string;
  }>;
  
  /** Invalidated validations */
  invalidatedValidations: Array<{
    testId: string;
    coverage: string;
    targetSlice: { key: string; path?: string };
    reason: string;
  }>;
  
  /** Advisory suggestions (not authoritative) */
  advisory: {
    suggestedTests: string[];
    reviewRecommendation: string;
    riskAssessment: 'low' | 'medium' | 'high';
  };
  
  /** Response metadata */
  meta: {
    queryDurationMs: number;
    preflightPerformed: boolean;
    slicesAnalyzed: number;
    graphVersion: string;
  };
}

// ─────────────────────────────────────────────────────────────────
// Tool Configuration
// ─────────────────────────────────────────────────────────────────

export interface ObligationToolsConfig {
  projectRoot: string;
  stateDir: string;
}

// ─────────────────────────────────────────────────────────────────
// Tool Handler
// ─────────────────────────────────────────────────────────────────

/**
 * Tool: project_change_obligations
 * 
 * Main obligation projection tool. Given a proposed change intent,
 * returns the obligations that are created, invalidated, or required.
 * 
 * This tool:
 * 1. Performs preflight reconciliation if required
 * 2. Projects obligations based on graph structure
 * 3. Returns authoritative results with freshness indicators
 */
export async function projectChangeObligationsTool(
  ctx: RssContext,
  args: ProjectChangeObligationsArgs,
  config: ObligationToolsConfig
): Promise<ProjectChangeObligationsResult> {
  const startTime = Date.now();
  
  // Build change intent from args
  const intent: ChangeIntent = {
    intentType: args.intentType,
    target: args.target,
    targetType: args.targetType ?? inferTargetType(args.target),
    scope: {
      depth: args.depth ?? 2,
      includeDomains: args.includeDomains,
      maxSlices: args.maxSlices ?? 100,
    },
    freshness: {
      requireFresh: args.requireFresh ?? true,
      maxStalenessSeconds: args.maxStalenessSeconds ?? 0,
    },
  };
  
  // Preflight options
  const preflightOptions: PreflightOptions = {
    projectRoot: config.projectRoot,
    stateDir: config.stateDir,
    maxStalenessSeconds: intent.freshness.maxStalenessSeconds,
    skipReconciliation: !intent.freshness.requireFresh,
  };
  
  // Run preflight reconciliation
  const preflight = await preflightReconciliation(ctx, intent, preflightOptions);
  
  // If reconciliation was performed, we should reload the context
  // For now, we continue with the existing context
  // In production, ctx would be reloaded after reconciliation
  
  // Project obligations
  const scope = resolveIntentScope(ctx, intent);
  const projection = projectObligations(ctx, intent, scope, {
    depth: intent.scope.depth,
    maxSlices: intent.scope.maxSlices,
    includeDomains: intent.scope.includeDomains,
  });
  
  // Build response
  const result: ProjectChangeObligationsResult = {
    intent: projection.resolvedIntent,
    freshness: preflight.freshness,
    impactedSlices: {
      direct: projection.impactedSlices.direct.map(s => ({
        key: s.key,
        domain: s.domain,
        type: s.type,
        id: s.id,
        path: s.path,
      })),
      dependents: projection.impactedSlices.dependents.map(s => ({
        key: s.key,
        domain: s.domain,
        type: s.type,
        id: s.id,
        path: s.path,
      })),
      dependencies: projection.impactedSlices.dependencies.map(s => ({
        key: s.key,
        domain: s.domain,
        type: s.type,
        id: s.id,
        path: s.path,
      })),
    },
    requiredObligations: projection.requiredObligations.map(o => ({
      id: o.id,
      type: o.type,
      targetSlice: {
        key: o.targetSlice.key,
        path: o.targetSlice.path,
      },
      source: o.source,
      description: o.description,
      status: o.status,
    })),
    invalidatedValidations: projection.invalidatedValidations.map(v => ({
      testId: v.claim.test_id,
      coverage: v.claim.coverage,
      targetSlice: {
        key: v.targetSlice.key,
        path: v.targetSlice.path,
      },
      reason: v.reason,
    })),
    advisory: projection.advisory,
    meta: {
      queryDurationMs: Date.now() - startTime,
      preflightPerformed: preflight.reconciliationPerformed,
      slicesAnalyzed: projection.slicesAnalyzed,
      graphVersion: ctx.graphVersion,
    },
  };
  
  return result;
}

/**
 * Infer target type from the target string.
 */
function inferTargetType(target: string): ChangeTargetType {
  // If it looks like a slice key (domain/type/id)
  if (target.includes('/') && target.split('/').length >= 3) {
    return 'slice_key';
  }
  
  // If it looks like a file path
  if (target.includes('.') && (
    target.endsWith('.py') ||
    target.endsWith('.ts') ||
    target.endsWith('.js') ||
    target.endsWith('.tsx') ||
    target.endsWith('.jsx') ||
    target.includes('/')
  )) {
    return 'file_path';
  }
  
  // Otherwise, treat as natural language query
  return 'query';
}

/**
 * Tool: check_graph_freshness
 * 
 * Quick check of graph freshness for a given scope.
 * Does not perform reconciliation.
 */
export async function checkGraphFreshnessTool(
  ctx: RssContext,
  args: {
    target: string;
    targetType?: ChangeTargetType;
    depth?: number;
  },
  config: ObligationToolsConfig
): Promise<{
  freshness: FreshnessIndicator;
  filesInScope: number;
}> {
  const intent: ChangeIntent = {
    intentType: 'modify', // Doesn't matter for freshness check
    target: args.target,
    targetType: args.targetType ?? inferTargetType(args.target),
    scope: {
      depth: args.depth ?? 2,
      maxSlices: 100,
    },
    freshness: {
      requireFresh: false,
      maxStalenessSeconds: 0,
    },
  };
  
  const freshness = await checkFreshness(ctx, intent, {
    projectRoot: config.projectRoot,
    stateDir: config.stateDir,
  });
  
  return {
    freshness,
    filesInScope: freshness.filesChecked.length,
  };
}

/**
 * Tool: count_obligations
 * 
 * Quick count of obligations for a change intent.
 * Lighter weight than full projection.
 */
export function countObligationsTool(
  ctx: RssContext,
  args: {
    intentType: ChangeIntentType;
    target: string;
    targetType?: ChangeTargetType;
  }
): {
  declared: number;
  derived: number;
  total: number;
} {
  const intent: ChangeIntent = {
    intentType: args.intentType,
    target: args.target,
    targetType: args.targetType ?? inferTargetType(args.target),
    scope: { depth: 2, maxSlices: 100 },
    freshness: { requireFresh: false, maxStalenessSeconds: 0 },
  };
  
  return countObligations(ctx, intent);
}


