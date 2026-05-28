import type { ArchModelState, ReconArchitectureSnapshot } from './types.js';

/**
 * Merge ADR intent graph with RECON embodiment snapshot.
 *
 * Enriches entity metadata with implementation attribution counts
 * derived from RECON evidence. Does not modify entity identity or
 * relationships -- only adds embodiment_count, attributed_code_slices,
 * and enforcing_code_slices metadata to entities that have matching
 * attribution records.
 */
export function architectureMerge(adrModel: ArchModelState, recon: ReconArchitectureSnapshot): ArchModelState {
  if (recon.version === '1' && recon.attribution_records.length > 0) {
    const adrAttribution = new Map<string, number>();
    const adrSlices = new Map<string, string[]>();
    const invAttribution = new Map<string, number>();
    const invSlices = new Map<string, string[]>();

    for (const record of recon.attribution_records) {
      for (const adrId of record.attributed_adrs) {
        adrAttribution.set(adrId, (adrAttribution.get(adrId) ?? 0) + 1);
        const slices = adrSlices.get(adrId) ?? [];
        slices.push(record.implementation_entity_id);
        adrSlices.set(adrId, slices);
      }
      for (const invId of record.enforced_invariants) {
        invAttribution.set(invId, (invAttribution.get(invId) ?? 0) + 1);
        const slices = invSlices.get(invId) ?? [];
        slices.push(record.implementation_entity_id);
        invSlices.set(invId, slices);
      }
    }

    for (const entity of adrModel.entities.values()) {
      const adrId = entity.id;
      const parentAdrId = entity.canonical_source.source_ref.split('#')[0];

      const directCount = adrAttribution.get(adrId) ?? 0;
      const parentCount = adrId !== parentAdrId ? (adrAttribution.get(parentAdrId) ?? 0) : 0;
      const invCount = invAttribution.get(adrId) ?? 0;

      const totalCount = directCount + parentCount + invCount;
      if (totalCount > 0) {
        entity.metadata.embodiment_count = totalCount;
      }
      const directSlices = adrSlices.get(adrId) ?? [];
      const parentSlices = adrId !== parentAdrId ? (adrSlices.get(parentAdrId) ?? []) : [];
      const allSlices = [...new Set([...directSlices, ...parentSlices])].sort();
      if (allSlices.length > 0) {
        entity.metadata.attributed_code_slices = allSlices;
      }
      const enforcingSlices = invSlices.get(adrId) ?? [];
      if (enforcingSlices.length > 0) {
        entity.metadata.enforcing_code_slices = [...new Set(enforcingSlices)].sort();
      }
    }
  }

  return adrModel;
}

export const emptyReconSnapshot: ReconArchitectureSnapshot = {
  version: '1',
  attribution_records: [],
};
