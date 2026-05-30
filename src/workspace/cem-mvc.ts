import crypto from 'node:crypto';

import type { WorkspaceGraph, WorkspaceNode } from './workspace-graph-loader.js';
import type { SourceLocator, SourceLocatorRegistry } from './source-locator-registry.js';
import { resolveLocator } from './source-locator-registry.js';

export interface CemDiagnostic {
  kind: string;
  message: string;
  entity_id?: string;
}

export interface TraversalContext {
  query: string;
  max_depth: number;
  max_nodes: number;
  visited_node_ids: string[];
  skipped_node_ids: string[];
  truncated: boolean;
  operations: Array<{ operation: string; start: string; direction: 'bidirectional'; depth: number }>;
}

export interface CemBundle {
  cem_bundle_id: string;
  schema_version: '1.0';
  generated_by: string;
  generated_at: string;
  workspace_manifest_hash: string;
  graph_snapshot_hash: string;
  locator_registry_hash: string;
  source_hashes: Record<string, string>;
  authoritative_source_refs: SourceLocator[];
  graph_provenance: Array<{ entity_id: string; entity_uri?: string; repo: string; type: string }>;
  traversal_context: TraversalContext;
  dependency_context: string[];
  blast_radius_context: string[];
  embodiment_evidence: Array<{ entity_id: string; source_uri?: string; evidence_type: string }>;
  implementation_linkage_decorators: Array<{ entity_id: string; source_uri?: string }>;
  validation_state: { status: 'not_evaluated' | 'evaluated'; diagnostics: CemDiagnostic[] };
  freshness_state: { graph_snapshot_hash: string; locator_registry_hash: string };
  negative_space_constraints: CemDiagnostic[];
  unresolved_risks: CemDiagnostic[];
  partial_state_diagnostics: CemDiagnostic[];
}

export interface MvcBundle {
  mvc_bundle_id: string;
  schema_version: '1.0';
  derived_from_cem_bundle_id: string;
  derivation_hash: string;
  generated_at: string;
  task_or_operation_scope: string;
  bounded_context_payload: Array<{ entity_id: string; entity_type: string; repo: string; source_uri?: string }>;
  selected_source_refs: SourceLocator[];
  selected_source_snippets: Array<{ source_uri: string; omitted: true; reason: string }>;
  selected_graph_entities: string[];
  selected_embodiment_evidence: CemBundle['embodiment_evidence'];
  provenance_refs: {
    cem_bundle_id: string;
    graph_snapshot_hash: string;
    locator_registry_hash: string;
  };
  traversal_scope: TraversalContext;
  freshness_metadata: CemBundle['freshness_state'];
  inclusion_rationale: Array<{ entity_id: string; reason: string }>;
  exclusion_rationale: CemDiagnostic[];
  negative_space_summary: CemDiagnostic[];
  unresolved_risk_summary: CemDiagnostic[];
  token_or_size_budget: { max_source_refs: number };
  validation_result_ref?: string;
}

export interface MvcValidationResult {
  validation_result_id: string;
  status: 'valid' | 'valid_with_warnings' | 'degraded' | 'invalid' | 'blocked';
  checks: {
    source_fidelity: boolean;
    source_freshness: boolean;
    graph_freshness: boolean;
    provenance_complete: boolean;
    traversal_complete: boolean;
    negative_space_included: boolean;
    embodiment_evidence_included: boolean;
    unresolved_risks_visible: boolean;
  };
  warnings: string[];
  errors: string[];
}

function stableHash(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function findEntryNode(graph: WorkspaceGraph, query: string): WorkspaceNode | undefined {
  return graph.nodes.get(query)
    ?? [...graph.nodes.values()].find(n => n.id.toLowerCase().includes(query.toLowerCase()))
    ?? [...graph.nodes.values()].find(n => n.source_uri === query || n.entity_uri === query);
}

function sortedIncidentEdges(graph: WorkspaceGraph, nodeId: string) {
  const edges = [...(graph.outAdj.get(nodeId) ?? []), ...(graph.inAdj.get(nodeId) ?? [])];
  return edges.sort((a, b) =>
    a.verb.localeCompare(b.verb) ||
    a.from.localeCompare(b.from) ||
    a.to.localeCompare(b.to));
}

function traverse(graph: WorkspaceGraph, startId: string, maxDepth: number, maxNodes: number): TraversalContext {
  const visited: string[] = [];
  const visitedSet = new Set<string>();
  const skipped: string[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visitedSet.has(current.id)) continue;
    if (visited.length >= maxNodes) {
      truncated = true;
      skipped.push(current.id);
      continue;
    }
    visitedSet.add(current.id);
    visited.push(current.id);
    if (current.depth >= maxDepth) continue;

    for (const edge of sortedIncidentEdges(graph, current.id)) {
      const next = edge.from === current.id ? edge.to : edge.from;
      if (!visitedSet.has(next)) {
        queue.push({ id: next, depth: current.depth + 1 });
      }
    }
  }

  return {
    query: startId,
    max_depth: maxDepth,
    max_nodes: maxNodes,
    visited_node_ids: visited,
    skipped_node_ids: [...new Set(skipped)].sort(),
    truncated,
    operations: [{ operation: 'workspace-neighborhood', start: startId, direction: 'bidirectional', depth: maxDepth }],
  };
}

