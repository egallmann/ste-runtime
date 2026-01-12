/**
 * Tests for change-detector.ts
 * 
 * Tests manifest building, loading, and change detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildFullManifest,
  loadReconManifest,
  writeReconManifest,
  detectFileChanges,
  manifestPath,
  type ReconManifest,
  type FileFingerprint,
} from './change-detector.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'change-detector-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createPythonFile(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

describe('buildFullManifest', () => {
  it('should build manifest from Python files', async () => {
    await createPythonFile('src/module.py', 'def hello(): pass');
    await createPythonFile('src/utils.py', 'def util(): pass');

    const manifest = await buildFullManifest(tempDir);

    expect(manifest.version).toBe(1);
    expect(manifest.generatedAt).toBeTruthy();
    expect(Object.keys(manifest.files)).toHaveLength(2);
    expect(manifest.files['src/module.py']).toBeDefined();
    expect(manifest.files['src/utils.py']).toBeDefined();
  });

  it('should include file fingerprints with hash', async () => {
    await createPythonFile('src/module.py', 'def hello(): pass');

    const manifest = await buildFullManifest(tempDir);
    const fingerprint = manifest.files['src/module.py'];

    expect(fingerprint.path).toBe('src/module.py');
    expect(fingerprint.mtimeMs).toBeGreaterThan(0);
    expect(fingerprint.size).toBeGreaterThan(0);
    expect(fingerprint.hash).toHaveLength(64); // SHA-256
  });

  it('should exclude venv directories', async () => {
    await createPythonFile('src/module.py', 'def hello(): pass');
    await createPythonFile('venv/lib/python.py', 'ignore me');
    await createPythonFile('.venv/lib/python.py', 'ignore me too');

    const manifest = await buildFullManifest(tempDir);

    expect(Object.keys(manifest.files)).toHaveLength(1);
    expect(manifest.files['src/module.py']).toBeDefined();
  });

  it('should exclude .ste directory', async () => {
    await createPythonFile('src/module.py', 'def hello(): pass');
    await createPythonFile('.ste/state/test.py', 'ignore me');

    const manifest = await buildFullManifest(tempDir);

    expect(Object.keys(manifest.files)).toHaveLength(1);
  });

  it('should handle empty project', async () => {
    const manifest = await buildFullManifest(tempDir);

    expect(manifest.version).toBe(1);
    expect(Object.keys(manifest.files)).toHaveLength(0);
  });
});

describe('loadReconManifest', () => {
  it('should load existing manifest', async () => {
    const manifestDir = path.join(tempDir, '.ste', 'state', 'manifest');
    await mkdir(manifestDir, { recursive: true });
    
    const existingManifest: ReconManifest = {
      version: 1,
      generatedAt: '2026-01-08T00:00:00.000Z',
      files: {
        'src/test.py': {
          path: 'src/test.py',
          mtimeMs: 1234567890,
          size: 100,
          hash: 'abc123',
        },
      },
    };
    await writeFile(
      path.join(manifestDir, 'recon-manifest.json'),
      JSON.stringify(existingManifest),
      'utf8'
    );

    const loaded = await loadReconManifest(tempDir);

    expect(loaded).toBeDefined();
    expect(loaded?.version).toBe(1);
    expect(loaded?.files['src/test.py']).toBeDefined();
  });

  it('should return null for missing manifest', async () => {
    const loaded = await loadReconManifest(tempDir);

    expect(loaded).toBeNull();
  });

  it('should return null for invalid manifest', async () => {
    const manifestDir = path.join(tempDir, '.ste', 'state', 'manifest');
    await mkdir(manifestDir, { recursive: true });
    await writeFile(
      path.join(manifestDir, 'recon-manifest.json'),
      'invalid json',
      'utf8'
    );

    const loaded = await loadReconManifest(tempDir);

    expect(loaded).toBeNull();
  });
});

describe('writeReconManifest', () => {
  it('should write manifest to correct location', async () => {
    const manifest: ReconManifest = {
      version: 1,
      generatedAt: '2026-01-08T00:00:00.000Z',
      files: {},
    };

    await writeReconManifest(tempDir, manifest);

    const written = await readFile(manifestPath(tempDir), 'utf8');
    const parsed = JSON.parse(written);
    expect(parsed.version).toBe(1);
  });

  it('should create directory structure if missing', async () => {
    const manifest: ReconManifest = {
      version: 1,
      generatedAt: '2026-01-08T00:00:00.000Z',
      files: {},
    };

    // Directory doesn't exist yet
    await writeReconManifest(tempDir, manifest);

    const loaded = await loadReconManifest(tempDir);
    expect(loaded).toBeDefined();
  });
});

describe('detectFileChanges', () => {
  describe('with no previous manifest', () => {
    it('should detect all files as added', async () => {
      await createPythonFile('src/new1.py', 'content1');
      await createPythonFile('src/new2.py', 'content2');

      const changes = await detectFileChanges(tempDir, null);

      expect(changes.added).toHaveLength(2);
      expect(changes.modified).toHaveLength(0);
      expect(changes.deleted).toHaveLength(0);
      expect(changes.unchanged).toHaveLength(0);
    });
  });

  describe('with previous manifest', () => {
    it('should detect added files', async () => {
      await createPythonFile('src/existing.py', 'existing');
      const previousManifest = await buildFullManifest(tempDir);

      await createPythonFile('src/new.py', 'new content');

      const changes = await detectFileChanges(tempDir, previousManifest);

      expect(changes.added).toContain('src/new.py');
      expect(changes.unchanged).toContain('src/existing.py');
    });

    it('should detect modified files', async () => {
      await createPythonFile('src/module.py', 'original');
      const previousManifest = await buildFullManifest(tempDir);

      // Modify the file
      await createPythonFile('src/module.py', 'modified content');

      const changes = await detectFileChanges(tempDir, previousManifest);

      expect(changes.modified).toContain('src/module.py');
    });

    it('should detect deleted files', async () => {
      await createPythonFile('src/to-delete.py', 'content');
      await createPythonFile('src/to-keep.py', 'content');
      const previousManifest = await buildFullManifest(tempDir);

      // Delete one file
      await rm(path.join(tempDir, 'src/to-delete.py'));

      const changes = await detectFileChanges(tempDir, previousManifest);

      expect(changes.deleted).toContain('src/to-delete.py');
      expect(changes.unchanged).toContain('src/to-keep.py');
    });

    it('should detect unchanged files', async () => {
      await createPythonFile('src/stable.py', 'stable content');
      const previousManifest = await buildFullManifest(tempDir);

      const changes = await detectFileChanges(tempDir, previousManifest);

      expect(changes.unchanged).toContain('src/stable.py');
      expect(changes.added).not.toContain('src/stable.py');
      expect(changes.modified).not.toContain('src/stable.py');
    });

    it('should handle files with same mtime but different content', async () => {
      await createPythonFile('src/tricky.py', 'original');
      const previousManifest = await buildFullManifest(tempDir);

      // Force mtime change by waiting briefly
      await new Promise(resolve => setTimeout(resolve, 10));
      await createPythonFile('src/tricky.py', 'different');

      const changes = await detectFileChanges(tempDir, previousManifest);

      expect(changes.modified).toContain('src/tricky.py');
    });
  });

  describe('manifest generation', () => {
    it('should return updated manifest in change set', async () => {
      await createPythonFile('src/module.py', 'content');

      const changes = await detectFileChanges(tempDir, null);

      expect(changes.manifest).toBeDefined();
      expect(changes.manifest.version).toBe(1);
      expect(changes.manifest.files['src/module.py']).toBeDefined();
    });

    it('should return fingerprints for current files', async () => {
      await createPythonFile('src/module.py', 'content');

      const changes = await detectFileChanges(tempDir, null);

      expect(changes.fingerprints['src/module.py']).toBeDefined();
      expect(changes.fingerprints['src/module.py'].hash).toHaveLength(64);
    });
  });
});

describe('manifestPath', () => {
  it('should return correct manifest path', () => {
    const expected = path.join(tempDir, '.ste', 'state', 'manifest', 'recon-manifest.json');
    
    expect(manifestPath(tempDir)).toBe(expected);
  });
});


