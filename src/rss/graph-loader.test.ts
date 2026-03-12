/**
 * Tests for graph-loader.ts
 * 
 * Tests YAML parsing, edge normalization, graph loading, and version detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadAidocGraph } from './graph-loader.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'graph-loader-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeYaml(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

describe('loadAidocGraph', () => {
  describe('basic loading', () => {
    it('should load a simple slice with all fields', async () => {
      await writeYaml('graph/modules/test.yaml', `
_slice:
  id: module:test.ts
  domain: graph
  type: module
  source_files:
    - src/test.ts
  references:
    - domain: data
      type: entity
      id: user
  referenced_by:
    - domain: api
      type: endpoint
      id: get-users
`);

      const { graph } = await loadAidocGraph(tempDir);

      expect(graph.size).toBe(1);
      const node = graph.get('graph/module/module:test.ts');
      expect(node).toBeDefined();
      expect(node?.domain).toBe('graph');
      expect(node?.type).toBe('module');
      expect(node?.id).toBe('module:test.ts');
      expect(node?.sourceFiles).toEqual(['src/test.ts']);
      expect(node?.references).toHaveLength(1);
      expect(node?.referencedBy).toHaveLength(1);
    });

    it('should load multiple slices from different directories', async () => {
      await writeYaml('api/endpoints/get-user.yaml', `
_slice:
  id: get-user
  domain: api
  type: endpoint
  source_files:
    - src/api.ts
  references: []
  referenced_by: []
`);

      await writeYaml('data/entities/user.yaml', `
_slice:
  id: user
  domain: data
  type: entity
  source_files:
    - src/models/user.ts
  references: []
  referenced_by: []
`);

      const { graph } = await loadAidocGraph(tempDir);

      expect(graph.size).toBe(2);
      expect(graph.has('api/endpoint/get-user')).toBe(true);
      expect(graph.has('data/entity/user')).toBe(true);
    });

    it('should handle empty state directory', async () => {
      const { graph } = await loadAidocGraph(tempDir);

      expect(graph.size).toBe(0);
    });
  });

  describe('edge normalization', () => {
    it('should normalize and deduplicate edges', async () => {
      await writeYaml('graph/modules/test.yaml', `
_slice:
  id: test
  domain: graph
  type: module
  source_files:
    - test.ts
  references:
    - domain: data
      type: entity
      id: user
    - domain: data
      type: entity
      id: user
    - domain: data
      type: entity
      id: account
  referenced_by: []
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/module/test');

      // Should deduplicate the duplicate user reference
      expect(node?.references).toHaveLength(2);
      
      // Should be sorted alphabetically by key
      expect(node?.references[0].id).toBe('account');
      expect(node?.references[1].id).toBe('user');
    });

    it('should handle malformed edge objects gracefully', async () => {
      await writeYaml('graph/modules/test.yaml', `
_slice:
  id: test
  domain: graph
  type: module
  source_files:
    - test.ts
  references:
    - domain: data
      type: entity
      id: valid
    - domain: data
      type: entity
    - invalid: true
    - null
  referenced_by: []
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/module/test');

      // Should only include the valid reference
      expect(node?.references).toHaveLength(1);
      expect(node?.references[0].id).toBe('valid');
    });

    it('should handle missing references array', async () => {
      await writeYaml('graph/modules/test.yaml', `
_slice:
  id: test
  domain: graph
  type: module
  source_files:
    - test.ts
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/module/test');

      expect(node?.references).toEqual([]);
      expect(node?.referencedBy).toEqual([]);
    });
  });

  describe('slice validation', () => {
    it('should skip slices without _slice key', async () => {
      await writeYaml('graph/modules/invalid.yaml', `
id: test
domain: graph
type: module
`);

      const { graph } = await loadAidocGraph(tempDir);

      expect(graph.size).toBe(0);
    });

    it('should skip slices missing required fields', async () => {
      // Missing id
      await writeYaml('graph/modules/no-id.yaml', `
_slice:
  domain: graph
  type: module
`);

      // Missing domain
      await writeYaml('graph/modules/no-domain.yaml', `
_slice:
  id: test
  type: module
`);

      // Missing type
      await writeYaml('graph/modules/no-type.yaml', `
_slice:
  id: test
  domain: graph
`);

      const { graph } = await loadAidocGraph(tempDir);

      expect(graph.size).toBe(0);
    });

    it('should skip duplicate slices (first wins)', async () => {
      await writeYaml('dir1/test.yaml', `
_slice:
  id: duplicate
  domain: graph
  type: module
  source_files:
    - first.ts
  references: []
  referenced_by: []
`);

      await writeYaml('dir2/test.yaml', `
_slice:
  id: duplicate
  domain: graph
  type: module
  source_files:
    - second.ts
  references: []
  referenced_by: []
`);

      const { graph } = await loadAidocGraph(tempDir);

      expect(graph.size).toBe(1);
      const node = graph.get('graph/module/duplicate');
      // First one encountered (alphabetically by path) should win
      expect(node?.sourceFiles).toContain('first.ts');
    });
  });

  describe('version detection', () => {
    it('should detect version from version.txt', async () => {
      await writeFile(path.join(tempDir, 'version.txt'), '1.2.3', 'utf8');
      await writeYaml('graph/test.yaml', `
_slice:
  id: test
  domain: graph
  type: module
  source_files: []
  references: []
  referenced_by: []
`);

      const { graphVersion } = await loadAidocGraph(tempDir);

      expect(graphVersion).toBe('1.2.3');
    });

    it('should detect version from version.json', async () => {
      await writeFile(path.join(tempDir, 'version.json'), JSON.stringify({ version: '2.0.0' }), 'utf8');

      const { graphVersion } = await loadAidocGraph(tempDir);

      expect(graphVersion).toBe('2.0.0');
    });

    it('should detect version from manifest.yaml', async () => {
      await writeYaml('manifest.yaml', `
version: "3.0.0"
generated_at: "2026-01-01T00:00:00Z"
`);

      const { graphVersion } = await loadAidocGraph(tempDir);

      expect(graphVersion).toBe('3.0.0');
    });

    it('should return default version when no version file exists', async () => {
      const { graphVersion } = await loadAidocGraph(tempDir);

      expect(graphVersion).toBe('unknown');
    });
  });

  describe('source files and path handling', () => {
    it('should extract source files correctly', async () => {
      await writeYaml('graph/modules/test.yaml', `
_slice:
  id: test
  domain: graph
  type: module
  source_files:
    - src/module.ts
    - src/utils.ts
  references: []
  referenced_by: []
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/module/test');

      expect(node?.sourceFiles).toEqual(['src/module.ts', 'src/utils.ts']);
      expect(node?.path).toBe('src/module.ts');
    });

    it('should use relative file path when no source_files', async () => {
      await writeYaml('graph/modules/orphan.yaml', `
_slice:
  id: orphan
  domain: graph
  type: module
  source_files: []
  references: []
  referenced_by: []
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/module/orphan');

      expect(node?.path).toContain('graph');
      expect(node?.path).toContain('orphan.yaml');
    });
  });

  describe('tags extraction', () => {
    it('should extract tags from _slice.tags array', async () => {
      await writeYaml('graph/modules/tagged.yaml', `
_slice:
  id: tagged-module
  domain: graph
  type: module
  source_files:
    - src/tagged.ts
  references: []
  referenced_by: []
  tags:
    - layer:api
    - lang:typescript
    - custom:my-tag
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/module/tagged-module');

      expect(node?.tags).toBeDefined();
      expect(node?.tags).toHaveLength(3);
      expect(node?.tags).toContain('layer:api');
      expect(node?.tags).toContain('lang:typescript');
      expect(node?.tags).toContain('custom:my-tag');
    });

    it('should return empty tags array when no tags defined', async () => {
      await writeYaml('graph/modules/untagged.yaml', `
_slice:
  id: untagged-module
  domain: graph
  type: module
  source_files:
    - src/untagged.ts
  references: []
  referenced_by: []
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/module/untagged-module');

      expect(node?.tags).toBeDefined();
      expect(node?.tags).toEqual([]);
    });
  });

  describe('slice line range extraction', () => {
    it('should extract slice range from provenance.line', async () => {
      await writeYaml('graph/functions/with-provenance.yaml', `
_slice:
  id: my-function
  domain: graph
  type: function
  source_files:
    - src/utils.ts
  references: []
  referenced_by: []
provenance:
  extracted_at: '2026-01-08T15:55:45.961Z'
  extractor: recon-typescript-extractor-v1
  file: src/utils.ts
  line: 42
  language: typescript
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/function/my-function');

      expect(node?.slice).toBeDefined();
      expect(node?.slice?.start).toBe(42);
    });

    it('should prefer explicit slice range over provenance', async () => {
      await writeYaml('graph/functions/with-explicit-slice.yaml', `
_slice:
  id: explicit-slice-function
  domain: graph
  type: function
  source_files:
    - src/utils.ts
  references: []
  referenced_by: []
  slice:
    start: 100
    end: 150
provenance:
  line: 42
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/function/explicit-slice-function');

      expect(node?.slice).toBeDefined();
      expect(node?.slice?.start).toBe(100);
      expect(node?.slice?.end).toBe(150);
    });

    it('should handle missing provenance gracefully', async () => {
      await writeYaml('graph/modules/no-provenance.yaml', `
_slice:
  id: no-provenance
  domain: graph
  type: module
  source_files:
    - src/module.ts
  references: []
  referenced_by: []
`);

      const { graph } = await loadAidocGraph(tempDir);
      const node = graph.get('graph/module/no-provenance');

      expect(node).toBeDefined();
      // slice should be undefined when no provenance or explicit slice
      expect(node?.slice).toBeUndefined();
    });
  });

  describe('integration with fixture data', () => {
    it('should load state-sample fixture correctly', async () => {
      const fixtureRoot = path.resolve('fixtures', 'state-sample');
      
      try {
        const { graph } = await loadAidocGraph(fixtureRoot);
        
        // Should load all slices from fixture
        expect(graph.size).toBeGreaterThan(0);
        
        // Check specific slices exist
        const userEntity = graph.get('data/entity/user');
        expect(userEntity).toBeDefined();
        expect(userEntity?.domain).toBe('data');
        expect(userEntity?.type).toBe('entity');
      } catch (err) {
        // Skip if fixture doesn't exist (CI environment)
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw err;
        }
      }
    });
  });
});


