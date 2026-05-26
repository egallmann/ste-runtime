import path from 'node:path';

import {
  collectStandaloneInvariantMentions,
  detectUnresolvedFromGaps,
  deriveRelationships,
  extractLogicalEntities,
  extractPhysicalEntities,
  mergeInvariantMentions,
  resolveInvariantCanonical,
  type ExtractedEntity,
} from './extraction.js';
import { discoverSourceFiles, loadNamespace, loadYamlFile, scopeRelativePath } from './support.js';
import { projectEntity, projectRelationship, projectUnresolved } from './projection.js';
import { validateRegistryBundle } from './validate-bundle.js';
import type { ArchModelState, IrEntity, IrRelationship, IrUnresolved, SourceRef } from './types.js';

function classifyPhysicalKind(filePath: string): 'physical' | 'physical-system' | 'physical-component' {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('/physical-system/')) return 'physical-system';
  if (normalized.includes('/physical-component/')) return 'physical-component';
  return 'physical';
}

function addEntity(
  entities: Map<string, IrEntity>,
  referenceMerges: Map<string, SourceRef[]>,
  extracted: ExtractedEntity,
): void {
  const { entity, allowReferenceMerge } = extracted;
  const existing = entities.get(entity.id);
  if (!existing) {
    entities.set(entity.id, entity);
    return;
  }
  if (!allowReferenceMerge) {
    throw new Error(`Duplicate canonical entity ID ${entity.id}`);
  }
  const refs = referenceMerges.get(entity.id) ?? [];
  const ref: SourceRef = {
    source_type: entity.canonical_source.source_type,
    source_ref: entity.canonical_source.source_ref,
    artifact_path: entity.canonical_source.artifact_path,
    mention_role: 'reference',
  };
  const key = `${ref.source_ref}|${ref.mention_role}`;
  if (!refs.some((r) => `${r.source_ref}|${r.mention_role}` === key)) {
    refs.push(ref);
    refs.sort((a, b) => a.source_ref.localeCompare(b.source_ref) || a.mention_role.localeCompare(b.mention_role));
    referenceMerges.set(entity.id, refs);
  }
}

function finalizeSourceRefs(entities: Map<string, IrEntity>, referenceMerges: Map<string, SourceRef[]>): void {
  for (const [id, refs] of referenceMerges) {
    const entity = entities.get(id);
    if (!entity) continue;
    entity.source_refs.push(...refs);
    entity.source_refs.sort(
      (a, b) => a.source_ref.localeCompare(b.source_ref) || a.mention_role.localeCompare(b.mention_role),
    );
  }
}

function applyRelationshipsToEntities(entities: Map<string, IrEntity>, rels: IrRelationship[]): void {
  for (const rel of rels) {
    const from = entities.get(rel.from_entity_id);
    if (!from) continue;
    const bucket = from.relationships[rel.relationship_type];
    if (!bucket.includes(rel.to_entity_id)) {
      bucket.push(rel.to_entity_id);
      bucket.sort();
    }
  }
}

function addNamespaceBoundary(entities: Map<string, IrEntity>, namespace: string, scopeRoot: string): void {
  const boundaryId = `${namespace}:__namespace__`;
  if (entities.has(boundaryId)) return;
  entities.set(boundaryId, {
    id: boundaryId,
    entity_type: 'boundary',
    name: namespace,
    summary: 'Namespace marker for compiler build metadata.',
    canonical_source: {
      source_type: 'project_metadata',
      source_ref: 'PROJECT.yaml#architecture_namespace',
      artifact_path: 'PROJECT.yaml',
    },
    source_refs: [],
    metadata: {},
    completeness: { status: 'complete', missing_fields: [] },
    provenance: {
      source_type: 'project_metadata',
      source_ref: 'PROJECT.yaml#architecture_namespace',
      extraction_phase: 'load_namespace',
      classification: 'explicit',
      generator: 'adr-architecture-index',
    },
    relationships: {
      declared_in: [],
      declares: [],
      references: [],
      referenced_by: [],
      related_to: [],
      enforces: [],
      enforced_by: [],
      enabled_by: [],
      enables: [],
      governs: [],
      governed_by: [],
      implements: [],
      implemented_by: [],
      embodied_in: [],
      embodies: [],
      supersedes: [],
      superseded_by: [],
      refines: [],
      refined_by: [],
    },
  });
}

export interface PipelineRunOptions {
  scopeRoot: string;
  generatedAt: Date;
}

