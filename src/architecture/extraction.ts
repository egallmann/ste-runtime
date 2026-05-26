import {
  type IrEntity,
  type IrUnresolved,
  type NormalizedEntity,
  type RelationshipRecord,
  type RelationshipType,
  emptyRelationshipBuckets,
} from './types.js';
import {
  asRecord,
  asString,
  asStringArray,
  asOptionalString,
  classifyAuthorGap,
  makeCanonical,
  makeProvenance,
  relationshipId,
  scoreCompleteness,
  summarizeText,
  systemEntityId,
} from './support.js';

export interface ExtractedEntity {
  entity: IrEntity;
  allowReferenceMerge?: boolean;
}

export interface InvariantMention {
  payload: { name: string; summary: string; metadata: Record<string, unknown> };
  artifact_path: string;
  source_ref: string;
}

export interface LogicalExtractionResult {
  entities: ExtractedEntity[];
  invariantMentions: Map<string, InvariantMention[]>;
  unresolved: IrUnresolved[];
}

export function newIrEntity(
  partial: Omit<IrEntity, 'relationships' | 'source_refs'> & { source_refs?: IrEntity['source_refs'] },
): IrEntity {
  return {
    source_refs: partial.source_refs ?? [],
    relationships: emptyRelationshipBuckets(),
    ...partial,
  };
}

export function extractLogicalEntities(
  logicalAdrs: Array<{ adr: Record<string, unknown>; path: string }>,
  sourcePath: (p: string) => string,
): LogicalExtractionResult {
  const entities: ExtractedEntity[] = [];
  const invariantMentions = new Map<string, InvariantMention[]>();
  const unresolved: IrUnresolved[] = [];

  for (const { adr, path } of logicalAdrs) {
    const artifact = sourcePath(path);
    const id = asString(adr.id, 'adr.id');
    const title = asString(adr.title, 'adr.title');
    const context = asOptionalString(adr.context) ?? '';
    const status = asString(adr.status, 'adr.status');
    const domains = asStringArray(adr.domains);
    const tags = asStringArray(adr.tags);
    const governance = (adr.governance as Record<string, unknown> | undefined) ?? {};

    entities.push({
      entity: newIrEntity({
        id,
        entity_type: 'adr',
        name: title,
        summary: summarizeText(context),
        canonical_source: makeCanonical('logical_adr', id, artifact),
        metadata: {
          status,
          domains,
          tags,
          implementation_authority: asOptionalString(governance.implementation_authority),
          related_reviews: asStringArray(governance.related_reviews),
          related_overrides: asStringArray(governance.related_overrides),
        },
        completeness: scoreCompleteness(),
        provenance: makeProvenance('logical_adr', id, 'extract_adr', 'explicit'),
      }),
    });

    const capabilities = Array.isArray(adr.capabilities) ? adr.capabilities : [];
    for (const cap of capabilities) {
      const c = asRecord(cap, 'capability');
      const capId = asString(c.id, 'capability.id');
      const sourceRef = `${id}#${capId}`;
      const capDesc = asOptionalString(c.description) ?? '';
      entities.push({
        entity: newIrEntity({
          id: capId,
          entity_type: 'capability',
          name: asString(c.name, 'capability.name'),
          summary: summarizeText(capDesc),
          canonical_source: makeCanonical('logical_adr', sourceRef, artifact),
          metadata: {
            adr_id: id,
            domains,
            implemented_by_components: asStringArray(c.implemented_by_components),
            enabled_by_decisions: asStringArray(c.enabled_by_decisions),
          },
          completeness: scoreCompleteness(),
          provenance: makeProvenance('logical_adr', sourceRef, 'extract_capability', 'explicit'),
        }),
      });
    }

    const decisions = Array.isArray(adr.decisions) ? adr.decisions : [];
    for (const dec of decisions) {
      const d = asRecord(dec, 'decision');
      const decId = asString(d.id, 'decision.id');
      const sourceRef = `${id}#${decId}`;
      const decSummary = asOptionalString(d.summary) ?? decId;
      const decRationale = asOptionalString(d.rationale) ?? '';
      entities.push({
        entity: newIrEntity({
          id: decId,
          entity_type: 'decision',
          name: decSummary,
          summary: summarizeText(decRationale),
          canonical_source: makeCanonical('logical_adr', sourceRef, artifact),
          metadata: {
            adr_id: id,
            related_invariants: asStringArray(d.related_invariants),
            enforces_invariants: asStringArray(d.enforces_invariants),
            enables_capabilities: asStringArray(d.enables_capabilities),
            governs_components: asStringArray(d.governs_components),
            supersedes: asStringArray(d.supersedes),
            refines: asStringArray(d.refines),
          },
          completeness: scoreCompleteness(),
          provenance: makeProvenance('logical_adr', sourceRef, 'extract_decision', 'explicit'),
        }),
      });
    }

    const invariants = Array.isArray(adr.invariants) ? adr.invariants : [];
    for (const inv of invariants) {
      const i = asRecord(inv, 'invariant');
      const invId = asString(i.id, 'invariant.id');
      const statement = asString(i.statement, 'invariant.statement');
      const scope = asString(i.scope, 'invariant.scope');
      const enforcementLevel = asString(i.enforcement_level, 'invariant.enforcement_level');
      const declarationMode = asOptionalString(i.declaration_mode) ?? 'local';
      const list = invariantMentions.get(invId) ?? [];
      list.push({
        payload: {
          name: invId,
          summary: summarizeText(statement),
          metadata: {
            adr_id: id,
            scope,
            statement,
            enforcement_level: enforcementLevel,
            declaration_mode: declarationMode,
            upheld_by_decisions: asStringArray(i.upheld_by_decisions),
          },
        },
        artifact_path: artifact,
        source_ref: `${id}#${invId}`,
      });
      invariantMentions.set(invId, list);
    }

    const gaps = Array.isArray(adr.gaps) ? adr.gaps : [];
    for (const gap of gaps) {
      const g = asRecord(gap, 'gap');
      const gapId = asOptionalString(g.id) ?? 'GAP';
      const question = asOptionalString(g.question) ?? '';
      const blocking = Boolean(g.blocking);
      unresolved.push({
        id: `UGAP-${id}-${gapId}`,
        gap_class: 'author_declared',
        gap_type: classifyAuthorGap(g),
        source_entity_id: id,
        severity: blocking ? 'important' : 'advisory',
        provenance: makeProvenance('derived_registry', `${id}#${gapId}`, 'detect_unresolved', 'explicit'),
        evidence: [id, question],
      });
    }
  }

  unresolved.sort((a, b) => a.id.localeCompare(b.id));
  return { entities, invariantMentions, unresolved };
}