export function assembleCemBundle(args: {
  graph: WorkspaceGraph;
  registry: SourceLocatorRegistry;
  query: string;
  generatedAt?: string;
  generatedBy?: string;
  maxDepth?: number;
  maxNodes?: number;
}): CemBundle {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const generatedBy = args.generatedBy ?? 'ste-runtime';
  const maxDepth = args.maxDepth ?? 2;
  const maxNodes = args.maxNodes ?? 50;
  const entry = resolveLocator(args.registry, args.query)?.entity_id
    ? args.graph.nodes.get(resolveLocator(args.registry, args.query)!.entity_id)
    : findEntryNode(args.graph, args.query);

  const partialStateDiagnostics: CemDiagnostic[] = [];
  if (!entry) {
    partialStateDiagnostics.push({ kind: 'entry_not_found', message: `No graph entry found for ${args.query}` });
  }

  const traversal = entry
    ? traverse(args.graph, entry.id, maxDepth, maxNodes)
    : {
        query: args.query,
        max_depth: maxDepth,
        max_nodes: maxNodes,
        visited_node_ids: [],
        skipped_node_ids: [],
        truncated: false,
        operations: [],
      };

  const authoritativeSourceRefs: SourceLocator[] = [];
  const negativeSpace: CemDiagnostic[] = [];
  const graphProvenance: CemBundle['graph_provenance'] = [];
  const sourceHashes: Record<string, string> = {};
  const embodimentEvidence: CemBundle['embodiment_evidence'] = [];

  for (const nodeId of traversal.visited_node_ids) {
    const node = args.graph.nodes.get(nodeId);
    if (!node) continue;
    graphProvenance.push({ entity_id: node.id, entity_uri: node.entity_uri, repo: node.repo, type: node.type });
    const locator = resolveLocator(args.registry, node.id);
    if (locator) {
      authoritativeSourceRefs.push(locator);
      if (locator.source_hash) sourceHashes[locator.source_uri] = locator.source_hash;
      embodimentEvidence.push({ entity_id: node.id, source_uri: locator.source_uri, evidence_type: 'source-locator' });
    } else {
      negativeSpace.push({
        kind: 'unresolved_locator',
        entity_id: node.id,
        message: `No source locator resolved for ${node.id}`,
      });
    }
  }

  if (traversal.truncated) {
    negativeSpace.push({ kind: 'truncated_traversal', message: 'Traversal reached max node cap' });
  }

  const dependencyContext = traversal.visited_node_ids.slice(1).sort();
  const bodyForId = {
    query: args.query,
    graph: args.registry.graph_snapshot_hash,
    locators: authoritativeSourceRefs.map(l => l.entity_uri),
    traversal: traversal.visited_node_ids,
  };

  return {
    cem_bundle_id: stableHash(bodyForId),
    schema_version: '1.0',
    generated_by: generatedBy,
    generated_at: generatedAt,
    workspace_manifest_hash: args.registry.workspace_manifest_hash,
    graph_snapshot_hash: args.registry.graph_snapshot_hash,
    locator_registry_hash: args.registry.locator_registry_hash ?? stableHash(args.registry.locators),
    source_hashes: sourceHashes,
    authoritative_source_refs: authoritativeSourceRefs,
    graph_provenance: graphProvenance,
    traversal_context: traversal,
    dependency_context: dependencyContext,
    blast_radius_context: traversal.visited_node_ids,
    embodiment_evidence: embodimentEvidence,
    implementation_linkage_decorators: embodimentEvidence.map(e => ({ entity_id: e.entity_id, source_uri: e.source_uri })),
    validation_state: { status: 'not_evaluated', diagnostics: [] },
    freshness_state: {
      graph_snapshot_hash: args.registry.graph_snapshot_hash,
      locator_registry_hash: args.registry.locator_registry_hash ?? stableHash(args.registry.locators),
    },
    negative_space_constraints: negativeSpace,
    unresolved_risks: [...negativeSpace],
    partial_state_diagnostics: partialStateDiagnostics,
  };
}

