import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const fixtureRoot = path.join(repositoryRoot, 'test', 'fixtures', 'public-consumer');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ste-runtime-public-tarball-'));
const consumerRoot = path.join(tempRoot, 'consumer');
const packRoot = path.join(tempRoot, 'pack');
const sourceFixtureRoot = path.join(consumerRoot, 'source-fixture');
const packNpmCache = path.join(tempRoot, 'npm-pack-cache');
const installNpmCache = process.env.npm_config_cache
  ?? (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'npm-cache') : undefined);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tscCommand = process.platform === 'win32'
  ? path.join(consumerRoot, 'node_modules', '.bin', 'tsc.cmd')
  : path.join(consumerRoot, 'node_modules', '.bin', 'tsc');

try {
  await fs.mkdir(consumerRoot, { recursive: true });
  await fs.mkdir(packRoot, { recursive: true });
  await fs.copyFile(path.join(fixtureRoot, 'package.json'), path.join(consumerRoot, 'package.json'));
  await fs.copyFile(path.join(fixtureRoot, 'consumer.ts'), path.join(consumerRoot, 'consumer.ts'));
  await fs.copyFile(path.join(fixtureRoot, 'bootstrap.mjs'), path.join(consumerRoot, 'bootstrap.mjs'));
  await fs.copyFile(path.join(fixtureRoot, 'tsconfig.json'), path.join(consumerRoot, 'tsconfig.json'));
  await fs.mkdir(path.join(sourceFixtureRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(sourceFixtureRoot, 'package.json'), '{"name":"public-consumer-source-fixture","version":"1.0.0"}\n');
  await fs.writeFile(path.join(sourceFixtureRoot, 'src', 'index.ts'), 'export const fixture = 1;\n');

  await execFileAsync(npmCommand, ['run', 'build'], {
    cwd: repositoryRoot,
    maxBuffer: 4 * 1024 * 1024,
    shell: true,
    env: { ...process.env, npm_config_cache: packNpmCache },
  });

  const { stdout } = await execFileAsync(npmCommand, ['pack', '--ignore-scripts', '--json', '--pack-destination', packRoot], {
    cwd: repositoryRoot,
    maxBuffer: 1024 * 1024,
    shell: true,
    env: {
      ...process.env,
      npm_config_cache: packNpmCache,
    },
  });
  const packed = JSON.parse(stdout.slice(stdout.indexOf('[')));
  const tarball = path.resolve(packRoot, packed[0].filename);

  await execFileAsync(npmCommand, [
    'install', tarball, '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock',
  ], {
    cwd: consumerRoot,
    maxBuffer: 4 * 1024 * 1024,
    shell: true,
    env: {
      ...process.env,
      ...(installNpmCache ? { npm_config_cache: installNpmCache } : {}),
      npm_config_fetch_retries: '0',
      npm_config_fetch_timeout: '10000',
    },
  });

  await execFileAsync(tscCommand, ['--project', 'tsconfig.json'], {
    cwd: consumerRoot,
    maxBuffer: 4 * 1024 * 1024,
    shell: true,
  });

  const result = await execFileAsync(process.execPath, ['bootstrap.mjs', sourceFixtureRoot], {
    cwd: consumerRoot,
    maxBuffer: 1024 * 1024,
  });
  for (const forbidden of ['.ste', '.ste-self', '.workspace-graph']) {
    const candidate = path.join(sourceFixtureRoot, forbidden);
    await expectMissing(candidate);
  }
  process.stdout.write(result.stdout);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

async function expectMissing(candidate) {
  try {
    await fs.access(candidate);
    throw new Error(`Packed consumer created forbidden state path: ${candidate}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}