export interface PhysicalExtractionResult {
  entities: ExtractedEntity[];
  systemIds: Map<string, string>;
}

export function extractPhysicalEntities(
  physicalAdrs: Array<{ adr: Record<string, unknown>; path: string; kind: string }>,
  sourcePath: (p: string) => string,
): PhysicalExtractionResult {
  const entities: ExtractedEntity[] = [];
  const systemIds = new Map<string, string>();

  for (const { adr, path, kind } of physicalAdrs) {
    const artifact = sourcePath(path);
    const id = asString(adr.id, 'adr.id');
    const title = asString(adr.title, 'adr.title');
    const context = asOptionalString(adr.context) ?? '';
    const status = asString(adr.status, 'adr.status');
    const domains = asStringArray(adr.domains);
    const tags = asStringArray(adr.tags);
    const governance = (adr.governance as Record<string, unknown> | undefined) ?? {};

    const sourceType =
      kind === 'physical-component'
        ? 'physical_component_adr'
        : kind === 'physical-system'
          ? 'physical_system_adr'
          : 'physical_adr';

    entities.push({
      entity: newIrEntity({
        id,
        entity_type: 'adr',
        name: title,
        summary: summarizeText(context),
        canonical_source: makeCanonical(sourceType, id, artifact),
        metadata: {
          status,
          domains,
          tags,
          implementation_authority: asOptionalString(governance.implementation_authority),
          related_reviews: asStringArray(governance.related_reviews),
          related_overrides: asStringArray(governance.related_overrides),
        },
        completeness: scoreCompleteness(),
        provenance: makeProvenance(sourceType, id, 'extract_adr', 'explicit'),
      }),
      allowReferenceMerge: true,
    });

    if (kind === 'physical-system') {
      const sysId = systemEntityId(id);
      systemIds.set(id, sysId);
      entities.push({
        entity: newIrEntity({
          id: sysId,
          entity_type: 'system',
          name: title,
          summary: summarizeText(context),
          canonical_source: makeCanonical('physical_system_adr', id, artifact),
          metadata: {
            adr_id: id,
            implements_logical: asStringArray(adr.implements_logical),
            technologies: asStringArray(adr.technologies),
          },
          completeness: scoreCompleteness(),
          provenance: makeProvenance('physical_system_adr', id, 'extract_system', 'explicit'),
        }),
      });
    }

    if (kind === 'physical-component') {
      const specs = Array.isArray(adr.component_specifications) ? adr.component_specifications : [];
      for (const spec of specs) {
        const s = asRecord(spec, 'component_specification');
        const legacyId = asString(s.id, 'component.id');
        const componentId = asOptionalString(s.component_id) ?? legacyId;
        const impl = asRecord(s.implementation_identifiers, 'implementation_identifiers');
        const resp = asOptionalString(s.responsibilities) ?? '';
        entities.push({
          entity: newIrEntity({
            id: componentId,
            entity_type: 'component',
            name: asString(s.name, 'component.name'),
            summary: summarizeText(resp),
            canonical_source: makeCanonical('physical_component_adr', `${id}#${componentId}`, artifact),
            metadata: {
              adr_id: id,
              legacy_component_id: legacyId,
              technologies: asStringArray(adr.technologies),
              module_path: asString(impl.module_path, 'module_path'),
              implements_capabilities: asStringArray(s.implements_capabilities),
              implements_system: asStringArray(adr.implements_system),
            },
            completeness: scoreCompleteness(),
            provenance: makeProvenance('physical_component_adr', `${id}#${componentId}`, 'extract_component', 'explicit'),
          }),
        });
      }
    }
  }

  return { entities, systemIds };
}

