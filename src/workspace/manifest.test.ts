/**
 * Workspace manifest and per-repo config (Invariant 2: state outside scanned repo).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';

import { buildPerRepoConfig, discoverWorkspaceRoot, mapRepoLang, RepoEntrySchema } from './manifest.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'ste-workspace-manifest-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('buildPerRepoConfig', () => {
  it('places resolved state outside projectRoot for default .workspace-graph layout (Invariant 2)', async () => {
    const workspaceRoot = tempDir;
    const repoRel = 'repo-alpha';
    await mkdir(path.join(workspaceRoot, repoRel), { recursive: true });
    await writeFile(path.join(workspaceRoot, repoRel, '.gitkeep'), '', 'utf8');

    const repo = RepoEntrySchema.parse({
      name: 'repo-alpha',
      path: `./${repoRel}`,
      kind: 'service',
      lang: 'python',
    });

    const runtimeDir = path.join(workspaceRoot, 'runtime-stub');
    await mkdir(runtimeDir, { recursive: true });
    const cfg = await buildPerRepoConfig(runtimeDir, repo, workspaceRoot, '.workspace-graph/');

    const projectRoot = path.resolve(workspaceRoot, repoRel);
    const stateResolved = path.resolve(projectRoot, cfg.stateDir);
    expect(stateResolved.startsWith(projectRoot + path.sep)).toBe(false);
    expect(stateResolved).toBe(path.join(workspaceRoot, '.workspace-graph', 'state', 'repo-alpha'));
  });

  it('throws when output_dir would place state under the scanned repository', async () => {
    const workspaceRoot = tempDir;
    const repoRel = 'repo-alpha';
    await mkdir(path.join(workspaceRoot, repoRel, 'nested', 'out'), { recursive: true });

    const repo = RepoEntrySchema.parse({
      name: 'repo-alpha',
      path: `./${repoRel}`,
      kind: 'service',
      lang: 'python',
    });

    // output_dir under workspace but inside repo tree -> state path under projectRoot
    const badOutput = path.join(repoRel, 'nested', 'out');

    const runtimeDir = path.join(workspaceRoot, 'runtime-stub');
    await mkdir(runtimeDir, { recursive: true });
    await expect(
      buildPerRepoConfig(runtimeDir, repo, workspaceRoot, badOutput),
    ).rejects.toThrow(/Invariant 2 violation/);
  });
});

describe('output_dir variants', () => {
  it('accepts custom output_dir and resolves state path correctly', async () => {
    const workspaceRoot = tempDir;
    const repoRel = 'repo-alpha';
    await mkdir(path.join(workspaceRoot, repoRel), { recursive: true });
    await writeFile(path.join(workspaceRoot, repoRel, '.gitkeep'), '', 'utf8');

    const repo = RepoEntrySchema.parse({
      name: 'repo-alpha',
      path: `./${repoRel}`,
      kind: 'service',
      lang: 'python',
    });

    const runtimeDir = path.join(workspaceRoot, 'runtime-stub');
    await mkdir(runtimeDir, { recursive: true });
    const cfg = await buildPerRepoConfig(runtimeDir, repo, workspaceRoot, '.custom-graph/');

    const stateResolved = path.resolve(path.resolve(workspaceRoot, repoRel), cfg.stateDir);
    expect(stateResolved).toBe(path.join(workspaceRoot, '.custom-graph', 'state', 'repo-alpha'));
  });

  it('isolates state between repos under the same output_dir', async () => {
    const workspaceRoot = tempDir;
    await mkdir(path.join(workspaceRoot, 'repo-alpha'), { recursive: true });
    await mkdir(path.join(workspaceRoot, 'repo-beta'), { recursive: true });

    const repoA = RepoEntrySchema.parse({
      name: 'repo-alpha', path: './repo-alpha', kind: 'service', lang: 'python',
    });
    const repoB = RepoEntrySchema.parse({
      name: 'repo-beta', path: './repo-beta', kind: 'service', lang: 'node',
    });

    const runtimeDir = path.join(workspaceRoot, 'runtime-stub');
    await mkdir(runtimeDir, { recursive: true });
    const cfgA = await buildPerRepoConfig(runtimeDir, repoA, workspaceRoot, '.workspace-graph/');
    const cfgB = await buildPerRepoConfig(runtimeDir, repoB, workspaceRoot, '.workspace-graph/');

    const stateA = path.resolve(path.resolve(workspaceRoot, 'repo-alpha'), cfgA.stateDir);
    const stateB = path.resolve(path.resolve(workspaceRoot, 'repo-beta'), cfgB.stateDir);
    expect(stateA).not.toBe(stateB);
    expect(stateA).toContain('repo-alpha');
    expect(stateB).toContain('repo-beta');
  });
});

describe('mapRepoLang', () => {
  it('augments typescript mapping with adr-yaml when adrs/manifest.yaml exists', async () => {
    const repoRoot = path.join(tempDir, 'typed-repo');
    await mkdir(path.join(repoRoot, 'adrs'), { recursive: true });
    await writeFile(path.join(repoRoot, 'adrs', 'manifest.yaml'), 'schema_version: "1.0"\n', 'utf8');

    const languages = await mapRepoLang('typescript', repoRoot);
    expect(languages).toContain('typescript');
    expect(languages).toContain('adr-yaml');
  });

  it('does not add adr-yaml when adrs/manifest.yaml is absent', async () => {
    const repoRoot = path.join(tempDir, 'no-adr-repo');
    await mkdir(repoRoot, { recursive: true });

    const languages = await mapRepoLang('typescript', repoRoot);
    expect(languages).toContain('typescript');
    expect(languages).not.toContain('adr-yaml');
  });
});

describe('buildPerRepoConfig sourceDirs', () => {
  it('includes adrs when adrs/manifest.yaml exists', async () => {
    const workspaceRoot = tempDir;
    const repoRel = 'repo-with-adrs';
    await mkdir(path.join(workspaceRoot, repoRel, 'adrs'), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, repoRel, 'adrs', 'manifest.yaml'),
      'schema_version: "1.0"\n',
      'utf8',
    );

    const repo = RepoEntrySchema.parse({
      name: 'repo-with-adrs',
      path: `./${repoRel}`,
      kind: 'library',
      lang: 'python',
    });

    const runtimeDir = path.join(workspaceRoot, 'runtime-stub');
    await mkdir(runtimeDir, { recursive: true });
    const cfg = await buildPerRepoConfig(runtimeDir, repo, workspaceRoot, '.ste-workspace/');

    expect(cfg.sourceDirs).toContain('.');
    expect(cfg.sourceDirs).toContain('adrs');
  });

  it('does not include adrs when adrs/manifest.yaml is absent', async () => {
    const workspaceRoot = tempDir;
    const repoRel = 'repo-no-adrs';
    await mkdir(path.join(workspaceRoot, repoRel), { recursive: true });

    const repo = RepoEntrySchema.parse({
      name: 'repo-no-adrs',
      path: `./${repoRel}`,
      kind: 'library',
      lang: 'python',
    });

    const runtimeDir = path.join(workspaceRoot, 'runtime-stub');
    await mkdir(runtimeDir, { recursive: true });
    const cfg = await buildPerRepoConfig(runtimeDir, repo, workspaceRoot, '.ste-workspace/');

    expect(cfg.sourceDirs).toEqual(['.']);
  });
});

describe('discoverWorkspaceRoot', () => {
  it('finds workspace.yml and workspace.yaml walking upward', async () => {
    const wsRoot = tempDir;
    const nested = path.join(wsRoot, 'deep', 'nested');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(wsRoot, 'workspace.yml'), 'schema_version: "1.0"\nrepos:\n  - { name: x, path: ./x, kind: service, lang: python }\n', 'utf8');
    await mkdir(path.join(wsRoot, 'x'), { recursive: true });
    await expect(discoverWorkspaceRoot(nested)).resolves.toBe(path.resolve(wsRoot));
  });

  it('returns null when no manifest exists above startDir', async () => {
    const lonely = path.join(tempDir, 'empty-tree');
    await mkdir(lonely, { recursive: true });
    await expect(discoverWorkspaceRoot(lonely)).resolves.toBeNull();
  });
});
