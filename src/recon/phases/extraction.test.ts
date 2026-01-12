/**
 * Tests for RECON Phase 2: Extraction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractAssertions } from './extraction.js';
import type { DiscoveredFile } from './index.js';
import * as fs from 'node:fs/promises';
import { execa } from 'execa';

// Mock external dependencies
vi.mock('node:fs/promises');
vi.mock('execa');

describe('extractAssertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TypeScript extraction', () => {
    it('should extract functions from TypeScript files', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/sample.ts',
        relativePath: 'sample.ts',
        language: 'typescript'
      };

      const tsContent = `
        export function greet(name: string): string {
          return \`Hello, \${name}\`;
        }

        function helper() {
          return 'help';
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      expect(assertions.length).toBeGreaterThan(0);
      
      const functionAssertions = assertions.filter(a => a.elementType === 'function');
      expect(functionAssertions).toHaveLength(2);
      
      const greetFunc = functionAssertions.find(f => f.metadata.name === 'greet');
      expect(greetFunc).toBeDefined();
      expect(greetFunc?.metadata.isExported).toBe(true);
      expect(greetFunc?.metadata.parameters).toEqual(['name']);
      expect(greetFunc?.file).toBe('sample.ts');
    });

    it('should extract classes from TypeScript files', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/user.ts',
        relativePath: 'user.ts',
        language: 'typescript'
      };

      const tsContent = `
        export class UserService {
          private users: User[] = [];
          
          addUser(user: User) {
            this.users.push(user);
          }
          
          getUsers() {
            return this.users;
          }
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const classAssertions = assertions.filter(a => a.elementType === 'class');
      expect(classAssertions).toHaveLength(1);
      
      const userClass = classAssertions[0];
      expect(userClass.metadata.name).toBe('UserService');
      expect(userClass.metadata.isExported).toBe(true);
      expect(userClass.metadata.methods).toContain('addUser');
      expect(userClass.metadata.methods).toContain('getUsers');
    });

    it('should extract imports from TypeScript files', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/app.ts',
        relativePath: 'app.ts',
        language: 'typescript'
      };

      const tsContent = `
        import { User, Role } from './models.js';
        import express from 'express';
        import * as fs from 'node:fs';
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const importAssertions = assertions.filter(a => a.elementType === 'import');
      expect(importAssertions.length).toBeGreaterThanOrEqual(3);
      
      const modelImport = importAssertions.find(i => i.metadata.module === './models.js');
      expect(modelImport).toBeDefined();
      expect(modelImport?.metadata.names).toContain('User');
      expect(modelImport?.metadata.names).toContain('Role');
    });

    it('should handle async functions', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/async.ts',
        relativePath: 'async.ts',
        language: 'typescript'
      };

      const tsContent = `
        export async function fetchData(url: string): Promise<any> {
          const response = await fetch(url);
          return response.json();
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(1);
      expect(funcAssertions[0].metadata.isAsync).toBe(true);
    });

    it('should handle files with no extractable content', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/empty.ts',
        relativePath: 'empty.ts',
        language: 'typescript'
      };

      const tsContent = `
        // Just comments
        const x = 5;
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      // Should not error, just return empty or minimal assertions
      expect(assertions).toBeDefined();
    });

    it('should handle TypeScript extraction errors gracefully', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/error.ts',
        relativePath: 'error.ts',
        language: 'typescript'
      };

      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const assertions = await extractAssertions([tsFile]);

      // Should not throw, should handle error and return empty
      expect(assertions).toEqual([]);
    });

    it('should extract JSDoc description from functions', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/documented.ts',
        relativePath: 'documented.ts',
        language: 'typescript'
      };

      const tsContent = `
        /**
         * Main context assembly function
         * 
         * Given entry points, traverse the graph and assemble minimal viable context.
         * This is the core RSS operation per ste-spec Section 4.6.
         */
        export function assembleContext(ctx: Context, entryPoints: Node[]): Result {
          return { nodes: [] };
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(1);
      
      const func = funcAssertions[0];
      expect(func.metadata.name).toBe('assembleContext');
      expect(func.metadata.description).toBe('Main context assembly function');
      expect(func.metadata.docstring).toContain('traverse the graph');
      expect(func.metadata.docstring).toContain('minimal viable context');
    });

    it('should extract JSDoc @param descriptions', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/params.ts',
        relativePath: 'params.ts',
        language: 'typescript'
      };

      const tsContent = `
        /**
         * Search the graph
         * @param ctx - RSS context containing the graph
         * @param query - Search query string
         * @param options - Configuration options
         */
        export function search(ctx: Context, query: string, options: any): Result {
          return { nodes: [] };
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(1);
      
      const func = funcAssertions[0];
      expect(func.metadata.params).toBeDefined();
      expect(func.metadata.params).toHaveLength(3);
      expect(func.metadata.params[0].name).toBe('ctx');
      expect(func.metadata.params[0].description).toBe('RSS context containing the graph');
      expect(func.metadata.params[1].name).toBe('query');
      expect(func.metadata.params[1].description).toBe('Search query string');
    });

    it('should extract JSDoc @returns description', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/returns.ts',
        relativePath: 'returns.ts',
        language: 'typescript'
      };

      const tsContent = `
        /**
         * Perform a search
         * @returns Query result containing matched nodes
         */
        export function search(): Result {
          return { nodes: [] };
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(1);
      
      const func = funcAssertions[0];
      expect(func.metadata.returns).toBeDefined();
      expect(func.metadata.returns.description).toBe('Query result containing matched nodes');
    });

    it('should detect @deprecated flag', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/deprecated.ts',
        relativePath: 'deprecated.ts',
        language: 'typescript'
      };

      const tsContent = `
        /**
         * Old function
         * @deprecated Use newFunction instead
         */
        export function oldFunction(): void {
          // implementation
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(1);
      
      const func = funcAssertions[0];
      expect(func.metadata.deprecated).toBe(true);
    });

    it('should extract @example blocks', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/examples.ts',
        relativePath: 'examples.ts',
        language: 'typescript'
      };

      const tsContent = `
        /**
         * Format a date
         * @example
         * formatDate(new Date())
         * // returns "2024-01-01"
         * @example
         * formatDate(new Date(), 'short')
         * // returns "1/1/24"
         */
        export function formatDate(date: Date, format?: string): string {
          return '';
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(1);
      
      const func = funcAssertions[0];
      expect(func.metadata.examples).toBeDefined();
      expect(func.metadata.examples).toHaveLength(2);
      expect(func.metadata.examples[0]).toContain('formatDate(new Date())');
    });

    it('should extract JSDoc from classes', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/class-doc.ts',
        relativePath: 'class-doc.ts',
        language: 'typescript'
      };

      const tsContent = `
        /**
         * User service class
         * 
         * Handles all user-related operations including authentication,
         * authorization, and profile management.
         * @example
         * const service = new UserService();
         * service.getUser(123);
         */
        export class UserService {
          getUser(id: number) {
            return null;
          }
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const classAssertions = assertions.filter(a => a.elementType === 'class');
      expect(classAssertions).toHaveLength(1);
      
      const cls = classAssertions[0];
      expect(cls.metadata.description).toBe('User service class');
      expect(cls.metadata.docstring).toContain('authentication');
      expect(cls.metadata.docstring).toContain('profile management');
      expect(cls.metadata.examples).toBeDefined();
      expect(cls.metadata.examples).toHaveLength(1);
    });

    it('should handle functions without JSDoc gracefully', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/no-doc.ts',
        relativePath: 'no-doc.ts',
        language: 'typescript'
      };

      const tsContent = `
        export function undocumented(x: number): number {
          return x * 2;
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(1);
      
      const func = funcAssertions[0];
      expect(func.metadata.name).toBe('undocumented');
      expect(func.metadata.description).toBeUndefined();
      expect(func.metadata.docstring).toBeUndefined();
    });

    it('should extract custom tags from JSDoc', async () => {
      const tsFile: DiscoveredFile = {
        path: '/test/tags.ts',
        relativePath: 'tags.ts',
        language: 'typescript'
      };

      const tsContent = `
        /**
         * Experimental feature
         * @experimental
         * @category context-assembly
         * @internal
         */
        export function experimentalFeature(): void {
          // implementation
        }
      `;

      vi.mocked(fs.readFile).mockResolvedValue(tsContent);

      const assertions = await extractAssertions([tsFile]);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(1);
      
      const func = funcAssertions[0];
      expect(func.metadata.tags).toBeDefined();
      expect(func.metadata.tags).toContain('experimental');
      expect(func.metadata.tags).toContain('category:context-assembly');
      expect(func.metadata.tags).toContain('internal');
    });
  });

  describe('Python extraction', () => {
    it('should extract functions from Python files', async () => {
      const pyFile: DiscoveredFile = {
        path: '/test/api.py',
        relativePath: 'api.py',
        language: 'python'
      };

      const pythonOutput = JSON.stringify({
        functions: [
          {
            name: 'greet',
            lineno: 5,
            args: ['name'],
            returns: 'str',
            decorators: [],
            docstring: 'Greet a user',
            async: false
          },
          {
            name: 'fetch_data',
            lineno: 10,
            args: ['url'],
            returns: 'dict',
            decorators: ['@cache'],
            docstring: null,
            async: true
          }
        ],
        classes: [],
        imports: []
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: pythonOutput,
        stderr: '',
        exitCode: 0,
        command: '',
        escapedCommand: '',
        failed: false,
        timedOut: false,
        isCanceled: false,
        killed: false
      } as any);

      const assertions = await extractAssertions([pyFile]);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(2);
      
      const greetFunc = funcAssertions.find(f => f.metadata.name === 'greet');
      expect(greetFunc).toBeDefined();
      expect(greetFunc?.metadata.args).toEqual(['name']);
      expect(greetFunc?.metadata.docstring).toBe('Greet a user');
      expect(greetFunc?.metadata.async).toBe(false);
      expect(greetFunc?.signature).toContain('def greet');

      const asyncFunc = funcAssertions.find(f => f.metadata.name === 'fetch_data');
      expect(asyncFunc?.metadata.async).toBe(true);
      expect(asyncFunc?.signature).toContain('async def fetch_data');
    });

    it('should extract classes from Python files', async () => {
      const pyFile: DiscoveredFile = {
        path: '/test/models.py',
        relativePath: 'models.py',
        language: 'python'
      };

      const pythonOutput = JSON.stringify({
        functions: [],
        classes: [
          {
            name: 'User',
            lineno: 1,
            bases: ['BaseModel'],
            methods: [
              { name: '__init__' },
              { name: 'save' },
              { name: 'delete' }
            ],
            docstring: 'User model class'
          }
        ],
        imports: []
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: pythonOutput,
        stderr: '',
        exitCode: 0
      } as any);

      const assertions = await extractAssertions([pyFile]);

      const classAssertions = assertions.filter(a => a.elementType === 'class');
      expect(classAssertions).toHaveLength(1);
      
      const userClass = classAssertions[0];
      expect(userClass.metadata.name).toBe('User');
      expect(userClass.metadata.bases).toEqual(['BaseModel']);
      expect(userClass.metadata.methods).toEqual(['__init__', 'save', 'delete']);
      expect(userClass.metadata.docstring).toBe('User model class');
    });

    it('should extract imports from Python files', async () => {
      const pyFile: DiscoveredFile = {
        path: '/test/app.py',
        relativePath: 'app.py',
        language: 'python'
      };

      const pythonOutput = JSON.stringify({
        functions: [],
        classes: [],
        imports: [
          {
            module: 'flask',
            names: ['Flask', 'request'],
            alias: null
          },
          {
            module: 'typing',
            names: ['Dict', 'List'],
            alias: null
          }
        ]
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: pythonOutput,
        stderr: '',
        exitCode: 0
      } as any);

      const assertions = await extractAssertions([pyFile]);

      const importAssertions = assertions.filter(a => a.elementType === 'import');
      expect(importAssertions).toHaveLength(2);
      
      const flaskImport = importAssertions.find(i => i.metadata.module === 'flask');
      expect(flaskImport).toBeDefined();
      expect(flaskImport?.metadata.names).toEqual(['Flask', 'request']);
    });

    it('should extract API endpoints from Python files', async () => {
      const pyFile: DiscoveredFile = {
        path: '/test/routes.py',
        relativePath: 'routes.py',
        language: 'python'
      };

      const pythonOutput = JSON.stringify({
        functions: [],
        classes: [],
        imports: [],
        api_endpoints: [
          {
            framework: 'flask',
            method: 'GET',
            path: '/api/users',
            function_name: 'get_users',
            lineno: 10,
            docstring: 'Get all users'
          },
          {
            framework: 'flask',
            method: 'POST',
            path: '/api/users',
            function_name: 'create_user',
            lineno: 20,
            docstring: null
          }
        ]
      });

      vi.mocked(execa).mockResolvedValue({
        stdout: pythonOutput,
        stderr: '',
        exitCode: 0
      } as any);

      const assertions = await extractAssertions([pyFile]);

      const endpointAssertions = assertions.filter(a => a.elementType === 'api_endpoint');
      expect(endpointAssertions).toHaveLength(2);
      
      const getUsersEndpoint = endpointAssertions.find(
        e => e.metadata.method === 'GET' && e.metadata.path === '/api/users'
      );
      expect(getUsersEndpoint).toBeDefined();
      expect(getUsersEndpoint?.metadata.framework).toBe('flask');
      expect(getUsersEndpoint?.metadata.function_name).toBe('get_users');
    });

    it('should handle Python extraction errors gracefully', async () => {
      const pyFile: DiscoveredFile = {
        path: '/test/error.py',
        relativePath: 'error.py',
        language: 'python'
      };

      vi.mocked(execa).mockRejectedValue(new Error('Python parser failed'));

      const assertions = await extractAssertions([pyFile]);

      // Should not throw, should handle error and return empty
      expect(assertions).toEqual([]);
    });

    it('should handle malformed Python parser output', async () => {
      const pyFile: DiscoveredFile = {
        path: '/test/bad.py',
        relativePath: 'bad.py',
        language: 'python'
      };

      vi.mocked(execa).mockResolvedValue({
        stdout: 'not valid json',
        stderr: '',
        exitCode: 0
      } as any);

      const assertions = await extractAssertions([pyFile]);

      // Should handle JSON parse error gracefully
      expect(assertions).toEqual([]);
    });
  });

  describe('Multiple files and languages', () => {
    it('should process multiple files of the same language', async () => {
      const files: DiscoveredFile[] = [
        { path: '/test/a.ts', relativePath: 'a.ts', language: 'typescript' },
        { path: '/test/b.ts', relativePath: 'b.ts', language: 'typescript' }
      ];

      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (path === '/test/a.ts') {
          return 'export function a() {}';
        }
        return 'export function b() {}';
      });

      const assertions = await extractAssertions(files);

      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(2);
      expect(funcAssertions.map(f => f.metadata.name).sort()).toEqual(['a', 'b']);
    });

    it('should process files from multiple languages', async () => {
      const files: DiscoveredFile[] = [
        { path: '/test/app.ts', relativePath: 'app.ts', language: 'typescript' },
        { path: '/test/api.py', relativePath: 'api.py', language: 'python' }
      ];

      vi.mocked(fs.readFile).mockResolvedValue('export function tsFunc() {}');
      vi.mocked(execa).mockResolvedValue({
        stdout: JSON.stringify({
          functions: [{ name: 'pyFunc', lineno: 1, args: [] }],
          classes: [],
          imports: []
        }),
        stderr: '',
        exitCode: 0
      } as any);

      const assertions = await extractAssertions(files);

      expect(assertions.length).toBeGreaterThan(0);
      expect(assertions.some(a => a.language === 'typescript')).toBe(true);
      expect(assertions.some(a => a.language === 'python')).toBe(true);
    });

    it('should continue processing if one file fails', async () => {
      const files: DiscoveredFile[] = [
        { path: '/test/good.ts', relativePath: 'good.ts', language: 'typescript' },
        { path: '/test/bad.ts', relativePath: 'bad.ts', language: 'typescript' },
        { path: '/test/another.ts', relativePath: 'another.ts', language: 'typescript' }
      ];

      vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (path === '/test/bad.ts') {
          throw new Error('File error');
        }
        return 'export function func() {}';
      });

      const assertions = await extractAssertions(files);

      // Should get assertions from good.ts and another.ts, but not bad.ts
      expect(assertions.length).toBeGreaterThan(0);
      const funcAssertions = assertions.filter(a => a.elementType === 'function');
      expect(funcAssertions).toHaveLength(2);
    });
  });

  describe('Empty inputs', () => {
    it('should handle empty file list', async () => {
      const assertions = await extractAssertions([]);
      expect(assertions).toEqual([]);
    });

    it('should handle files with unsupported language gracefully', async () => {
      const files: DiscoveredFile[] = [
        { path: '/test/unknown.xyz', relativePath: 'unknown.xyz', language: 'unknown' as any }
      ];

      const assertions = await extractAssertions(files);

      // Should return empty for unsupported language
      expect(assertions).toEqual([]);
    });
  });
});

