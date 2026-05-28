import type { ArchModelState } from './types.js';

export interface EntityCoverage {
  entityId: string;
  entityType: string;
  entityName: string;
  embodimentCount: number;
  attributedSlices: string[];
  enforcingSlices: string[];
  coverageStatus: 'covered' | 'partial' | 'unlinked';
}

export interface EmbodimentDensityResult {
  byAdr: EntityCoverage[];
  byCapability: EntityCoverage[];
  bySystem: EntityCoverage[];
  byComponent: EntityCoverage[];
  byInvariant: EntityCoverage[];
  summary: {
    totalEntities: number;
    coveredEntities: number;
    unlinkedEntities: number;
    coverageRatio: number;
  };
}

/**
 * Compute embodiment density across the ADR entity model.
 *
 * Requires that architectureMerge has been called with real attribution
 * data so that entities carry embodiment_count and attributed_code_slices
 * metadata.
 */
export function computeEmbodimentDensity(model: ArchModelState): EmbodimentDensityResult {
  const byType = new Map<string, EntityCoverage[]>();

  for (const entity of model.entities.values()) {
    const entityType = entity.entity_type;
    if (!['adr', 'capability', 'system', 'component', 'invariant'].includes(entityType)) continue;

    const embodimentCount = typeof entity.metadata.embodiment_count === 'number'
      ? entity.metadata.embodiment_count
      : 0;
    const attributedSlices = Array.isArray(entity.metadata.attributed_code_slices)
      ? (entity.metadata.attributed_code_slices as string[])
      : [];
    const enforcingSlices = Array.isArray(entity.metadata.enforcing_code_slices)
      ? (entity.metadata.enforcing_code_slices as string[])
      : [];

    let coverageStatus: EntityCoverage['coverageStatus'];
    if (embodimentCount === 0 && attributedSlices.length === 0 && enforcingSlices.length === 0) {
      coverageStatus = 'unlinked';
    } else if (embodimentCount > 0 && attributedSlices.length > 0) {
      coverageStatus = 'covered';
    } else {
      coverageStatus = 'partial';
    }

    const coverage: EntityCoverage = {
      entityId: entity.id,
      entityType,
      entityName: entity.name,
      embodimentCount,
      attributedSlices,
      enforcingSlices,
      coverageStatus,
    };

    const list = byType.get(entityType) ?? [];
    list.push(coverage);
    byType.set(entityType, list);
  }

  const sort = (items: EntityCoverage[]) =>
    items.sort((a, b) => b.embodimentCount - a.embodimentCount || a.entityId.localeCompare(b.entityId));

  const allCoverage = [...(byType.values())].flat();
  const totalEntities = allCoverage.length;
  const coveredEntities = allCoverage.filter((c) => c.coverageStatus === 'covered').length;
  const unlinkedEntities = allCoverage.filter((c) => c.coverageStatus === 'unlinked').length;

  return {
    byAdr: sort(byType.get('adr') ?? []),
    byCapability: sort(byType.get('capability') ?? []),
    bySystem: sort(byType.get('system') ?? []),
    byComponent: sort(byType.get('component') ?? []),
    byInvariant: sort(byType.get('invariant') ?? []),
    summary: {
      totalEntities,
      coveredEntities,
      unlinkedEntities,
      coverageRatio: totalEntities > 0 ? coveredEntities / totalEntities : 0,
    },
  };
}
