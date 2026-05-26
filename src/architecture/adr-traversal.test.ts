import { describe, expect, it } from 'vitest';

import { adrDependencies, adrDependents, adrBlastRadius } from './adr-traversal.js';
import type { ArchModelState, IrEntity, IrRelationship } from './types.js';

function makeEntity(id: string, type: string = 'decision'): IrEntity {
  return {
    id,
    entity_type: type,
    name: id,
    summary: '',
    canonical_source: { source_type: 'adr', source_ref: 'ADR-L-0001', artifact_path: '' },
    source_refs: [],
    metadata: {},
    completeness: { status: 'complete', missing_fields: [] },
    provenance: { source_type: 'adr', source_ref: 'ADR-L-0001', extraction_phase: 'test', classification: 'explicit', generator: 'test' },
    relationships: {} as IrEntity['relationships'],
  };
}

function makeRel(type: string, from: string, to: string): IrRelationship {
  return {
    relationship_id: `${type}--${from}--${to}`,
    relationship_type: type as IrRelationship['relationship_type'],
    from_entity_id: from,
    to_entity_id: to,
    canonical_source_ref: 'test',
    provenance_classification: 'explicit',
    evidence: [],
    confidence: 1,
    metadata: {},
  };
}

function makeModel(entities: IrEntity[], rels: IrRelationship[]): ArchModelState {
  return {
    scopeRoot: '/test',
    namespace: 'test',
    generatedAt: new Date().toISOString(),
    entities: new Map(entities.map((e) => [e.id, e])),
    relationships: new Map(rels.map((r) => [r.relationship_id, r])),
    unresolved: new Map(),
    coverage: { logical_adrs: 0, physical_adrs: 0, physical_system_adrs: 0, physical_component_adrs: 0, standalone_invariants: 0 },
    corpus: new Map(),
    logicalAdrs: [],
    physicalAdrs: [],
    standaloneInvariants: [],
  };
}

describe('adr-traversal', () => {
  describe('adrDependencies (forward traversal)', () => {
    it('returns direct dependencies', () => {
      const model = makeModel(
        [makeEntity('A'), makeEntity('B'), makeEntity('C')],
        [makeRel('enforces', 'A', 'B'), makeRel('governs', 'A', 'C')],
      );
      const result = adrDependencies(model, 'A');
      expect(result.entityIds.sort()).toEqual(['B', 'C']);
      expect(result.truncated).toBe(false);
      expect(result.brokenEdges).toEqual([]);
    });

    it('traverses multi-hop chains', () => {
      const model = makeModel(
        [makeEntity('A'), makeEntity('B'), makeEntity('C')],
        [makeRel('enforces', 'A', 'B'), makeRel('governs', 'B', 'C')],
      );
      const result = adrDependencies(model, 'A', 3);
      expect(result.entityIds).toEqual(['B', 'C']);
    });

    it('respects maxDepth bounds', () => {
      const model = makeModel(
        [makeEntity('A'), makeEntity('B'), makeEntity('C')],
        [makeRel('enforces', 'A', 'B'), makeRel('governs', 'B', 'C')],
      );
      const result = adrDependencies(model, 'A', 1);
      expect(result.entityIds).toEqual(['B']);
    });
  });

  describe('adrDependents (reverse traversal)', () => {
    it('returns entities that depend on the target', () => {
      const model = makeModel(
        [makeEntity('A'), makeEntity('B'), makeEntity('C')],
        [makeRel('enforces', 'B', 'A'), makeRel('governs', 'C', 'A')],
      );
      const result = adrDependents(model, 'A');
      expect(result.entityIds.sort()).toEqual(['B', 'C']);
      expect(result.truncated).toBe(false);
    });
  });

  describe('adrBlastRadius (bidirectional)', () => {
    it('returns full impact surface', () => {
      const model = makeModel(
        [makeEntity('A'), makeEntity('B'), makeEntity('C'), makeEntity('D')],
        [makeRel('enforces', 'B', 'A'), makeRel('governs', 'A', 'C'), makeRel('refines', 'C', 'D')],
      );
      const result = adrBlastRadius(model, 'A', 3);
      expect(result.entityIds.sort()).toEqual(['B', 'C', 'D']);
    });
  });

  describe('cycle handling', () => {
    it('handles cycles without infinite loops', () => {
      const model = makeModel(
        [makeEntity('A'), makeEntity('B'), makeEntity('C')],
        [makeRel('enforces', 'A', 'B'), makeRel('governs', 'B', 'C'), makeRel('refines', 'C', 'A')],
      );
      const result = adrDependencies(model, 'A', 10);
      expect(result.entityIds.sort()).toEqual(['B', 'C']);
      expect(result.truncated).toBe(false);
    });
  });

  describe('maxNodes truncation', () => {
    it('truncates when maxNodes is reached', () => {
      const entities = Array.from({ length: 10 }, (_, i) => makeEntity(`E${i}`));
      const rels = Array.from({ length: 9 }, (_, i) => makeRel('enforces', 'E0', `E${i + 1}`));
      const model = makeModel(entities, rels);
      const result = adrDependencies(model, 'E0', 3, 3);
      expect(result.entityIds.length).toBe(3);
      expect(result.truncated).toBe(true);
    });
  });

  describe('broken edge detection', () => {
    it('detects edges to non-existent entities', () => {
      const model = makeModel(
        [makeEntity('A')],
        [makeRel('enforces', 'A', 'MISSING')],
      );
      const result = adrDependencies(model, 'A');
      expect(result.entityIds).toEqual([]);
      expect(result.brokenEdges).toEqual([
        { fromEntityId: 'A', toEntityId: 'MISSING', relationshipType: 'enforces' },
      ]);
    });
  });
});
