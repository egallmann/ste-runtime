/**
 * Tests for Context Source Loader
 * 
 * Tests source code loading for semantic slices.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadSourceForSlice,
  loadSourceForSlices,
  loadSourceGroupedByFile,
  formatSourceForLLM,
  type LoadSourceOptions,
} from './context-source-loader.js';
import type { AidocNode } from '../rss/graph-loader.js';

describe('Context Source Loader', () => {
  let tempDir: string;
  let testFilePath: string;
  let testFileContent: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-source-loader-test-'));
    
    // Create a test file with known content
    testFileContent = `// Test file
function hello() {
  console.log('Hello, world!');
}

function goodbye() {
  console.log('Goodbye!');
}

class TestClass {
  method1() {
    return 42;
  }
  
  method2() {
    return 'test';
  }
}

export { hello, goodbye, TestClass };`;

    testFilePath = path.join(tempDir, 'test.ts');
    await fs.writeFile(testFilePath, testFileContent, 'utf-8');
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('loadSourceForSlice', () => {
    it('should load source code for a slice with no line range', async () => {
      const node: AidocNode = {
        key: 'test/function/hello',
        domain: 'test',
        type: 'function',
        id: 'hello',
        path: 'function/hello',
        tags: [],
        sourceFiles: [testFilePath],
        references: [],
        referencedBy: [],
      };

      const result = await loadSourceForSlice(node, { projectRoot: tempDir });

      expect(result).not.toBeNull();
      expect(result!.key).toBe('test/function/hello');
      expect(result!.filePath).toBe(testFilePath);
      expect(result!.content).toBe(testFileContent);
      expect(result!.lines.length).toBeLessThanOrEqual(100); // Default maxLines
      expect(result!.truncated).toBe(false); // File is < 100 lines
    });

    it('should load source code with line range', async () => {
      const node: AidocNode = {
        key: 'test/function/hello',
        domain: 'test',
        type: 'function',
        id: 'hello',
        path: 'function/hello',
        tags: [],
        sourceFiles: [testFilePath],
        references: [],
        referencedBy: [],
        slice: { start: 2, end: 4 },
      };

      const result = await loadSourceForSlice(node, { projectRoot: tempDir });

      expect(result).not.toBeNull();
      expect(result!.lineRange).toEqual({ start: 2, end: 4 });
      expect(result!.lines).toHaveLength(3); // Lines 2-4 inclusive
      expect(result!.lines[0]).toContain('function hello()');
      expect(result!.truncated).toBe(false);
    });

    it('should respect maxLines limit', async () => {
      const node: AidocNode = {
        key: 'test/function/hello',
        domain: 'test',
        type: 'function',
        id: 'hello',
        path: 'function/hello',
        tags: [],
        sourceFiles: [testFilePath],
        references: [],
        referencedBy: [],
      };

      const result = await loadSourceForSlice(node, { projectRoot: tempDir, maxLines: 5 });

      expect(result).not.toBeNull();
      expect(result!.lines).toHaveLength(5);
      expect(result!.truncated).toBe(true);
    });

    it('should handle includeFullFile option', async () => {
      const node: AidocNode = {
        key: 'test/function/hello',
        domain: 'test',
        type: 'function',
        id: 'hello',
        path: 'function/hello',
        tags: [],
        sourceFiles: [testFilePath],
        references: [],
        referencedBy: [],
        slice: { start: 2, end: 4 },
      };

      const result = await loadSourceForSlice(node, {
        projectRoot: tempDir,
        includeFullFile: true,
        maxLines: 5,
      });

      expect(result).not.toBeNull();
      expect(result!.lineRange).toBeUndefined(); // No line range when includeFullFile
      expect(result!.lines).toHaveLength(5); // Respects maxLines even with includeFullFile
      expect(result!.truncated).toBe(true);
    });

    it('should return null for nodes without source files', async () => {
      const node: AidocNode = {
        key: 'test/function/hello',
        domain: 'test',
        type: 'function',
        id: 'hello',
        path: 'function/hello',
        tags: [],
        sourceFiles: [],
        references: [],
        referencedBy: [],
      };

      const result = await loadSourceForSlice(node, { projectRoot: tempDir });

      expect(result).toBeNull();
    });

    it('should return null for non-existent files', async () => {
      const node: AidocNode = {
        key: 'test/function/hello',
        domain: 'test',
        type: 'function',
        id: 'hello',
        path: 'function/hello',
        tags: [],
        sourceFiles: [path.join(tempDir, 'nonexistent.ts')],
        references: [],
        referencedBy: [],
      };

      const result = await loadSourceForSlice(node, { projectRoot: tempDir });

      expect(result).toBeNull();
    });

    it('should handle relative paths', async () => {
      const node: AidocNode = {
        key: 'test/function/hello',
        domain: 'test',
        type: 'function',
        id: 'hello',
        path: 'function/hello',
        tags: [],
        sourceFiles: ['test.ts'],
        references: [],
        referencedBy: [],
      };

      const result = await loadSourceForSlice(node, { projectRoot: tempDir });

      expect(result).not.toBeNull();
      expect(result!.filePath).toBe('test.ts'); // Stores original relative path
      expect(result!.content).toBe(testFileContent);
    });
  });

  describe('loadSourceForSlices', () => {
    it('should load source for multiple slices', async () => {
      const nodes: AidocNode[] = [
        {
          key: 'test/function/hello',
          domain: 'test',
          type: 'function',
          id: 'hello',
          path: 'function/hello',
          tags: [],
          sourceFiles: [testFilePath],
          references: [],
          referencedBy: [],
          slice: { start: 2, end: 4 },
        },
        {
          key: 'test/function/goodbye',
          domain: 'test',
          type: 'function',
          id: 'goodbye',
          path: 'function/goodbye',
          tags: [],
          sourceFiles: [testFilePath],
          references: [],
          referencedBy: [],
          slice: { start: 6, end: 8 },
        },
      ];

      const results = await loadSourceForSlices(nodes, { projectRoot: tempDir });

      expect(results).toHaveLength(2);
      expect(results[0].key).toBe('test/function/hello');
      expect(results[1].key).toBe('test/function/goodbye');
      expect(results[0].lineRange).toEqual({ start: 2, end: 4 });
      expect(results[1].lineRange).toEqual({ start: 6, end: 8 });
    });

    it('should filter out null results', async () => {
      const nodes: AidocNode[] = [
        {
          key: 'test/function/hello',
          domain: 'test',
          type: 'function',
          id: 'hello',
          path: 'function/hello',
          tags: [],
          sourceFiles: [testFilePath],
          references: [],
          referencedBy: [],
        },
        {
          key: 'test/function/missing',
          domain: 'test',
          type: 'function',
          id: 'missing',
          path: 'function/missing',
          tags: [],
          sourceFiles: [path.join(tempDir, 'missing.ts')],
          references: [],
          referencedBy: [],
        },
      ];

      const results = await loadSourceForSlices(nodes, { projectRoot: tempDir });

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('test/function/hello');
    });
  });

  describe('loadSourceGroupedByFile', () => {
    it('should group source contexts by file', async () => {
      const nodes: AidocNode[] = [
        {
          key: 'test/function/hello',
          domain: 'test',
          type: 'function',
          id: 'hello',
          path: 'function/hello',
          tags: [],
          sourceFiles: [testFilePath],
          references: [],
          referencedBy: [],
          slice: { start: 2, end: 4 },
        },
        {
          key: 'test/function/goodbye',
          domain: 'test',
          type: 'function',
          id: 'goodbye',
          path: 'function/goodbye',
          tags: [],
          sourceFiles: [testFilePath],
          references: [],
          referencedBy: [],
          slice: { start: 6, end: 8 },
        },
      ];

      const result = await loadSourceGroupedByFile(nodes, { projectRoot: tempDir });

      expect(result.size).toBe(1);
      const contexts = result.get(testFilePath);
      expect(contexts).toHaveLength(2);
      expect(contexts![0].key).toBe('test/function/hello');
      expect(contexts![1].key).toBe('test/function/goodbye');
    });

    it('should handle nodes from multiple files', async () => {
      // Create second test file
      const testFile2Path = path.join(tempDir, 'test2.ts');
      await fs.writeFile(testFile2Path, '// Another file\nconst x = 42;', 'utf-8');

      const nodes: AidocNode[] = [
        {
          key: 'test/function/hello',
          domain: 'test',
          type: 'function',
          id: 'hello',
          path: 'function/hello',
          tags: [],
          sourceFiles: [testFilePath],
          references: [],
          referencedBy: [],
        },
        {
          key: 'test/const/x',
          domain: 'test',
          type: 'const',
          id: 'x',
          path: 'const/x',
          tags: [],
          sourceFiles: [testFile2Path],
          references: [],
          referencedBy: [],
        },
      ];

      const result = await loadSourceGroupedByFile(nodes, { projectRoot: tempDir });

      expect(result.size).toBe(2);
      expect(result.get(testFilePath)).toHaveLength(1);
      expect(result.get(testFile2Path)).toHaveLength(1);
    });

    it('should skip files that cannot be read', async () => {
      const nodes: AidocNode[] = [
        {
          key: 'test/function/hello',
          domain: 'test',
          type: 'function',
          id: 'hello',
          path: 'function/hello',
          tags: [],
          sourceFiles: [testFilePath],
          references: [],
          referencedBy: [],
        },
        {
          key: 'test/function/missing',
          domain: 'test',
          type: 'function',
          id: 'missing',
          path: 'function/missing',
          tags: [],
          sourceFiles: [path.join(tempDir, 'missing.ts')],
          references: [],
          referencedBy: [],
        },
      ];

      const result = await loadSourceGroupedByFile(nodes, { projectRoot: tempDir });

      expect(result.size).toBe(1);
      expect(result.get(testFilePath)).toHaveLength(1);
    });
  });

  describe('formatSourceForLLM', () => {
    it('should format source contexts with line numbers and file paths', () => {
      const contexts = [
        {
          key: 'test/function/hello',
          filePath: 'src/test.ts',
          content: testFileContent,
          lineRange: { start: 2, end: 4 },
          lines: ['function hello() {', '  console.log(\'Hello, world!\');', '}'],
          truncated: false,
        },
      ];

      const result = formatSourceForLLM(contexts);

      expect(result).toContain('File: src/test.ts');
      expect(result).toContain('Lines: 2-4');
      expect(result).toContain('   2 | function hello() {');
      expect(result).toContain('   3 |   console.log(\'Hello, world!\');');
      expect(result).toContain('   4 | }');
    });

    it('should format without line numbers when requested', () => {
      const contexts = [
        {
          key: 'test/function/hello',
          filePath: 'src/test.ts',
          content: testFileContent,
          lineRange: { start: 2, end: 4 },
          lines: ['function hello() {', '  console.log(\'Hello, world!\');', '}'],
          truncated: false,
        },
      ];

      const result = formatSourceForLLM(contexts, { includeLineNumbers: false });

      expect(result).toContain('File: src/test.ts');
      expect(result).toContain('function hello() {');
      expect(result).not.toContain('   2 |');
    });

    it('should format without file paths when requested', () => {
      const contexts = [
        {
          key: 'test/function/hello',
          filePath: 'src/test.ts',
          content: testFileContent,
          lineRange: { start: 2, end: 4 },
          lines: ['function hello() {', '  console.log(\'Hello, world!\');', '}'],
          truncated: false,
        },
      ];

      const result = formatSourceForLLM(contexts, { includeFilePath: false });

      expect(result).not.toContain('File: src/test.ts');
      expect(result).toContain('function hello() {');
    });

    it('should indicate truncation', () => {
      const contexts = [
        {
          key: 'test/function/hello',
          filePath: 'src/test.ts',
          content: testFileContent,
          lines: ['function hello() {', '  console.log(\'Hello, world!\');'],
          truncated: true,
        },
      ];

      const result = formatSourceForLLM(contexts);

      expect(result).toContain('... (truncated)');
    });

    it('should separate multiple contexts with dividers', () => {
      const contexts = [
        {
          key: 'test/function/hello',
          filePath: 'src/test.ts',
          content: testFileContent,
          lines: ['function hello() {'],
          truncated: false,
        },
        {
          key: 'test/function/goodbye',
          filePath: 'src/test.ts',
          content: testFileContent,
          lines: ['function goodbye() {'],
          truncated: false,
        },
      ];

      const result = formatSourceForLLM(contexts);

      expect(result).toContain('---');
      const sections = result.split('---');
      expect(sections.length).toBe(2);
    });
  });
});

