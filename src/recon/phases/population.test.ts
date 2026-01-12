/**
 * Tests for RECON Phase 5: Population
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { populateAiDoc } from './population.js';
import type { NormalizedAssertion } from './index.js';
import * as fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import { writeTracker } from '../../watch/write-tracker.js';
import { updateCoordinator } from '../../watch/update-coordinator.js';
import * as fullRecon from '../../watch/full-reconciliation.js';

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('../../watch/write-tracker.js');
vi.mock('../../watch/update-coordinator.js');
vi.mock('../../watch/full-reconciliation.js');

describe('populateAiDoc', () => {
  const projectRoot = '/test/project';
  const stateRoot = '.ste/state';
  const mockChecksum = 'abc123def456';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock basic file system operations
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockResolvedValue([]);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
    
    // Mock write tracker
    vi.mocked(writeTracker.recordWrite).mockResolvedValue(undefined);
    
    // Mock update coordinator
    vi.mocked(updateCoordinator.recordSliceWrite).mockReturnValue(undefined);
    
    // Mock checksum computation
    vi.mocked(fullRecon.computeFileChecksum).mockResolvedValue(mockChecksum);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Creating new slices', () => {
    it('should write new slices to appropriate directories', async () => {
      const assertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:app.ts:greet:1',
            domain: 'graph',
            type: 'function',
            source_files: ['app.ts'],
          },
          element: {
            name: 'greet',
            signature: 'function greet()',
          },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'test-extractor',
            file: 'app.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      const result = await populateAiDoc(assertions, projectRoot, stateRoot, ['app.ts']);

      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.unchanged).toBe(0);
      
      // Should have written the file
      expect(fs.writeFile).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writeCall[0]).toContain('graph');
      expect(writeCall[0]).toContain('functions');
      expect(writeCall[0]).toContain('.yaml');
    });

    it('should write module slices to modules directory', async () => {
      const assertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'module:app.ts',
            domain: 'graph',
            type: 'module',
            source_files: ['app.ts'],
          },
          element: {
            name: 'app',
            path: 'app.ts',
          },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'test-extractor',
            file: 'app.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      await populateAiDoc(assertions, projectRoot, stateRoot, ['app.ts']);

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writeCall[0]).toContain('graph');
      expect(writeCall[0]).toContain('modules');
    });

    it('should write API endpoint slices to endpoints directory', async () => {
      const assertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'api_endpoint:routes.py:GET:/users',
            domain: 'api',
            type: 'endpoint',
            source_files: ['routes.py'],
          },
          element: {
            method: 'GET',
            path: '/users',
          },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'test-extractor',
            file: 'routes.py',
            line: 1,
            language: 'python',
          },
        },
      ];

      await populateAiDoc(assertions, projectRoot, stateRoot, ['routes.py']);

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      expect(writeCall[0]).toContain('api');
      expect(writeCall[0]).toContain('endpoints');
    });

    it('should add source checksum to provenance', async () => {
      const assertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:app.ts:test:1',
            domain: 'graph',
            type: 'function',
            source_files: ['app.ts'],
          },
          element: { name: 'test' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'test-extractor',
            file: 'app.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      await populateAiDoc(assertions, projectRoot, stateRoot, ['app.ts']);

      // Should have computed checksum
      expect(fullRecon.computeFileChecksum).toHaveBeenCalledWith(
        expect.stringContaining('app.ts')
      );

      // Should have written file with checksum in provenance
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenContent = writeCall[1] as string;
      expect(writtenContent).toContain(mockChecksum);
    });

    it('should track writes with write tracker', async () => {
      const assertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:app.ts:test:1',
            domain: 'graph',
            type: 'function',
            source_files: ['app.ts'],
          },
          element: { name: 'test' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'test',
            file: 'app.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      await populateAiDoc(assertions, projectRoot, stateRoot, ['app.ts']);

      expect(writeTracker.recordWrite).toHaveBeenCalled();
    });

    it('should record generation with update coordinator when provided', async () => {
      const assertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:app.ts:test:1',
            domain: 'graph',
            type: 'function',
            source_files: ['app.ts'],
          },
          element: { name: 'test' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'test',
            file: 'app.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      await populateAiDoc(assertions, projectRoot, stateRoot, ['app.ts'], {
        generation: 42,
      });

      expect(updateCoordinator.recordSliceWrite).toHaveBeenCalledWith(
        42,
        expect.any(String)
      );
    });
  });

  describe('Updating existing slices', () => {
    it('should detect updates when content changes', async () => {
      // Mock prior state
      const priorSlice: NormalizedAssertion = {
        _slice: {
          id: 'function:app.ts:greet:1',
          domain: 'graph',
          type: 'function',
          source_files: ['app.ts'],
        },
        element: {
          name: 'greet',
          signature: 'function greet(name)',
        },
        provenance: {
          extracted_at: '2024-01-01T00:00:00Z',
          extractor: 'test',
          file: 'app.ts',
          line: 1,
          language: 'typescript',
        },
      };

      vi.mocked(fs.readdir).mockResolvedValue(['abc123.yaml'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(priorSlice));

      const updatedAssertion: NormalizedAssertion = {
        ...priorSlice,
        element: {
          ...priorSlice.element,
          signature: 'function greet(name, age)', // Changed
        },
      };

      const result = await populateAiDoc(
        [updatedAssertion],
        projectRoot,
        stateRoot,
        ['app.ts']
      );

      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.deleted).toBe(0);
      expect(result.unchanged).toBe(0);
    });

    it('should detect unchanged slices', async () => {
      const slice: NormalizedAssertion = {
        _slice: {
          id: 'function:app.ts:greet:1',
          domain: 'graph',
          type: 'function',
          source_files: ['app.ts'],
        },
        element: {
          name: 'greet',
          signature: 'function greet()',
        },
        provenance: {
          extracted_at: '2024-01-01T00:00:00Z',
          extractor: 'test',
          file: 'app.ts',
          line: 1,
          language: 'typescript',
          source_checksum: mockChecksum,
        },
      };

      vi.mocked(fs.readdir).mockResolvedValue(['abc123.yaml'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(slice));

      // Create a copy with same content but new timestamp
      const newSlice = { ...slice };

      const result = await populateAiDoc([newSlice], projectRoot, stateRoot, ['app.ts']);

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.unchanged).toBe(1);
    });
  });

  describe('Deleting orphaned slices', () => {
    it('should delete slices from processed files that no longer exist', async () => {
      // Mock prior state with a slice that will be orphaned
      const orphanedSlice: NormalizedAssertion = {
        _slice: {
          id: 'function:app.ts:oldFunc:1',
          domain: 'graph',
          type: 'function',
          source_files: ['app.ts'],
        },
        element: {
          name: 'oldFunc',
        },
        provenance: {
          extracted_at: '2024-01-01T00:00:00Z',
          extractor: 'test',
          file: 'app.ts',
          line: 1,
          language: 'typescript',
        },
      };

      vi.mocked(fs.readdir).mockResolvedValue(['abc123.yaml'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(orphanedSlice));

      // New assertions don't include the old function
      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:app.ts:newFunc:1',
            domain: 'graph',
            type: 'function',
            source_files: ['app.ts'],
          },
          element: {
            name: 'newFunc',
          },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'test',
            file: 'app.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      const result = await populateAiDoc(
        newAssertions,
        projectRoot,
        stateRoot,
        ['app.ts']
      );

      expect(result.deleted).toBe(1);
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should not delete slices from unprocessed files', async () => {
      // Mock prior state with slice from a different file
      const otherFileSlice: NormalizedAssertion = {
        _slice: {
          id: 'function:other.ts:func:1',
          domain: 'graph',
          type: 'function',
          source_files: ['other.ts'],
        },
        element: {
          name: 'func',
        },
        provenance: {
          extracted_at: '2024-01-01T00:00:00Z',
          extractor: 'test',
          file: 'other.ts',
          line: 1,
          language: 'typescript',
        },
      };

      vi.mocked(fs.readdir).mockResolvedValue(['abc123.yaml'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(otherFileSlice));

      // Process app.ts but not other.ts
      const result = await populateAiDoc([], projectRoot, stateRoot, ['app.ts']);

      // Should not delete slice from other.ts since we didn't process it
      expect(result.deleted).toBe(0);
    });

    it('should delete all slices in full reconciliation mode', async () => {
      const priorSlice: NormalizedAssertion = {
        _slice: {
          id: 'function:old.ts:func:1',
          domain: 'graph',
          type: 'function',
          source_files: ['old.ts'],
        },
        element: {
          name: 'func',
        },
        provenance: {
          extracted_at: '2024-01-01T00:00:00Z',
          extractor: 'test',
          file: 'old.ts',
          line: 1,
          language: 'typescript',
        },
      };

      vi.mocked(fs.readdir).mockResolvedValue(['abc123.yaml'] as any);
      vi.mocked(fs.readFile).mockResolvedValue(yaml.dump(priorSlice));

      // Full reconciliation with no new assertions
      const result = await populateAiDoc([], projectRoot, stateRoot, [], {
        fullReconciliation: true,
      });

      expect(result.deleted).toBe(1);
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty assertions array', async () => {
      const result = await populateAiDoc([], projectRoot, stateRoot, []);

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.unchanged).toBe(0);
    });

    it('should handle write errors gracefully', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));

      const assertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:app.ts:test:1',
            domain: 'graph',
            type: 'function',
            source_files: ['app.ts'],
          },
          element: { name: 'test' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'test',
            file: 'app.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      // Should not throw, just log warning
      await expect(
        populateAiDoc(assertions, projectRoot, stateRoot, ['app.ts'])
      ).resolves.toBeDefined();
    });

    it('should handle malformed prior state files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['malformed.yaml'] as any);
      vi.mocked(fs.readFile).mockResolvedValue('invalid: yaml: content:');

      // Should not throw when loading prior state
      await expect(
        populateAiDoc([], projectRoot, stateRoot, [])
      ).resolves.toBeDefined();
    });

    it('should handle missing prior state directory', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Directory not found'));

      // Should not throw, just continue with empty prior state
      const result = await populateAiDoc([], projectRoot, stateRoot, []);

      expect(result.priorState.size).toBe(0);
    });

    it('should handle assertions with no source files', async () => {
      const assertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'test:no-source',
            domain: 'graph',
            type: 'function',
            source_files: [],
          },
          element: { name: 'test' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'test',
            file: '',
            line: 0,
            language: 'typescript',
          },
        },
      ];

      // Should handle gracefully
      await expect(
        populateAiDoc(assertions, projectRoot, stateRoot, [])
      ).resolves.toBeDefined();
    });
  });

  describe('Directory structure', () => {
    it('should create all required state directories', async () => {
      await populateAiDoc([], projectRoot, stateRoot, []);

      // Should have created base state directories
      expect(fs.mkdir).toHaveBeenCalled();
      const mkdirCalls = vi.mocked(fs.mkdir).mock.calls;
      
      // Check some key directories were created
      const createdDirs = mkdirCalls.map(call => call[0] as string);
      expect(createdDirs.some(d => d.includes('graph') && d.includes('modules'))).toBe(true);
      expect(createdDirs.some(d => d.includes('graph') && d.includes('functions'))).toBe(true);
      expect(createdDirs.some(d => d.includes('api') && d.includes('endpoints'))).toBe(true);
    });
  });
});

