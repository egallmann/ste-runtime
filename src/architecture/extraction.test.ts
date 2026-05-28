import { describe, expect, it } from 'vitest';

import { deriveRelationships } from './extraction.js';
import type { IrEntity, RelationshipType } from './types.js';
import { emptyRelationshipBuckets } from './types.js';

function makeAdrEntity(id: string, metadata: Record<string, unknown> = {}): IrEntity {
  return {
    id,
    entity_type: 'adr',
    name: id,
    summary: '',
    canonical_source: { source_type: 'adr', source_ref: id, artifact_path: `adrs/logical/${id}.yaml` },
    source_refs: [],
    metadata: { status: 'active', ...metadata },
    completeness: { status: 'complete', missing_fields: [] },
    provenance: { source_type: 'adr', source_ref: id, extraction_phase: 'test', classification: 'explicit', generator: 'test' },
    relationships: emptyRelationshipBuckets(),
  };
}

function makeChildEntity(id: string, parentAdrId: string, type: string): IrEntity {
  return {
    id,
    entity_type: type,
    name: id,
    summary: '',
    canonical_source: { source_type: 'adr', source_ref: `${parentAdrId}#${id}`, artifact_path: `adrs/logical/${parentAdrId}.yaml` },
    source_refs: [],
    metadata: {},
    completeness: { status: 'complete', missing_fields: [] },
    provenance: { source_type: 'adr', source_ref: parentAdrId, extraction_phase: 'test', classification: 'explicit', generator: 'test' },
    relationships: emptyRelationshipBuckets(),
  };
}

function findInverse(
  relationships: Array<{ relationship_type: string; from_entity_id: string; to_entity_id: string; provenance_classification: string }>,
  type: RelationshipType,
): typeof relationships {
  return relationships.filter((r) => r.relationship_type === type);
}

