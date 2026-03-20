/**
 * Loads pre-generated architecture index / registry YAML from disk for evidence and tooling.
 *
 * Compiler authority: ste-runtime is the compiler of record for machine-consumable architecture
 * state. Do not treat these files as a substitute for compiling from canonical ADR YAML + source;
 * long term they must be outputs of the ste-runtime compiler, not a second authority.
 * See repo root COMPILER-AUTHORITY.md.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';

export type ArchitectureBundleStatus = 'valid' | 'degraded' | 'invalid';

export interface ArchitectureBundleArtifact<T = unknown> {
  path: string;
  exists: boolean;
  data?: T;
  error?: string;
}

export interface ArchitectureBundleManifestSummary {
  schemaVersion?: string;
  generatedDate?: string;
  adrCount?: number;
}

export interface ArchitectureBundleIndexSummary {
  schemaVersion?: string;
  architectureNamespace?: string;
  generatedAt?: string;
}

export interface ArchitectureBundleResult {
  status: ArchitectureBundleStatus;
  scopeRoot: string;
  requiredArtifacts: {
    architectureIndex: ArchitectureBundleArtifact<Record<string, unknown>>;
    manifest: ArchitectureBundleArtifact<Record<string, unknown>>;
    entityRegistry: ArchitectureBundleArtifact<unknown>;
    relationshipRegistry: ArchitectureBundleArtifact<unknown>;
    unresolvedRegistry: ArchitectureBundleArtifact<unknown>;
  };
  additiveArtifacts: {
    architectureGraph: ArchitectureBundleArtifact<unknown>;
    subsetRegistries: ArchitectureBundleArtifact<unknown>[];
  };
  manifest: ArchitectureBundleManifestSummary;
  index: ArchitectureBundleIndexSummary;
  warnings: string[];
  errors: string[];
}

const REQUIRED_INDEX_KEYS = {
  entityRegistry: 'entity_registry_path',
  relationshipRegistry: 'relationship_registry_path',
  unresolvedRegistry: 'unresolved_registry_path',
} as const;

const REQUIRED_DEFAULT_PATHS = {
  entityRegistry: 'adrs/index/entity-registry.yaml',
  relationshipRegistry: 'adrs/index/relationship-registry.yaml',
  unresolvedRegistry: 'adrs/index/unresolved-registry.yaml',
} as const;

const ARCHITECTURE_INDEX_PATH = 'adrs/index/architecture-index.yaml';
const MANIFEST_PATH = 'adrs/manifest.yaml';
const ARCHITECTURE_GRAPH_PATH = 'adrs/index/architecture-graph.yaml';
const LEGACY_ENTITY_REGISTRY_PATH = 'adrs/entities/registry.yaml';

async function readYamlArtifact<T = unknown>(absolutePath: string): Promise<ArchitectureBundleArtifact<T>> {
  try {
    const raw = await fs.readFile(absolutePath, 'utf8');
    const data = yaml.load(raw);
    if (data === undefined) {
      return {
        path: absolutePath,
        exists: true,
        error: 'YAML document is empty',
      };
    }
    return {
      path: absolutePath,
      exists: true,
      data: data as T,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') {
      return {
        path: absolutePath,
        exists: false,
        error: 'File not found',
      };
    }
    return {
      path: absolutePath,
      exists: true,
      error: message,
    };
  }
}

function getStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeArtifactPath(scopeRoot: string, relativePath: string): string {
  return path.resolve(scopeRoot, relativePath);
}

function resolveRequiredPath(
  scopeRoot: string,
  indexData: Record<string, unknown> | undefined,
  indexKey: string,
  fallbackPath: string,
  warnings: string[],
): string {
  const configuredPath = indexData ? getStringField(indexData, indexKey) : undefined;
  if (configuredPath) {
    return normalizeArtifactPath(scopeRoot, configuredPath);
  }
  warnings.push(`Architecture index did not declare ${indexKey}; falling back to ${fallbackPath}.`);
  return normalizeArtifactPath(scopeRoot, fallbackPath);
}

function summarizeManifest(manifestData: Record<string, unknown> | undefined): ArchitectureBundleManifestSummary {
  const adrs = manifestData?.adrs;
  return {
    schemaVersion: manifestData ? getStringField(manifestData, 'schema_version') : undefined,
    generatedDate: manifestData ? getStringField(manifestData, 'generated_date') : undefined,
    adrCount: Array.isArray(adrs) ? adrs.length : undefined,
  };
}

function summarizeIndex(indexData: Record<string, unknown> | undefined): ArchitectureBundleIndexSummary {
  return {
    schemaVersion: indexData ? getStringField(indexData, 'schema_version') : undefined,
    architectureNamespace: indexData ? getStringField(indexData, 'architecture_namespace') : undefined,
    generatedAt: indexData ? getStringField(indexData, 'generated_at') : undefined,
  };
}

export async function loadArchitectureBundle(scopeRoot: string): Promise<ArchitectureBundleResult> {
  const resolvedRoot = path.resolve(scopeRoot);
  const warnings: string[] = [];
  const errors: string[] = [];

  const architectureIndex = await readYamlArtifact<Record<string, unknown>>(
    normalizeArtifactPath(resolvedRoot, ARCHITECTURE_INDEX_PATH),
  );
  const manifest = await readYamlArtifact<Record<string, unknown>>(
    normalizeArtifactPath(resolvedRoot, MANIFEST_PATH),
  );

  const indexData =
    architectureIndex.data && typeof architectureIndex.data === 'object' && !Array.isArray(architectureIndex.data)
      ? architectureIndex.data
      : undefined;

  if (architectureIndex.error) {
    errors.push(`Required architecture index is unavailable: ${architectureIndex.error}.`);
  } else if (!indexData) {
    errors.push('Required architecture index is malformed.');
  }

  if (manifest.error) {
    errors.push(`Required manifest is unavailable: ${manifest.error}.`);
  } else if (!manifest.data || typeof manifest.data !== 'object' || Array.isArray(manifest.data)) {
    errors.push('Required manifest is malformed.');
  }

  const entityRegistryPath = resolveRequiredPath(
    resolvedRoot,
    indexData,
    REQUIRED_INDEX_KEYS.entityRegistry,
    REQUIRED_DEFAULT_PATHS.entityRegistry,
    warnings,
  );
  const relationshipRegistryPath = resolveRequiredPath(
    resolvedRoot,
    indexData,
    REQUIRED_INDEX_KEYS.relationshipRegistry,
    REQUIRED_DEFAULT_PATHS.relationshipRegistry,
    warnings,
  );
  const unresolvedRegistryPath = resolveRequiredPath(
    resolvedRoot,
    indexData,
    REQUIRED_INDEX_KEYS.unresolvedRegistry,
    REQUIRED_DEFAULT_PATHS.unresolvedRegistry,
    warnings,
  );

  const [entityRegistry, relationshipRegistry, unresolvedRegistry, architectureGraph] = await Promise.all([
    readYamlArtifact(entityRegistryPath),
    readYamlArtifact(relationshipRegistryPath),
    readYamlArtifact(unresolvedRegistryPath),
    readYamlArtifact(normalizeArtifactPath(resolvedRoot, ARCHITECTURE_GRAPH_PATH)),
  ]);

  const subsetRegistryArtifacts: ArchitectureBundleArtifact<unknown>[] = [];
  if (indexData) {
    for (const [key, value] of Object.entries(indexData)) {
      if (!key.endsWith('_registry_path')) continue;
      if (Object.values(REQUIRED_INDEX_KEYS).includes(key as (typeof REQUIRED_INDEX_KEYS)[keyof typeof REQUIRED_INDEX_KEYS])) {
        continue;
      }
      if (typeof value !== 'string' || !value.trim()) {
        warnings.push(`Architecture index declared ${key} without a usable path.`);
        continue;
      }
      subsetRegistryArtifacts.push(await readYamlArtifact(normalizeArtifactPath(resolvedRoot, value)));
    }
  }

  const requiredArtifacts = [entityRegistry, relationshipRegistry, unresolvedRegistry];
  for (const artifact of requiredArtifacts) {
    if (artifact.error) {
      errors.push(`Required bundle artifact ${path.relative(resolvedRoot, artifact.path)} is unavailable: ${artifact.error}.`);
    }
  }

  if (architectureGraph.error) {
    warnings.push(`Additive architecture graph unavailable: ${architectureGraph.error}.`);
  }
  for (const artifact of subsetRegistryArtifacts) {
    if (artifact.error) {
      warnings.push(`Additive subset registry ${path.relative(resolvedRoot, artifact.path)} unavailable: ${artifact.error}.`);
    }
  }

  const legacyRegistryPath = normalizeArtifactPath(resolvedRoot, LEGACY_ENTITY_REGISTRY_PATH);
  try {
    await fs.access(legacyRegistryPath);
    warnings.push('Legacy compatibility registry detected at adrs/entities/registry.yaml but intentionally not consulted.');
  } catch {
    // Compatibility surface absent; nothing to report.
  }

  const status: ArchitectureBundleStatus =
    errors.length > 0 ? 'invalid' : warnings.some((warning) => warning.startsWith('Additive ')) ? 'degraded' : 'valid';

  return {
    status,
    scopeRoot: resolvedRoot,
    requiredArtifacts: {
      architectureIndex,
      manifest,
      entityRegistry,
      relationshipRegistry,
      unresolvedRegistry,
    },
    additiveArtifacts: {
      architectureGraph,
      subsetRegistries: subsetRegistryArtifacts,
    },
    manifest: summarizeManifest(
      manifest.data && typeof manifest.data === 'object' && !Array.isArray(manifest.data) ? manifest.data : undefined,
    ),
    index: summarizeIndex(indexData),
    warnings,
    errors,
  };
}
