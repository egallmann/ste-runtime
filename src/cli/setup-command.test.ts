import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(runtimeRoot, 'dist', 'cli', 'index.js');

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'ste-setup-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function runSetup(args: string[] = []): string {
  const allArgs = ['setup', '--skip-recon', '--ste-runtime-path', runtimeRoot, '--project-root', tempDir, ...args];
  return execSync(`node "${cliPath}" ${allArgs.join(' ')}`, {
    encoding: 'utf8',
    cwd: tempDir,
    timeout: 30_000,
  });
}

// ── Workspace-type detection ──

describe('workspace-type detection', () => {
  it('detects multi-repo workspace (2+ subdirs with project markers)', async () => {
    await mkdir(path.join(tempDir, 'repo-a'));
    await writeFile(path.join(tempDir, 'repo-a', 'package.json'), '{}');
    await mkdir(path.join(tempDir, 'repo-b'));
    await writeFile(path.join(tempDir, 'repo-b', 'pyproject.toml'), '[project]\nname="b"');

    const output = runSetup(['--dry-run']);
    expect(output).toContain('multi-repo workspace');
    expect(output).toContain('workspace.yaml');
  });

  it('detects single-repo project (1 subdir with project markers)', async () => {
    await mkdir(path.join(tempDir, 'my-app'));
    await writeFile(path.join(tempDir, 'my-app', 'package.json'), '{}');

    const output = runSetup(['--dry-run']);
    expect(output).toContain('single-repo');
    expect(output).toContain('ste.config.json');
  });

  it('detects .csproj as project marker', async () => {
    await mkdir(path.join(tempDir, 'dotnet-app'));
    await writeFile(path.join(tempDir, 'dotnet-app', 'App.csproj'), '<Project/>');
    await mkdir(path.join(tempDir, 'dotnet-lib'));
    await writeFile(path.join(tempDir, 'dotnet-lib', 'Lib.csproj'), '<Project/>');

    const output = runSetup(['--dry-run']);
    expect(output).toContain('multi-repo workspace');
  });
});

// ── .cursor/mcp.json generation ──

describe('MCP config generation', () => {
  it('generates mcp.json with correct absolute paths in --dry-run', async () => {
    await mkdir(path.join(tempDir, 'svc-a'));
    await writeFile(path.join(tempDir, 'svc-a', 'package.json'), '{}');

    const output = runSetup(['--dry-run']);
    expect(output).toContain('.cursor/mcp.json');
    expect(output).toContain('--project-root');
    const expectedCliPath = path.join(runtimeRoot, 'dist', 'cli', 'index.js');
    const jsonEscaped = expectedCliPath.replace(/\\/g, '\\\\');
    expect(output).toContain(jsonEscaped);
  });

  it('writes mcp.json with absolute paths (live write)', async () => {
    await mkdir(path.join(tempDir, 'app'));
    await writeFile(path.join(tempDir, 'app', 'package.json'), '{}');

    runSetup([]);

    const mcpPath = path.join(tempDir, '.cursor', 'mcp.json');
    expect(existsSync(mcpPath)).toBe(true);

    const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
    expect(mcp.mcpServers['ste-runtime']).toBeDefined();
    const args: string[] = mcp.mcpServers['ste-runtime'].args;
    expect(args[0]).toContain(path.join('dist', 'cli', 'index.js'));
    expect(args).toContain('--project-root');
    expect(args).toContain(tempDir);
  });

  it('preserves existing mcp.json entries', async () => {
    await mkdir(path.join(tempDir, '.cursor'), { recursive: true });
    await writeFile(
      path.join(tempDir, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'other-server': { command: 'other' } } }),
    );
    await mkdir(path.join(tempDir, 'app'));
    await writeFile(path.join(tempDir, 'app', 'package.json'), '{}');

    runSetup([]);

    const mcp = JSON.parse(readFileSync(path.join(tempDir, '.cursor', 'mcp.json'), 'utf8'));
    expect(mcp.mcpServers['other-server']).toBeDefined();
    expect(mcp.mcpServers['ste-runtime']).toBeDefined();
  });
});

// ── .gitignore idempotent append ──

describe('gitignore append logic', () => {
  it('appends .ste/, .ste-self/, .workspace-graph/ to empty .gitignore', async () => {
    await writeFile(path.join(tempDir, '.gitignore'), '');
    await mkdir(path.join(tempDir, 'app'));
    await writeFile(path.join(tempDir, 'app', 'package.json'), '{}');

    runSetup([]);

    const gi = readFileSync(path.join(tempDir, '.gitignore'), 'utf8');
    expect(gi).toContain('.ste/');
    expect(gi).toContain('.ste-self/');
    expect(gi).toContain('.workspace-graph/');
  });

  it('does not duplicate entries on second run', async () => {
    await writeFile(path.join(tempDir, '.gitignore'), '.ste/\n.ste-self/\n.workspace-graph/\n');
    await mkdir(path.join(tempDir, 'app'));
    await writeFile(path.join(tempDir, 'app', 'package.json'), '{}');

    runSetup([]);

    const gi = readFileSync(path.join(tempDir, '.gitignore'), 'utf8');
    const steCount = (gi.match(/^\.ste\/$/gm) ?? []).length;
    expect(steCount).toBe(1);
  });

  it('creates .gitignore when none exists', async () => {
    await mkdir(path.join(tempDir, 'app'));
    await writeFile(path.join(tempDir, 'app', 'package.json'), '{}');

    runSetup([]);

    expect(existsSync(path.join(tempDir, '.gitignore'))).toBe(true);
    const gi = readFileSync(path.join(tempDir, '.gitignore'), 'utf8');
    expect(gi).toContain('.ste/');
  });
});

// ── Dry-run produces output without writing ──

describe('dry-run mode', () => {
  it('does not write any files', async () => {
    await mkdir(path.join(tempDir, 'repo-a'));
    await writeFile(path.join(tempDir, 'repo-a', 'package.json'), '{}');
    await mkdir(path.join(tempDir, 'repo-b'));
    await writeFile(path.join(tempDir, 'repo-b', 'pyproject.toml'), '[project]\nname="b"');

    const output = runSetup(['--dry-run']);

    expect(output).toContain('DRY RUN');
    expect(existsSync(path.join(tempDir, 'workspace.yaml'))).toBe(false);
    expect(existsSync(path.join(tempDir, '.cursor', 'mcp.json'))).toBe(false);
  });

  it('shows all planned writes', async () => {
    await mkdir(path.join(tempDir, 'repo-a'));
    await writeFile(path.join(tempDir, 'repo-a', 'package.json'), '{}');
    await mkdir(path.join(tempDir, 'repo-b'));
    await writeFile(path.join(tempDir, 'repo-b', 'pyproject.toml'), '[project]\nname="b"');

    const output = runSetup(['--dry-run']);

    expect(output).toContain('CREATE');
    expect(output).toContain('workspace.yaml');
    expect(output).toContain('.cursor/mcp.json');
    expect(output).toContain('APPEND');
    expect(output).toContain('.gitignore');
  });
});
