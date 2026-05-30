import { promises as fs } from 'node:fs';
import path from 'node:path';

import { globby } from 'globby';
import yaml from 'js-yaml';

import { DEFAULT_GRAPH_VERSION, Slice } from './schema.js';
import { ioLimiter } from '../utils/concurrency.js';

export type AidocEdge = {
  domain: string;
  type: string;
  id: string;
};

export type AidocNode = {
  key: string;
  domain: string;
  type: string;
  id: string;
  sourceFiles: string[];
  references: AidocEdge[];
  referencedBy: AidocEdge[];
  tags: string[];
  path?: string;
  slice?: Slice;
  element?: Record<string, unknown>;
  /** Embedded source code from the slice (Pillar 1: Rich Slices) */
  source?: string;
  /** Optional description/docstring for this component */
  description?: string;
  /** Originating repository name in workspace mode; undefined in single-project mode */
  repo?: string;
};

export type AidocGraph = Map<string, AidocNode>;

const SLICE_KEY = '_slice';

/**
 * Known domain directory names used by the extractor. When the first path
 * segment relative to stateRoot matches one of these, the graph is in
 * single-project mode (no repo prefix). If the first segment is NOT in
 * this set and the path has 3+ segments, it is treated as a repo name
 * (workspace mode).
 *
 * COUPLING: if the extractor adds a new top-level domain directory, this
 * set must be updated to avoid misidentifying it as a repo name.
 */
const DOMAIN_DIRS = new Set([
  'graph', 'infrastructure', 'behavior', 'api', 'data',
  'attribution', 'manifest', 'validation',
]);

function edgeKey(edge: AidocEdge): string {
  return `${edge.domain}/${edge.type}/${edge.id}`;
}

function normalizeEdge(raw: unknown): AidocEdge | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const domain = typeof candidate.domain === 'string' ? candidate.domain : null;
  const type = typeof candidate.type === 'string' ? candidate.type : null;
  const id = typeof candidate.id === 'string' ? candidate.id : null;
  if (!domain || !type || !id) return null;
  return { domain, type, id };
}

function normalizeEdges(list: unknown): AidocEdge[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const edges: AidocEdge[] = [];
  for (const item of list) {
    const edge = normalizeEdge(item);
    if (!edge) continue;
    const key = edgeKey(edge);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(edge);
  }
  edges.sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));
  return edges;
}

async function readYaml(filePath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(filePath, 'utf8');
  const data = yaml.load(raw);
  if (!data || typeof data !== 'object') return {};
  return data as Record<string, unknown>;
}

async function detectGraphVersion(stateRoot: string): Promise<string> {
  const candidates = ['version.txt', 'version.json', 'manifest.json', 'manifest.yaml', 'manifest.yml'];
  for (const candidate of candidates) {
    const full = path.join(stateRoot, candidate);
    try {
      const stat = await fs.stat(full);
      if (!stat.isFile()) continue;
      const content = await fs.readFile(full, 'utf8');
      if (candidate.endsWith('.txt')) {
        const value = content.trim();
        if (value) return value;
      }
      if (candidate.endsWith('.json')) {
        const parsed = JSON.parse(content);
        if (typeof parsed?.version === 'string' && parsed.version.trim()) return parsed.version.trim();
      }
      if (candidate.endsWith('.yaml') || candidate.endsWith('.yml')) {
        const parsed = yaml.load(content);
        if (parsed && typeof (parsed as Record<string, unknown>).version === 'string') {
          const value = (parsed as Record<string, unknown>).version as string;
          if (value.trim()) return value.trim();
        }
      }
    } catch {
      // ignore and continue
    }
  }
  return DEFAULT_GRAPH_VERSION;
}

export async function loadAidocGraph(stateRoot: string): Promise<{ graph: AidocGraph; graphVersion: string }> {
  const resolvedRoot = path.resolve(stateRoot);
  const files = await globby(['**/*.yaml', '**/*.yml'], { cwd: resolvedRoot, absolute: true, dot: false });
  const graph: AidocGraph = new Map();

  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b));

  // Parallel YAML reads with bounded concurrency for I/O overlap
  const parsed = await Promise.all(
    sortedFiles.map((filePath) =>
      ioLimiter(() => readYaml(filePath).then((data) => ({ filePath, data })))
    )
  );

  // Single-threaded graph insertion (Map is not concurrent)
  for (const { filePath, data } of parsed) {
    const slice = data[SLICE_KEY];
    if (!slice || typeof slice !== 'object') continue;

    const sliceObj = slice as Record<string, unknown>;
    const domain = typeof sliceObj.domain === 'string' ? sliceObj.domain : null;
    const type = typeof sliceObj.type === 'string' ? sliceObj.type : null;
    const id = typeof sliceObj.id === 'string' ? sliceObj.id : null;
    if (!domain || !type || !id) continue;

    const key = `${domain}/${type}/${id}`;
    if (graph.has(key)) continue;

    const relPath = path.relative(resolvedRoot, filePath);
    const segments = relPath.split(path.sep);
    const firstSeg = segments[0];
    const repo = (segments.length > 2 && !DOMAIN_DIRS.has(firstSeg))
      ? firstSeg
      : undefined;

    const sourceFilesRaw = Array.isArray(sliceObj.source_files) ? sliceObj.source_files : [];
    const sourceFiles = sourceFilesRaw.map((v) => String(v)).filter(Boolean);
    const references = normalizeEdges(sliceObj.references);
    const referencedBy = normalizeEdges(sliceObj.referenced_by);
    
    const tagsRaw = Array.isArray(sliceObj.tags) ? sliceObj.tags : [];
    const tags = tagsRaw.map((v) => String(v)).filter(Boolean);

    const nodePath = sourceFiles.length > 0 ? sourceFiles[0] : path.relative(process.cwd(), filePath);
    
    let sliceRange: Slice | undefined = (sliceObj.slice as Slice | undefined) || undefined;
    
    if (!sliceRange || (sliceRange.start === undefined && sliceRange.end === undefined)) {
      const provenance = data.provenance as Record<string, unknown> | undefined;
      if (provenance && typeof provenance.line === 'number') {
        const startLine = provenance.line;
        const endLine = typeof provenance.end_line === 'number' ? provenance.end_line : undefined;
        sliceRange = { start: startLine, end: endLine };
      }
    }
    
    const element = data.element as Record<string, unknown> | undefined;
    const source = typeof sliceObj.source === 'string' ? sliceObj.source : undefined;
    
    const description = 
      (element?.docstring as string) || 
      (element?.description as string) || 
      undefined;

    graph.set(key, {
      key,
      domain,
      type,
      id,
      sourceFiles,
      references,
      referencedBy,
      tags,
      path: nodePath,
      slice: sliceRange,
      element: element || undefined,
      source,
      description,
      repo,
    });
  }

  const graphVersion = await detectGraphVersion(resolvedRoot);
  return { graph, graphVersion };
}