export function deriveMvcBundle(cem: CemBundle, options: {
  generatedAt?: string;
  maxSourceRefs?: number;
} = {}): MvcBundle {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const maxSourceRefs = options.maxSourceRefs ?? 8;
  const selectedSourceRefs = cem.authoritative_source_refs.slice(0, maxSourceRefs);
  const selectedSourceUris = new Set(selectedSourceRefs.map(ref => ref.source_uri));
  const payload = cem.graph_provenance.map(entity => {
    const locator = cem.authoritative_source_refs.find(l => l.entity_id === entity.entity_id);
    return {
      entity_id: entity.entity_id,
      entity_type: entity.type,
      repo: entity.repo,
      source_uri: locator?.source_uri,
    };
  });
  const excluded = cem.authoritative_source_refs
    .filter(ref => !selectedSourceUris.has(ref.source_uri))
    .map(ref => ({
      kind: 'source_ref_budget_excluded',
      entity_id: ref.entity_id,
      message: `Source reference excluded by MVC max_source_refs=${maxSourceRefs}`,
    }));
  const body = {
    cem: cem.cem_bundle_id,
    selected: selectedSourceRefs.map(ref => ref.source_uri),
    traversal: cem.traversal_context.visited_node_ids,
  };
  const derivationHash = stableHash(body);

  return {
    mvc_bundle_id: derivationHash,
    schema_version: '1.0',
    derived_from_cem_bundle_id: cem.cem_bundle_id,
    derivation_hash: derivationHash,
    generated_at: generatedAt,
    task_or_operation_scope: cem.traversal_context.query,
    bounded_context_payload: payload,
    selected_source_refs: selectedSourceRefs,
    selected_source_snippets: selectedSourceRefs.map(ref => ({
      source_uri: ref.source_uri,
      omitted: true,
      reason: 'source content is retrieved lazily by source locator',
    })),
    selected_graph_entities: cem.traversal_context.visited_node_ids,
    selected_embodiment_evidence: cem.embodiment_evidence.filter(e => !e.source_uri || selectedSourceUris.has(e.source_uri)),
    provenance_refs: {
      cem_bundle_id: cem.cem_bundle_id,
      graph_snapshot_hash: cem.graph_snapshot_hash,
      locator_registry_hash: cem.locator_registry_hash,
    },
    traversal_scope: cem.traversal_context,
    freshness_metadata: cem.freshness_state,
    inclusion_rationale: payload.map(p => ({ entity_id: p.entity_id, reason: 'selected by deterministic CEM traversal' })),
    exclusion_rationale: excluded,
    negative_space_summary: cem.negative_space_constraints,
    unresolved_risk_summary: cem.unresolved_risks,
    token_or_size_budget: { max_source_refs: maxSourceRefs },
  };
}

export function validateMvcBundle(mvc: MvcBundle, cem: CemBundle): MvcValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const sourceFidelity = mvc.selected_source_refs.every(ref =>
    cem.authoritative_source_refs.some(cemRef => cemRef.source_uri === ref.source_uri && cemRef.source_hash === ref.source_hash),
  );
  if (!sourceFidelity) errors.push('MVC selected source refs are not faithful to parent CEM source refs.');

  const provenanceComplete =
    mvc.derived_from_cem_bundle_id === cem.cem_bundle_id &&
    mvc.provenance_refs.cem_bundle_id === cem.cem_bundle_id &&
    mvc.provenance_refs.graph_snapshot_hash === cem.graph_snapshot_hash &&
    mvc.provenance_refs.locator_registry_hash === cem.locator_registry_hash;
  if (!provenanceComplete) errors.push('MVC provenance chain is incomplete.');

  const traversalComplete = !cem.traversal_context.truncated;
  if (!traversalComplete) warnings.push('MVC parent CEM traversal was truncated.');

  const negativeSpaceIncluded = mvc.negative_space_summary.length === cem.negative_space_constraints.length;
  if (!negativeSpaceIncluded || mvc.negative_space_summary.length > 0) {
    warnings.push('MVC carries negative-space constraints from parent CEM.');
  }

  const embodimentIncluded = cem.embodiment_evidence.length === 0 || mvc.selected_embodiment_evidence.length > 0;
  if (!embodimentIncluded) warnings.push('MVC omitted relevant embodiment evidence.');

  const unresolvedRisksVisible = mvc.unresolved_risk_summary.length === cem.unresolved_risks.length;
  if (!unresolvedRisksVisible || mvc.unresolved_risk_summary.length > 0) {
    warnings.push('MVC carries unresolved risks from parent CEM.');
  }

  let status: MvcValidationResult['status'] = 'valid';
  if (errors.length > 0) {
    status = 'invalid';
  } else if (!traversalComplete || warnings.length > 0) {
    status = 'valid_with_warnings';
  }

  return {
    validation_result_id: stableHash({ mvc: mvc.mvc_bundle_id, cem: cem.cem_bundle_id, warnings, errors }),
    status,
    checks: {
      source_fidelity: sourceFidelity,
      source_freshness: true,
      graph_freshness: mvc.provenance_refs.graph_snapshot_hash === cem.graph_snapshot_hash,
      provenance_complete: provenanceComplete,
      traversal_complete: traversalComplete,
      negative_space_included: negativeSpaceIncluded,
      embodiment_evidence_included: embodimentIncluded,
      unresolved_risks_visible: unresolvedRisksVisible,
    },
    warnings,
    errors,
  };
}
