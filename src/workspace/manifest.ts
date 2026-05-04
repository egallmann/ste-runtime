/**
 * Workspace manifest parsing and per-repository RECON configuration.
 * Used when scanning a multi-repository workspace from a manifest file (workspace.yaml).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';

import {
  BUILTIN_IGNORE_PATTERNS,
  detectLanguages,
  type ResolvedConfig,
  type SupportedLanguage,
} from '../config/index.js';
import { toPosixPath } from '../utils/paths.js';

const INFRA_SOURCE_SUBDIRS = [
  'cloudformation',
  'infrastructure',
  'cfn_templates',
  'sam',
  'cfn',
] as const;

const LANG_MAP: Record<string, SupportedLanguage[]> = {
  dotnet: ['cloudformation', 'json'],
  csharp: ['cloudformation', 'json'],
  python: ['python', 'cloudformation', 'json'],
  node: ['typescript', 'json'],
  typescript: ['typescript', 'json'],
  java: ['cloudformation', 'json'],
};

export const RepoEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  kind: z.string().default('service'),
  lang: z.string().default('unknown'),
});

export const ExternalSystemEntrySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['partner-api', 'vendor-service', 'saas', 'unknown']).default('unknown'),
  url_patterns: z.array(z.string()).optional(),
});

export const WorkspaceManifestSchema = z.object({
  schema_version: z.string(),
  output_dir: z.string().optional().default('.ste-workspace/'),
  seed_scope: z.array(z.string()).optional(),
  repos: z.array(RepoEntrySchema).min(1),
  external_systems: z.array(ExternalSystemEntrySchema).optional().default([]),
});

export type RepoEntry = z.infer<typeof RepoEntrySchema>;
export type ExternalSystemEntry = z.infer<typeof ExternalSystemEntrySchema>;
export type WorkspaceManifest = z.infer<typeof WorkspaceManifestSchema>;

export interface ParsedWorkspaceLocation {
  manifest: WorkspaceManifest;
  workspaceRoot: string;
  manifestFile: string;
}

const WORKSPACE_MANIFEST_FILENAMES = ['workspace.yaml', 'workspace.yml'] as const;

/**
 * Walk upward from {@code startDir} (typically process.cwd()) and return the first directory
 * that contains a workspace manifest file. Agnostic to repo layout — enables `recon --workspace`
 * without hardcoded paths.
 */
export async function discoverWorkspaceRoot(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    for (const name of WORKSPACE_MANIFEST_FILENAMES) {
      const candidate = path.join(dir, name);
      try {
        const st = await fs.stat(candidate);
        if (st.isFile()) {
          return dir;
        }
      } catch {
        /* missing */
      }
    }
    if (dir === root) {
      return null;
    }
    dir = path.dirname(dir);
  }
}

function dedupeLanguages(langs: SupportedLanguage[]): SupportedLanguage[] {
  return [...new Set(langs)];
}

/**
 * Map manifest `lang` labels to RECON {@link SupportedLanguage} values.
 * Unknown labels fall back to {@link detectLanguages} against the repository root.
 */
export async function mapRepoLang(
  lang: string,
  projectRoot: string,
): Promise<SupportedLanguage[]> {
  const key = lang.trim().toLowerCase();
  const mapped = LANG_MAP[key];
  if (mapped && mapped.length > 0) {
    return dedupeLanguages(mapped);
  }
  return detectLanguages(projectRoot);
}

async function expandSourceDirsForLang(projectRoot: string, lang: string): Promise<string[]> {
  const dirs = new Set<string>(['.']);
  const lower = lang.trim().toLowerCase();
  if (lower === 'dotnet' || lower === 'csharp') {
    for (const d of INFRA_SOURCE_SUBDIRS) {
      try {
        const st = await fs.stat(path.join(projectRoot, d));
        if (st.isDirectory()) {
          dirs.add(d);
        }
      } catch {
        /* directory missing */
      }
    }
  }
  return [...dirs];
}

