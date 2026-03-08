import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { globby } from 'globby';

/**
 * Get the manifest file path within a state directory.
 * 
 * CRITICAL: The manifest MUST be written inside the stateDir, not relative to projectRoot.
 * This ensures state is always contained within the configured location.
 * 
 * @param stateDir - Resolved absolute path to state directory (e.g., /path/to/ste-runtime/.ste/state)
 */
function getManifestPath(stateDir: string): string {
  return path.join(stateDir, 'manifest', 'recon-manifest.json');
}

const PYTHON_PATTERNS = [
  '**/*.py',
  '!**/venv/**',
  '!**/.venv/**',
  '!**/node_modules/**',
  '!**/.git/**',
  '!**/.ste/**',
];

const TYPESCRIPT_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '!**/node_modules/**',
  '!**/dist/**',
  '!**/build/**',
  '!**/.git/**',
  '!**/.ste/**',
  '!**/.ste-self/**',
];

const ALL_SOURCE_PATTERNS = [
  ...PYTHON_PATTERNS,
  ...TYPESCRIPT_PATTERNS.filter(p => !PYTHON_PATTERNS.includes(p)),
];

export type FileFingerprint = {
  path: string;
  mtimeMs: number;
  size: number;
  hash: string;
};

export type ReconManifest = {
  version: 1;
  generatedAt: string;
  files: Record<string, FileFingerprint>;
};

export type ChangeSet = {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
  manifest: ReconManifest;
  fingerprints: Record<string, FileFingerprint>;
};

const toPosix = (value: string) => value.replace(/\\/g, '/');

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const file = await fs.open(filePath, 'r');
  try {
    const stream = file.createReadStream();
    for await (const chunk of stream) {
      hash.update(chunk);
    }
  } finally {
    await file.close();
  }
  return hash.digest('hex');
}

async function listPythonFiles(projectRoot: string): Promise<string[]> {
  return globby(PYTHON_PATTERNS, { cwd: projectRoot, absolute: true, gitignore: true });
}

async function listTypeScriptFiles(projectRoot: string): Promise<string[]> {
  return globby(TYPESCRIPT_PATTERNS, { cwd: projectRoot, absolute: true, gitignore: true });
}

async function listAllSourceFiles(projectRoot: string): Promise<string[]> {
  return globby(ALL_SOURCE_PATTERNS, { cwd: projectRoot, absolute: true, gitignore: true });
}

/**
 * Load RECON manifest from the state directory.
 * 
 * @param stateDir - Resolved absolute path to state directory
 */
export async function loadReconManifest(stateDir: string): Promise<ReconManifest | null> {
  const manifestFilePath = getManifestPath(stateDir);
  try {
    const raw = await fs.readFile(manifestFilePath, 'utf8');
    const parsed = JSON.parse(raw) as ReconManifest;
    if (!parsed?.files) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Ensure the manifest directory exists within the state directory.
 * 
 * @param stateDir - Resolved absolute path to state directory
 */
async function ensureManifestDir(stateDir: string) {
  const dir = path.dirname(getManifestPath(stateDir));
  await fs.mkdir(dir, { recursive: true });
}

function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EACCES' || code === 'EPERM';
}

/**
 * Write RECON manifest to the state directory.
 * 
 * @param stateDir - Resolved absolute path to state directory
 * @param manifest - The manifest to write
 */
export async function writeReconManifest(stateDir: string, manifest: ReconManifest): Promise<void> {
  try {
    await ensureManifestDir(stateDir);
    const manifestFilePath = getManifestPath(stateDir);
    await fs.writeFile(manifestFilePath, JSON.stringify(manifest, null, 2), 'utf8');
  } catch (error) {
    // Non-fatal: manifest persistence improves incremental performance but must not break RECON.
    if (isPermissionDeniedError(error)) {
      return;
    }
    throw error;
  }
}

export type ManifestLanguage = 'python' | 'typescript' | 'all';

export async function buildFullManifest(
  projectRoot: string,
  language: ManifestLanguage = 'python'
): Promise<ReconManifest> {
  let files: string[];
  switch (language) {
    case 'typescript':
      files = await listTypeScriptFiles(projectRoot);
      break;
    case 'all':
      files = await listAllSourceFiles(projectRoot);
      break;
    case 'python':
    default:
      files = await listPythonFiles(projectRoot);
      break;
  }
  
  const entries: Record<string, FileFingerprint> = {};
  for (const abs of files) {
    const stat = await fs.stat(abs);
    const hash = await hashFile(abs);
    const rel = toPosix(path.relative(projectRoot, abs));
    entries[rel] = {
      path: rel,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      hash,
    };
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    files: entries,
  };
}

/**
 * Detect file changes by comparing current state to previous manifest.
 * 
 * @param projectRoot - Project root for scanning files
 * @param stateDir - Resolved absolute path to state directory (for loading previous manifest)
 * @param previous - Optional previous manifest (if already loaded)
 */
export async function detectFileChanges(
  projectRoot: string,
  stateDir: string,
  previous?: ReconManifest | null
): Promise<ChangeSet> {
  const prevManifest = previous ?? (await loadReconManifest(stateDir));
  const prevFiles = prevManifest?.files ?? {};

  const absoluteFiles = await listPythonFiles(projectRoot);
  const fingerprints: Record<string, FileFingerprint> = {};
  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  for (const absPath of absoluteFiles) {
    const stat = await fs.stat(absPath);
    const rel = toPosix(path.relative(projectRoot, absPath));
    const prev = prevFiles[rel];

    const candidate: FileFingerprint = {
      path: rel,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      hash: prev?.hash ?? '',
    };

    const mtimeChanged = !prev || prev.mtimeMs !== stat.mtimeMs || prev.size !== stat.size;

    if (!prev) {
      candidate.hash = await hashFile(absPath);
      added.push(rel);
    } else if (mtimeChanged) {
      const newHash = await hashFile(absPath);
      candidate.hash = newHash;
      if (newHash !== prev.hash) {
        modified.push(rel);
      } else {
        unchanged.push(rel);
      }
    } else {
      candidate.hash = prev.hash;
      unchanged.push(rel);
    }

    fingerprints[rel] = candidate;
  }

  const deleted = Object.keys(prevFiles).filter((rel) => !fingerprints[rel]);

  const manifest: ReconManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    files: { ...fingerprints },
  };

  return {
    added,
    modified,
    deleted,
    unchanged,
    manifest,
    fingerprints,
  };
}

/**
 * Get the manifest file path for a state directory.
 * 
 * @param stateDir - Resolved absolute path to state directory
 */
export function manifestPath(stateDir: string): string {
  return getManifestPath(stateDir);
}
