import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

import { loadAidocGraph } from './graph-loader.js';
import {
  BundleNode,
  DEFAULT_DEPTH_LIMIT,
  DEFAULT_GRAPH_VERSION,
  EntryPoint,
  RssBundle,
  rssBundleSchema,
} from './schema.js';

type CandidateEntryPoint = {
  id: string;
  domain: string;
  type: string;
  score?: number;
  rationale?: string;
};

type RunRssOptions = {
  stateRoot?: string;
  depthLimit?: number;
  top?: number;
  threshold?: number;
  entryPoints?: EntryPoint[];
  format?: 'json' | 'pretty';
};

function makeNodeKey(domain: string, type: string, id: string): string {
  return `${domain}/${type}/${id}`;
}

async function ensureStateExists(stateRoot: string): Promise<void> {
  try {
    const stat = await fs.stat(stateRoot);
    if (!stat.isDirectory()) {
      throw new Error(`AI-DOC state is not a directory: ${stateRoot}`);
    }
  } catch (err) {
    throw new Error(`AI-DOC state not found at ${stateRoot}: ${(err as Error).message}`);
  }
}

function resolveTaskAnalysisScript(): string {
  const scriptUrl = new URL('../../python-scripts/task_analysis.py', import.meta.url);
  return path.resolve(fileURLToPath(scriptUrl));
}

async function runTaskAnalysis(task: string, opts: { stateRoot: string; top?: number; threshold?: number }): Promise<CandidateEntryPoint[]> {
  const scriptPath = resolveTaskAnalysisScript();
  const args = [scriptPath, '--task', task, '--state', opts.stateRoot, '--format', 'json'];
  if (typeof opts.top === 'number') args.push('--top', String(opts.top));
  if (typeof opts.threshold === 'number') args.push('--threshold', String(opts.threshold));

  const { stdout } = await execa(process.env.PYTHON || 'python', args, { stdout: 'pipe' });
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item.id ?? ''),
        domain: String(item.domain ?? ''),
        type: String(item.type ?? ''),
        score: typeof item.score === 'number' ? item.score : undefined,
        rationale: typeof item.rationale === 'string' ? item.rationale : undefined,
      }))
      .filter((item) => item.id && item.domain && item.type);
  } catch (err) {
    throw new Error(`Failed to parse task analysis JSON: ${(err as Error).message}`);
  }
}

async function discoverEntryPoints(task: string, options: RunRssOptions, stateRoot: string): Promise<EntryPoint[]> {
  if (options.entryPoints && options.entryPoints.length > 0) {
    return options.entryPoints;
  }
  const candidates = await runTaskAnalysis(task, {
    stateRoot,
    top: options.top,
    threshold: options.threshold,
  });
  return candidates.map((cand, idx) => ({
    domain: cand.domain,
    type: cand.type,
    id: cand.id,
    role: idx === 0 ? 'primary' : 'context',
    confidence: 'high',
  }));
}

type Neighbor = {
  key: string;
  edgeType: 'references' | 'referenced_by';
};

function gatherNeighbors(key: string, graph: Awaited<ReturnType<typeof loadAidocGraph>>['graph']): Neighbor[] {
  const node = graph.get(key);
  if (!node) return [];
  const neighbors: Neighbor[] = [];

  for (const edge of node.references) {
    const targetKey = makeNodeKey(edge.domain, edge.type, edge.id);
    neighbors.push({ key: targetKey, edgeType: 'references' });
  }
  for (const edge of node.referencedBy) {
    const targetKey = makeNodeKey(edge.domain, edge.type, edge.id);
    neighbors.push({ key: targetKey, edgeType: 'referenced_by' });
  }

  // Stable ordering: key then edgeType
  neighbors.sort((a, b) => {
    const cmp = a.key.localeCompare(b.key);
    if (cmp !== 0) return cmp;
    return a.edgeType.localeCompare(b.edgeType);
  });

  // Deduplicate by (key, edgeType) while preserving sort
  const deduped: Neighbor[] = [];
  let last: Neighbor | null = null;
  for (const n of neighbors) {
    if (last && last.key === n.key && last.edgeType === n.edgeType) continue;
    deduped.push(n);
    last = n;
  }
  return deduped;
}

function toBundleNode({
  key,
  depth,
  order,
  edgeFrom,
  edgeType,
  graph,
}: {
  key: string;
  depth: number;
  order: number;
  edgeFrom: string | null;
  edgeType: Neighbor['edgeType'] | null;
  graph: Awaited<ReturnType<typeof loadAidocGraph>>['graph'];
}) {
  const node = graph.get(key);
  if (!node) return null;
  return {
    nodeId: key,
    domain: node.domain,
    type: node.type,
    id: node.id,
    order,
    depth,
    path: node.path,
    slice: node.slice ?? null,
    tier: 1,
    confidence: 1,
    edgeFrom,
    edgeType,
  };
}

export async function assembleRssBundle(task: string, options: RunRssOptions = {}): Promise<RssBundle> {
  const stateRoot = path.resolve(options.stateRoot ?? '.ste/state');
  await ensureStateExists(stateRoot);

  const depthLimit = typeof options.depthLimit === 'number' && options.depthLimit >= 0 ? options.depthLimit : DEFAULT_DEPTH_LIMIT;
  const entryPoints = await discoverEntryPoints(task, options, stateRoot);
  const { graph, graphVersion } = await loadAidocGraph(stateRoot);

  const visited = new Set<string>();
  const nodes: BundleNode[] = [];
  let order = 0;

  const visit = (key: string, depth: number, from: string | null, edgeType: Neighbor['edgeType'] | null) => {
    if (visited.has(key)) return;
    const bundleNode = toBundleNode({ key, depth, order, edgeFrom: from, edgeType, graph });
    if (!bundleNode) return;
    visited.add(key);
    nodes.push(bundleNode);
    order += 1;
    if (depth >= depthLimit) return;
    const neighbors = gatherNeighbors(key, graph);
    for (const neighbor of neighbors) {
      visit(neighbor.key, depth + 1, key, neighbor.edgeType);
    }
  };

  for (const ep of entryPoints) {
    const key = makeNodeKey(ep.domain, ep.type, ep.id);
    visit(key, 0, null, null);
  }

  const bundle: RssBundle = {
    task,
    graphVersion: graphVersion ?? DEFAULT_GRAPH_VERSION,
    entryPoints,
    depthLimit,
    nodes,
  };

  return rssBundleSchema.parse(bundle);
}

export async function runRssTraversal(task: string, options: RunRssOptions = {}): Promise<void> {
  const bundle = await assembleRssBundle(task, options);
  const shouldPrettyPrint = options.format === 'pretty';
  const output = shouldPrettyPrint ? JSON.stringify(bundle, null, 2) : JSON.stringify(bundle);
  // eslint-disable-next-line no-console
  console.log(output);
}