export function collectStandaloneInvariantMentions(
  standalone: Array<{ inv: Record<string, unknown>; path: string }>,
  sourcePath: (p: string) => string,
): Map<string, InvariantMention[]> {
  const map = new Map<string, InvariantMention[]>();
  for (const { inv, path } of standalone) {
    const artifact = sourcePath(path);
    const invId = asString(inv.id, 'invariant.id');
    const statement = asString(inv.statement, 'invariant.statement');
    const definedIn = asString(inv.defined_in, 'invariant.defined_in');
    const enforcementLevel = asString(inv.enforcement_level, 'invariant.enforcement_level');
    const list = map.get(invId) ?? [];
    list.push({
      payload: {
        name: invId,
        summary: summarizeText(statement),
        metadata: {
          defined_in: definedIn,
          scope: asString(inv.scope, 'invariant.scope'),
          statement,
          enforcement_level: enforcementLevel,
          declaration_mode: asOptionalString(inv.declaration_mode) ?? 'canonical',
          upheld_by_decisions: asStringArray(inv.upheld_by_decisions),
          enforced_by: asStringArray(inv.enforced_by),
        },
      },
      artifact_path: artifact,
      source_ref: invId,
    });
    map.set(invId, list);
  }
  return map;
}

export function mergeInvariantMentions(
  a: Map<string, InvariantMention[]>,
  b: Map<string, InvariantMention[]>,
): Map<string, InvariantMention[]> {
  const out = new Map(a);
  for (const [k, v] of b) {
    out.set(k, [...(out.get(k) ?? []), ...v]);
  }
  return out;
}

