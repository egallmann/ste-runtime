import type { AdrGraph, ArchModelState } from './types.js';
import { asStringArray } from './support.js';

/** Internal, non-contract ADR graph view for tooling and future merge stages. */
export function buildAdrGraph(model: ArchModelState): AdrGraph {
  const nodes = [];
  const edges = [];

  for (const { adr, path } of model.logicalAdrs) {
    const id = String(adr.id ?? '');
    const introduced: string[] = [];
    for (const c of Array.isArray(adr.capabilities) ? adr.capabilities : []) {
      if (c && typeof c === 'object' && 'id' in c) introduced.push(String((c as { id: unknown }).id));
    }
    for (const d of Array.isArray(adr.decisions) ? adr.decisions : []) {
      if (d && typeof d === 'object' && 'id' in d) introduced.push(String((d as { id: unknown }).id));
    }
    for (const i of Array.isArray(adr.invariants) ? adr.invariants : []) {
      if (i && typeof i === 'object' && 'id' in i) introduced.push(String((i as { id: unknown }).id));
    }
    introduced.sort();
    nodes.push({
      adrId: id,
      classification: 'logical',
      status: String(adr.status ?? ''),
      sourcePath: path,
      introducedEntityIds: introduced,
      relatedAdrIds: [...asStringArray(adr.related_adrs)].sort(),
    });
  }

  for (const { adr, path, kind } of model.physicalAdrs) {
    const id = String(adr.id ?? '');
    const introduced: string[] = [];
    if (kind === 'physical-system') {
      introduced.push(`SYS-${id.replace('ADR-PS-', '')}`);
    }
    if (kind === 'physical-component') {
      for (const s of Array.isArray(adr.component_specifications) ? adr.component_specifications : []) {
        if (s && typeof s === 'object') {
          const rec = s as Record<string, unknown>;
          const cid = (rec.component_id as string | undefined) ?? String(rec.id ?? '');
          if (cid) introduced.push(cid);
        }
      }
    }
    introduced.sort();
    nodes.push({
      adrId: id,
      classification: kind,
      status: String(adr.status ?? ''),
      sourcePath: path,
      introducedEntityIds: introduced,
      relatedAdrIds: [],
    });
  }

  for (const rel of model.relationships.values()) {
    const fromEnt = model.entities.get(rel.from_entity_id);
    const toEnt = model.entities.get(rel.to_entity_id);
    if (!fromEnt || !toEnt) continue;
    if (fromEnt.entity_type === 'adr' && rel.relationship_type === 'references') {
      edges.push({
        fromAdrId: rel.from_entity_id,
        toTargetId: rel.to_entity_id,
        relationshipType: rel.relationship_type,
        sourceRef: rel.canonical_source_ref,
      });
    }
  }

  nodes.sort((a, b) => a.adrId.localeCompare(b.adrId));
  edges.sort((a, b) => a.fromAdrId.localeCompare(b.fromAdrId) || a.toTargetId.localeCompare(b.toTargetId));

  return { nodes, edges };
}
