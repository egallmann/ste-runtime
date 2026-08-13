import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runWorkspaceAttributionFederation } from './workspace-attribution-federation.js';

vi.mock('execa', () => ({
  execa: vi.fn(async () => ({ stdout: 'qualified_adr_count: 2', stderr: '' })),
}));

describe('runWorkspaceAttributionFederation', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ws-fed-'));
    await mkdir(tmpDir, { recursive: true });
    await writeFile(
      path.join(tmpDir, 'workspace.yaml'),
      'schema_version: "1.0"\noutput_dir: .ste-workspace/\nrepos: []\n',
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('invokes adr attribution workspace-report without throwing', async () => {
    const { execa } = await import('execa');
    await expect(runWorkspaceAttributionFederation(tmpDir)).resolves.toBeUndefined();
    expect(execa).toHaveBeenCalledWith(
      'adr',
      ['attribution', 'workspace-report', '--workspace-root', path.resolve(tmpDir)],
      expect.objectContaining({ cwd: path.resolve(tmpDir) }),
    );
  });
});
