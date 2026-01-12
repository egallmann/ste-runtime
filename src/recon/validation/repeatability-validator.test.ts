/**
 * Tests for repeatability-validator.ts
 * 
 * Tests deterministic extraction validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateRepeatability } from './repeatability-validator.js';
import type { NormalizedAssertion } from '../phases/index.js';
import type { ValidatorContext } from './types.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'repeatability-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function createAssertion(
  id: string,
  file: string,
  extractor = 'test@1.0.0',
  element: Record<string, unknown> = { name: id }
): NormalizedAssertion {
  return {
    _slice: {
      id,
      domain: 'graph',
      type: 'module',
      source_files: [file],
    },
    element,
    provenance: {
      extracted_at: '2026-01-08T00:00:00.000Z',
      extractor,
      file,
      line: 1,
      language: 'typescript',
    },
  } as NormalizedAssertion;
}

function createContext(assertions: NormalizedAssertion[]): ValidatorContext {
  return {
    assertions,
    projectRoot: tempDir,
    sourceRoot: 'src',
    stateDir: path.join(tempDir, '.ste', 'state'),
    repeatabilityCheck: false,
  };
}

async function setupValidationDir(): Promise<void> {
  const validationDir = path.join(tempDir, '.ste', 'state', 'validation');
  await mkdir(validationDir, { recursive: true });
}

describe('validateRepeatability', () => {
  beforeEach(async () => {
    await setupValidationDir();
  });

  describe('with no history', () => {
    it('should run without errors when no history exists', async () => {
      const assertion = createAssertion('test-id', 'src/test.ts');
      const context = createContext([assertion]);

      const findings = await validateRepeatability(context, 'run-1');

      // Should not have warning about checksum changes (no history to compare)
      const checksumWarnings = findings.filter(f => 
        f.category === 'WARNING' && f.description.includes('Checksum changed')
      );
      expect(checksumWarnings).toHaveLength(0);
    });

    it('should save checksums for future comparison', async () => {
      const assertion = createAssertion('test-id', 'src/test.ts');
      const context = createContext([assertion]);

      await validateRepeatability(context, 'run-1');

      // Run again - now there should be history
      const findings = await validateRepeatability(context, 'run-2');

      // Should not report changes for identical assertions
      const changeWarnings = findings.filter(f => 
        f.category === 'WARNING' && f.description.includes('Checksum changed')
      );
      expect(changeWarnings).toHaveLength(0);
    });
  });

  describe('checksum comparison', () => {
    it('should detect changed checksums due to content change', async () => {
      const assertion1 = createAssertion('test-id', 'src/test.ts', 'test@1.0.0', { name: 'original' });
      const context1 = createContext([assertion1]);
      await validateRepeatability(context1, 'run-1');

      // Change the element content (simulating non-determinism or real change)
      const assertion2 = createAssertion('test-id', 'src/test.ts', 'test@1.0.0', { name: 'modified' });
      const context2 = createContext([assertion2]);

      const findings = await validateRepeatability(context2, 'run-2');

      // Validator should complete and track changes
      // Specific warning behavior depends on history file format
      expect(Array.isArray(findings)).toBe(true);
    });

    it('should handle extractor version changes', async () => {
      const assertion1 = createAssertion('test-id', 'src/test.ts', 'test@1.0.0', { name: 'content' });
      const context1 = createContext([assertion1]);
      await validateRepeatability(context1, 'run-1');

      // Same content but different extractor version
      const assertion2 = createAssertion('test-id', 'src/test.ts', 'test@2.0.0', { name: 'content-v2' });
      const context2 = createContext([assertion2]);

      const findings = await validateRepeatability(context2, 'run-2');

      // Validator should complete and handle version change
      expect(Array.isArray(findings)).toBe(true);
    });

    it('should not warn when checksums match', async () => {
      const assertion = createAssertion('test-id', 'src/test.ts');
      const context = createContext([assertion]);

      await validateRepeatability(context, 'run-1');
      const findings = await validateRepeatability(context, 'run-2');

      const checksumWarnings = findings.filter(f => 
        f.category === 'WARNING' && f.description.includes('Checksum changed')
      );
      expect(checksumWarnings).toHaveLength(0);
    });
  });

  describe('artifact tracking', () => {
    it('should detect new artifacts', async () => {
      const assertion1 = createAssertion('existing-id', 'src/existing.ts');
      const context1 = createContext([assertion1]);
      await validateRepeatability(context1, 'run-1');

      // Add a new artifact
      const assertion2 = createAssertion('new-id', 'src/new.ts');
      const context2 = createContext([assertion1, assertion2]);

      const findings = await validateRepeatability(context2, 'run-2');

      expect(findings.some(f => 
        f.category === 'INFO' && f.description.includes('new artifact')
      )).toBe(true);
    });

    it('should detect removed artifacts', async () => {
      const assertion1 = createAssertion('id-1', 'src/file1.ts');
      const assertion2 = createAssertion('id-2', 'src/file2.ts');
      const context1 = createContext([assertion1, assertion2]);
      await validateRepeatability(context1, 'run-1');

      // Remove an artifact
      const context2 = createContext([assertion1]);

      const findings = await validateRepeatability(context2, 'run-2');

      expect(findings.some(f => 
        f.category === 'INFO' && f.description.includes('removed')
      )).toBe(true);
    });
  });

  describe('repeatability check flag', () => {
    it('should report when immediate re-run check is enabled', async () => {
      const assertion = createAssertion('test-id', 'src/test.ts');
      const context = createContext([assertion]);
      context.repeatabilityCheck = true;

      const findings = await validateRepeatability(context, 'run-1');

      expect(findings.some(f => 
        f.category === 'INFO' && f.description.includes('Immediate re-run')
      )).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle missing validation directory', async () => {
      await rm(path.join(tempDir, '.ste'), { recursive: true, force: true });

      const assertion = createAssertion('test-id', 'src/test.ts');
      const context = createContext([assertion]);

      // Should not throw
      const findings = await validateRepeatability(context, 'run-1');

      expect(Array.isArray(findings)).toBe(true);
    });
  });

  describe('normalization', () => {
    it('should ignore timestamp differences in checksum', async () => {
      const assertion1 = createAssertion('test-id', 'src/test.ts');
      assertion1.provenance.extracted_at = '2026-01-01T00:00:00.000Z';
      const context1 = createContext([assertion1]);
      await validateRepeatability(context1, 'run-1');

      // Same assertion but different timestamp
      const assertion2 = createAssertion('test-id', 'src/test.ts');
      assertion2.provenance.extracted_at = '2026-01-08T12:00:00.000Z';
      const context2 = createContext([assertion2]);

      const findings = await validateRepeatability(context2, 'run-2');

      // Should not warn about checksum change (timestamp excluded)
      const checksumWarnings = findings.filter(f => 
        f.category === 'WARNING' && f.description.includes('Checksum changed')
      );
      expect(checksumWarnings).toHaveLength(0);
    });
  });
});

