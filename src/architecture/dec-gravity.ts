import type { ArchModelState, NormalizedEntity } from './types.js';
import { projectEntity } from './projection.js';
import { adrDependents } from './adr-traversal.js';

export interface DecGravityScore {
  decisionId: string;
  decisionName: string;
  lifecycleStage: string;
  decLifecycleStage?: string;
  gravityScore: number;
  components: {
    downstreamDependencyCount: number;
    invariantEnforcementCount: number;
    componentGovernanceCount: number;
    capabilityEnablementCount: number;
    consequenceCount: number;
  };
}

export interface DecGravityResult {
  scores: DecGravityScore[];
  maxGravity: number;
  meanGravity: number;
}

/**
 * Compute DEC gravity for all decision entities in the model.
 *
 * Gravity is a composite score reflecting the semantic weight of a decision:
 *   gravity = downstream_deps * 2 + invariant_enforcements * 3
 *           + component_governance * 2 + capability_enablements * 1
 *           + consequence_count * 1
 *
 * Higher gravity means the decision is harder to change safely.
 */
export function computeDecGravity(model: ArchModelState): DecGravityResult {
  const scores: DecGravityScore[] = [];

  for (const entity of model.entities.values()) {
    if (entity.entity_type !== 'decision') continue;

    const projected = projectEntity(entity, model.relationships, model.entities);
    if (!projected) continue;

    const dependents = adrDependents(model, entity.id, 2, 500);

    const invariantEnforcementCount = projected.relationships.enforces.length;
    const componentGovernanceCount = projected.relationships.governs.length;
    const capabilityEnablementCount = projected.relationships.enables.length;
    const downstreamDependencyCount = dependents.entityIds.length;

    const accumulatedConsequences = Array.isArray(entity.metadata.accumulated_consequences)
      ? entity.metadata.accumulated_consequences
      : [];
    const consequenceCount = accumulatedConsequences.length;

    const gravityScore =
      downstreamDependencyCount * 2 +
      invariantEnforcementCount * 3 +
      componentGovernanceCount * 2 +
      capabilityEnablementCount * 1 +
      consequenceCount * 1;

    scores.push({
      decisionId: entity.id,
      decisionName: entity.name,
      lifecycleStage: projected.lifecycle_stage,
      decLifecycleStage: typeof entity.metadata.dec_lifecycle_stage === 'string'
        ? entity.metadata.dec_lifecycle_stage
        : undefined,
      gravityScore,
      components: {
        downstreamDependencyCount,
        invariantEnforcementCount,
        componentGovernanceCount,
        capabilityEnablementCount,
        consequenceCount,
      },
    });
  }

  scores.sort((a, b) => b.gravityScore - a.gravityScore || a.decisionId.localeCompare(b.decisionId));

  const total = scores.reduce((sum, s) => sum + s.gravityScore, 0);
  return {
    scores,
    maxGravity: scores.length > 0 ? scores[0].gravityScore : 0,
    meanGravity: scores.length > 0 ? total / scores.length : 0,
  };
}
