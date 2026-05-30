import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

import { entityUri, parseSourceUri, workspaceUri, type LineRange } from './source-uri.js';
import { enforces_invariant, implements_adr } from '../architecture/intent-decorators.js';

export interface SourceLocator {
  entity_uri: string;
  entity_id: string;
  entity_type: string;
  source_uri: string;
  repo: string;
  repo_path?: string;
  path: string;
  line_range?: LineRange;
  source_hash?: string;
  graph_snapshot_hash: string;
  canonical: boolean;
  authority: string;
  provenance_classification: 'explicit' | 'derived' | 'heuristic';
  generated_from?: string;
}

export interface SourceLocatorRegistry {
  schema_version: '1.0';
  generated_by: string;
  generated_at: string;
  workspace_manifest_hash: string;
  graph_snapshot_hash: string;
  locator_registry_hash?: string;
  locators: SourceLocator[];
}

export interface EmitSourceLocatorRegistryOptions {
  outputDir: string;
  workspaceRoot: string;
  repos: Array<{ name: string; path: string }>;
  graphSnapshotHash: string;
  workspaceManifestHash: string;
  generatedAt: string;
  generatedBy: string;
}

interface SliceNode {
  id?: string;
  type?: string;
  provenance?: { source_path?: string; source_ref?: string; repo?: string };
  source_uri?: string;
  entity_uri?: string;
  source_hash?: string;
}

interface SliceDoc {
  repo?: string;
  nodes?: SliceNode[];
}

interface ArchitectureEntityRegistry {
  entities?: Array<{
    id?: string;
    entity_type?: string;
    canonical_source?: {
      artifact_path?: string;
      source_ref?: string;
      source_type?: string;
    };
  }>;
}

function sha256(text: string | Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

export async function computeFileHash(filePath: string): Promise<string | undefined> {
  try {
    return sha256(await fs.readFile(filePath));
  } catch {
    return undefined;
  }
}

export async function hashFileIfPresent(filePath: string): Promise<string | undefined> {
  return computeFileHash(filePath);
}

function registryHash(registry: SourceLocatorRegistry): string {
  const comparable = { ...registry, locator_registry_hash: undefined };
  return sha256(yaml.dump(comparable, { lineWidth: 120, noRefs: true }));
}

function repoPathMap(options: EmitSourceLocatorRegistryOptions): Map<string, string> {
  const repos = new Map<string, string>();
  for (const repo of options.repos) {
    repos.set(repo.name, path.resolve(options.workspaceRoot, repo.path));
  }
  return repos;
}

function inferAuthority(repo: string, entityType: string): string {
  if (entityType.toLowerCase() === 'adr') return 'adr-architecture-kit';
  return repo;
}

function locatorForNode(
  node: SliceNode,
  repo: string,
  repoPath: string | undefined,
  graphSnapshotHash: string,
  sourceHash?: string,
): SourceLocator | null {
  if (!node.id || !node.type) return null;
  const sourcePath = node.provenance?.source_path;
  if (!sourcePath || sourcePath === '.') return null;
  let sourceUri: string;
  try {
    sourceUri = node.source_uri ?? workspaceUri(repo, sourcePath);
  } catch {
    return null;
  }
  return {
    entity_uri: node.entity_uri ?? entityUri(node.id),
    entity_id: node.id,
    entity_type: node.type,
    source_uri: sourceUri,
    repo,
    repo_path: repoPath?.replace(/\\/g, '/'),
    path: sourcePath.replace(/\\/g, '/'),
    source_hash: node.source_hash ?? sourceHash,
    graph_snapshot_hash: graphSnapshotHash,
    canonical: true,
    authority: inferAuthority(repo, node.type),
    provenance_classification: 'derived',
    generated_from: 'workspace-slice',
  };
}

async function readSliceFiles(outputDir: string): Promise<Array<{ file: string; doc: SliceDoc }>> {
  const slicesDir = path.join(outputDir, 'slices');
  let entries: string[];
  try {
    entries = await fs.readdir(slicesDir);
  } catch {
    return [];
  }
  const slices: Array<{ file: string; doc: SliceDoc }> = [];
  for (const entry of entries.filter(e => e.endsWith('.yaml')).sort()) {
    const file = path.join(slicesDir, entry);
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const doc = yaml.load(raw) as SliceDoc | null;
      if (doc) slices.push({ file, doc });
    } catch {
      /* skip unreadable slices */
    }
  }
  return slices;
}

async function locatorsFromArchitectureRegistry(
  repo: string,
  repoRoot: string,
  graphSnapshotHash: string,
): Promise<SourceLocator[]> {
  const registryPath = path.join(repoRoot, 'adrs', 'index', 'entity-registry.yaml');
  let doc: ArchitectureEntityRegistry | null = null;
  try {
    doc = yaml.load(await fs.readFile(registryPath, 'utf-8')) as ArchitectureEntityRegistry | null;
  } catch {
    return [];
  }
  if (!doc || !Array.isArray(doc.entities)) return [];

  const locators: SourceLocator[] = [];
  for (const entity of doc.entities) {
    if (!entity.id || !entity.entity_type) continue;
    const sourcePath = entity.canonical_source?.artifact_path;
    if (!sourcePath) continue;
    try {
      const sourceHash = await computeFileHash(path.resolve(repoRoot, sourcePath));
      locators.push({
        entity_uri: entityUri(entity.id),
        entity_id: entity.id,
        entity_type: entity.entity_type,
        source_uri: workspaceUri(repo, sourcePath),
        repo,
        repo_path: repoRoot.replace(/\\/g, '/'),
        path: sourcePath.replace(/\\/g, '/'),
        source_hash: sourceHash,
        graph_snapshot_hash: graphSnapshotHash,
        canonical: true,
        authority: inferAuthority(repo, entity.entity_type),
        provenance_classification: 'explicit',
        generated_from: 'architecture-entity-registry',
      });
    } catch {
      /* skip non-portable registry entries */
    }
  }
  return locators;
}

