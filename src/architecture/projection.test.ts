import { describe, expect, it } from 'vitest';

import { projectEntity } from './projection.js';
import type { IrEntity, IrRelationship } from './types.js';
import { emptyRelationshipBuckets } from './types.js';

function makeEntity(id: string, type: string, metadata: Record<string, unknown> = {}, sourceRef?: string): IrEntity {
  return {
    id,
    entity_type: type,
    name: id,
    summary: '',
    canonical_source: { source_type: 'adr', source_ref: sourceRef ?? id, artifact_path: '' },
    source_refs: [],
    metadata,
    completeness: { status: 'complete', missing_fields: [] },
    provenance: { source_type: 'adr', source_ref: id, extraction_phase: 'test', classification: 'explicit', generator: 'test' },
    relationships: emptyRelationshipBuckets(),
  };
}

describe('projectEntity lifecycle_stage derivation', () => {
  const emptyRels = new Map<string, IrRelationship>();

  it('derives proposed stage from ADR with proposed status', () => {
    const adr = makeEntity('ADR-L-0001', 'adr', { status: 'proposed' });
    const result = projectEntity(adr, emptyRels);
    expect(result).toBeDefined();
    expect(result!.lifecycle_stage).toBe('proposed');
  });

  it('derives active stage from ADR with active status', () => {
    const adr = makeEntity('ADR-L-0001', 'adr', { status: 'active' });
    const result = projectEntity(adr, emptyRels);
    expect(result).toBeDefined();
    expect(result!.lifecycle_stage).toBe('active');
  });

  it('derives deprecated stage from ADR with deprecated status', () => {
    const adr = makeEntity('ADR-L-0001', 'adr', { status: 'deprecated' });
    const result = projectEntity(adr, emptyRels);
    expect(result).toBeDefined();
    expect(result!.lifecycle_stage).toBe('deprecated');
  });

  it('derives superseded stage from ADR with superseded status', () => {
    const adr = makeEntity('ADR-L-0001', 'adr', { status: 'superseded' });
    const result = projectEntity(adr, emptyRels);
    expect(result).toBeDefined();
    expect(result!.lifecycle_stage).toBe('superseded');
  });

  it('propagates parent ADR lifecycle to child entities', () => {
    const adr = makeEntity('ADR-L-0001', 'adr', { status: 'deprecated' });
    const dec = makeEntity('DEC-0001', 'decision', {}, 'ADR-L-0001#DEC-0001');
    const allEntities = new Map([['ADR-L-0001', adr], ['DEC-0001', dec]]);

    const result = projectEntity(dec, emptyRels, allEntities);
    expect(result).toBeDefined();
    expect(result!.lifecycle_stage).toBe('deprecated');
  });

  it('defaults to active for child entities when parent ADR has unknown status', () => {
    const adr = makeEntity('ADR-L-0001', 'adr', { status: 'unknown-status' });
    const cap = makeEntity('CAP-0001', 'capability', {}, 'ADR-L-0001#CAP-0001');
    const allEntities = new Map([['ADR-L-0001', adr], ['CAP-0001', cap]]);

    const result = projectEntity(cap, emptyRels, allEntities);
    expect(result).toBeDefined();
    expect(result!.lifecycle_stage).toBe('active');
  });

  it('defaults to active when no parent is found', () => {
    const orphan = makeEntity('DEC-ORPHAN', 'decision', {}, 'MISSING-ADR#DEC-ORPHAN');
    const allEntities = new Map([['DEC-ORPHAN', orphan]]);

    const result = projectEntity(orphan, emptyRels, allEntities);
    expect(result).toBeDefined();
    expect(result!.lifecycle_stage).toBe('active');
  });
});
