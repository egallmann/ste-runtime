import type { ArchModelState, ReconArchitectureSnapshot } from './types.js';

/**
 * architectureMerge: combine ADR intent graph with RECON embodiment graph.
 * Minimal v1: identity passthrough; RECON snapshot reserved for future wiring.
 */
export function architectureMerge(adrModel: ArchModelState, recon: ReconArchitectureSnapshot): ArchModelState {
  void recon;
  return adrModel;
}

export const emptyReconSnapshot: ReconArchitectureSnapshot = { version: '0' };