export function resolveInvariantCanonical(
  invariantMentions: Map<string, InvariantMention[]>,
): { entities: ExtractedEntity[]; refs: Map<string, IrEntity['source_refs']> } {
  const entities: ExtractedEntity[] = [];
  const refs = new Map<string, IrEntity['source_refs']>();

  for (const [invId, mentions] of [...invariantMentions.entries()].sort(([x], [y]) => x.localeCompare(y))) {
    const standalone = mentions.filter((m) => m.source_ref === invId);
    const local = mentions.filter((m) => m.source_ref !== invId);
    if (standalone.length > 1 || (standalone.length === 0 && local.length > 1)) {
      throw new Error(`Duplicate canonical invariant ID ${invId}`);
    }
    const chosen = standalone[0] ?? local[0];
    const sourceType = standalone.length ? 'standalone_invariant' : 'logical_adr';
    const entity = newIrEntity({
      id: invId,
      entity_type: 'invariant',
      name: chosen.payload.name,
      summary: chosen.payload.summary,
      canonical_source: makeCanonical(sourceType, chosen.source_ref, chosen.artifact_path),
      metadata: chosen.payload.metadata,
      completeness: scoreCompleteness(),
      provenance: makeProvenance(sourceType, chosen.source_ref, 'assign_canonical_invariant', 'explicit'),
    });

    const extraRefs: IrEntity['source_refs'] = [];
    for (const m of mentions) {
      if (m.source_ref === chosen.source_ref && m.artifact_path === chosen.artifact_path) continue;
      extraRefs.push({
        source_type: m.source_ref.startsWith('ADR-') ? 'logical_adr' : 'standalone_invariant',
        source_ref: m.source_ref,
        artifact_path: m.artifact_path,
        mention_role: 'reference',
      });
    }
    extraRefs.sort((r1, r2) => r1.source_ref.localeCompare(r2.source_ref) || r1.mention_role.localeCompare(r2.mention_role));
    refs.set(invId, extraRefs);
    entities.push({ entity });
  }

  return { entities, refs };
}

export interface DerivedGapSignal {
  gap_id: string;
  gap_type: string;
  source_entity_id: string;
  severity: string;
  source_ref: string;
  evidence: string[];
  related_entity_id?: string;
  expected_relationship?: string;
}

