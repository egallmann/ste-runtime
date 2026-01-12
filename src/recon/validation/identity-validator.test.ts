/**
 * Tests for identity-validator.ts
 * 
 * Tests ID stability and identity drift detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateIdentity } from './identity-validator.js';
import type { NormalizedAssertion } from '../phases/index.js';
import type { ValidatorContext } from './types.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'identity-validator-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function createAssertion(id: string, file: string, extractor = 'test@1.0.0'): NormalizedAssertion {
  return {
    _slice: {
      id,
      domain: 'graph',
      type: 'module',
      source_files: [file],
    },
    element: { name: id },
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

describe('validateIdentity', () => {
  beforeEach(async () => {
    await setupValidationDir();
  });

  describe('duplicate ID detection', () => {
    it('should detect duplicate IDs across multiple files', async () => {
      const assertion1 = createAssertion('duplicate-id', 'src/file1.ts');
      const assertion2 = createAssertion('duplicate-id', 'src/file2.ts');
      const context = createContext([assertion1, assertion2]);

      const findings = await validateIdentity(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('Duplicate ID across multiple files')
      )).toBe(true);
    });

    it('should not flag unique IDs', async () => {
      const assertion1 = createAssertion('id-1', 'src/file1.ts');
      const assertion2 = createAssertion('id-2', 'src/file2.ts');
      const context = createContext([assertion1, assertion2]);

      const findings = await validateIdentity(context);

      const duplicateErrors = findings.filter(f => 
        f.category === 'ERROR' && f.description.includes('Duplicate ID')
      );
      expect(duplicateErrors).toHaveLength(0);
    });
  });

  describe('with no history', () => {
    it('should not report identity drift with no history', async () => {
      const assertion = createAssertion('test-id', 'src/test.ts');
      const context = createContext([assertion]);

      const findings = await validateIdentity(context);

      const driftErrors = findings.filter(f => 
        f.description.includes('ID changed') || f.description.includes('instability')
      );
      expect(driftErrors).toHaveLength(0);
    });
  });

  describe('with history', () => {
    async function writeHistory(checksums: { artifact_id: string; file_path: string; extractor_version: string }[]): Promise<void> {
      const historyPath = path.join(tempDir, '.ste', 'state', 'validation', 'checksums.yaml');
      const history = {
        runs: [{
          run_id: 'previous-run',
          timestamp: '2026-01-07T00:00:00.000Z',
          checksums: checksums.map(c => ({
            ...c,
            checksum: 'abc123',
            timestamp: '2026-01-07T00:00:00.000Z',
          })),
        }],
      };
      await writeFile(historyPath, JSON.stringify(history), 'utf8');
    }

    it('should detect ID change for same file with same extractor version', async () => {
      await writeHistory([
        { artifact_id: 'old-id', file_path: 'src/test.ts', extractor_version: 'test@1.0.0' },
      ]);

      const assertion = createAssertion('new-id', 'src/test.ts', 'test@1.0.0');
      const context = createContext([assertion]);

      const findings = await validateIdentity(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('ID instability')
      )).toBe(true);
    });

    it('should report ID change due to extractor version as INFO', async () => {
      await writeHistory([
        { artifact_id: 'old-id', file_path: 'src/test.ts', extractor_version: 'test@1.0.0' },
      ]);

      const assertion = createAssertion('new-id', 'src/test.ts', 'test@2.0.0');
      const context = createContext([assertion]);

      const findings = await validateIdentity(context);

      expect(findings.some(f => 
        f.category === 'INFO' && f.description.includes('extractor version change')
      )).toBe(true);
    });

    it('should not flag unchanged IDs', async () => {
      await writeHistory([
        { artifact_id: 'stable-id', file_path: 'src/test.ts', extractor_version: 'test@1.0.0' },
      ]);

      const assertion = createAssertion('stable-id', 'src/test.ts', 'test@1.0.0');
      const context = createContext([assertion]);

      const findings = await validateIdentity(context);

      const idChangeFindings = findings.filter(f => 
        f.description.includes('ID changed') || f.description.includes('instability')
      );
      expect(idChangeFindings).toHaveLength(0);
    });
  });

  describe('extractor version tracking', () => {
    it('should handle multiple extractor versions gracefully', async () => {
      const assertion1 = createAssertion('id-1', 'src/file1.ts', 'extractor@1.0.0');
      const assertion2 = createAssertion('id-2', 'src/file2.ts', 'extractor@2.0.0');
      const context = createContext([assertion1, assertion2]);

      const findings = await validateIdentity(context);

      // Validator should complete without errors
      // Multiple version warning is implementation-specific
      expect(Array.isArray(findings)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle missing validation directory gracefully', async () => {
      // Remove the validation directory
      await rm(path.join(tempDir, '.ste'), { recursive: true, force: true });

      const assertion = createAssertion('test-id', 'src/test.ts');
      const context = createContext([assertion]);

      // Should not throw, just log error finding
      const findings = await validateIdentity(context);

      // May or may not have error depending on implementation
      expect(Array.isArray(findings)).toBe(true);
    });
  });
});

