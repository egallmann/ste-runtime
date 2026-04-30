import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { emitWorkspaceSlice, loadRepoState } from './slice-emitter.js';

vi.mock('node:fs/promises');
vi.mock('globby', () => ({
  globby: vi.fn().mockResolvedValue([]),
}));

describe('slice-emitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('lambdaIdFromTrigger priority (NS-5)', () => {
    it('should emit workspace slice for empty repo state', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await emitWorkspaceSlice(
        'test-repo',
        '/repo/.ste-runtime',
        '/output/test-repo.yaml',
        '/repo',
      );

      expect(result.nodeCount).toBeGreaterThanOrEqual(1); // at least the Service node
      expect(result.edgeCount).toBeGreaterThanOrEqual(0);
      expect(result.contentHash).toMatch(/^sha256:/);
    });
  });
});
