import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { emitWorkspaceSlice, loadRepoState } from './slice-emitter.js';

vi.mock('node:fs/promises');
vi.mock('globby', () => ({
  globby: vi.fn().mockResolvedValue([]),
}));

describe('slice-emitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty repo state', () => {
    it('emits a Service node for empty state', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await emitWorkspaceSlice(
        'repo-alpha',
        '/workspace/.ste-workspace/state/repo-alpha',
        '/workspace/.ste-workspace/slices/repo-alpha.yaml',
        '/workspace/repo-alpha',
      );

      expect(result.nodeCount).toBe(1);
      expect(result.edgeCount).toBe(0);
      expect(result.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);

      const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsed = yaml.load(written) as Record<string, unknown>;
      expect(parsed.schema_version).toBe('1.0');
      expect(parsed.repo).toBe('repo-alpha');
      expect(parsed.generated_by).toMatch(/^ste-runtime@/);
      expect(parsed.generated_at).toBeDefined();
      expect(Array.isArray(parsed.nodes)).toBe(true);
      expect(Array.isArray(parsed.edges)).toBe(true);
      expect(Array.isArray(parsed.diagnostics)).toBe(true);
    });
  });

  describe('Graph Identity stability', () => {
    it('produces deterministic node IDs for the same inputs', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const r1 = await emitWorkspaceSlice(
        'repo-beta', '/state/repo-beta', '/out/repo-beta.yaml', '/ws/repo-beta');
      const hash1 = r1.contentHash;

      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      const r2 = await emitWorkspaceSlice(
        'repo-beta', '/state/repo-beta', '/out/repo-beta.yaml', '/ws/repo-beta');

      expect(r1.nodeCount).toBe(r2.nodeCount);
      expect(r1.edgeCount).toBe(r2.edgeCount);
    });

    it('uses lowercase normalized tokens in Service node ID', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await emitWorkspaceSlice(
        'Repo-Gamma', '/state/rg', '/out/rg.yaml', '/ws/rg');

      const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsed = yaml.load(written) as Record<string, unknown>;
      const nodes = parsed.nodes as Array<Record<string, unknown>>;
      expect(nodes[0].id).toBe('Service:repo-gamma');
    });
  });

  describe('W-1 compliance', () => {
    it('zero domain-specific vocabulary in slice output', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await emitWorkspaceSlice(
        'repo-alpha', '/state/ra', '/out/ra.yaml', '/ws/ra');

      const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const domainTerms = /proprietaryterm|internalservice|legacyreport|internalschemas|vendorreport/i;
      expect(domainTerms.test(written)).toBe(false);
    });
  });
});
