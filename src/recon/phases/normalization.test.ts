/**
 * Tests for RECON Phase 4: Normalization
 */

import { describe, it, expect } from 'vitest';
import { normalizeAssertions } from './normalization.js';
import type { RawAssertion } from './index.js';

describe('normalizeAssertions', () => {
  const projectRoot = '/test/project';

  describe('Function normalization', () => {
    it('should normalize TypeScript functions', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'function:app.ts:greet:5',
          elementType: 'function',
          file: 'app.ts',
          line: 5,
          language: 'typescript',
          signature: 'function greet(name: string): string',
          metadata: {
            name: 'greet',
            isExported: true,
            isAsync: false,
            parameters: ['name'],
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      // Should have module + function
      expect(normalized.length).toBeGreaterThanOrEqual(2);

      const funcSlice = normalized.find(n => n._slice.type === 'function');
      expect(funcSlice).toBeDefined();
      expect(funcSlice?._slice.domain).toBe('graph');
      expect(funcSlice?.element.name).toBe('greet');
      expect(funcSlice?.element.signature).toBe('function greet(name: string): string');
      expect(funcSlice?.element.is_exported).toBe(true);
      expect(funcSlice?.element.is_async).toBe(false);
      expect(funcSlice?.element.parameters).toEqual(['name']);
      expect(funcSlice?.provenance.file).toBe('app.ts');
      expect(funcSlice?.provenance.line).toBe(5);
      expect(funcSlice?.provenance.language).toBe('typescript');
    });

    it('should normalize Python functions', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'function:api.py:fetch_data:10',
          elementType: 'function',
          file: 'api.py',
          line: 10,
          language: 'python',
          signature: 'async def fetch_data(url: str) -> dict',
          metadata: {
            name: 'fetch_data',
            args: ['url'],
            returns: 'dict',
            async: true,
            decorators: ['@cache'],
            implementationIntent: {
              implements_adrs: ['ADR-L-0004'],
              enforced_invariants: ['INV-0006'],
              confidence: 'declared',
              source: 'decorator',
            },
            docstring: 'Fetch data from URL',
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const funcSlice = normalized.find(n => n._slice.type === 'function');
      expect(funcSlice).toBeDefined();
      expect(funcSlice?.element.name).toBe('fetch_data');
      expect(funcSlice?.element.is_async).toBe(true);
      expect(funcSlice?.element.parameters).toEqual(['url']);
      expect(funcSlice?.element.docstring).toBe('Fetch data from URL');
      expect(funcSlice?.element.decorators).toEqual(['@cache']);
      expect(funcSlice?.element.implementation_intent).toEqual({
        implements_adrs: ['ADR-L-0004'],
        enforced_invariants: ['INV-0006'],
        confidence: 'declared',
        source: 'decorator',
      });
      expect(funcSlice?.provenance.language).toBe('python');
    });

    it('should handle functions without docstrings', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'function:util.ts:helper:1',
          elementType: 'function',
          file: 'util.ts',
          line: 1,
          language: 'typescript',
          metadata: {
            name: 'helper',
            isExported: false,
            parameters: [],
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const funcSlice = normalized.find(n => n._slice.type === 'function');
      expect(funcSlice).toBeDefined();
      expect(funcSlice?.element.docstring).toBeUndefined();
    });
  });

  describe('Class normalization', () => {
    it('should normalize TypeScript classes', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'class:user.ts:UserService',
          elementType: 'class',
          file: 'user.ts',
          line: 10,
          language: 'typescript',
          metadata: {
            name: 'UserService',
            isExported: true,
            methods: ['constructor', 'getUser', 'saveUser'],
            properties: ['users', 'cache'],
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const classSlice = normalized.find(n => n._slice.type === 'class');
      expect(classSlice).toBeDefined();
      expect(classSlice?._slice.domain).toBe('graph');
      expect(classSlice?.element.name).toBe('UserService');
      expect(classSlice?.element.is_exported).toBe(true);
      expect(classSlice?.element.methods).toEqual(['constructor', 'getUser', 'saveUser']);
      expect(classSlice?.element.properties).toEqual(['users', 'cache']);
    });

    it('should normalize Python classes with inheritance', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'class:models.py:User',
          elementType: 'class',
          file: 'models.py',
          line: 5,
          language: 'python',
          metadata: {
            name: 'User',
            bases: ['BaseModel', 'TimestampMixin'],
            methods: ['__init__', 'save', 'delete'],
            docstring: 'User model class',
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const classSlice = normalized.find(n => n._slice.type === 'class');
      expect(classSlice).toBeDefined();
      expect(classSlice?.element.name).toBe('User');
      expect(classSlice?.element.bases).toEqual(['BaseModel', 'TimestampMixin']);
      expect(classSlice?.element.docstring).toBe('User model class');
      expect(classSlice?.provenance.language).toBe('python');
    });
  });

  describe('Module normalization', () => {
    it('should create module slice from file assertions', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'function:app.ts:func1:1',
          elementType: 'function',
          file: 'app.ts',
          line: 1,
          language: 'typescript',
          metadata: { name: 'func1', parameters: [] },
        },
        {
          elementId: 'function:app.ts:func2:10',
          elementType: 'function',
          file: 'app.ts',
          line: 10,
          language: 'typescript',
          metadata: { name: 'func2', parameters: [] },
        },
        {
          elementId: 'class:app.ts:MyClass',
          elementType: 'class',
          file: 'app.ts',
          line: 20,
          language: 'typescript',
          metadata: { name: 'MyClass', methods: [] },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const moduleSlice = normalized.find(n => n._slice.type === 'module');
      expect(moduleSlice).toBeDefined();
      expect(moduleSlice?._slice.domain).toBe('graph');
      expect(moduleSlice?.element.name).toBe('app');
      expect(moduleSlice?.element.language).toBe('typescript');
      const exports = moduleSlice?.element.exports as { functions: string[]; classes: string[] };
      expect(exports.functions).toEqual(['func1', 'func2']);
      expect(exports.classes).toEqual(['MyClass']);
    });

    it('should separate internal and external imports', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'import:app.ts:./user',
          elementType: 'import',
          file: 'app.ts',
          line: 1,
          language: 'typescript',
          metadata: {
            module: './user',
            names: ['User'],
          },
        },
        {
          elementId: 'import:app.ts:express',
          elementType: 'import',
          file: 'app.ts',
          line: 2,
          language: 'typescript',
          metadata: {
            module: 'express',
            names: ['Express'],
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const moduleSlice = normalized.find(n => n._slice.type === 'module');
      expect(moduleSlice).toBeDefined();
      const imports = moduleSlice?.element.imports as { internal: Array<{ module: string }>; external: Array<{ module: string }> };
      expect(imports.internal).toHaveLength(1);
      expect(imports.internal[0].module).toBe('./user');
      expect(imports.external).toHaveLength(1);
      expect(imports.external[0].module).toBe('express');
    });
  });

  describe('API endpoint normalization', () => {
    it('should normalize API endpoints', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'api_endpoint:routes.py:GET:/api/users',
          elementType: 'api_endpoint',
          file: 'routes.py',
          line: 10,
          language: 'python',
          metadata: {
            framework: 'flask',
            method: 'GET',
            path: '/api/users',
            function_name: 'get_users',
            docstring: 'Retrieve all users',
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const endpointSlice = normalized.find(n => n._slice.type === 'endpoint');
      expect(endpointSlice).toBeDefined();
      expect(endpointSlice?._slice.domain).toBe('api');
      expect(endpointSlice?.element.framework).toBe('flask');
      expect(endpointSlice?.element.method).toBe('GET');
      expect(endpointSlice?.element.path).toBe('/api/users');
      expect(endpointSlice?.element.function_name).toBe('get_users');
      expect(endpointSlice?.element.docstring).toBe('Retrieve all users');
    });

    it('should include API endpoints in module slice', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'api_endpoint:routes.py:GET:/users',
          elementType: 'api_endpoint',
          file: 'routes.py',
          line: 5,
          language: 'python',
          metadata: {
            method: 'GET',
            path: '/users',
            function_name: 'list_users',
          },
        },
        {
          elementId: 'api_endpoint:routes.py:POST:/users',
          elementType: 'api_endpoint',
          file: 'routes.py',
          line: 10,
          language: 'python',
          metadata: {
            method: 'POST',
            path: '/users',
            function_name: 'create_user',
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const moduleSlice = normalized.find(n => n._slice.type === 'module');
      expect(moduleSlice).toBeDefined();
      const endpoints = moduleSlice?.element.api_endpoints as Array<{ method: string }>;
      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].method).toBe('GET');
      expect(endpoints[1].method).toBe('POST');
    });
  });

  describe('CloudFormation normalization', () => {
    it('should carry template implementation intent into normalized slices', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'cfn_template:infra/template.yaml:template',
          elementType: 'cfn_template',
          file: 'infra/template.yaml',
          line: 1,
          language: 'cloudformation',
          metadata: {
            name: 'template',
            description: 'stack',
            resourceCount: 1,
            parameterCount: 0,
            outputCount: 0,
            implementationIntent: {
              implements_adrs: ['ADR-L-0004', 'ADR-PS-0004'],
              enforced_invariants: [],
              confidence: 'declared',
              source: 'metadata',
            },
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);
      const templateSlice = normalized.find(n => n._slice.type === 'template');

      expect(templateSlice).toBeDefined();
      expect(templateSlice?.element.implementation_intent).toEqual({
        implements_adrs: ['ADR-L-0004', 'ADR-PS-0004'],
        enforced_invariants: [],
        confidence: 'declared',
        source: 'metadata',
      });
    });
  });

  describe('Data model normalization', () => {
    it('should normalize Python data models', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'data_model:models.py:User',
          elementType: 'data_model',
          file: 'models.py',
          line: 5,
          language: 'python',
          metadata: {
            name: 'User',
            fields: [
              { name: 'id', type: 'int' },
              { name: 'username', type: 'str' },
              { name: 'email', type: 'str' },
            ],
            docstring: 'User data model',
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const entitySlice = normalized.find(
        n => n._slice.type === 'entity' || n._slice.type === 'data_model'
      );
      expect(entitySlice).toBeDefined();
      expect(entitySlice?._slice.domain).toBe('data');
      expect(entitySlice?.element.name).toBe('User');
    });

    it('should include data models in module exports', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'data_model:models.py:User',
          elementType: 'data_model',
          file: 'models.py',
          line: 1,
          language: 'python',
          metadata: {
            name: 'User',
            fields: [],
          },
        },
        {
          elementId: 'data_model:models.py:Product',
          elementType: 'data_model',
          file: 'models.py',
          line: 10,
          language: 'python',
          metadata: {
            name: 'Product',
            fields: [],
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const moduleSlice = normalized.find(n => n._slice.type === 'module');
      expect(moduleSlice).toBeDefined();
      const exports = moduleSlice?.element.exports as { data_models: string[] };
      expect(exports.data_models).toEqual(['User', 'Product']);
    });
  });

  describe('Multiple files', () => {
    it('should create separate module slices for different files', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'function:app.ts:func1:1',
          elementType: 'function',
          file: 'app.ts',
          line: 1,
          language: 'typescript',
          metadata: { name: 'func1', parameters: [] },
        },
        {
          elementId: 'function:user.ts:func2:1',
          elementType: 'function',
          file: 'user.ts',
          line: 1,
          language: 'typescript',
          metadata: { name: 'func2', parameters: [] },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const moduleSlices = normalized.filter(n => n._slice.type === 'module');
      expect(moduleSlices).toHaveLength(2);
      
      const appModule = moduleSlices.find(m => m.element.path === 'app.ts');
      const userModule = moduleSlices.find(m => m.element.path === 'user.ts');
      
      expect(appModule).toBeDefined();
      expect(userModule).toBeDefined();
      const appExports = appModule?.element.exports as { functions: string[] };
      const userExports = userModule?.element.exports as { functions: string[] };
      expect(appExports.functions).toEqual(['func1']);
      expect(userExports.functions).toEqual(['func2']);
    });
  });

  describe('Provenance', () => {
    it('should include proper provenance metadata', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'function:app.ts:test:1',
          elementType: 'function',
          file: 'app.ts',
          line: 1,
          language: 'typescript',
          metadata: { name: 'test', parameters: [] },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const funcSlice = normalized.find(n => n._slice.type === 'function');
      expect(funcSlice?.provenance.extractor).toBe('recon-typescript-extractor-v1');
      expect(funcSlice?.provenance.file).toBe('app.ts');
      expect(funcSlice?.provenance.line).toBe(1);
      expect(funcSlice?.provenance.language).toBe('typescript');
      expect(funcSlice?.provenance.extracted_at).toBeDefined();
    });

    it('should use correct extractor names for different languages', async () => {
      const assertions = [
        {
          elementId: 'function:app.ts:f1:1',
          elementType: 'function' as const,
          file: 'app.ts',
          line: 1,
          language: 'typescript' as const,
          metadata: { name: 'f1', parameters: [] },
        },
        {
          elementId: 'function:api.py:f2:1',
          elementType: 'function' as const,
          file: 'api.py',
          line: 1,
          language: 'python' as const,
          metadata: { name: 'f2', parameters: [] },
        },
      ];

      const normalized = await normalizeAssertions(assertions, projectRoot);

      const tsFunc = normalized.find(
        n => n._slice.type === 'function' && n.provenance.language === 'typescript'
      );
      const pyFunc = normalized.find(
        n => n._slice.type === 'function' && n.provenance.language === 'python'
      );

      expect(tsFunc?.provenance.extractor).toBe('recon-typescript-extractor-v1');
      expect(pyFunc?.provenance.extractor).toBe('recon-python-extractor-v1');
    });
  });

  describe('JSON data model normalization', () => {
    it('should normalize control from JSON', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'control:S3.1',
          elementType: 'data_model',
          file: 'controls/s3.json',
          line: 1,
          language: 'json',
          metadata: {
            jsonCategory: 'control',
            controlId: 'S3.1',
            title: 'S3 Bucket Security',
            severity: 'High',
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const control = normalized.find(n => n._slice.type === 'control');
      expect(control).toBeDefined();
      expect(control?._slice.domain).toBe('data');
      expect(control?.element.controlId).toBe('S3.1');
    });

    it('should normalize schema from JSON', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'schema:schemas/user.json',
          elementType: 'data_model',
          file: 'schemas/user.json',
          line: 1,
          language: 'json',
          metadata: {
            jsonCategory: 'schema',
            entity: 'User',
            tableName: 'users',
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const schema = normalized.find(n => n._slice.type === 'schema');
      expect(schema).toBeDefined();
      expect(schema?._slice.domain).toBe('data');
      expect(schema?.element.entity).toBe('User');
    });

    it('should normalize config from JSON', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'config:params/prod.json',
          elementType: 'data_model',
          file: 'params/prod.json',
          line: 1,
          language: 'json',
          metadata: {
            jsonCategory: 'config',
            environment: 'production',
            parameters: { VpcId: 'vpc-123' },
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const config = normalized.find(n => n._slice.type === 'config');
      expect(config).toBeDefined();
      expect(config?._slice.domain).toBe('infrastructure');
      expect(config?.element.environment).toBe('production');
    });

    it('should normalize reference data from JSON', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'reference:seed/regions.json:us-east-1',
          elementType: 'data_model',
          file: 'seed/regions.json',
          line: 1,
          language: 'json',
          metadata: {
            jsonCategory: 'reference',
            id: 'us-east-1',
            name: 'US East',
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const ref = normalized.find(n => n._slice.type === 'reference');
      expect(ref).toBeDefined();
      expect(ref?._slice.domain).toBe('data');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty assertions array', async () => {
      const normalized = await normalizeAssertions([], projectRoot);
      expect(normalized).toEqual([]);
    });

    it('should handle assertions with minimal metadata', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'function:minimal.ts:func:1',
          elementType: 'function',
          file: 'minimal.ts',
          line: 1,
          language: 'typescript',
          metadata: {
            name: 'func',
          },
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      const funcSlice = normalized.find(n => n._slice.type === 'function');
      expect(funcSlice).toBeDefined();
      expect(funcSlice?.element.name).toBe('func');
      // Should not error on missing optional fields
    });

    it('should handle unknown element types gracefully', async () => {
      const rawAssertions: RawAssertion[] = [
        {
          elementId: 'unknown:file.ts:thing',
          elementType: 'unknown_type' as any,
          file: 'file.ts',
          line: 1,
          language: 'typescript',
          metadata: {},
        },
      ];

      const normalized = await normalizeAssertions(rawAssertions, projectRoot);

      // Should create module slice but not element slice for unknown type
      const moduleSlice = normalized.find(n => n._slice.type === 'module');
      expect(moduleSlice).toBeDefined();
    });
  });
});