export function deriveRelationships(
  entities: Map<string, IrEntity>,
  logicalAdrs: Array<{ adr: Record<string, unknown>; path: string }>,
  standaloneInvariants: Array<{ inv: Record<string, unknown>; path: string }>,
  physicalAdrs: Array<{ adr: Record<string, unknown>; path: string; kind: string }>,
  systemIds: Map<string, string>,
): { relationships: RelationshipRecord[]; gaps: DerivedGapSignal[] } {
  const projected = new Map<string, NormalizedEntity>();
  for (const e of entities.values()) {
    if (!isProjectable(e.entity_type)) continue;
    projected.set(e.id, projectEntityForDerivation(e));
  }

  const relationships = new Map<string, RelationshipRecord>();
  const gaps: DerivedGapSignal[] = [];

  function addRel(
    type: RelationshipType,
    fromId: string,
    toId: string,
    sourceRef: string,
    evidence: string[],
    classification: RelationshipRecord['provenance_classification'] = 'explicit',
    confidence = 1,
    metadata: Record<string, unknown> = {},
  ): void {
    if (!projected.has(fromId) || !projected.has(toId)) return;
    const rid = relationshipId(type, fromId, toId);
    if (relationships.has(rid)) return;
    relationships.set(rid, {
      relationship_id: rid,
      relationship_type: type,
      from_entity_id: fromId,
      to_entity_id: toId,
      provenance_classification: classification,
      evidence: [...new Set(evidence)].sort(),
      canonical_source_ref: sourceRef,
      confidence,
      metadata,
    });
  }

  function addGap(g: DerivedGapSignal): void {
    gaps.push(g);
  }

  for (const e of entities.values()) {
    if (e.entity_type === 'adr') continue;
    const adrId = e.canonical_source.source_ref.split('#')[0];
    if (projected.has(adrId)) {
      addRel('declared_in', e.id, adrId, e.canonical_source.source_ref, [e.canonical_source.source_ref]);
      addRel('declares', adrId, e.id, e.canonical_source.source_ref, [e.canonical_source.source_ref], 'derived');
    }
  }

  for (const { adr } of logicalAdrs) {
    const adrId = asString(adr.id, 'adr.id');
    for (const related of asStringArray(adr.related_adrs)) {
      if (projected.has(related)) {
        addRel('references', adrId, related, adrId, [adrId]);
        addRel('referenced_by', related, adrId, adrId, [adrId], 'derived');
      }
    }
    const capabilities = Array.isArray(adr.capabilities) ? adr.capabilities : [];
    for (const cap of capabilities) {
      const c = asRecord(cap, 'capability');
      const capId = asString(c.id, 'capability.id');
      for (const componentId of asStringArray(c.implemented_by_components)) {
        if (projected.has(componentId)) {
          addRel('implemented_by', capId, componentId, `${adrId}#${capId}`, [adrId]);
          addRel('implements', componentId, capId, `${adrId}#${capId}`, [adrId], 'derived');
        } else {
          addGap({
            gap_id: `GAP-IMPL-${capId}-${componentId}`,
            gap_type: 'capability_without_implementing_component',
            source_entity_id: capId,
            severity: 'important',
            source_ref: `${adrId}#${capId}`,
            evidence: [adrId, componentId],
            related_entity_id: componentId,
            expected_relationship: 'implemented_by',
          });
        }
      }
    }
    const decisions = Array.isArray(adr.decisions) ? adr.decisions : [];
    for (const dec of decisions) {
      const d = asRecord(dec, 'decision');
      const decId = asString(d.id, 'decision.id');
      const invSet = new Set([...asStringArray(d.related_invariants), ...asStringArray(d.enforces_invariants)]);
      for (const invariantId of [...invSet].sort()) {
        if (projected.has(invariantId)) {
          addRel('enforces', decId, invariantId, `${adrId}#${decId}`, [adrId]);
          addRel('enforced_by', invariantId, decId, `${adrId}#${decId}`, [adrId], 'derived');
        } else {
          addGap({
            gap_id: `GAP-INV-${decId}-${invariantId}`,
            gap_type: 'unresolved_reference',
            source_entity_id: decId,
            severity: 'important',
            source_ref: `${adrId}#${decId}`,
            evidence: [adrId, invariantId],
            related_entity_id: invariantId,
            expected_relationship: 'enforces',
          });
        }
      }
      for (const capabilityId of asStringArray(d.enables_capabilities)) {
        if (projected.has(capabilityId)) {
          addRel('enables', decId, capabilityId, `${adrId}#${decId}`, [adrId]);
          addRel('enabled_by', capabilityId, decId, `${adrId}#${decId}`, [adrId], 'derived');
        } else {
          addGap({
            gap_id: `GAP-CAP-${decId}-${capabilityId}`,
            gap_type: 'unresolved_reference',
            source_entity_id: decId,
            severity: 'important',
            source_ref: `${adrId}#${decId}`,
            evidence: [adrId, capabilityId],
            related_entity_id: capabilityId,
            expected_relationship: 'enables',
          });
        }
      }
      for (const componentId of asStringArray(d.governs_components)) {
        if (projected.has(componentId)) {
          addRel('governs', decId, componentId, `${adrId}#${decId}`, [adrId]);
          addRel('governed_by', componentId, decId, `${adrId}#${decId}`, [adrId], 'derived');
        }
      }
      for (const target of asStringArray(d.supersedes)) {
        if (projected.has(target)) {
          addRel('supersedes', decId, target, `${adrId}#${decId}`, [adrId]);
          addRel('superseded_by', target, decId, `${adrId}#${decId}`, [adrId], 'derived');
        }
      }
      for (const target of asStringArray(d.refines)) {
        if (projected.has(target)) {
          addRel('refines', decId, target, `${adrId}#${decId}`, [adrId]);
          addRel('refined_by', target, decId, `${adrId}#${decId}`, [adrId], 'derived');
        }
      }
    }
  }

  for (const { inv } of standaloneInvariants) {
    const invId = asString(inv.id, 'invariant.id');
    if (!projected.has(invId)) continue;
    for (const target of asStringArray(inv.enforced_by)) {
      if (projected.has(target)) {
        addRel('enforces', invId, target, invId, [invId]);
        addRel('enforced_by', target, invId, invId, [invId], 'derived');
      }
    }
  }

  for (const { adr, kind } of physicalAdrs) {
    const adrId = asString(adr.id, 'adr.id');
    if (kind === 'physical-component') {
    const specs = Array.isArray(adr.component_specifications) ? adr.component_specifications : [];
    for (const spec of specs) {
      const s = asRecord(spec, 'component_specification');
      const legacyId = asString(s.id, 'component.id');
      const componentId = asOptionalString(s.component_id) ?? legacyId;
      for (const capabilityId of asStringArray(s.implements_capabilities)) {
        if (projected.has(capabilityId)) {
          addRel('implemented_by', capabilityId, componentId, `${adrId}#${componentId}`, [adrId]);
          addRel('implements', componentId, capabilityId, `${adrId}#${componentId}`, [adrId], 'derived');
        } else {
          addGap({
            gap_id: `GAP-MISSING-CAP-${componentId}-${capabilityId}`,
            gap_type: 'unresolved_reference',
            source_entity_id: componentId,
            severity: 'important',
            source_ref: `${adrId}#${componentId}`,
            evidence: [adrId, capabilityId],
            related_entity_id: capabilityId,
            expected_relationship: 'implemented_by',
          });
        }
      }
      for (const systemAdrId of asStringArray(adr.implements_system)) {
        const resolvedSystemId = systemIds.get(systemAdrId) ?? `SYS-${systemAdrId.replace('ADR-PS-', '')}`;
        if (projected.has(resolvedSystemId)) {
          addRel('embodied_in', componentId, resolvedSystemId, `${adrId}#${componentId}`, [adrId]);
          addRel('embodies', resolvedSystemId, componentId, `${adrId}#${componentId}`, [adrId], 'derived');
        } else {
          addGap({
            gap_id: `GAP-MISSING-SYS-${componentId}-${systemAdrId}`,
            gap_type: 'component_without_system',
            source_entity_id: componentId,
            severity: 'important',
            source_ref: `${adrId}#${componentId}`,
            evidence: [adrId, systemAdrId],
            related_entity_id: systemAdrId,
            expected_relationship: 'embodied_in',
          });
        }
      }
      for (const dep of asStringArray(s.dependencies)) {
        if (projected.has(dep)) {
          addRel('related_to', componentId, dep, `${adrId}#${componentId}`, [adrId], 'derived', 0.8);
          addRel('related_to', dep, componentId, `${adrId}#${componentId}`, [adrId], 'derived', 0.8);
        }
      }
    }
    }
    if (kind === 'physical-system' && Array.isArray(adr.references_components)) {
      for (const componentAdr of asStringArray(adr.references_components)) {
        if (projected.has(componentAdr)) {
          addRel('related_to', adrId, componentAdr, adrId, [adrId], 'derived', 0.8);
          addRel('related_to', componentAdr, adrId, adrId, [adrId], 'derived', 0.8);
        }
      }
    }
  }

  const relList = [...relationships.values()].sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));
  return { relationships: relList, gaps };
}

function isProjectable(entityType: string): boolean {
  return ['adr', 'system', 'component', 'decision', 'capability', 'invariant'].includes(entityType);
}

function projectEntityForDerivation(entity: IrEntity): NormalizedEntity {
  return {
    id: entity.id,
    entity_type: entity.entity_type as NormalizedEntity['entity_type'],
    name: entity.name,
    summary: entity.summary,
    lifecycle_stage: 'active',
    canonical_source: entity.canonical_source,
    source_refs: entity.source_refs,
    metadata: entity.metadata,
    relationships: { ...emptyRelationshipBuckets() },
    completeness: entity.completeness,
    provenance: entity.provenance,
  };
}

export function detectUnresolvedFromGaps(gaps: DerivedGapSignal[]): IrUnresolved[] {
  return gaps
    .map((g) => ({
      id: g.gap_id,
      gap_class: 'generator_derived' as const,
      gap_type: g.gap_type,
      source_entity_id: g.source_entity_id,
      related_entity_id: g.related_entity_id,
      expected_relationship: g.expected_relationship,
      severity: g.severity as IrUnresolved['severity'],
      provenance: makeProvenance('derived_registry', g.source_ref, 'detect_unresolved', 'derived'),
      evidence: g.evidence,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
