import fs from 'node:fs/promises';
import path from 'node:path';

import yaml from 'js-yaml';
import { globby } from 'globby';

import { PythonExtractor } from '../extractors/python/python-extractor.js';
import { log, warn } from '../utils/logger.js';
import { loadAidocGraph } from '../rss/graph-loader.js';
import {
  Aidoc,
  EndpointDoc,
  EntityDoc,
  ModuleDoc,
  ModuleNameLookup,
  buildEndpointDoc,
  buildEntityDoc,
  buildModuleDoc,
  buildModuleNameLookup,
  connectDocs,
  finalizeBidirectionalRefs,
  moduleNameFromRelPath,
  normalizeRelPath,
  yamlDump,
} from './common.js';
import { runFullRecon } from './full-recon.js';
import {
  ChangeSet,
  buildFullManifest,
  detectFileChanges,
  loadReconManifest,
  writeReconManifest,
} from '../watch/change-detector.js';

type AidocKey = string;

/**
 * Get path resolvers for different document types.
 * 
 * @param stateDir - Resolved absolute path to state directory
 */
function getDocTypeToPath(stateDir: string): Record<string, (id: string) => string> {
  return {
    'api:endpoint': (id) => path.resolve(stateDir, 'api', 'endpoints', `${id}.yaml`),
    'data:entity': (id) => path.resolve(stateDir, 'data', 'entities', `${id}.yaml`),
    'graph:module': (id) => path.resolve(stateDir, 'graph', 'internal', 'modules', `${id}.yaml`),
  };
}

function aidocKey(doc: Aidoc): AidocKey {
  return `${doc._slice.domain}:${doc._slice.type}:${doc._slice.id}`;
}

async function readAidocFile(filePath: string): Promise<Aidoc | null> {
  const raw = await fs.readFile(filePath, 'utf8');
  const data = yaml.load(raw) as Aidoc | null;
  if (!data || typeof data !== 'object') return null;
  return data as Aidoc;
}

async function loadExistingDocs(stateDir: string): Promise<Aidoc[]> {
  const files = await globby(['api/**/*.yaml', 'data/**/*.yaml', 'graph/**/*.yaml'], {
    cwd: stateDir,
    absolute: true,
    dot: false,
  });

  const docs: Aidoc[] = [];
  for (const filePath of files) {
    if (filePath.endsWith('index.yaml')) continue;
    const doc = await readAidocFile(filePath);
    if (doc && doc._slice && doc._slice.id) {
      docs.push(doc);
    }
  }
  return docs;
}

function docTargetPath(stateDir: string, doc: Aidoc): string {
  const docTypeToPath = getDocTypeToPath(stateDir);
  const resolver = docTypeToPath[`${doc._slice.domain}:${doc._slice.type}`];
  if (!resolver) {
    throw new Error(`Unsupported doc type for incremental recon: ${doc._slice.domain}:${doc._slice.type}`);
  }
  return resolver(doc._slice.id);
}

async function ensureParentDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeAidoc(stateDir: string, doc: Aidoc) {
  const target = docTargetPath(stateDir, doc);
  await ensureParentDir(target);
  await fs.writeFile(target, yamlDump(doc), 'utf8');
}

async function removeMissingDocs(stateDir: string, expectedPaths: Set<string>) {
  const files = await globby(['api/**/*.yaml', 'data/**/*.yaml', 'graph/**/*.yaml'], {
    cwd: stateDir,
    absolute: true,
    dot: false,
  });

  // Normalize expected paths to use forward slashes for comparison with globby results
  const normalizedExpected = new Set(Array.from(expectedPaths).map((p) => p.replace(/\\/g, '/')));

  for (const file of files) {
    const isIndex = file.endsWith('index.yaml');
    if (isIndex) continue;
    const normalizedFile = file.replace(/\\/g, '/');
    if (!normalizedExpected.has(normalizedFile)) {
      await fs.rm(file, { force: true });
    }
  }
}

function buildModuleLookupFromGraph(
  projectRoot: string,
  graphLookup: Map<string, { sourceFiles: string[]; id: string; domain: string; type: string }>,
): ModuleNameLookup {
  const lookup: ModuleNameLookup = new Map();
  for (const { id, sourceFiles, domain, type } of graphLookup.values()) {
    if (!(domain === 'graph' && type === 'module')) continue;
    const [first] = sourceFiles;
    if (!first) continue;
    const relPath = normalizeRelPath(projectRoot, path.resolve(projectRoot, first));
    const dotted = moduleNameFromRelPath(relPath);
    const base = path.posix.basename(relPath, '.py');
    lookup.set(dotted, id);
    lookup.set(base, id);
  }
  return lookup;
}

