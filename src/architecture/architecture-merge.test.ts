import { describe, expect, it } from 'vitest';

import { architectureMerge, emptyReconSnapshot } from './architecture-merge.js';
import { emptyRelationshipBuckets, type ArchModelState, type IrEntity } from './types.js';

function adrEntity(id: string): IrEntity {
  return {
    id,
    entity_type: 'adr',
    name: id,
    summary: '',
    canonical_source: {
      source_type: 'logical_adr',
      source_ref: id,
      artifact_path: `adrs/logical/${id}.yaml`,
    },
    source_refs: [],
    metadata: {},
    completeness: { status: 'complete', missing_fields: [] },
    provenance: {
      source_type: 'adr',
      source_ref: id,
      extraction_phase: 'test',
      classification: 'explicit',
      generator: 'test',
    },
    relationships: emptyRelationshipBuckets(),
  };
}

function minimalModel(entities: IrEntity[]): ArchModelState {
  const map = new Map<string, IrEntity>();
  for (const e of entities) map.set(e.id, e);
  return {
    scopeRoot: '.',
    namespace: 'test',
    generatedAt: '2026-01-01T00:00:00.000Z',
    entities: map,
    relationships: new Map(),
    unresolved: new Map(),
    coverage: {
      logical_adrs: 0,
      physical_adrs: 0,
      physical_system_adrs: 0,
      physical_component_adrs: 0,
      standalone_invariants: 0,
    },
    corpus: new Map(),
    logicalAdrs: [],
    adrGraph: { nodes: [], edges: [] },
  };
}

describe('architectureMerge', () => {
  it('keys embodiment by bare adr id within a single corpus only', () => {
    const merged = architectureMerge(minimalModel([adrEntity('ADR-L-0013')]), {
      version: '1',
      attribution_records: [
        {
          implementation_entity_id: 'function:a:one:1',
          attributed_adrs: ['ADR-L-0013'],
          enforced_invariants: [],
        },
        {
          implementation_entity_id: 'function:b:one:1',
          attributed_adrs: ['ADR-L-0013'],
          enforced_invariants: [],
        },
      ],
    });

    expect(merged.entities.get('ADR-L-0013')?.metadata.embodiment_count).toBe(2);
    expect(merged.entities.get('ADR-L-0013')?.metadata.attributed_code_slices).toHaveLength(2);
  });

  it('does not consume workspace federation artifacts (empty snapshot is no-op)', () => {
    const merged = architectureMerge(minimalModel([adrEntity('ADR-L-0013')]), emptyReconSnapshot);
    expect(merged.entities.get('ADR-L-0013')?.metadata.embodiment_count).toBeUndefined();
  });
});
