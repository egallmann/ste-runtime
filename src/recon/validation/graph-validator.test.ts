/**
 * Tests for graph-validator.ts
 * 
 * Tests graph consistency validation.
 */

import { describe, it, expect } from 'vitest';
import { validateGraph } from './graph-validator.js';
import type { NormalizedAssertion } from '../phases/index.js';
import type { ValidatorContext } from './types.js';

function createModuleAssertion(
  id: string,
  imports: { internal?: unknown[]; external?: unknown[] } = {},
  exports: { classes?: unknown[]; functions?: unknown[]; constants?: unknown[] } = {}
): NormalizedAssertion {
  return {
    _slice: {
      id,
      domain: 'graph',
      type: 'module',
      source_files: [`src/${id}.ts`],
    },
    element: {
      path: `src/${id}.ts`,
      imports,
      exports,
    },
    provenance: {
      extracted_at: '2026-01-08T00:00:00.000Z',
      extractor: 'test-extractor@1.0.0',
      file: `src/${id}.ts`,
      line: 1,
      language: 'typescript',
    },
  } as NormalizedAssertion;
}

function createContext(assertions: NormalizedAssertion[]): ValidatorContext {
  return {
    assertions,
    projectRoot: '/test/project',
    sourceRoot: 'src',
    stateDir: '/test/project/.ste/state',
    repeatabilityCheck: false,
  };
}

describe('validateGraph', () => {
  describe('duplicate ID detection', () => {
    it('should detect duplicate IDs within same domain', async () => {
      const assertion1 = createModuleAssertion('duplicate-id');
      const assertion2 = createModuleAssertion('duplicate-id');
      const context = createContext([assertion1, assertion2]);

      const findings = await validateGraph(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('Duplicate ID')
      )).toBe(true);
    });

    it('should not flag unique IDs', async () => {
      const assertion1 = createModuleAssertion('module-a');
      const assertion2 = createModuleAssertion('module-b');
      const context = createContext([assertion1, assertion2]);

      const findings = await validateGraph(context);

      const duplicateErrors = findings.filter(f => 
        f.category === 'ERROR' && f.description.includes('Duplicate ID')
      );
      expect(duplicateErrors).toHaveLength(0);
    });
  });

  describe('import structure validation', () => {
    it('should validate well-formed internal imports', async () => {
      const assertion = createModuleAssertion('test', {
        internal: [
          { module: 'utils', symbols: ['helper'] },
          { module: 'types', symbols: ['Type'] },
        ],
      });
      const context = createContext([assertion]);

      const findings = await validateGraph(context);

      const importErrors = findings.filter(f => 
        f.category === 'ERROR' && f.description.includes('import')
      );
      expect(importErrors).toHaveLength(0);
    });

    it('should error on malformed internal import object', async () => {
      const assertion = createModuleAssertion('test', {
        internal: ['not-an-object'],
      });
      const context = createContext([assertion]);

      const findings = await validateGraph(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('Malformed internal import')
      )).toBe(true);
    });

    it('should error on internal import missing module field', async () => {
      const assertion = createModuleAssertion('test', {
        internal: [{ symbols: ['helper'] }], // missing 'module' field
      });
      const context = createContext([assertion]);

      const findings = await validateGraph(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('missing module field')
      )).toBe(true);
    });

    it('should error when internal imports is not an array', async () => {
      const assertion = createModuleAssertion('test', {
        internal: { invalid: 'structure' } as unknown as unknown[],
      });
      const context = createContext([assertion]);

      const findings = await validateGraph(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('imports.internal must be an array')
      )).toBe(true);
    });

    it('should error when external imports is not an array', async () => {
      const assertion = createModuleAssertion('test', {
        external: 'not-an-array' as unknown as unknown[],
      });
      const context = createContext([assertion]);

      const findings = await validateGraph(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('imports.external must be an array')
      )).toBe(true);
    });
  });

  describe('export structure validation', () => {
    it('should validate well-formed exports', async () => {
      const assertion = createModuleAssertion('test', {}, {
        classes: ['MyClass'],
        functions: ['myFunction'],
        constants: ['MY_CONST'],
      });
      const context = createContext([assertion]);

      const findings = await validateGraph(context);

      const exportErrors = findings.filter(f => 
        f.category === 'ERROR' && f.description.includes('exports')
      );
      expect(exportErrors).toHaveLength(0);
    });

    it('should error when exports.classes is not an array', async () => {
      const assertion = createModuleAssertion('test', {}, {
        classes: 'not-an-array' as unknown as unknown[],
      });
      const context = createContext([assertion]);

      const findings = await validateGraph(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('exports.classes must be an array')
      )).toBe(true);
    });

    it('should error when exports.functions is not an array', async () => {
      const assertion = createModuleAssertion('test', {}, {
        functions: { invalid: true } as unknown as unknown[],
      });
      const context = createContext([assertion]);

      const findings = await validateGraph(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('exports.functions must be an array')
      )).toBe(true);
    });
  });

  describe('unreferenced modules detection', () => {
    it('should report unreferenced modules as INFO', async () => {
      const assertion1 = createModuleAssertion('orphan-a');
      const assertion2 = createModuleAssertion('orphan-b');
      const context = createContext([assertion1, assertion2]);

      const findings = await validateGraph(context);

      expect(findings.some(f => 
        f.category === 'INFO' && f.description.includes('not referenced by other modules')
      )).toBe(true);
    });

    it('should count referenced modules correctly', async () => {
      const assertion1 = createModuleAssertion('main', {
        internal: [{ module: 'utils' }],
      });
      const assertion2 = createModuleAssertion('utils');
      const context = createContext([assertion1, assertion2]);

      const findings = await validateGraph(context);

      // Should report 1 unreferenced module (main is not referenced, utils is)
      const unreferencedInfo = findings.find(f => 
        f.description.includes('not referenced')
      );
      expect(unreferencedInfo?.description).toContain('1 module');
    });
  });

  describe('non-module assertions', () => {
    it('should skip validation for non-graph domain assertions', async () => {
      const apiAssertion: NormalizedAssertion = {
        _slice: {
          id: 'api-endpoint',
          domain: 'api',
          type: 'endpoint',
          source_files: ['src/api.ts'],
        },
        element: { method: 'GET', path: '/users' },
        provenance: {
          extracted_at: '2026-01-08T00:00:00.000Z',
          extractor: 'test',
          file: 'src/api.ts',
          line: 1,
          language: 'typescript',
        },
      } as NormalizedAssertion;
      const context = createContext([apiAssertion]);

      const findings = await validateGraph(context);

      // Should not have import/export errors for API assertions
      const structureErrors = findings.filter(f => 
        f.description.includes('imports') || f.description.includes('exports')
      );
      expect(structureErrors).toHaveLength(0);
    });
  });
});


