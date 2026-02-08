import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { globby } from 'globby';
import yaml from 'js-yaml';
import { runFullRecon } from './full-recon.js';
import { runIncrementalRecon } from './incremental-recon.js';
import { buildFullManifest, writeReconManifest } from '../watch/change-detector.js';

async function copyFixture(): Promise<string> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'recon-incremental-'));
  const fixtureRoot = path.resolve('fixtures', 'python-sample');
  await cp(fixtureRoot, tmp, { recursive: true });
  return tmp;
}

function normalizeTimestamp(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeTimestamp);
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'timestamp') {
      result[key] = 'NORMALIZED';
    } else if (key === 'generatedAt') {
      result[key] = 'NORMALIZED';
    } else {
      result[key] = normalizeTimestamp(value);
    }
  }
  return result;
}

async function hashState(stateRoot: string) {
  const files = await globby(['**/*.yaml', '**/*.yml'], { cwd: stateRoot, absolute: true });
  const entries = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(file, 'utf8');
      const parsed = yaml.load(raw);
      const normalized = normalizeTimestamp(parsed);
      const serialized = JSON.stringify(normalized, null, 2);
      const hash = crypto.createHash('sha256').update(serialized).digest('hex');
      return { rel: path.relative(stateRoot, file).replace(/\\/g, '/'), hash };
    }),
  );
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  return entries;
}

describe('incremental recon', () => {
  it('matches full recon after single-file change', async () => {
    const projectRoot = await copyFixture();
    // State directory is inside the project root
    const stateDir = path.join(projectRoot, '.ste', 'state');

    // Run full recon with stateDir parameter
    await runFullRecon(projectRoot, stateDir);
    const manifest = await buildFullManifest(projectRoot);
    // Write manifest to stateDir, not projectRoot
    await writeReconManifest(stateDir, manifest);

    const greetingPath = path.join(projectRoot, 'app', 'services', 'greeting.py');
    const original = await readFile(greetingPath, 'utf8');
    await writeFile(greetingPath, `${original}\n\n# tweak\n`);

    // Run incremental recon with stateDir option
    await runIncrementalRecon(projectRoot, { fallbackToFull: false, stateDir });
    const incrementalState = await hashState(stateDir);

    // Run full recon again with stateDir parameter
    await runFullRecon(projectRoot, stateDir);
    const fullState = await hashState(stateDir);

    expect(incrementalState).toEqual(fullState);
  });
});
