/**
 * Tests for schema-validator.ts
 * 
 * Tests AI-DOC schema conformance validation.
 */

import { describe, it, expect } from 'vitest';
import { validateSchema } from './schema-validator.js';
import type { NormalizedAssertion } from '../phases/index.js';
import type { ValidatorContext } from './types.js';

function createValidAssertion(overrides: Partial<NormalizedAssertion> = {}): NormalizedAssertion {
  return {
    _slice: {
      id: 'test-id',
      domain: 'graph',
      type: 'module',
      source_files: ['src/test.ts'],
      ...overrides._slice,
    },
    element: {
      name: 'TestElement',
      ...overrides.element,
    },
    provenance: {
      extracted_at: '2026-01-08T00:00:00.000Z',
      extractor: 'test-extractor@1.0.0',
      file: 'src/test.ts',
      line: 1,
      language: 'typescript',
      ...overrides.provenance,
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

describe('validateSchema', () => {
  describe('valid assertions', () => {
    it('should return no errors for valid assertion', async () => {
      const assertion = createValidAssertion();
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      const errors = findings.filter(f => f.category === 'ERROR');
      expect(errors).toHaveLength(0);
    });

    it('should validate all valid domains', async () => {
      const validDomains = [
        'project', 'entrypoints', 'api', 'data', 'graph', 'config',
        'errors', 'testing', 'domain', 'conventions', 'observability',
        'infrastructure', 'deployment', 'frontend', 'behavior',
      ];

      for (const domain of validDomains) {
        const assertion = createValidAssertion({
          _slice: { id: 'test', domain, type: 'module', source_files: ['test.ts'] },
        });
        const context = createContext([assertion]);

        const findings = await validateSchema(context);
        const domainWarnings = findings.filter(
          f => f.category === 'WARNING' && f.description.includes('Unknown domain')
        );
        expect(domainWarnings).toHaveLength(0);
      }
    });
  });

  describe('_slice validation', () => {
    it('should error on missing _slice block', async () => {
      const assertion = { element: {}, provenance: {} } as unknown as NormalizedAssertion;
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('Missing _slice metadata')
      )).toBe(true);
    });

    it('should error on missing required _slice fields', async () => {
      const assertion = {
        _slice: { id: 'test' }, // missing domain, type, source_files
        element: {},
        provenance: {
          extracted_at: '2026-01-08T00:00:00.000Z',
          extractor: 'test',
          file: 'test.ts',
          line: 1,
        },
      } as unknown as NormalizedAssertion;
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      const errors = findings.filter(f => f.category === 'ERROR');
      expect(errors.some(f => f.description.includes('domain'))).toBe(true);
      expect(errors.some(f => f.description.includes('type'))).toBe(true);
      expect(errors.some(f => f.description.includes('source_files'))).toBe(true);
    });

    it('should warn on unknown domain', async () => {
      const assertion = createValidAssertion({
        _slice: { id: 'test', domain: 'unknown_domain', type: 'module', source_files: ['test.ts'] },
      });
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      expect(findings.some(f => 
        f.category === 'WARNING' && f.description.includes('Unknown domain')
      )).toBe(true);
    });

    it('should error when source_files is not an array', async () => {
      const assertion = createValidAssertion();
      (assertion._slice as Record<string, unknown>).source_files = 'not-an-array';
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('source_files must be an array')
      )).toBe(true);
    });

    it('should warn when source_files is empty', async () => {
      const assertion = createValidAssertion({
        _slice: { id: 'test', domain: 'graph', type: 'module', source_files: [] },
      });
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      expect(findings.some(f => 
        f.category === 'WARNING' && f.description.includes('source_files array is empty')
      )).toBe(true);
    });
  });

  describe('provenance validation', () => {
    it('should error on missing provenance block', async () => {
      const assertion = {
        _slice: { id: 'test', domain: 'graph', type: 'module', source_files: ['test.ts'] },
        element: {},
      } as unknown as NormalizedAssertion;
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      expect(findings.some(f => 
        f.category === 'ERROR' && f.description.includes('Missing provenance metadata')
      )).toBe(true);
    });

    it('should error on missing required provenance fields', async () => {
      const assertion = {
        _slice: { id: 'test', domain: 'graph', type: 'module', source_files: ['test.ts'] },
        element: {},
        provenance: { extracted_at: '2026-01-08T00:00:00.000Z' }, // missing other fields
      } as unknown as NormalizedAssertion;
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      const errors = findings.filter(f => f.category === 'ERROR');
      expect(errors.some(f => f.description.includes('extractor'))).toBe(true);
      expect(errors.some(f => f.description.includes('file'))).toBe(true);
      expect(errors.some(f => f.description.includes('line'))).toBe(true);
    });

    it('should warn on non-ISO-8601 timestamp', async () => {
      const assertion = createValidAssertion();
      assertion.provenance.extracted_at = '2026/01/08 00:00:00'; // Invalid format
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      expect(findings.some(f => 
        f.category === 'WARNING' && f.description.includes('not in ISO-8601 format')
      )).toBe(true);
    });

    it('should accept valid ISO-8601 timestamp without milliseconds', async () => {
      const assertion = createValidAssertion();
      assertion.provenance.extracted_at = '2026-01-08T00:00:00Z';
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      const timestampWarnings = findings.filter(f => 
        f.description.includes('ISO-8601')
      );
      expect(timestampWarnings).toHaveLength(0);
    });
  });

  describe('element validation', () => {
    it('should warn on missing element block', async () => {
      const assertion = {
        _slice: { id: 'test', domain: 'graph', type: 'module', source_files: ['test.ts'] },
        provenance: {
          extracted_at: '2026-01-08T00:00:00.000Z',
          extractor: 'test',
          file: 'test.ts',
          line: 1,
        },
      } as unknown as NormalizedAssertion;
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      expect(findings.some(f => 
        f.category === 'WARNING' && f.description.includes('Missing or invalid element')
      )).toBe(true);
    });

    it('should warn when element is not an object', async () => {
      const assertion = createValidAssertion();
      (assertion as Record<string, unknown>).element = 'not-an-object';
      const context = createContext([assertion]);

      const findings = await validateSchema(context);

      expect(findings.some(f => 
        f.category === 'WARNING' && f.description.includes('Missing or invalid element')
      )).toBe(true);
    });
  });

  describe('multiple assertions', () => {
    it('should validate all assertions', async () => {
      const validAssertion = createValidAssertion({ _slice: { id: 'valid', domain: 'graph', type: 'module', source_files: ['a.ts'] } });
      const invalidAssertion = {
        _slice: { id: 'invalid' }, // missing required fields
        element: {},
        provenance: {},
      } as unknown as NormalizedAssertion;
      
      const context = createContext([validAssertion, invalidAssertion]);

      const findings = await validateSchema(context);

      // Should have errors from the invalid assertion
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some(f => f.affected_artifacts.includes('invalid'))).toBe(true);
    });
  });
});

