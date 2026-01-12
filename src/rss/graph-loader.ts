import { promises as fs } from 'node:fs';
import path from 'node:path';

import { globby } from 'globby';
import yaml from 'js-yaml';

import { DEFAULT_GRAPH_VERSION, Slice } from './schema.js';

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
};

export type AidocGraph = Map<string, AidocNode>;

const SLICE_KEY = '_slice';

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
  for (const filePath of sortedFiles) {
    const data = await readYaml(filePath);
    const slice = data[SLICE_KEY];
    if (!slice || typeof slice !== 'object') continue;

    const sliceObj = slice as Record<string, unknown>;
    const domain = typeof sliceObj.domain === 'string' ? sliceObj.domain : null;
    const type = typeof sliceObj.type === 'string' ? sliceObj.type : null;
    const id = typeof sliceObj.id === 'string' ? sliceObj.id : null;
    if (!domain || !type || !id) continue;

    const key = `${domain}/${type}/${id}`;
    if (graph.has(key)) continue;

    const sourceFilesRaw = Array.isArray(sliceObj.source_files) ? sliceObj.source_files : [];
    const sourceFiles = sourceFilesRaw.map((v) => String(v)).filter(Boolean);
    const references = normalizeEdges(sliceObj.references);
    const referencedBy = normalizeEdges(sliceObj.referenced_by);
    
    // Extract tags from _slice.tags array
    const tagsRaw = Array.isArray(sliceObj.tags) ? sliceObj.tags : [];
    const tags = tagsRaw.map((v) => String(v)).filter(Boolean);

    const nodePath = sourceFiles.length > 0 ? sourceFiles[0] : path.relative(process.cwd(), filePath);
    
    // Extract slice line range - prefer explicit slice.start/end, fallback to provenance.line
    let sliceRange: Slice | undefined = (sliceObj.slice as Slice | undefined) || undefined;
    
    // If no explicit slice range, try to extract from provenance
    if (!sliceRange || (sliceRange.start === undefined && sliceRange.end === undefined)) {
      const provenance = data.provenance as Record<string, unknown> | undefined;
      if (provenance && typeof provenance.line === 'number') {
        const startLine = provenance.line;
        // For functions/classes, estimate end line based on element structure if available
        // For now, set start only - end can be determined by next slice or EOF
        sliceRange = { start: startLine };
      }
    }
    
    // Extract element metadata (contains function/class details including docstrings)
    const element = data.element as Record<string, unknown> | undefined;

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
    });
  }

  const graphVersion = await detectGraphVersion(resolvedRoot);
  return { graph, graphVersion };
}

