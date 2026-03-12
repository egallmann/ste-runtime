/**
 * Tests for RECON Phase 6: Divergence Detection & State Validation
 * Tests semantic enrichment detection and orphaned slice identification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectDivergence } from './divergence.js';
import type { NormalizedAssertion } from './index.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');

describe('detectDivergence', () => {
  const projectRoot = '/test/project';
  const stateRoot = '.ste';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Orphaned slice detection', () => {
    it('should identify slices removed from source', async () => {
      const priorState = new Map<string, NormalizedAssertion>([
        ['function:old.ts:removed:5', {
          _slice: {
            id: 'function:old.ts:removed:5',
            domain: 'graph',
            type: 'function',
            source_files: ['old.ts'],
          },
          element: { name: 'removed', signature: 'function removed()' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'old.ts',
            line: 5,
            language: 'typescript',
          },
        }],
        ['function:kept.ts:kept:10', {
          _slice: {
            id: 'function:kept.ts:kept:10',
            domain: 'graph',
            type: 'function',
            source_files: ['kept.ts'],
          },
          element: { name: 'kept', signature: 'function kept()' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'kept.ts',
            line: 10,
            language: 'typescript',
          },
        }],
      ]);

      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:kept.ts:kept:10',
            domain: 'graph',
            type: 'function',
            source_files: ['kept.ts'],
          },
          element: { name: 'kept', signature: 'function kept()' },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'kept.ts',
            line: 10,
            language: 'typescript',
          },
        },
      ];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.orphanedSlices).toContain('function:old.ts:removed:5');
      expect(result.orphanedSlices).not.toContain('function:kept.ts:kept:10');
      expect(result.validationSummary.orphaned).toBe(1);
    });

    it('should handle no orphaned slices', async () => {
      const priorState = new Map<string, NormalizedAssertion>();
      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:new.ts:new:1',
            domain: 'graph',
            type: 'function',
            source_files: ['new.ts'],
          },
          element: { name: 'new' },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'new.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.orphanedSlices).toHaveLength(0);
      expect(result.validationSummary.orphaned).toBe(0);
    });
  });

  describe('Semantic enrichment detection', () => {
    it('should detect signature changes in functions', async () => {
      const priorState = new Map<string, NormalizedAssertion>([
        ['function:app.ts:greet:5', {
          _slice: {
            id: 'function:app.ts:greet:5',
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
            extractor: 'typescript-v1',
            file: 'app.ts',
            line: 5,
            language: 'typescript',
          },
        }],
      ]);

      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:app.ts:greet:5',
            domain: 'graph',
            type: 'function',
            source_files: ['app.ts'],
          },
          element: {
            name: 'greet',
            signature: 'function greet(name: string): string',
          },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'app.ts',
            line: 5,
            language: 'typescript',
          },
        },
      ];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.semanticEnrichments).toHaveLength(1);
      expect(result.semanticEnrichments[0].enrichment_type).toBe('signature_change');
      expect(result.semanticEnrichments[0].description).toContain('Authoritative update');
    });

    it('should detect signature changes from improved extractor', async () => {
      const priorState = new Map<string, NormalizedAssertion>([
        ['function:app.component.ts:ngOnInit:10', {
          _slice: {
            id: 'function:app.component.ts:ngOnInit:10',
            domain: 'graph',
            type: 'function',
            source_files: ['app.component.ts'],
          },
          element: {
            name: 'ngOnInit',
            signature: 'function ngOnInit()',
          },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'app.component.ts',
            line: 10,
            language: 'typescript',
          },
        }],
      ]);

      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:app.component.ts:ngOnInit:10',
            domain: 'graph',
            type: 'function',
            source_files: ['app.component.ts'],
          },
          element: {
            name: 'ngOnInit',
            signature: 'ngOnInit(): void',
          },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'angular-v1',
            file: 'app.component.ts',
            line: 10,
            language: 'angular',
          },
        },
      ];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.semanticEnrichments).toHaveLength(1);
      expect(result.semanticEnrichments[0].enrichment_type).toBe('signature_change');
      expect(result.semanticEnrichments[0].description).toContain('Semantic enrichment');
      expect(result.semanticEnrichments[0].description).toContain('improved extractor');
      expect(result.semanticEnrichments[0].prior_extractor).toBe('typescript-v1');
      expect(result.semanticEnrichments[0].current_extractor).toBe('angular-v1');
    });

    it('should detect class structure changes', async () => {
      const priorState = new Map<string, NormalizedAssertion>([
        ['class:user.ts:User:5', {
          _slice: {
            id: 'class:user.ts:User:5',
            domain: 'graph',
            type: 'class',
            source_files: ['user.ts'],
          },
          element: {
            name: 'User',
            methods: ['getName', 'getEmail'],
            properties: ['name', 'email'],
          },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'user.ts',
            line: 5,
            language: 'typescript',
          },
        }],
      ]);

      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'class:user.ts:User:5',
            domain: 'graph',
            type: 'class',
            source_files: ['user.ts'],
          },
          element: {
            name: 'User',
            methods: ['getName', 'getEmail', 'setName', 'setEmail'],
            properties: ['name', 'email'],
          },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'user.ts',
            line: 5,
            language: 'typescript',
          },
        },
      ];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.semanticEnrichments).toHaveLength(1);
      expect(result.semanticEnrichments[0].enrichment_type).toBe('structure_change');
      expect(result.semanticEnrichments[0].description).toContain('Structure changed');
    });

    it('should detect ownership changes', async () => {
      const priorState = new Map<string, NormalizedAssertion>([
        ['class:old-path/user.ts:User:5', {
          _slice: {
            id: 'class:old-path/user.ts:User:5',
            domain: 'graph',
            type: 'class',
            source_files: ['old-path/user.ts'],
          },
          element: {
            name: 'User',
          },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'old-path/user.ts',
            line: 5,
            language: 'typescript',
          },
        }],
      ]);

      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'class:old-path/user.ts:User:5',
            domain: 'graph',
            type: 'class',
            source_files: ['new-path/user.ts'],
          },
          element: {
            name: 'User',
          },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'new-path/user.ts',
            line: 5,
            language: 'typescript',
          },
        },
      ];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.semanticEnrichments).toHaveLength(1);
      expect(result.semanticEnrichments[0].enrichment_type).toBe('ownership_change');
      expect(result.semanticEnrichments[0].description).toContain('moved/refactored');
    });

    it('should detect new properties from improved extractor', async () => {
      const priorState = new Map<string, NormalizedAssertion>([
        ['component:app.component.ts:AppComponent:10', {
          _slice: {
            id: 'component:app.component.ts:AppComponent:10',
            domain: 'ui',
            type: 'angular_component',
            source_files: ['app.component.ts'],
          },
          element: {
            name: 'AppComponent',
          },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'app.component.ts',
            line: 10,
            language: 'typescript',
          },
        }],
      ]);

      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'component:app.component.ts:AppComponent:10',
            domain: 'ui',
            type: 'angular_component',
            source_files: ['app.component.ts'],
          },
          element: {
            name: 'AppComponent',
            selector: 'app-root',
            templateUrl: './app.component.html',
            styleUrls: ['./app.component.scss'],
          },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'angular-v1',
            file: 'app.component.ts',
            line: 10,
            language: 'angular',
          },
        },
      ];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      // New properties are only detected when extractor changes
      expect(result.semanticEnrichments.length).toBeGreaterThan(0);
      const newPropsEnrichment = result.semanticEnrichments.find(
        e => e.enrichment_type === 'new_properties'
      );
      expect(newPropsEnrichment).toBeDefined();
      expect(newPropsEnrichment?.description).toContain('new properties');
      expect(newPropsEnrichment?.prior_extractor).toBe('typescript-v1');
      expect(newPropsEnrichment?.current_extractor).toBe('angular-v1');
    });
  });

  describe('Validation summary', () => {
    it('should provide accurate validation statistics', async () => {
      const priorState = new Map<string, NormalizedAssertion>([
        ['function:old.ts:removed:5', {
          _slice: {
            id: 'function:old.ts:removed:5',
            domain: 'graph',
            type: 'function',
            source_files: ['old.ts'],
          },
          element: { name: 'removed' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'old.ts',
            line: 5,
            language: 'typescript',
          },
        }],
        ['function:changed.ts:changed:10', {
          _slice: {
            id: 'function:changed.ts:changed:10',
            domain: 'graph',
            type: 'function',
            source_files: ['changed.ts'],
          },
          element: {
            name: 'changed',
            signature: 'function changed()',
          },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'changed.ts',
            line: 10,
            language: 'typescript',
          },
        }],
      ]);

      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:changed.ts:changed:10',
            domain: 'graph',
            type: 'function',
            source_files: ['changed.ts'],
          },
          element: {
            name: 'changed',
            signature: 'function changed(x: string)',
          },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'changed.ts',
            line: 10,
            language: 'typescript',
          },
        },
        {
          _slice: {
            id: 'function:unchanged.ts:unchanged:15',
            domain: 'graph',
            type: 'function',
            source_files: ['unchanged.ts'],
          },
          element: {
            name: 'unchanged',
          },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'unchanged.ts',
            line: 15,
            language: 'typescript',
          },
        },
      ];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.validationSummary.totalValidated).toBe(4); // 2 new + 2 prior
      expect(result.validationSummary.orphaned).toBe(1);
      expect(result.validationSummary.enriched).toBe(1);
      expect(result.validationSummary.unchanged).toBe(1); // 2 new - 1 enriched
    });
  });

  describe('Cleanup and self-healing', () => {
    it('should remove old conflicts directory', async () => {
      const priorState = new Map<string, NormalizedAssertion>();
      const newAssertions: NormalizedAssertion[] = [];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining('conflicts'),
        { recursive: true, force: true }
      );
    });

    it('should handle missing conflicts directory gracefully', async () => {
      const priorState = new Map<string, NormalizedAssertion>();
      const newAssertions: NormalizedAssertion[] = [];

      vi.mocked(fs.rm).mockRejectedValue(new Error('Directory not found'));

      // Should not throw
      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty prior state', async () => {
      const priorState = new Map<string, NormalizedAssertion>();
      const newAssertions: NormalizedAssertion[] = [
        {
          _slice: {
            id: 'function:new.ts:new:1',
            domain: 'graph',
            type: 'function',
            source_files: ['new.ts'],
          },
          element: { name: 'new' },
          provenance: {
            extracted_at: '2024-01-02T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'new.ts',
            line: 1,
            language: 'typescript',
          },
        },
      ];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.orphanedSlices).toHaveLength(0);
      expect(result.semanticEnrichments).toHaveLength(0);
      expect(result.validationSummary.totalValidated).toBe(1);
    });

    it('should handle empty new assertions', async () => {
      const priorState = new Map<string, NormalizedAssertion>([
        ['function:old.ts:old:1', {
          _slice: {
            id: 'function:old.ts:old:1',
            domain: 'graph',
            type: 'function',
            source_files: ['old.ts'],
          },
          element: { name: 'old' },
          provenance: {
            extracted_at: '2024-01-01T00:00:00Z',
            extractor: 'typescript-v1',
            file: 'old.ts',
            line: 1,
            language: 'typescript',
          },
        }],
      ]);
      const newAssertions: NormalizedAssertion[] = [];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.orphanedSlices).toHaveLength(1);
      expect(result.semanticEnrichments).toHaveLength(0);
    });

    it('should handle assertions with no element changes', async () => {
      const assertion: NormalizedAssertion = {
        _slice: {
          id: 'function:app.ts:same:5',
          domain: 'graph',
          type: 'function',
          source_files: ['app.ts'],
        },
        element: {
          name: 'same',
          signature: 'function same()',
        },
        provenance: {
          extracted_at: '2024-01-01T00:00:00Z',
          extractor: 'typescript-v1',
          file: 'app.ts',
          line: 5,
          language: 'typescript',
        },
      };

      const priorState = new Map([['function:app.ts:same:5', assertion]]);
      const newAssertions = [{
        ...assertion,
        provenance: {
          ...assertion.provenance,
          extracted_at: '2024-01-02T00:00:00Z',
        },
      }];

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await detectDivergence(newAssertions, priorState, projectRoot, stateRoot);

      expect(result.semanticEnrichments).toHaveLength(0);
      expect(result.orphanedSlices).toHaveLength(0);
    });
  });
});

