/**
 * Workspace graph merge -- TypeScript port of the legacy workspace-graph merger.
 *
 * Loads per-repo slices, validates via Zod, merges nodes (first-wins collision),
 * filters to high-confidence edges, resolves dangling references, folds
 * cross-repo edges from workspace-edges.yaml, and emits graph.yaml.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

import { validateSlice } from './slice-schema.js';
import type { CrossRepoEdge } from './cross-repo-edges.js';
import { log, warn } from '../utils/logger.js';

export interface MergedNode {
  id: string;
  type: string;
  name: string;
  repo: string;
  entity_uri?: string;
  source_uri?: string;
  source_hash?: string;
  source_locator_ref?: string;
  canonical?: boolean;
  authority?: string;
  graph_snapshot_hash?: string;
  attributes?: Record<string, unknown>;
  provenance: { source_path: string; source_ref: string; repo?: string };
}

export interface MergedEdge {
  from: string;
  to: string;
  verb: string;
  confidence?: string;
  provenance?: { source_path: string; source_ref: string; repo?: string };
}

export interface UnifiedGraphDoc {
  schema_version: string;
  generated_at: string;
  partial_from: string[];
  nodes: MergedNode[];
  edges: MergedEdge[];
}

export interface MergeResult {
  graph: UnifiedGraphDoc;
  graphPath: string;
  repoStatuses: Array<{ name: string; status: 'success' | 'failed'; error?: string }>;
}

interface SliceDoc {
  schema_version?: string;
  repo?: string;
  nodes?: Array<{
    id: string;
    type: string;
    name: string;
    attributes?: Record<string, unknown>;
    entity_uri?: string;
    source_uri?: string;
    source_hash?: string;
    source_locator_ref?: string;
    canonical?: boolean;
    authority?: string;
    graph_snapshot_hash?: string;
    provenance: { source_path: string; source_ref: string; repo?: string };
  }>;
  edges?: Array<{
    from: string;
    to: string;
    verb: string;
    confidence?: string;
    provenance?: { source_path: string; source_ref: string; repo?: string };
  }>;
}

async function loadCrossRepoEdges(outputDir: string): Promise<CrossRepoEdge[]> {
  const edgesPath = path.join(outputDir, 'workspace-edges.yaml');
  try {
    const raw = await fs.readFile(edgesPath, 'utf-8');
    const doc = yaml.load(raw) as { cross_repo_edges?: CrossRepoEdge[] } | null;
    return doc?.cross_repo_edges ?? [];
  } catch {
    return [];
  }
}

export async function mergeWorkspaceGraph(
  outputDir: string,
  validationMode: 'warn' | 'reject' = 'warn',
): Promise<MergeResult> {
  const slicesDir = path.join(outputDir, 'slices');
  const allNodes = new Map<string, MergedNode>();
  const allEdges: MergedEdge[] = [];
  const partialFrom: string[] = [];
  const repoStatuses: MergeResult['repoStatuses'] = [];

  let sliceFiles: string[] = [];
  try {
    const entries = await fs.readdir(slicesDir);
    sliceFiles = entries
      .filter((f) => f.endsWith('.yaml'))
      .sort()
      .map((f) => path.join(slicesDir, f));
  } catch {
    log('[workspace-merge] No slices directory found; emitting empty graph');
  }

  for (const slicePath of sliceFiles) {
    const repoName = path.basename(slicePath, '.yaml');
    try {
      const raw = await fs.readFile(slicePath, 'utf-8');
      const parsed = yaml.load(raw) as unknown;

      const validation = validateSlice(parsed, validationMode);
      if (!validation.valid) {
        const errMsg = validation.errors.join('; ');
        warn(`[workspace-merge] Slice validation failed for ${repoName}: ${errMsg}`);
        repoStatuses.push({ name: repoName, status: 'failed', error: errMsg });
        partialFrom.push(repoName);
        continue;
      }
      for (const w of validation.warnings) {
        warn(`[workspace-merge] ${repoName}: ${w}`);
      }

      const doc = parsed as SliceDoc;
      const sliceRepo = doc.repo ?? repoName;

      if (Array.isArray(doc.nodes)) {
        for (const node of doc.nodes) {
          if (!node.id || !node.type) continue;
          if (allNodes.has(node.id)) {
            const prev = allNodes.get(node.id)!;
            if (prev.type !== node.type || prev.name !== node.name) {
              warn(
                `[workspace-merge] Identity collision: ${node.id} declared in ${prev.repo} and ${sliceRepo}; keeping first`,
              );
            }
            continue;
          }
          allNodes.set(node.id, {
            id: node.id,
            type: node.type,
            name: node.name ?? node.id,
            repo: node.provenance?.repo ?? sliceRepo,
            entity_uri: node.entity_uri,
            source_uri: node.source_uri,
            source_hash: node.source_hash,
            source_locator_ref: node.source_locator_ref,
            canonical: node.canonical,
            authority: node.authority,
            graph_snapshot_hash: node.graph_snapshot_hash,
            attributes: node.attributes,
            provenance: node.provenance,
          });
        }
      }

      if (Array.isArray(doc.edges)) {
        for (const edge of doc.edges) {
          if (!edge.from || !edge.to || !edge.verb) continue;
          if (edge.confidence && edge.confidence !== 'high') continue;
          allEdges.push({
            from: edge.from,
            to: edge.to,
            verb: edge.verb,
            confidence: edge.confidence,
            provenance: edge.provenance,
          });
        }
      }

      repoStatuses.push({ name: repoName, status: 'success' });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      warn(`[workspace-merge] Failed to load slice ${repoName}: ${errMsg}`);
      repoStatuses.push({ name: repoName, status: 'failed', error: errMsg });
      partialFrom.push(repoName);
    }
  }

  const crossRepoEdges = await loadCrossRepoEdges(outputDir);
  for (const cre of crossRepoEdges) {
    allEdges.push({
      from: cre.from,
      to: cre.to,
      verb: cre.verb,
      confidence: cre.confidence,
    });
  }
  if (crossRepoEdges.length > 0) {
    log(`[workspace-merge] Folded ${crossRepoEdges.length} cross-repo edges`);
  }

  const resolvedEdges: MergedEdge[] = [];
  for (const edge of allEdges) {
    if (!allNodes.has(edge.from)) {
      warn(`[workspace-merge] Dropping edge ${edge.from} -${edge.verb}-> ${edge.to}: unknown from-node`);
      continue;
    }
    if (!allNodes.has(edge.to)) {
      warn(`[workspace-merge] Dropping edge ${edge.from} -${edge.verb}-> ${edge.to}: unknown to-node`);
      continue;
    }
    resolvedEdges.push(edge);
  }

  const generatedAt = new Date().toISOString();
  const graph: UnifiedGraphDoc = {
    schema_version: '1.0',
    generated_at: generatedAt,
    partial_from: partialFrom,
    nodes: [...allNodes.values()],
    edges: resolvedEdges,
  };

  const graphPath = path.join(outputDir, 'graph.yaml');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(graphPath, yaml.dump(graph, { lineWidth: 120, noRefs: true }), 'utf-8');
  log(`[workspace-merge] Emitted graph.yaml: ${allNodes.size} nodes, ${resolvedEdges.length} edges`);

  return { graph, graphPath, repoStatuses };
}
