/**
 * Tests for RECON Phase 7: Self-Validation Orchestration
 * Tests non-blocking validation orchestration per E-ADR-002
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSelfValidation, type SelfValidationOptions } from './self-validation.js';
import type { NormalizedAssertion } from './index.js';
import * as schemaValidator from '../validation/schema-validator.js';
import * as repeatabilityValidator from '../validation/repeatability-validator.js';
import * as graphValidator from '../validation/graph-validator.js';
import * as identityValidator from '../validation/identity-validator.js';
import * as coverageValidator from '../validation/coverage-validator.js';
import * as reportGenerator from '../validation/report-generator.js';

vi.mock('../validation/schema-validator.js');
vi.mock('../validation/repeatability-validator.js');
vi.mock('../validation/graph-validator.js');
vi.mock('../validation/identity-validator.js');
vi.mock('../validation/coverage-validator.js');
vi.mock('../validation/report-generator.js');

describe('runSelfValidation', () => {
  const projectRoot = '/test/project';
  const stateRoot = '.ste';
  const sourceRoot = 'src';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementations - return empty findings
    vi.mocked(schemaValidator.validateSchema).mockResolvedValue([]);
    vi.mocked(repeatabilityValidator.validateRepeatability).mockResolvedValue([]);
    vi.mocked(graphValidator.validateGraph).mockResolvedValue([]);
    vi.mocked(identityValidator.validateIdentity).mockResolvedValue([]);
    vi.mocked(coverageValidator.validateCoverage).mockResolvedValue([]);
    vi.mocked(reportGenerator.generateReport).mockResolvedValue();
  });

  describe('Orchestration', () => {
    it('should run all validators in sequence', async () => {
      const assertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:test.ts:test:1',
            domain: 'graph',
            type: 'function',
            source_files: ['test.ts'],
          },
          element: { name: 'test' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'test.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      const result = await runSelfValidation(assertions, projectRoot, stateRoot, sourceRoot);

      expect(schemaValidator.validateSchema).toHaveBeenCalledOnce();
      expect(repeatabilityValidator.validateRepeatability).toHaveBeenCalledOnce();
      expect(graphValidator.validateGraph).toHaveBeenCalledOnce();
      expect(identityValidator.validateIdentity).toHaveBeenCalledOnce();
      expect(coverageValidator.validateCoverage).toHaveBeenCalledOnce();
      expect(result.success).toBe(true);
    });

    it('should pass correct context to validators', async () => {
      const assertions: NormalizedAssertion[] = [];

      await runSelfValidation(assertions, projectRoot, stateRoot, sourceRoot);

      expect(schemaValidator.validateSchema).toHaveBeenCalledWith(
        expect.objectContaining({
          assertions,
          projectRoot,
          sourceRoot,
          stateDir: expect.stringContaining('.ste'),
          repeatabilityCheck: false,
        })
      );
    });

    it('should respect repeatabilityCheck option', async () => {
      const assertions: NormalizedAssertion[] = [];
      const options: SelfValidationOptions = {
        repeatabilityCheck: true,
      };

      await runSelfValidation(assertions, projectRoot, stateRoot, sourceRoot, options);

      expect(repeatabilityValidator.validateRepeatability).toHaveBeenCalledWith(
        expect.objectContaining({ repeatabilityCheck: true }),
        expect.any(String) // runId
      );
    });
  });

  describe('Error handling (non-blocking)', () => {
    it('should continue when schema validator throws', async () => {
      vi.mocked(schemaValidator.validateSchema).mockRejectedValue(new Error('Schema crashed'));

      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      // Should still run other validators
      expect(repeatabilityValidator.validateRepeatability).toHaveBeenCalled();
      expect(graphValidator.validateGraph).toHaveBeenCalled();
      
      // Should record the error as a finding
      const errorFinding = result.findings.find(f => f.validator === 'schema');
      expect(errorFinding).toBeDefined();
      expect(errorFinding?.category).toBe('ERROR');
      expect(errorFinding?.description).toContain('crashed');
    });

    it('should continue when repeatability validator throws', async () => {
      vi.mocked(repeatabilityValidator.validateRepeatability).mockRejectedValue(
        new Error('Repeatability crashed')
      );

      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      // Should still run other validators
      expect(graphValidator.validateGraph).toHaveBeenCalled();
      expect(identityValidator.validateIdentity).toHaveBeenCalled();
      
      const errorFinding = result.findings.find(f => f.validator === 'repeatability');
      expect(errorFinding).toBeDefined();
      expect(errorFinding?.category).toBe('ERROR');
    });

    it('should continue when graph validator throws', async () => {
      vi.mocked(graphValidator.validateGraph).mockRejectedValue(new Error('Graph crashed'));

      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      // Should still run remaining validators
      expect(identityValidator.validateIdentity).toHaveBeenCalled();
      expect(coverageValidator.validateCoverage).toHaveBeenCalled();
      
      const errorFinding = result.findings.find(f => f.validator === 'graph');
      expect(errorFinding).toBeDefined();
    });

    it('should never throw - even if all validators crash', async () => {
      vi.mocked(schemaValidator.validateSchema).mockRejectedValue(new Error('1'));
      vi.mocked(repeatabilityValidator.validateRepeatability).mockRejectedValue(new Error('2'));
      vi.mocked(graphValidator.validateGraph).mockRejectedValue(new Error('3'));
      vi.mocked(identityValidator.validateIdentity).mockRejectedValue(new Error('4'));
      vi.mocked(coverageValidator.validateCoverage).mockRejectedValue(new Error('5'));

      // Should not throw
      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      expect(result).toBeDefined();
      expect(result.findings.length).toBeGreaterThan(0);
      // Success is always true (non-blocking) - errors are in findings
      expect(result.success).toBe(true);
    });
  });

  describe('Findings aggregation', () => {
    it('should aggregate findings from all validators', async () => {
      vi.mocked(schemaValidator.validateSchema).mockResolvedValue([
        {
          category: 'ERROR',
          validator: 'schema',
          affected_artifacts: ['test.ts'],
          description: 'Schema error',
          suggested_investigation: 'Fix schema',
        },
      ]);

      vi.mocked(graphValidator.validateGraph).mockResolvedValue([
        {
          category: 'WARNING',
          validator: 'graph',
          affected_artifacts: ['module.ts'],
          description: 'Graph warning',
          suggested_investigation: 'Check graph',
        },
      ]);

      vi.mocked(identityValidator.validateIdentity).mockResolvedValue([
        {
          category: 'INFO',
          validator: 'identity',
          affected_artifacts: [],
          description: 'All good',
          suggested_investigation: '',
        },
      ]);

      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      expect(result.findings).toHaveLength(3);
      expect(result.findings.some(f => f.validator === 'schema')).toBe(true);
      expect(result.findings.some(f => f.validator === 'graph')).toBe(true);
      expect(result.findings.some(f => f.validator === 'identity')).toBe(true);
    });

    it('should record ERRORs in summary', async () => {
      vi.mocked(schemaValidator.validateSchema).mockResolvedValue([
        {
          category: 'ERROR',
          validator: 'schema',
          affected_artifacts: [],
          description: 'Critical error',
          suggested_investigation: '',
        },
      ]);

      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      expect(result.success).toBe(true); // Non-blocking
      expect(result.summary.errors).toBe(1);
    });

    it('should record WARNINGs in summary', async () => {
      vi.mocked(graphValidator.validateGraph).mockResolvedValue([
        {
          category: 'WARNING',
          validator: 'graph',
          affected_artifacts: [],
          description: 'Minor warning',
          suggested_investigation: '',
        },
      ]);

      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      expect(result.success).toBe(true);
      expect(result.summary.warnings).toBe(1);
    });

    it('should record INFO in summary', async () => {
      vi.mocked(identityValidator.validateIdentity).mockResolvedValue([
        {
          category: 'INFO',
          validator: 'identity',
          affected_artifacts: [],
          description: 'Informational',
          suggested_investigation: '',
        },
      ]);

      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      expect(result.success).toBe(true);
      expect(result.summary.info).toBe(1);
    });
  });

  describe('Report generation', () => {
    it('should generate report with default verbosity', async () => {
      await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      expect(reportGenerator.generateReport).toHaveBeenCalledWith(
        expect.stringContaining('.ste'),
        expect.stringMatching(/^recon-\d+$/), // runId
        [],
        'summary'
      );
    });

    it('should respect validationVerbosity option', async () => {
      const options: SelfValidationOptions = {
        validationVerbosity: 'full',
      };

      await runSelfValidation([], projectRoot, stateRoot, sourceRoot, options);

      expect(reportGenerator.generateReport).toHaveBeenCalledWith(
        expect.stringContaining('.ste'),
        expect.any(String),
        [],
        'full'
      );
    });

    it('should respect silent verbosity', async () => {
      const options: SelfValidationOptions = {
        validationVerbosity: 'silent',
      };

      await runSelfValidation([], projectRoot, stateRoot, sourceRoot, options);

      expect(reportGenerator.generateReport).toHaveBeenCalledWith(
        expect.stringContaining('.ste'),
        expect.any(String),
        [],
        'silent'
      );
    });
  });

  describe('Result structure', () => {
    it('should return complete ValidationResult', async () => {
      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('findings');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.findings)).toBe(true);
      expect(result.summary).toHaveProperty('total_findings');
      expect(result.summary).toHaveProperty('errors');
      expect(result.summary).toHaveProperty('warnings');
      expect(result.summary).toHaveProperty('info');
    });

    it('should have accurate summary statistics', async () => {
      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      expect(result.summary.total_findings).toBe(0);
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.summary.info).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty assertions array', async () => {
      const result = await runSelfValidation([], projectRoot, stateRoot, sourceRoot);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle large number of assertions', async () => {
      const assertions: NormalizedAssertion[] = Array.from({ length: 1000 }, (_, i) => ({
        _slice: {
          id: `function:test${i}.ts:test${i}:1`,
          domain: 'graph',
          type: 'function',
          source_files: [`test${i}.ts`],
        },
        element: { name: `test${i}` },
        provenance: {
          extracted_at: '2024-01-01T00:00:00Z',
          extractor: 'typescript-v1',
          file: `test${i}.ts`,
          line: 1,
          language: 'typescript',
        },
      }));

      const result = await runSelfValidation(assertions, projectRoot, stateRoot, sourceRoot);

      expect(result).toBeDefined();
      expect(schemaValidator.validateSchema).toHaveBeenCalledWith(
        expect.objectContaining({ assertions })
      );
    });
  });
});

