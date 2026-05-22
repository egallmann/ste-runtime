/**
 * Loads workspace graph slices (emitted by slice-emitter.ts) into a typed
 * in-memory graph with pre-built adjacency lists for O(1) neighbor lookups.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WorkspaceNode {
  id: string;
  type: string;
  name: string;
  repo: string;
  attributes?: Record<string, unknown>;
}

export interface WorkspaceEdge {
  from: string;
  to: string;
  verb: string;
}

export interface WorkspaceGraph {
  nodes: Map<string, WorkspaceNode>;
  edges: WorkspaceEdge[];
  outAdj: Map<string, WorkspaceEdge[]>;
  inAdj: Map<string, WorkspaceEdge[]>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SliceDoc {
  schema_version?: string;
  repo?: string;
  nodes?: Array<{
    id?: string;
    type?: string;
    name?: string;
    provenance?: { repo?: string; source_path?: string; source_ref?: string };
    attributes?: Record<string, unknown>;
  }>;
  edges?: Array<{
    from?: string;
    to?: string;
    verb?: string;
    confidence?: string;
  }>;
}

interface WorkspaceIndexDoc {
  schema_version?: string;
  repos?: Array<{
    name?: string;
    status?: string;
    slice?: string;
  }>;
}

function extractRepo(
  nodeProvenance: { repo?: string } | undefined,
  sliceRepo: string | undefined,
): string {
  return nodeProvenance?.repo ?? sliceRepo ?? 'unknown';
}

function pushToAdjList(
  adj: Map<string, WorkspaceEdge[]>,
  key: string,
  edge: WorkspaceEdge,
): void {
  const list = adj.get(key);
  if (list) {
    list.push(edge);
  } else {
    adj.set(key, [edge]);
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load all workspace graph slices from {@code outputDir} (the directory
 * containing `workspace-index.yaml` and `slices/`).
 *
 * Returns a unified {@link WorkspaceGraph} with pre-built adjacency lists.
 */
export async function loadWorkspaceGraph(outputDir: string): Promise<WorkspaceGraph> {
  const resolved = path.resolve(outputDir);

  const indexPath = path.join(resolved, 'workspace-index.yaml');
  const indexRaw = await fs.readFile(indexPath, 'utf-8');
  const indexDoc = yaml.load(indexRaw) as WorkspaceIndexDoc | null;

  const slicePaths: string[] = [];
  if (indexDoc?.repos && Array.isArray(indexDoc.repos)) {
    for (const entry of indexDoc.repos) {
      if (entry.status === 'success' && typeof entry.slice === 'string') {
        slicePaths.push(path.join(resolved, entry.slice));
      }
    }
  }

  const nodes = new Map<string, WorkspaceNode>();
  const edges: WorkspaceEdge[] = [];
  const outAdj = new Map<string, WorkspaceEdge[]>();
  const inAdj = new Map<string, WorkspaceEdge[]>();

  for (const slicePath of slicePaths) {
    let raw: string;
    try {
      raw = await fs.readFile(slicePath, 'utf-8');
    } catch {
      continue;
    }

    const doc = yaml.load(raw) as SliceDoc | null;
    if (!doc) continue;

    const sliceRepo = doc.repo;

    if (Array.isArray(doc.nodes)) {
      for (const n of doc.nodes) {
        if (typeof n.id !== 'string' || typeof n.type !== 'string') continue;
        if (nodes.has(n.id)) continue;

        nodes.set(n.id, {
          id: n.id,
          type: n.type,
          name: typeof n.name === 'string' ? n.name : n.id,
          repo: extractRepo(n.provenance, sliceRepo),
          attributes: n.attributes,
        });
      }
    }

    if (Array.isArray(doc.edges)) {
      for (const e of doc.edges) {
        if (typeof e.from !== 'string' || typeof e.to !== 'string' || typeof e.verb !== 'string') {
          continue;
        }
        const edge: WorkspaceEdge = { from: e.from, to: e.to, verb: e.verb };
        edges.push(edge);
        pushToAdjList(outAdj, edge.from, edge);
        pushToAdjList(inAdj, edge.to, edge);
      }
    }
  }

  return { nodes, edges, outAdj, inAdj };
}
