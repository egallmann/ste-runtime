import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const steRuntimeRoot = path.resolve(__dirname, '..', '..');
const siblingSchemaPath = path.resolve(
  steRuntimeRoot,
  '..',
  'ste-spec',
  'contracts',
  'architecture-evidence.schema.json',
);
const fixtureSchemaPath = path.resolve(
  steRuntimeRoot,
  'test',
  'fixtures',
  'architecture-evidence.schema.json',
);

describe('architecture evidence schema fixture sync', () => {
  it('keeps the committed test fixture present', async () => {
    await expect(access(fixtureSchemaPath)).resolves.toBeUndefined();
  });

  it('matches the sibling ste-spec contract when available', async () => {
    try {
      await access(siblingSchemaPath);
    } catch {
      return;
    }

    const [fixtureBytes, siblingBytes] = await Promise.all([
      readFile(fixtureSchemaPath),
      readFile(siblingSchemaPath),
    ]);
    expect(JSON.parse(fixtureBytes.toString('utf8'))).toEqual(
      JSON.parse(siblingBytes.toString('utf8')),
    );
  });
});
