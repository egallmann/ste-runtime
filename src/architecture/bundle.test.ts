import { describe, expect, it } from 'vitest';

import { assembleDiscoveryBundle } from './bundle.js';
import { emptyRelationshipBuckets, type ArchModelState, type IrEntity } from './types.js';

function modelWith(entity: IrEntity): ArchModelState {
  return {
    scopeRoot: '.',
    namespace: 'ste-runtime',
    generatedAt: '2026-08-12T00:00:00.000Z',
    entities: new Map([[entity.id, entity]]),
    relationships: new Map(),
    unresolved: new Map(),
    coverage: {
      logical_adrs: 1,
      physical_adrs: 0,
      physical_system_adrs: 0,
      physical_component_adrs: 0,
      standalone_invariants: 0,
    },
    corpus: new Map(),
    logicalAdrs: [],
    physicalAdrs: [],
    standaloneInvariants: [],
  };
}

describe('legacy projection provenance', () => {
  it('uses source context rather than canonical ID prefixes', () => {
    const adrId = '019fee89-e615-70a5-861b-b2dde147e5af';
    const capabilityId = '019fee89-e615-73a3-8d31-7a4721affae9';
    const entity: IrEntity = {
      id: capabilityId,
      entity_type: 'capability',
      name: 'UUID capability',
      summary: '',
      canonical_source: {
        source_type: 'logical_adr',
        source_ref: `${adrId}#${capabilityId}`,
        artifact_path: 'adrs/logical/generated.yaml',
      },
      source_refs: [{
        source_type: 'logical_adr',
        source_ref: adrId,
        artifact_path: 'adrs/logical/generated.yaml',
        mention_role: 'declared',
      }],
      metadata: {},
      completeness: { status: 'complete', missing_fields: [] },
      provenance: {
        source_type: 'logical_adr',
        source_ref: `${adrId}#${capabilityId}`,
        extraction_phase: 'test',
        classification: 'explicit',
        generator: 'test',
      },
      relationships: emptyRelationshipBuckets(),
    };

    const projected = assembleDiscoveryBundle(modelWith(entity)).legacyEntityRegistry.entities[0];
    expect(projected.source_artifact_type).toBe('logical_adr');
    expect(projected.introduced_by).toBe(adrId);
    expect(projected.related_adrs).toEqual([adrId]);
  });
});