export const emitSourceLocatorRegistry: (
  options: EmitSourceLocatorRegistryOptions,
) => Promise<{ registry: SourceLocatorRegistry; registryPath: string }> = implements_adr(
  'ADR-L-0020',
)(enforces_invariant('INV-0027', 'INV-0029')(async function emitSourceLocatorRegistry(
  options: EmitSourceLocatorRegistryOptions,
): Promise<{ registry: SourceLocatorRegistry; registryPath: string }> {
  const repos = repoPathMap(options);
  const locators: SourceLocator[] = [];
  const hashCache = new Map<string, string | undefined>();

  for (const { doc } of await readSliceFiles(options.outputDir)) {
    const repo = doc.repo;
    if (!repo || !Array.isArray(doc.nodes)) continue;
    const repoRoot = repos.get(repo);
    for (const node of doc.nodes) {
      const sourcePath = node.provenance?.source_path;
      let fileHash: string | undefined;
      if (repoRoot && sourcePath && sourcePath !== '.') {
        const fullPath = path.resolve(repoRoot, sourcePath);
        if (!hashCache.has(fullPath)) {
          hashCache.set(fullPath, await computeFileHash(fullPath));
        }
        fileHash = hashCache.get(fullPath);
      }
      const locator = locatorForNode(node, repo, repos.get(repo), options.graphSnapshotHash, fileHash);
      if (locator) locators.push(locator);
    }
  }

  for (const [repo, repoRoot] of repos) {
    locators.push(...await locatorsFromArchitectureRegistry(repo, repoRoot, options.graphSnapshotHash));
  }

  const deduped = new Map<string, SourceLocator>();
  for (const locator of locators) {
    const key = `${locator.entity_uri}\0${locator.source_uri}`;
    if (!deduped.has(key)) {
      deduped.set(key, locator);
    }
  }
  const sortedLocators = [...deduped.values()]
    .sort((a, b) => a.entity_uri.localeCompare(b.entity_uri) || a.source_uri.localeCompare(b.source_uri));
  const registry: SourceLocatorRegistry = {
    schema_version: '1.0',
    generated_by: options.generatedBy,
    generated_at: options.generatedAt,
    workspace_manifest_hash: options.workspaceManifestHash,
    graph_snapshot_hash: options.graphSnapshotHash,
    locators: sortedLocators,
  };
  registry.locator_registry_hash = registryHash(registry);

  const registryPath = path.join(options.outputDir, 'source-locator-registry.yaml');
  await fs.writeFile(registryPath, yaml.dump(registry, { lineWidth: 120, noRefs: true }), 'utf-8');
  return { registry, registryPath };
}));

export async function loadSourceLocatorRegistry(outputDir: string): Promise<SourceLocatorRegistry> {
  const raw = await fs.readFile(path.join(outputDir, 'source-locator-registry.yaml'), 'utf-8');
  return yaml.load(raw) as SourceLocatorRegistry;
}

export function resolveLocator(
  registry: SourceLocatorRegistry,
  entityOrUri: string,
): SourceLocator | undefined {
  const parsed = parseSourceUri(entityOrUri);
  switch (parsed.kind) {
    case 'entity':
      return registry.locators.find(l => l.entity_id === parsed.entityId || l.entity_uri === entityOrUri);
    case 'workspace':
      return registry.locators.find(l => l.repo === parsed.repo && l.path === parsed.path);
    case 'adr':
      return registry.locators.find(l => l.entity_id === parsed.adrId || l.source_uri.toLowerCase().includes(parsed.adrId.toLowerCase()));
    case 'decision':
      return registry.locators.find(l => l.entity_id === parsed.decisionId || l.entity_id.includes(parsed.decisionId));
    case 'graph':
      return registry.locators.find(l => l.entity_id === parsed.entityId && l.graph_snapshot_hash === parsed.graphSnapshotHash);
    case 'projection':
      return undefined;
  }
}

export async function resolveLocatorFreshness(
  registry: SourceLocatorRegistry,
  locator: SourceLocator,
  workspaceRoot: string,
  repos: Array<{ name: string; path: string }>,
): Promise<{ status: 'resolved' | 'missing_source' | 'hash_mismatch'; current_hash?: string }> {
  const repo = repos.find(r => r.name === locator.repo);
  if (!repo) return { status: 'missing_source' };
  const currentHash = await computeFileHash(path.resolve(workspaceRoot, repo.path, locator.path));
  if (!currentHash) return { status: 'missing_source' };
  if (locator.source_hash && currentHash !== locator.source_hash) {
    return { status: 'hash_mismatch', current_hash: currentHash };
  }
  return { status: 'resolved', current_hash: currentHash };
}
