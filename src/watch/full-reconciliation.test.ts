/**
 * Tests for Full Reconciliation
 * 
 * Tests periodic state verification and healing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  computeFileChecksum,
} from './full-reconciliation.js';

describe('Full Reconciliation', () => {
  let tempDir: string;
  let projectRoot: string;
  let stateDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'full-recon-test-'));
    projectRoot = path.join(tempDir, 'project');
    stateDir = path.join(tempDir, '.ste', 'state');

    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(path.join(stateDir, 'graph', 'functions'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('computeFileChecksum', () => {
    it('should compute checksum for file', async () => {
      const testFile = path.join(projectRoot, 'test.ts');
      await fs.writeFile(testFile, 'const x = 42;', 'utf-8');

      const checksum = await computeFileChecksum(testFile);

      expect(checksum).toBeTruthy();
      expect(checksum).toHaveLength(64); // SHA-256 hex
    });

    it('should return same checksum for same content', async () => {
      const testFile = path.join(projectRoot, 'test.ts');
      const content = 'const x = 42;';
      await fs.writeFile(testFile, content, 'utf-8');

      const checksum1 = await computeFileChecksum(testFile);
      const checksum2 = await computeFileChecksum(testFile);

      expect(checksum1).toBe(checksum2);
    });

    it('should return different checksum for different content', async () => {
      const testFile = path.join(projectRoot, 'test.ts');

      await fs.writeFile(testFile, 'const x = 42;', 'utf-8');
      const checksum1 = await computeFileChecksum(testFile);

      await fs.writeFile(testFile, 'const x = 43;', 'utf-8');
      const checksum2 = await computeFileChecksum(testFile);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle non-existent files', async () => {
      const checksum = await computeFileChecksum('/nonexistent/file.ts');

      expect(checksum).toBe('');
    });
  });
});