function createGraphLookup(
  projectRoot: string,
  graph: Map<string, { sourceFiles: string[]; id: string; domain: string; type: string }>,
) {
  const fileToKeys = new Map<string, AidocKey[]>();
  for (const node of graph.values()) {
    for (const file of node.sourceFiles) {
      const rel = normalizeRelPath(projectRoot, path.resolve(projectRoot, file));
      if (!fileToKeys.has(rel)) fileToKeys.set(rel, []);
      fileToKeys.get(rel)!.push(`${node.domain}:${node.type}:${node.id}`);
    }
  }
  return fileToKeys;
}

function selectAffectedKeys(
  changeSet: ChangeSet,
  graphFileMap: Map<string, AidocKey[]>,
  graph: Map<string, { referencedBy: { domain: string; type: string; id: string }[] }>,
): Set<AidocKey> {
  const keys = new Set<AidocKey>();
  const changedFiles = [...changeSet.added, ...changeSet.modified, ...changeSet.deleted];
  for (const rel of changedFiles) {
    const mapped = graphFileMap.get(rel) ?? [];
    mapped.forEach((k) => keys.add(k));
  }

  // include one-hop dependents that reference affected nodes
  for (const key of Array.from(keys)) {
    const node = graph.get(key);
    if (!node) continue;
    for (const ref of node.referencedBy ?? []) {
      keys.add(`${ref.domain}:${ref.type}:${ref.id}`);
    }
  }
  return keys;
}

function mergeDocs(existing: Aidoc[], replacements: Aidoc[], keysToRemove: Set<AidocKey>): Aidoc[] {
  const merged = new Map<AidocKey, Aidoc>();
  for (const doc of existing) {
    const key = aidocKey(doc);
    if (keysToRemove.has(key)) continue;
    merged.set(key, doc);
  }
  for (const doc of replacements) {
    merged.set(aidocKey(doc), doc);
  }
  return Array.from(merged.values());
}

function buildIndexes(docs: Aidoc[], timestamp: string) {
  const apiEndpoints = docs.filter((doc) => doc._slice.domain === 'api' && doc._slice.type === 'endpoint') as EndpointDoc[];
  const dataEntities = docs.filter((doc) => doc._slice.domain === 'data' && doc._slice.type === 'entity') as EntityDoc[];
  const graphModules = docs.filter((doc) => doc._slice.domain === 'graph' && doc._slice.type === 'module') as ModuleDoc[];

  const apiIndex = {
    _slice: {
      id: 'api-index',
      domain: 'api',
      type: 'index',
      source_files: [],
      references: [],
      referenced_by: [],
      tags: ['api'],
      extraction: {
        method: 'static',
        confidence: 'high',
        timestamp,
      },
    },
    endpoints: apiEndpoints
      .slice()
      .sort((a, b) => a._slice.id.localeCompare(b._slice.id))
      .map((ep) => ({
        id: ep._slice.id,
        method: ep.endpoint.method,
        path: ep.endpoint.path,
        summary: ep.endpoint.summary,
        domain_function: ep.endpoint.domain_function,
      })),
  };

  const dataIndex = {
    _slice: {
      id: 'data-index',
      domain: 'data',
      type: 'index',
      source_files: [],
      references: [],
      referenced_by: [],
      tags: ['data'],
      extraction: {
        method: 'static',
        confidence: 'high',
        timestamp,
      },
    },
    entities: dataEntities
      .slice()
      .sort((a, b) => a._slice.id.localeCompare(b._slice.id))
      .map((entity) => ({
        id: entity._slice.id,
        name: entity.entity.name,
        type: 'entity',
        table: '',
      })),
    dtos: [],
    enums: [],
  };

  const graphIndex = {
    _slice: {
      id: 'internal-graph-index',
      domain: 'graph',
      type: 'internal-index',
      source_files: [],
      references: [],
      referenced_by: [],
      tags: ['graph', 'internal'],
      extraction: {
        method: 'static',
        confidence: 'high',
        timestamp,
      },
    },
    modules: graphModules
      .slice()
      .sort((a, b) => a._slice.id.localeCompare(b._slice.id))
      .map((mod) => ({
        id: mod._slice.id,
        path: mod.module.path,
        layer: mod.module.layer,
      })),
    layers: [],
  };

  return { apiIndex, dataIndex, graphIndex };
}

