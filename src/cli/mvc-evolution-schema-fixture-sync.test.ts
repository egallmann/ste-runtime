import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const steRuntimeRoot = path.resolve(__dirname, '..', '..');

const schemaPairs = [
  {
    name: 'MVC-D',
    sibling: path.resolve(steRuntimeRoot, '..', 'ste-spec', 'contracts', 'mvc', 'mvc-definition.schema.json'),
    fixture: path.resolve(steRuntimeRoot, 'test', 'fixtures', 'mvc-evolution', 'mvc-definition.schema.json'),
  },
  {
    name: 'MVC-S',
    sibling: path.resolve(steRuntimeRoot, '..', 'ste-spec', 'contracts', 'mvc', 'mvc-snapshot.schema.json'),
    fixture: path.resolve(steRuntimeRoot, 'test', 'fixtures', 'mvc-evolution', 'mvc-snapshot.schema.json'),
  },
];

describe('MVC evolution schema fixture sync', () => {
  for (const pair of schemaPairs) {
    it(`keeps the committed ${pair.name} schema fixture present`, async () => {
      await expect(access(pair.fixture)).resolves.toBeUndefined();
    });

    it(`matches the sibling ste-spec ${pair.name} contract when available`, async () => {
      try {
        await access(pair.sibling);
      } catch {
        return;
      }

      const [fixtureBytes, siblingBytes] = await Promise.all([
        readFile(pair.fixture),
        readFile(pair.sibling),
      ]);
      expect(JSON.parse(fixtureBytes.toString('utf8'))).toEqual(
        JSON.parse(siblingBytes.toString('utf8')),
      );
    });
  }
});
