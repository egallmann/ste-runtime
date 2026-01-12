/**
 * Tests for coverage-validator.ts
 * 
 * Tests extraction coverage gap detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateCoverage } from './coverage-validator.js';
import type { NormalizedAssertion } from '../phases/index.js';
import type { ValidatorContext } from './types.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'coverage-validator-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function createAssertion(sourceFile: string): NormalizedAssertion {
  return {
    _slice: {
      id: `module:${sourceFile}`,
      domain: 'graph',
      type: 'module',
      source_files: [sourceFile],
    },
    element: { path: sourceFile },
    provenance: {
      extracted_at: '2026-01-08T00:00:00.000Z',
      extractor: 'test@1.0.0',
      file: sourceFile,
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

async function createSourceFile(relativePath: string, content = 'export const x = 1;'): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

describe('validateCoverage', () => {
  describe('file validity statistics', () => {
    it('should report file validity statistics', async () => {
      await createSourceFile('src/module.ts');
      const assertion = createAssertion('src/module.ts');
      const context = createContext([assertion]);

      const findings = await validateCoverage(context);

      expect(findings.some(f => 
        f.category === 'INFO' && f.description.includes('AI-DOC file validity')
      )).toBe(true);
    });

    it('should report 100% when all files in AI-DOC exist', async () => {
      await createSourceFile('src/module.ts');
      const assertion = createAssertion('src/module.ts');
      const context = createContext([assertion]);

      const findings = await validateCoverage(context);

      expect(findings.some(f => 
        f.description.includes('100%') || f.description.includes('All AI-DOC entries reference valid files')
      )).toBe(true);
    });
  });

  describe('file existence validation', () => {
    it('should validate AI-DOC entries against actual files', async () => {
      await createSourceFile('src/existing.ts');
      
      // Only one file is in AI-DOC and it exists
      const assertion = createAssertion('src/existing.ts');
      const context = createContext([assertion]);

      const findings = await validateCoverage(context);

      // No warnings about deleted files since the file exists
      const deletedFindings = findings.filter(f => 
        f.category === 'WARNING' && f.description.includes('no longer exist')
      );
      expect(deletedFindings).toHaveLength(0);
    });

    it('should not report issues when all AI-DOC files exist', async () => {
      await createSourceFile('src/module.ts');
      const assertion = createAssertion('src/module.ts');
      const context = createContext([assertion]);

      const findings = await validateCoverage(context);

      const warningFindings = findings.filter(f => 
        f.category === 'WARNING'
      );
      expect(warningFindings).toHaveLength(0);
    });
  });

  describe('stale entries detection', () => {
    it('should detect AI-DOC entries for deleted files', async () => {
      // No source files exist, but we have an AI-DOC entry
      const assertion = createAssertion('src/deleted-file.ts');
      const context = createContext([assertion]);

      const findings = await validateCoverage(context);

      expect(findings.some(f => 
        f.category === 'WARNING' && f.description.includes('no longer exist')
      )).toBe(true);
    });

    it('should not flag existing files', async () => {
      await createSourceFile('src/module.ts');
      const assertion = createAssertion('src/module.ts');
      const context = createContext([assertion]);

      const findings = await validateCoverage(context);

      const staleFindings = findings.filter(f => 
        f.category === 'WARNING' && f.description.includes('no longer exist')
      );
      expect(staleFindings).toHaveLength(0);
    });
  });

  describe('file filtering', () => {
    it('should exclude test files from coverage', async () => {
      await createSourceFile('src/module.ts');
      await createSourceFile('src/module.test.ts');
      await createSourceFile('src/module.spec.ts');
      
      const assertion = createAssertion('src/module.ts');
      const context = createContext([assertion]);

      const findings = await validateCoverage(context);

      // Test files should not be counted as missing
      const missingInfo = findings.find(f => 
        f.description.includes('not yet in AI-DOC')
      );
      if (missingInfo) {
        expect(missingInfo.affected_artifacts).not.toContain('src/module.test.ts');
        expect(missingInfo.affected_artifacts).not.toContain('src/module.spec.ts');
      }
    });

    it('should exclude node_modules from coverage', async () => {
      await createSourceFile('src/module.ts');
      await createSourceFile('src/node_modules/dep/index.ts');
      
      const assertion = createAssertion('src/module.ts');
      const context = createContext([assertion]);

      const findings = await validateCoverage(context);

      // node_modules should not be counted
      const missingInfo = findings.find(f => 
        f.description.includes('not yet in AI-DOC')
      );
      if (missingInfo) {
        expect(missingInfo.affected_artifacts.some(a => a.includes('node_modules'))).toBe(false);
      }
    });
  });

  describe('empty project', () => {
    it('should handle empty AI-DOC', async () => {
      await mkdir(path.join(tempDir, 'src'), { recursive: true });
      const context = createContext([]);

      const findings = await validateCoverage(context);

      // Should report 100% validity (no AI-DOC entries to validate)
      expect(findings.some(f => 
        f.category === 'INFO' && f.description.includes('AI-DOC file validity')
      )).toBe(true);
    });

    it('should handle missing source directory', async () => {
      const context = createContext([]);

      // Should not throw
      const findings = await validateCoverage(context);

      expect(Array.isArray(findings)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      const context = createContext([]);
      // Use invalid path that might cause issues
      context.projectRoot = '/nonexistent/path/that/should/not/exist';

      const findings = await validateCoverage(context);

      // Should not throw, may report error or empty results
      expect(Array.isArray(findings)).toBe(true);
    });
  });
});

