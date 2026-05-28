import type { ArchModelState, NormalizedEntity } from './types.js';
import { projectEntity } from './projection.js';

export interface GovernanceChain {
  decisionId: string;
  decisionName: string;
  governedEntities: Array<{ id: string; type: string; name: string; relationship: string }>;
  enforcedInvariants: Array<{ id: string; name: string }>;
  lifecycleStage: string;
  decLifecycleStage?: string;
}

export interface AuthorityBoundary {
  adrId: string;
  adrName: string;
  implementationAuthority?: string;
  declaredEntities: string[];
  lifecycleStage: string;
}

export interface InvariantCoverage {
  invariantId: string;
  invariantName: string;
  enforcingDecisions: string[];
  enforcingRules: string[];
  coverageStatus: 'enforced' | 'partially_enforced' | 'unenforced';
}

export interface GovernanceProjectionResult {
  chains: GovernanceChain[];
  authorityBoundaries: AuthorityBoundary[];
  invariantCoverage: InvariantCoverage[];
  summary: {
    totalDecisions: number;
    governingDecisions: number;
    totalInvariants: number;
    enforcedInvariants: number;
    unenforcedInvariants: number;
  };
}

/**
 * Build a governance projection from the ADR architecture model.
 *
 * Replaces the stub that previously delegated to componentIntegration.
 * Reads authority boundaries, invariant coverage, and decision governance
 * chains directly from the ADR entity and relationship registries.
 */
export function buildGovernanceProjection(model: ArchModelState): GovernanceProjectionResult {
  const chains: GovernanceChain[] = [];
  const authorityBoundaries: AuthorityBoundary[] = [];
  const invariantCoverage: InvariantCoverage[] = [];

  const projected = new Map<string, NormalizedEntity>();
  for (const entity of model.entities.values()) {
    const p = projectEntity(entity, model.relationships, model.entities);
    if (p) projected.set(p.id, p);
  }

  for (const entity of projected.values()) {
    if (entity.entity_type === 'decision') {
      const governed: GovernanceChain['governedEntities'] = [];
      const enforced: GovernanceChain['enforcedInvariants'] = [];

      for (const compId of entity.relationships.governs) {
        const comp = projected.get(compId);
        if (comp) governed.push({ id: compId, type: comp.entity_type, name: comp.name, relationship: 'governs' });
      }
      for (const capId of entity.relationships.enables) {
        const cap = projected.get(capId);
        if (cap) governed.push({ id: capId, type: cap.entity_type, name: cap.name, relationship: 'enables' });
      }
      for (const invId of entity.relationships.enforces) {
        const inv = projected.get(invId);
        if (inv) enforced.push({ id: invId, name: inv.name });
      }

      if (governed.length > 0 || enforced.length > 0) {
        chains.push({
          decisionId: entity.id,
          decisionName: entity.name,
          governedEntities: governed,
          enforcedInvariants: enforced,
          lifecycleStage: entity.lifecycle_stage,
          decLifecycleStage: typeof entity.metadata.dec_lifecycle_stage === 'string'
            ? entity.metadata.dec_lifecycle_stage
            : undefined,
        });
      }
    }

    if (entity.entity_type === 'adr') {
      const declaredEntities = entity.relationships.declares;
      authorityBoundaries.push({
        adrId: entity.id,
        adrName: entity.name,
        implementationAuthority: typeof entity.metadata.implementation_authority === 'string'
          ? entity.metadata.implementation_authority
          : undefined,
        declaredEntities,
        lifecycleStage: entity.lifecycle_stage,
      });
    }

    if (entity.entity_type === 'invariant') {
      const enforcingDecisions = entity.relationships.enforced_by.filter(
        (id) => projected.get(id)?.entity_type === 'decision',
      );
      const enforcingRules = entity.relationships.enforced_by.filter(
        (id) => projected.get(id)?.entity_type === 'rule',
      );

      let coverageStatus: InvariantCoverage['coverageStatus'];
      if (enforcingDecisions.length + enforcingRules.length === 0) {
        coverageStatus = 'unenforced';
      } else if (enforcingDecisions.length > 0 && enforcingRules.length > 0) {
        coverageStatus = 'enforced';
      } else {
        coverageStatus = 'partially_enforced';
      }

      invariantCoverage.push({
        invariantId: entity.id,
        invariantName: entity.name,
        enforcingDecisions,
        enforcingRules,
        coverageStatus,
      });
    }
  }

  chains.sort((a, b) => a.decisionId.localeCompare(b.decisionId));
  authorityBoundaries.sort((a, b) => a.adrId.localeCompare(b.adrId));
  invariantCoverage.sort((a, b) => a.invariantId.localeCompare(b.invariantId));

  const totalDecisions = [...projected.values()].filter((e) => e.entity_type === 'decision').length;
  const totalInvariants = invariantCoverage.length;
  const enforcedInvariants = invariantCoverage.filter((c) => c.coverageStatus !== 'unenforced').length;

  return {
    chains,
    authorityBoundaries,
    invariantCoverage,
    summary: {
      totalDecisions,
      governingDecisions: chains.length,
      totalInvariants,
      enforcedInvariants,
      unenforcedInvariants: totalInvariants - enforcedInvariants,
    },
  };
}
