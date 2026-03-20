import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ArchitectureBundleResult } from '../discovery/architecture-bundle.js';

export type ArchitectureEvidenceFreshnessStatus = 'current' | 'stale-unknown' | 'stale-confirmed';

export interface ArchitectureEvidenceFreshnessResult {
  status: ArchitectureEvidenceFreshnessStatus;
  lastReconciled?: string;
  warnings: string[];
  errors: string[];
  sourceFiles: string[];
}

const ADRS_DIR = 'adrs';
const DERIVED_DIRECTORY_PREFIXES = [
  'adrs/index/',
  'adrs/rendered/',
  'adrs/entities/',
] as const;
const DERIVED_FILE_PATHS = new Set([
  'adrs/manifest.yaml',
]);

function normalizeRelativePath(scopeRoot: string, filePath: string): string {
  return path.relative(scopeRoot, filePath).replace(/\\/g, '/');
}

function isCanonicalAdrSource(relativePath: string): boolean {
  if (!relativePath.startsWith('adrs/')) {
    return false;
  }
  if (!relativePath.endsWith('.yaml')) {
    return false;
  }
  if (DERIVED_FILE_PATHS.has(relativePath)) {
    return false;
  }
  return !DERIVED_DIRECTORY_PREFIXES.some(prefix => relativePath.startsWith(prefix));
}

async function walkYamlFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkYamlFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.yaml')) {
      results.push(fullPath);
    }
  }

  return results;
}

function resolveBundleTimestamp(
  bundle: Pick<ArchitectureBundleResult, 'index' | 'manifest'>,
): { timestamp: Date | null; source: 'index' | 'manifest' | null } {
  const indexGeneratedAt = bundle.index.generatedAt;
  if (typeof indexGeneratedAt === 'string') {
    const timestamp = new Date(indexGeneratedAt);
    if (!Number.isNaN(timestamp.getTime())) {
      return { timestamp, source: 'index' };
    }
  }

  const manifestGeneratedDate = bundle.manifest.generatedDate;
  if (typeof manifestGeneratedDate === 'string') {
    const timestamp = new Date(manifestGeneratedDate);
    if (!Number.isNaN(timestamp.getTime())) {
      return { timestamp, source: 'manifest' };
    }
  }

  return { timestamp: null, source: null };
}

export async function resolveArchitectureEvidenceFreshness(
  scopeRoot: string,
  bundle: Pick<ArchitectureBundleResult, 'scopeRoot' | 'index' | 'manifest'>,
): Promise<ArchitectureEvidenceFreshnessResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const resolvedRoot = path.resolve(scopeRoot);
  const adrsRoot = path.join(resolvedRoot, ADRS_DIR);

  const { timestamp: bundleTimestamp, source } = resolveBundleTimestamp(bundle);
  if (!bundleTimestamp) {
    warnings.push('Architecture evidence freshness is stale-unknown because no valid bundle timestamp was available.');
    return {
      status: 'stale-unknown',
      warnings,
      errors,
      sourceFiles: [],
    };
  }

  let yamlFiles: string[];
  try {
    yamlFiles = await walkYamlFiles(adrsRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Architecture evidence freshness is stale-unknown because source discovery failed: ${message}`);
    return {
      status: 'stale-unknown',
      lastReconciled: bundleTimestamp.toISOString(),
      warnings,
      errors,
      sourceFiles: [],
    };
  }

  const sourceFiles = yamlFiles
    .map(filePath => path.resolve(filePath))
    .filter(filePath => isCanonicalAdrSource(normalizeRelativePath(resolvedRoot, filePath)));

  if (sourceFiles.length === 0) {
    warnings.push('Architecture evidence freshness is stale-unknown because no canonical ADR source files were found.');
    return {
      status: 'stale-unknown',
      lastReconciled: bundleTimestamp.toISOString(),
      warnings,
      errors,
      sourceFiles: [],
    };
  }

  try {
    for (const sourceFile of sourceFiles) {
      const stat = await fs.stat(sourceFile);
      if (stat.mtime.getTime() > bundleTimestamp.getTime()) {
        return {
          status: 'stale-confirmed',
          lastReconciled: bundleTimestamp.toISOString(),
          warnings,
          errors,
          sourceFiles,
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Architecture evidence freshness is stale-unknown because source timestamps could not be read: ${message}`);
    return {
      status: 'stale-unknown',
      lastReconciled: bundleTimestamp.toISOString(),
      warnings,
      errors,
      sourceFiles,
    };
  }

  if (source === 'manifest' && bundle.index.generatedAt) {
    warnings.push('Architecture evidence freshness used manifest.generatedDate because architecture-index.generatedAt was invalid.');
  }

  return {
    status: 'current',
    lastReconciled: bundleTimestamp.toISOString(),
    warnings,
    errors,
    sourceFiles,
  };
}
