/**
 * Tests for RECON Phase Orchestration
 * Tests the main runReconPhases function that orchestrates all 7 phases
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runReconPhases, type ReconOptions } from './index.js';
import * as discovery from './discovery.js';
import * as extraction from './extraction.js';
import * as normalization from './normalization.js';
import * as inference from './inference.js';
import * as population from './population.js';
import * as divergence from './divergence.js';
import * as selfValidation from './self-validation.js';
import * as implementationIntent from '../implementation-intent.js';
import { ProjectDiscovery } from '../../discovery/index.js';

vi.mock('./discovery.js');
vi.mock('./extraction.js');
vi.mock('./normalization.js');
vi.mock('./inference.js');
vi.mock('./population.js');
vi.mock('./divergence.js');
vi.mock('./self-validation.js');
vi.mock('../implementation-intent.js');
const mockBuildFullManifest = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ version: 1, generatedAt: '2024-01-01T00:00:00Z', files: {} })
);
const mockWriteReconManifest = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../watch/change-detector.js', () => ({
  buildFullManifest: mockBuildFullManifest,
  writeReconManifest: mockWriteReconManifest,
  loadReconManifest: vi.fn(),
  manifestPath: vi.fn(),
}));
vi.mock('../../discovery/index.js');

describe('runReconPhases', () => {
  let projectRoot: string;
  const sourceRoot = 'src';
  const stateRoot = '.ste';

  beforeAll(async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'recon-phases-test-'));
    projectRoot = path.join(tempDir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
  });

  afterAll(async () => {
    if (projectRoot) {
      const tempDir = path.dirname(projectRoot);
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ProjectDiscovery
    const mockDiscover = vi.fn().mockResolvedValue({
      rootDir: projectRoot,
      domains: [
        { name: 'backend', type: 'server', rootPaths: ['src/backend'], confidence: 0.9 },
      ],
      architecture: 'monolith',
      discoveredAt: new Date(),
    });
    vi.mocked(ProjectDiscovery).mockImplementation(() => ({
      discover: mockDiscover,
      getDomainForFile: vi.fn(),
      getDomainType: vi.fn(),
      getFramework: vi.fn(),
    } as any));

    // Mock all phases
    vi.mocked(discovery.discoverFiles).mockResolvedValue([
      {
        path: path.join(projectRoot, 'src', 'test.ts'),
        relativePath: '/src/test.ts',
        language: 'typescript',
        changeType: 'unchanged',
      },
    ]);

    vi.mocked(discovery.discoverFilesLegacy).mockResolvedValue([
      {
        path: path.join(projectRoot, 'src', 'test.ts'),
        relativePath: '/src/test.ts',
        changeType: 'unchanged',
      },
    ]);

    vi.mocked(extraction.extractAssertions).mockResolvedValue([
      {
        elementId: 'function:test.ts:test:1',
        elementType: 'function',
        metadata: { name: 'test' },
        content: {},
      },
    ]);

    vi.mocked(normalization.normalizeAssertions).mockResolvedValue([
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
    ]);

    vi.mocked(inference.inferRelationships).mockReturnValue([
      {
        _slice: {
          id: 'function:test.ts:test:1',
          domain: 'graph',
          type: 'function',
          source_files: ['test.ts'],
          references: [],
          tags: [],
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
    ]);

    vi.mocked(population.populateAiDoc).mockResolvedValue({
      created: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      priorState: new Map(),
      currentState: new Map([
        [
          'function:test.ts:test:1',
          {
            _slice: {
              id: 'function:test.ts:test:1',
              domain: 'graph',
              type: 'function',
              source_files: ['test.ts'],
            },
            element: { id: 'function:test.ts:test:1', name: 'test' },
            provenance: {
              extracted_at: '2024-01-01T00:00:00Z',
              extractor: 'typescript-v1',
              file: 'test.ts',
              line: 1,
              language: 'typescript',
            },
          },
        ],
      ]),
    });

    vi.mocked(implementationIntent.writeImplementationAttributionEvidence).mockResolvedValue(undefined);

    vi.mocked(divergence.detectDivergence).mockResolvedValue({
      orphanedSlices: [],
      semanticEnrichments: [],
      validationSummary: {
        totalValidated: 1,
        orphaned: 0,
        enriched: 0,
        unchanged: 1,
      },
    });

    vi.mocked(selfValidation.runSelfValidation).mockResolvedValue({
      success: true,
      summary: {
        total_findings: 0,
        errors: 0,
        warnings: 0,
        info: 0,
      },
      findings: [],
    });
  });

  describe('Basic execution', () => {
    it('should execute all 7 phases successfully', async () => {
      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
      };

      const result = await runReconPhases(options);

      expect(result.success).toBe(true);
      expect(ProjectDiscovery).toHaveBeenCalledWith(projectRoot);
      expect(discovery.discoverFilesLegacy).toHaveBeenCalled();
      expect(extraction.extractAssertions).toHaveBeenCalled();
      expect(normalization.normalizeAssertions).toHaveBeenCalled();
      expect(inference.inferRelationships).toHaveBeenCalled();
      expect(population.populateAiDoc).toHaveBeenCalled();
      expect(implementationIntent.writeImplementationAttributionEvidence).toHaveBeenCalled();
      expect(divergence.detectDivergence).toHaveBeenCalled();
      expect(selfValidation.runSelfValidation).toHaveBeenCalled();
    });

    it('should use config-based discovery when config provided', async () => {
      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
        config: {
          projectRoot,
          sourceDirs: ['src', 'lib'],
          languages: ['typescript', 'python'],
          ignorePatterns: ['**/node_modules/**'],
          stateDir: '.ste',
        },
      };

      await runReconPhases(options);

      expect(discovery.discoverFiles).toHaveBeenCalledWith({
        projectRoot,
        sourceDirs: ['src', 'lib'],
        languages: ['typescript', 'python'],
        ignorePatterns: ['**/node_modules/**'],
      });
    });

    it('should normalize absolute config stateDir to project-relative path', async () => {
      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
        config: {
          projectRoot,
          sourceDirs: ['src'],
          languages: ['typescript'],
          ignorePatterns: [],
          stateDir: '/test',
        },
      };

      const result = await runReconPhases(options);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain("Absolute state root '/test' normalized to 'test'");
      expect(population.populateAiDoc).toHaveBeenCalledWith(
        expect.anything(),
        projectRoot,
        'test',
        expect.anything(),
        expect.anything()
      );
      expect(selfValidation.runSelfValidation).toHaveBeenCalledWith(
        expect.anything(),
        projectRoot,
        'test',
        sourceRoot,
        expect.anything()
      );
    });

    it('should continue successfully when manifest write fails', async () => {
      mockWriteReconManifest.mockRejectedValueOnce(
        new Error("EACCES: permission denied, mkdir '/test'")
      );

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
      };

      const result = await runReconPhases(options);

      expect(result.success).toBe(true);
      expect(result.warnings.some(w => w.includes('Manifest write skipped:'))).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw on discovery phase errors', async () => {
      vi.mocked(discovery.discoverFilesLegacy).mockRejectedValue(new Error('Discovery failed'));

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
      };

      await expect(runReconPhases(options)).rejects.toThrow('Discovery failed');
    });

    it('should throw on extraction phase errors', async () => {
      // Need to make discovery succeed first
      vi.mocked(discovery.discoverFilesLegacy).mockResolvedValue([
        { path: 'test.ts', relativePath: '/test.ts', changeType: 'unchanged' },
      ]);
      vi.mocked(extraction.extractAssertions).mockRejectedValue(new Error('Extraction failed'));

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
      };

      await expect(runReconPhases(options)).rejects.toThrow('Extraction failed');
    });

    it('should throw on population errors', async () => {
      // Need to make earlier phases succeed
      vi.mocked(discovery.discoverFilesLegacy).mockResolvedValue([
        { path: 'test.ts', relativePath: '/test.ts', changeType: 'unchanged' },
      ]);
      vi.mocked(population.populateAiDoc).mockRejectedValue(new Error('Population failed'));

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
      };

      await expect(runReconPhases(options)).rejects.toThrow('Population failed');
    });
  });

  describe('Empty file handling', () => {
    it('should handle zero discovered files gracefully', async () => {
      vi.mocked(discovery.discoverFilesLegacy).mockResolvedValue([]);

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
      };

      const result = await runReconPhases(options);

      // Should succeed but with no slices written
      expect(result.success).toBe(true);
      expect(result.conflictsDetected).toBe(0);
    });

    it('should handle files with no assertions', async () => {
      vi.mocked(extraction.extractAssertions).mockResolvedValue([]);

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
      };

      const result = await runReconPhases(options);

      expect(result.success).toBe(true);
    });
  });

  describe('Result construction', () => {
    it('should return correct statistics', async () => {
      vi.mocked(population.populateAiDoc).mockResolvedValue({
        created: 5,
        updated: 3,
        deleted: 1,
        unchanged: 1,
        priorState: new Map(),
        currentState: new Map(),
      });

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
      };

      const result = await runReconPhases(options);

      expect(result.success).toBe(true);
      expect(result.conflictsDetected).toBe(0); // No conflicts under new model
    });

    it('should include validation summary', async () => {
      vi.mocked(selfValidation.runSelfValidation).mockResolvedValue({
        success: true,
        summary: {
          total_findings: 3,
          errors: 1,
          warnings: 1,
          info: 1,
        },
        findings: [
          {
            category: 'ERROR',
            validator: 'schema',
            affected_artifacts: [],
            description: 'Test error',
            suggested_investigation: '',
          },
        ],
      });

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
      };

      const result = await runReconPhases(options);

      expect(result.success).toBe(true);
      // Validation is non-blocking, so success should still be true
    });
  });

  describe('Phase options propagation', () => {
    it('should pass validation verbosity to self-validation', async () => {
      // Need files to reach validation phase
      vi.mocked(discovery.discoverFilesLegacy).mockResolvedValue([
        { path: 'test.ts', relativePath: '/test.ts', changeType: 'unchanged' },
      ]);

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
        validationVerbosity: 'detailed',
      };

      await runReconPhases(options);

      expect(selfValidation.runSelfValidation).toHaveBeenCalledWith(
        expect.anything(),
        projectRoot,
        stateRoot,
        sourceRoot,
        expect.objectContaining({
          validationVerbosity: 'detailed',
        })
      );
    });

    it('should pass repeatability check option', async () => {
      // Need files to reach validation phase
      vi.mocked(discovery.discoverFilesLegacy).mockResolvedValue([
        { path: 'test.ts', relativePath: '/test.ts', changeType: 'unchanged' },
      ]);

      const options: ReconOptions = {
        projectRoot,
        sourceRoot,
        stateRoot,
        repeatabilityCheck: true,
      };

      await runReconPhases(options);

      expect(selfValidation.runSelfValidation).toHaveBeenCalledWith(
        expect.anything(),
        projectRoot,
        stateRoot,
        sourceRoot,
        expect.objectContaining({
          repeatabilityCheck: true,
        })
      );
    });
  });
});

