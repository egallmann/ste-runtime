import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { globby } from 'globby';

const MANIFEST_RELATIVE = path.join('.ste', 'state', 'manifest', 'recon-manifest.json');
const PYTHON_PATTERNS = [
  '**/*.py',
  '!**/venv/**',
  '!**/.venv/**',
  '!**/node_modules/**',
  '!**/.git/**',
  '!**/.ste/**',
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

export async function loadReconManifest(projectRoot: string): Promise<ReconManifest | null> {
  const manifestPath = path.resolve(projectRoot, MANIFEST_RELATIVE);
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as ReconManifest;
    if (!parsed?.files) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function ensureManifestDir(projectRoot: string) {
  const dir = path.dirname(path.resolve(projectRoot, MANIFEST_RELATIVE));
  await fs.mkdir(dir, { recursive: true });
}

export async function writeReconManifest(projectRoot: string, manifest: ReconManifest): Promise<void> {
  await ensureManifestDir(projectRoot);
  const manifestPath = path.resolve(projectRoot, MANIFEST_RELATIVE);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

export async function buildFullManifest(projectRoot: string): Promise<ReconManifest> {
  const files = await listPythonFiles(projectRoot);
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

export async function detectFileChanges(projectRoot: string, previous?: ReconManifest | null): Promise<ChangeSet> {
  const prevManifest = previous ?? (await loadReconManifest(projectRoot));
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

export function manifestPath(projectRoot: string) {
  return path.resolve(projectRoot, MANIFEST_RELATIVE);
}