async function writeIndexes(stateDir: string, timestamp: string, docs: Aidoc[]) {
  const { apiIndex, dataIndex, graphIndex } = buildIndexes(docs, timestamp);
  const apiIndexPath = path.resolve(stateDir, 'api', 'index.yaml');
  const dataIndexPath = path.resolve(stateDir, 'data', 'index.yaml');
  const graphIndexPath = path.resolve(stateDir, 'graph', 'internal', 'index.yaml');

  await ensureParentDir(apiIndexPath);
  await fs.writeFile(apiIndexPath, yamlDump(apiIndex), 'utf8');

  await ensureParentDir(dataIndexPath);
  await fs.writeFile(dataIndexPath, yamlDump(dataIndex), 'utf8');

  await ensureParentDir(graphIndexPath);
  await fs.writeFile(graphIndexPath, yamlDump(graphIndex), 'utf8');
}

async function writeDocs(stateDir: string, docs: Aidoc[]) {
  const expected = new Set<string>();
  for (const doc of docs) {
    const target = docTargetPath(stateDir, doc);
    expected.add(target);
    await writeAidoc(stateDir, doc);
  }
  if (expected.size > 0) {
    await removeMissingDocs(stateDir, expected);
  }
}

async function ensureStateExists(stateDir: string) {
  await fs.mkdir(stateDir, { recursive: true });
}

async function buildModuleLookupForIncremental(
  projectRoot: string,
  graphModuleLookup: ModuleNameLookup,
  structures: { filepath: string }[],
): Promise<ModuleNameLookup> {
  const combined: ModuleNameLookup = new Map(graphModuleLookup);
  const tempLookup = buildModuleNameLookup(structures as any, projectRoot);
  for (const [key, value] of tempLookup.entries()) {
    combined.set(key, value);
  }
  return combined;
}

function collectNewDocs(
  projectRoot: string,
  structures: any[],
  moduleLookup: ModuleNameLookup,
  timestamp: string,
): { modules: ModuleDoc[]; entities: EntityDoc[]; endpoints: EndpointDoc[] } {
  const moduleDocs = structures.map((structure) => buildModuleDoc(structure, projectRoot, timestamp, moduleLookup));
  const entityDocs = structures.flatMap((structure) =>
    structure.data_models.map((model: any) => buildEntityDoc(structure, model, projectRoot, timestamp)),
  );
  const endpointDocs = structures.flatMap((structure) =>
    structure.api_endpoints.map((ep: any) => buildEndpointDoc(structure, ep, projectRoot, timestamp)),
  );

  return { modules: moduleDocs, entities: entityDocs, endpoints: endpointDocs };
}

/**
 * Fallback to full recon.
 * 
 * @param projectRoot - Project root directory
 * @param stateDir - Resolved absolute path to state directory
 */
async function fallbackToFullRecon(projectRoot: string, stateDir: string): Promise<void> {
  await runFullRecon(projectRoot, stateDir);
  // For fallback full recon, use 'all' to capture both Python and TypeScript
  const manifest = await buildFullManifest(projectRoot, 'all');
  await writeReconManifest(stateDir, manifest);
}

export interface IncrementalReconOptions {
  /** Whether to fall back to full recon if manifest is missing */
  fallbackToFull?: boolean;
  /** 
   * State directory path. Can be relative (resolved against projectRoot) or absolute.
   * Defaults to '.ste/state' for legacy compatibility but should always be provided.
   */
  stateDir?: string;
}

/**
 * Run incremental RECON.
 * 
 * @param projectRoot - Project root directory
 * @param opts - Options including stateDir
 */