describe('deriveRelationships inverse emission', () => {
  it('emits declares as inverse of declared_in', () => {
    const adr = makeAdrEntity('ADR-L-0001');
    const cap = makeChildEntity('CAP-0001', 'ADR-L-0001', 'capability');
    const entities = new Map<string, IrEntity>([['ADR-L-0001', adr], ['CAP-0001', cap]]);

    const { relationships } = deriveRelationships(entities, [], [], [], new Map());
    const inverses = findInverse(relationships, 'declares');
    expect(inverses.length).toBeGreaterThanOrEqual(1);
    expect(inverses[0].from_entity_id).toBe('ADR-L-0001');
    expect(inverses[0].to_entity_id).toBe('CAP-0001');
    expect(inverses[0].provenance_classification).toBe('derived');
  });

  it('emits referenced_by as inverse of references', () => {
    const adr1 = makeAdrEntity('ADR-L-0001');
    const adr2 = makeAdrEntity('ADR-L-0002');
    const entities = new Map<string, IrEntity>([['ADR-L-0001', adr1], ['ADR-L-0002', adr2]]);
    const logicalAdrs = [{ adr: { id: 'ADR-L-0001', related_adrs: ['ADR-L-0002'] }, path: '' }];

    const { relationships } = deriveRelationships(entities, logicalAdrs, [], [], new Map());
    const inverses = findInverse(relationships, 'referenced_by');
    expect(inverses.length).toBeGreaterThanOrEqual(1);
    expect(inverses[0].from_entity_id).toBe('ADR-L-0002');
    expect(inverses[0].to_entity_id).toBe('ADR-L-0001');
    expect(inverses[0].provenance_classification).toBe('derived');
  });

  it('emits implements as inverse of implemented_by', () => {
    const adr = makeAdrEntity('ADR-L-0001');
    const cap = makeChildEntity('CAP-0001', 'ADR-L-0001', 'capability');
    const comp = makeChildEntity('COMP-0001', 'ADR-L-0001', 'component');
    const entities = new Map<string, IrEntity>([['ADR-L-0001', adr], ['CAP-0001', cap], ['COMP-0001', comp]]);
    const logicalAdrs = [{
      adr: {
        id: 'ADR-L-0001',
        related_adrs: [],
        capabilities: [{ id: 'CAP-0001', implemented_by_components: ['COMP-0001'] }],
        decisions: [],
      },
      path: '',
    }];

    const { relationships } = deriveRelationships(entities, logicalAdrs, [], [], new Map());
    const inverses = findInverse(relationships, 'implements');
    expect(inverses.length).toBeGreaterThanOrEqual(1);
    expect(inverses[0].from_entity_id).toBe('COMP-0001');
    expect(inverses[0].to_entity_id).toBe('CAP-0001');
    expect(inverses[0].provenance_classification).toBe('derived');
  });

  it('emits enforced_by as inverse of enforces', () => {
    const adr = makeAdrEntity('ADR-L-0001');
    const dec = makeChildEntity('DEC-0001', 'ADR-L-0001', 'decision');
    const inv = makeChildEntity('INV-0001', 'ADR-L-0001', 'invariant');
    const entities = new Map<string, IrEntity>([['ADR-L-0001', adr], ['DEC-0001', dec], ['INV-0001', inv]]);
    const logicalAdrs = [{
      adr: {
        id: 'ADR-L-0001',
        related_adrs: [],
        capabilities: [],
        decisions: [{
          id: 'DEC-0001',
          enforces_invariants: ['INV-0001'],
          related_invariants: [],
          enables_capabilities: [],
          governs_components: [],
          supersedes: [],
          refines: [],
        }],
      },
      path: '',
    }];

    const { relationships } = deriveRelationships(entities, logicalAdrs, [], [], new Map());
    const inverses = findInverse(relationships, 'enforced_by');
    expect(inverses.length).toBeGreaterThanOrEqual(1);
    expect(inverses[0].from_entity_id).toBe('INV-0001');
    expect(inverses[0].to_entity_id).toBe('DEC-0001');
    expect(inverses[0].provenance_classification).toBe('derived');
  });

  it('emits governed_by as inverse of governs', () => {
    const adr = makeAdrEntity('ADR-L-0001');
    const dec = makeChildEntity('DEC-0001', 'ADR-L-0001', 'decision');
    const comp = makeChildEntity('COMP-0001', 'ADR-L-0001', 'component');
    const entities = new Map<string, IrEntity>([['ADR-L-0001', adr], ['DEC-0001', dec], ['COMP-0001', comp]]);
    const logicalAdrs = [{
      adr: {
        id: 'ADR-L-0001',
        related_adrs: [],
        capabilities: [],
        decisions: [{
          id: 'DEC-0001',
          enforces_invariants: [],
          related_invariants: [],
          enables_capabilities: [],
          governs_components: ['COMP-0001'],
          supersedes: [],
          refines: [],
        }],
      },
      path: '',
    }];

    const { relationships } = deriveRelationships(entities, logicalAdrs, [], [], new Map());
    const inverses = findInverse(relationships, 'governed_by');
    expect(inverses.length).toBeGreaterThanOrEqual(1);
    expect(inverses[0].from_entity_id).toBe('COMP-0001');
    expect(inverses[0].to_entity_id).toBe('DEC-0001');
    expect(inverses[0].provenance_classification).toBe('derived');
  });

  it('emits embodies as inverse of embodied_in', () => {
    const adr = makeAdrEntity('ADR-PS-0001');
    const sys = makeChildEntity('SYS-0001', 'ADR-PS-0001', 'system');
    const comp = makeChildEntity('COMP-0001', 'ADR-PC-0001', 'component');
    const entities = new Map<string, IrEntity>([['ADR-PS-0001', adr], ['SYS-0001', sys], ['COMP-0001', comp]]);
    const physicalAdrs = [{
      adr: {
        id: 'ADR-PC-0001',
        implements_system: ['ADR-PS-0001'],
        component_specifications: [{ id: 'COMP-0001', component_id: 'COMP-0001', implements_capabilities: [], dependencies: [] }],
      },
      path: '',
      kind: 'physical-component',
    }];

    const { relationships } = deriveRelationships(entities, [], [], physicalAdrs, new Map([['ADR-PS-0001', 'SYS-0001']]));
    const inverses = findInverse(relationships, 'embodies');
    expect(inverses.length).toBeGreaterThanOrEqual(1);
    const emb = inverses.find((r) => r.from_entity_id === 'SYS-0001');
    expect(emb).toBeDefined();
    expect(emb!.to_entity_id).toBe('COMP-0001');
    expect(emb!.provenance_classification).toBe('derived');
  });

  it('emits refined_by as inverse of refines', () => {
    const adr = makeAdrEntity('ADR-L-0001');
    const dec1 = makeChildEntity('DEC-0001', 'ADR-L-0001', 'decision');
    const dec2 = makeChildEntity('DEC-0002', 'ADR-L-0001', 'decision');
    const entities = new Map<string, IrEntity>([['ADR-L-0001', adr], ['DEC-0001', dec1], ['DEC-0002', dec2]]);
    const logicalAdrs = [{
      adr: {
        id: 'ADR-L-0001',
        related_adrs: [],
        capabilities: [],
        decisions: [{
          id: 'DEC-0001',
          enforces_invariants: [],
          related_invariants: [],
          enables_capabilities: [],
          governs_components: [],
          supersedes: [],
          refines: ['DEC-0002'],
        }],
      },
      path: '',
    }];

    const { relationships } = deriveRelationships(entities, logicalAdrs, [], [], new Map());
    const inverses = findInverse(relationships, 'refined_by');
    expect(inverses.length).toBeGreaterThanOrEqual(1);
    expect(inverses[0].from_entity_id).toBe('DEC-0002');
    expect(inverses[0].to_entity_id).toBe('DEC-0001');
    expect(inverses[0].provenance_classification).toBe('derived');
  });
});