function defaultWatchdog() {
  return {
    enabled: false,
    debounceMs: 500,
    aiEditDebounceMs: 2000,
    syntaxValidation: true,
    transactionDetection: true,
    stabilityCheckMs: 100,
    patterns: ['**/*.py', '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    ignore: ['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build'],
    fullReconciliationInterval: 0,
    fallbackPolling: false,
    pollingInterval: 5000,
  };
}

function defaultMcp(): ResolvedConfig['mcp'] {
  return {
    transport: 'stdio',
    logLevel: 'info',
  };
}

/**
 * Resolve workspace.yaml path: accepts a directory (containing workspace.yaml) or a direct file path.
 */
export async function parseWorkspaceManifest(workspacePathInput: string): Promise<ParsedWorkspaceLocation> {
  const resolved = path.resolve(workspacePathInput);
  let manifestFile: string;
  let workspaceRoot: string;
  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) {
    workspaceRoot = resolved;
    manifestFile = path.join(workspaceRoot, 'workspace.yaml');
  } else {
    manifestFile = resolved;
    workspaceRoot = path.dirname(resolved);
  }
  let raw: string;
  try {
    raw = await fs.readFile(manifestFile, 'utf-8');
  } catch (e) {
    throw new Error(`workspace manifest not found: ${manifestFile}`, { cause: e });
  }
  let data: unknown;
  try {
    data = yaml.load(raw);
  } catch (e) {
    throw new Error(`workspace manifest YAML parse failed: ${manifestFile}`, { cause: e });
  }
  const parsed = WorkspaceManifestSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`workspace manifest validation failed: ${parsed.error.message}`);
  }
  return { manifest: parsed.data, workspaceRoot, manifestFile };
}

/**
 * Resolve a repository entry to an absolute path and verify it exists as a directory.
 */
export async function resolveRepoPath(workspaceRoot: string, repo: RepoEntry): Promise<string> {
  const abs = path.resolve(workspaceRoot, repo.path);
  const st = await fs.stat(abs);
  if (!st.isDirectory()) {
    throw new Error(`workspace repo path is not a directory: ${abs} (repo ${repo.name})`);
  }
  return abs;
}

/**
 * Build {@link ResolvedConfig} for one repository in workspace mode.
 * State is written under {@code <workspaceRoot>/<outputDir>/state/<repo.name>/} (Invariant 2: never under the scanned repo tree).
 */
export async function buildPerRepoConfig(
  runtimeDir: string,
  repo: RepoEntry,
  workspaceRoot: string,
  outputDir: string,
): Promise<ResolvedConfig> {
  const resolvedRuntime = path.resolve(runtimeDir);
  const projectRoot = path.resolve(workspaceRoot, repo.path);
  const normalizedOutput = outputDir.replace(/[/\\]+$/, '') || '.ste-workspace';
  const stateAbsPath = path.resolve(workspaceRoot, normalizedOutput, 'state', repo.name);
  const repoAbsPath = path.resolve(projectRoot);

  if (stateAbsPath === repoAbsPath || stateAbsPath.startsWith(repoAbsPath + path.sep)) {
    throw new Error(
      `Invariant 2 violation: resolved state directory would be inside scanned repo (${stateAbsPath} under ${repoAbsPath})`,
    );
  }

  const relativeStateDir = toPosixPath(path.relative(repoAbsPath, stateAbsPath));
  const resolvedViaJoin = path.resolve(repoAbsPath, relativeStateDir);
  if (resolvedViaJoin !== stateAbsPath) {
    throw new Error(
      `Invariant 2 check failed: state path resolution mismatch (expected ${stateAbsPath}, got ${resolvedViaJoin})`,
    );
  }

  const languages = await mapRepoLang(repo.lang, projectRoot);
  const sourceDirs = await expandSourceDirsForLang(projectRoot, repo.lang);

  const stateDir = relativeStateDir;

  const rss: ResolvedConfig['rss'] = {
    stateRoot: stateDir,
    defaultDepth: 2,
    maxResults: 50,
  };

  return {
    projectRoot: repoAbsPath,
    runtimeDir: resolvedRuntime,
    languages,
    sourceDirs,
    ignorePatterns: [...BUILTIN_IGNORE_PATTERNS],
    stateDir,
    jsonPatterns: {},
    angularPatterns: {},
    cssPatterns: {},
    watchdog: defaultWatchdog(),
    mcp: defaultMcp(),
    rss,
  };
}