export async function runIncrementalRecon(projectRoot: string, opts?: IncrementalReconOptions): Promise<void> {
  const resolvedRoot = path.resolve(projectRoot);
  const fallback = opts?.fallbackToFull ?? true;
  
  // CRITICAL: Resolve stateDir properly
  // If not provided, warn and use legacy default (for backward compatibility)
  let stateDir: string;
  if (opts?.stateDir) {
    stateDir = path.isAbsolute(opts.stateDir) 
      ? opts.stateDir 
      : path.resolve(resolvedRoot, opts.stateDir);
  } else {
    warn('[recon] WARNING: runIncrementalRecon called without stateDir option.');
    warn('[recon] Using legacy default .ste/state which may cause boundary violations.');
    warn('[recon] Please provide stateDir option from config.');
    stateDir = path.resolve(resolvedRoot, '.ste', 'state');
  }

  const manifest = await loadReconManifest(stateDir);
  if (!manifest) {
    if (fallback) {
      log('[recon] No manifest found. Running full recon.');
      await fallbackToFullRecon(resolvedRoot, stateDir);
      return;
    }
    throw new Error('Recon manifest missing; run full recon first.');
  }

  const changeSet = await detectFileChanges(resolvedRoot, stateDir, manifest);
  const hasChanges = changeSet.added.length + changeSet.modified.length + changeSet.deleted.length > 0;
  if (!hasChanges) {
    log('[recon] No file changes detected. Skipping incremental recon.');
    await writeReconManifest(stateDir, changeSet.manifest);
    return;
  }

  await ensureStateExists(stateDir);

  let graphResult;
  try {
    graphResult = await loadAidocGraph(stateDir);
  } catch (error) {
    if (fallback) {
      warn('[recon] Failed to load current AI-DOC graph. Falling back to full recon.');
      await fallbackToFullRecon(resolvedRoot, stateDir);
      return;
    }
    throw error;
  }

  const graph = graphResult.graph;
  const graphLookup = new Map<string, { sourceFiles: string[]; id: string; domain: string; type: string; referencedBy: any[] }>();
  for (const [key, node] of graph.entries()) {
    graphLookup.set(key, {
      sourceFiles: node.sourceFiles,
      id: node.id,
      domain: node.domain,
      type: node.type,
      referencedBy: node.referencedBy ?? [],
    });
  }

  const fileToKeys = createGraphLookup(resolvedRoot, graphLookup);
  const affectedKeys = selectAffectedKeys(changeSet, fileToKeys, graph);

  const extractor = new PythonExtractor();
  const timestamp = new Date().toISOString();

  const targetFilesSet = new Set<string>();
  for (const rel of [...changeSet.added, ...changeSet.modified]) {
    targetFilesSet.add(path.resolve(resolvedRoot, rel));
  }
  for (const key of affectedKeys) {
    const node = graph.get(key);
    if (!node) continue;
    for (const file of node.sourceFiles) {
      const abs = path.resolve(resolvedRoot, file);
      targetFilesSet.add(abs);
    }
  }

  const targetFiles: string[] = [];
  for (const abs of targetFilesSet) {
    try {
      const stat = await fs.stat(abs);
      if (stat.isFile()) {
        targetFiles.push(abs);
      }
    } catch {
      // skip missing files (e.g., deletions)
    }
  }

  const extracted = await Promise.all(targetFiles.map((file) => extractor.extractFile(file)));
  const structures = extracted.flat();

  const graphModuleLookup = buildModuleLookupFromGraph(resolvedRoot, graphLookup);
  const moduleLookup = await buildModuleLookupForIncremental(resolvedRoot, graphModuleLookup, structures);

  const { modules, entities, endpoints } = collectNewDocs(resolvedRoot, structures, moduleLookup, timestamp);

  // Wire references using both existing and new modules for endpoint/entity handlers.
  const moduleIdByPath = new Map<string, string>();
  for (const [, node] of graph.entries()) {
    if (node.domain === 'graph' && node.type === 'module') {
      const [filePath] = node.sourceFiles;
      if (filePath) {
        const rel = normalizeRelPath(resolvedRoot, path.resolve(resolvedRoot, filePath));
        moduleIdByPath.set(rel, node.id);
      }
    }
  }
  for (const mod of modules) {
    moduleIdByPath.set(mod.module.path, mod._slice.id);
  }
  connectDocs(modules, endpoints, entities, moduleIdByPath);

  const newDocs: Aidoc[] = [...modules, ...entities, ...endpoints];

  const existingDocs = await loadExistingDocs(stateDir);

  const keysToRemove = new Set<AidocKey>();
  // Remove docs whose source files were deleted
  for (const rel of changeSet.deleted) {
    const keys = fileToKeys.get(rel) ?? [];
    keys.forEach((k) => keysToRemove.add(k));
  }
  // Remove docs we have replacements for (changed/added)
  for (const doc of newDocs) {
    keysToRemove.add(aidocKey(doc));
  }

  const mergedDocs = mergeDocs(existingDocs, newDocs, keysToRemove);

  finalizeBidirectionalRefs(mergedDocs);
  await writeDocs(stateDir, mergedDocs);
  await writeIndexes(stateDir, timestamp, mergedDocs);
  await writeReconManifest(stateDir, changeSet.manifest);

  log(
    `[recon] Incremental recon complete. Added: ${changeSet.added.length}, Modified: ${changeSet.modified.length}, Deleted: ${changeSet.deleted.length}`,
  );
}
