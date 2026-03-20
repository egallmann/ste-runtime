import { promises as fs } from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';

import {
  type Completeness,
  type DiscoveryProvenance,
  type CanonicalSource,
  GENERATOR_ID,
} from './types.js';

export async function discoverSourceFiles(adrDir: string): Promise<{
  logical: string[];
  physical: string[];
  invariants: string[];
}> {
  const logicalDir = path.join(adrDir, 'logical');
  const physicalDirs = ['physical', 'physical-system', 'physical-component'].map((d) => path.join(adrDir, d));
  const invDir = path.join(adrDir, 'invariants');

  const logical = (await pathExists(logicalDir))
    ? (await listYamlFiles(logicalDir)).sort()
    : [];
  const physical: string[] = [];
  for (const dir of physicalDirs) {
    if (await pathExists(dir)) {
      physical.push(...(await listYamlFiles(dir)));
    }
  }
  const dedupedPhysical = [...new Set(physical.map((p) => path.resolve(p)))].sort().map((p) => p);
  const invariants = (await pathExists(invDir)) ? (await listYamlFiles(invDir)).sort() : [];

  return { logical, physical: dedupedPhysical, invariants };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listYamlFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.yaml'))
    .map((e) => path.join(dir, e.name))
    .sort();
}

export function scopeRelativePath(scopeRoot: string, filePath: string): string {
  return path.relative(scopeRoot, path.resolve(filePath)).split(path.sep).join('/');
}

export async function loadYamlFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf8');
  const data = yaml.load(raw);
  if (data === undefined || data === null) {
    throw new Error(`Empty YAML: ${filePath}`);
  }
  if (typeof data !== 'object') {
    throw new Error(`Expected YAML mapping: ${filePath}`);
  }
  return data;
}

export async function loadNamespace(scopeRoot: string): Promise<string> {
  const projectPath = path.join(scopeRoot, 'PROJECT.yaml');
  const data = (await loadYamlFile(projectPath)) as Record<string, unknown>;
  const arch = (data.architecture_documentation as Record<string, unknown> | undefined) ?? {};
  const ns = arch.architecture_namespace;
  if (typeof ns !== 'string' || !ns.trim()) {
    throw new Error('PROJECT.yaml is missing architecture_documentation.architecture_namespace');
  }
  return ns.trim();
}

export function makeProvenance(
  sourceType: string,
  sourceRef: string,
  phase: string,
  classification: DiscoveryProvenance['classification'],
): DiscoveryProvenance {
  return {
    source_type: sourceType,
    source_ref: sourceRef,
    extraction_phase: phase,
    classification,
    generator: GENERATOR_ID,
  };
}

export function makeCanonical(sourceType: string, sourceRef: string, artifactPath: string): CanonicalSource {
  return { source_type: sourceType, source_ref: sourceRef, artifact_path: artifactPath };
}

export function scoreCompleteness(missing?: string[]): Completeness {
  const m = missing ?? [];
  return { status: m.length === 0 ? 'complete' : 'partial', missing_fields: m };
}

export function summarizeText(text: string, limit = 220): string {
  return String(text ?? '')
    .split(/\s+/)
    .join(' ')
    .slice(0, limit);
}

export function classifyAuthorGap(gap: Record<string, unknown>): string {
  const ctx = String(gap.context ?? '').toLowerCase();
  if (ctx.includes('classification: deferred')) return 'author_declared_deferred_gap';
  if (ctx.includes('classification: resolved')) return 'author_declared_resolved_gap';
  return 'author_declared_real_gap';
}

export function systemEntityId(adrId: string): string {
  return `SYS-${adrId.replace('ADR-PS-', '')}`;
}

export function relationshipId(relationshipType: string, fromId: string, toId: string): string {
  return `${relationshipType}:${fromId}:${toId}`;
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

export function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t || undefined;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

export function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
