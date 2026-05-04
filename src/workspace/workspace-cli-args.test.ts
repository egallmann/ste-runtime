/**
 * Workspace CLI path parsing (agnostic defaults).
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  parseWorkspaceArgv,
  resolveWorkspaceDirectory,
  WORKSPACE_CLI_AUTO,
} from './workspace-cli-args.js';

describe('parseWorkspaceArgv', () => {
  it('returns null when --workspace omitted', () => {
    expect(parseWorkspaceArgv([])).toBeNull();
    expect(parseWorkspaceArgv(['--mode=full'])).toBeNull();
  });

  it('parses explicit --workspace path', () => {
    expect(parseWorkspaceArgv(['--workspace', '/tmp/ws'])).toBe('/tmp/ws');
    expect(parseWorkspaceArgv(['--workspace=/tmp/ws'])).toBe('/tmp/ws');
  });

  it('returns WORKSPACE_CLI_AUTO for bare --workspace', () => {
    expect(parseWorkspaceArgv(['--workspace'])).toBe(WORKSPACE_CLI_AUTO);
    expect(parseWorkspaceArgv(['--workspace', '--mode=full'])).toBe(WORKSPACE_CLI_AUTO);
  });

  it('returns WORKSPACE_CLI_AUTO for --workspace= and --workspace=auto', () => {
    expect(parseWorkspaceArgv(['--workspace='])).toBe(WORKSPACE_CLI_AUTO);
    expect(parseWorkspaceArgv(['--workspace=auto'])).toBe(WORKSPACE_CLI_AUTO);
    expect(parseWorkspaceArgv(['--workspace=AUTO'])).toBe(WORKSPACE_CLI_AUTO);
  });
});

describe('resolveWorkspaceDirectory', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ste-ws-cli-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns null when parsed is null', async () => {
    await expect(resolveWorkspaceDirectory(null, tempDir)).resolves.toBeNull();
  });

  it('resolves explicit path without requiring manifest', async () => {
    const dir = path.join(tempDir, 'explicit');
    await mkdir(dir, { recursive: true });
    await expect(resolveWorkspaceDirectory(dir, tempDir)).resolves.toBe(path.resolve(dir));
  });

  it('uses STE_WORKSPACE_ROOT for AUTO mode when set', async () => {
    const wsRoot = path.join(tempDir, 'from-env');
    await mkdir(wsRoot, { recursive: true });
    await writeFile(path.join(wsRoot, 'workspace.yaml'), 'schema_version: "1.0"\nrepos:\n  - { name: a, path: ./a, kind: service, lang: python }\n', 'utf8');
    await mkdir(path.join(wsRoot, 'a'), { recursive: true });

    const prev = process.env.STE_WORKSPACE_ROOT;
    process.env.STE_WORKSPACE_ROOT = wsRoot;
    try {
      await expect(resolveWorkspaceDirectory(WORKSPACE_CLI_AUTO, '/unlikely/cwd')).resolves.toBe(path.resolve(wsRoot));
    } finally {
      if (prev === undefined) {
        delete process.env.STE_WORKSPACE_ROOT;
      } else {
        process.env.STE_WORKSPACE_ROOT = prev;
      }
    }
  });

  it('discovers manifest upward from cwd for AUTO mode', async () => {
    const wsRoot = path.join(tempDir, 'mono');
    const nested = path.join(wsRoot, 'packages', 'runtime');
    await mkdir(nested, { recursive: true });
    await writeFile(
      path.join(wsRoot, 'workspace.yaml'),
      'schema_version: "1.0"\nrepos:\n  - { name: a, path: ./a, kind: service, lang: python }\n',
      'utf8',
    );
    await mkdir(path.join(wsRoot, 'a'), { recursive: true });

    await expect(resolveWorkspaceDirectory(WORKSPACE_CLI_AUTO, nested)).resolves.toBe(path.resolve(wsRoot));
  });

  it('returns null for AUTO when nothing discoverable', async () => {
    const lonely = path.join(tempDir, 'no-manifest');
    await mkdir(lonely, { recursive: true });
    const prev = process.env.STE_WORKSPACE_ROOT;
    delete process.env.STE_WORKSPACE_ROOT;
    try {
      await expect(resolveWorkspaceDirectory(WORKSPACE_CLI_AUTO, lonely)).resolves.toBeNull();
    } finally {
      if (prev !== undefined) process.env.STE_WORKSPACE_ROOT = prev;
    }
  });
});