export async function runArchitecturePipeline(options: PipelineRunOptions): Promise<ArchModelState> {
  const scopeRoot = path.resolve(options.scopeRoot);
  const adrDir = path.join(scopeRoot, 'adrs');
  const namespace = await loadNamespace(scopeRoot);
  const { logical, physical, invariants } = await discoverSourceFiles(adrDir);
  const sourcePath = (p: string) => scopeRelativePath(scopeRoot, p);

  const logicalAdrs: ArchModelState['logicalAdrs'] = [];
  for (const file of logical) {
    const adr = (await loadYamlFile(file)) as Record<string, unknown>;
    logicalAdrs.push({ adr, path: file });
  }

  const physicalAdrs: ArchModelState['physicalAdrs'] = [];
  for (const file of physical) {
    const adr = (await loadYamlFile(file)) as Record<string, unknown>;
    physicalAdrs.push({ adr, path: file, kind: classifyPhysicalKind(file) });
  }

  const standaloneInvariants: ArchModelState['standaloneInvariants'] = [];
  for (const file of invariants) {
    const inv = (await loadYamlFile(file)) as Record<string, unknown>;
    standaloneInvariants.push({ inv, path: file });
  }

  const corpus = new Map<string, unknown>();
  for (const { adr, path: p } of logicalAdrs) corpus.set(p, adr);
  for (const { adr, path: p } of physicalAdrs) corpus.set(p, adr);
  for (const { inv, path: p } of standaloneInvariants) corpus.set(p, inv);
  try {
    const projectYaml = await loadYamlFile(path.join(scopeRoot, 'PROJECT.yaml'));
    corpus.set('PROJECT.yaml', projectYaml);
  } catch {
    /* optional */
  }

  const entities = new Map<string, IrEntity>();
  const referenceMerges = new Map<string, SourceRef[]>();
  const unresolved = new Map<string, IrUnresolved>();

  const logicalResult = extractLogicalEntities(logicalAdrs, sourcePath);
  for (const u of logicalResult.unresolved) unresolved.set(u.id, u);
  let invariantMentions = logicalResult.invariantMentions;
  const standaloneMentions = collectStandaloneInvariantMentions(standaloneInvariants, sourcePath);
  invariantMentions = mergeInvariantMentions(invariantMentions, standaloneMentions);

  for (const ex of logicalResult.entities) {
    addEntity(entities, referenceMerges, ex);
  }

  const invResolved = resolveInvariantCanonical(invariantMentions);
  for (const ex of invResolved.entities) {
    addEntity(entities, referenceMerges, ex);
  }

  const physicalResult = extractPhysicalEntities(physicalAdrs, sourcePath);
  for (const ex of physicalResult.entities) {
    addEntity(entities, referenceMerges, ex);
  }

  for (const [invId, refs] of invResolved.refs) {
    const entity = entities.get(invId);
    if (!entity) continue;
    for (const ref of refs) {
      if (!entity.source_refs.some((r) => r.source_ref === ref.source_ref && r.mention_role === ref.mention_role)) {
        entity.source_refs.push(ref);
      }
    }
    entity.source_refs.sort(
      (a, b) => a.source_ref.localeCompare(b.source_ref) || a.mention_role.localeCompare(b.mention_role),
    );
  }

  const relGraph = new Map<string, IrRelationship>();
  const { relationships: derivedRels, gaps } = deriveRelationships(
    entities,
    logicalAdrs,
    standaloneInvariants,
    physicalAdrs,
    physicalResult.systemIds,
  );

  const irRels: IrRelationship[] = derivedRels.map((r) => ({
    relationship_id: r.relationship_id,
    relationship_type: r.relationship_type,
    from_entity_id: r.from_entity_id,
    to_entity_id: r.to_entity_id,
    canonical_source_ref: r.canonical_source_ref,
    provenance_classification: r.provenance_classification,
    evidence: r.evidence,
    confidence: r.confidence,
    metadata: r.metadata,
  }));
  applyRelationshipsToEntities(entities, irRels);
  for (const r of irRels) {
    relGraph.set(r.relationship_id, r);
  }

  for (const u of detectUnresolvedFromGaps(gaps)) {
    unresolved.set(u.id, u);
  }

  finalizeSourceRefs(entities, referenceMerges);

  const generatedAtIso = options.generatedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  addNamespaceBoundary(entities, namespace, scopeRoot);

  const projectedEntities = [...entities.values()]
    .map((e) => projectEntity(e, relGraph))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .sort((a, b) => a.entity_type.localeCompare(b.entity_type) || a.id.localeCompare(b.id));

  const projectedRels = [...relGraph.values()]
    .map(projectRelationship)
    .sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));

  const projectedUnresolved = [...unresolved.values()]
    .map(projectUnresolved)
    .sort((a, b) => a.id.localeCompare(b.id));

  const diags = validateRegistryBundle(projectedEntities, projectedRels, projectedUnresolved);
  const err = diags.find((d) => d.level === 'ERROR');
  if (err) {
    throw new Error(`${err.code}: ${err.message}`);
  }

  const coverage = {
    logical_adrs: logicalAdrs.length,
    physical_adrs: physicalAdrs.filter((p) => p.kind === 'physical').length,
    physical_system_adrs: physicalAdrs.filter((p) => p.kind === 'physical-system').length,
    physical_component_adrs: physicalAdrs.filter((p) => p.kind === 'physical-component').length,
    standalone_invariants: standaloneInvariants.length,
  };

  return {
    scopeRoot,
    namespace,
    generatedAt: generatedAtIso,
    entities,
    relationships: relGraph,
    unresolved,
    coverage,
    corpus,
    logicalAdrs,
    physicalAdrs,
    standaloneInvariants,
  };
}
