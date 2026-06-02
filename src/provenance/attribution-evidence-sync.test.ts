import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const steRuntimeRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.resolve(steRuntimeRoot, '..');
const attributionPath = path.resolve(
  workspaceRoot,
  '.ste-workspace',
  'state',
  'ste-runtime',
  'attribution',
  'implementation-attribution-evidence.yaml',
);

interface AttributionRecord {
  attributed_adrs?: string[];
  enforced_invariants?: string[];
  implementation_entity_id?: string;
  implementation_entity_type?: string;
  provenance?: { source_file?: string };
  confidence?: string;
  metadata?: { source?: string };
}

interface AttributionEvidence {
  records?: AttributionRecord[];
}

async function attributionFileExists(): Promise<boolean> {
  try {
    await access(attributionPath);
    return true;
  } catch {
    return false;
  }
}

function recordAdrIds(record: AttributionRecord): string[] {
  return record.attributed_adrs ?? [];
}

describe('implementation attribution evidence sync', () => {
  it('populates records after workspace RECON when sibling .ste-workspace exists', async () => {
    if (!(await attributionFileExists())) {
      return;
    }

    const raw = await readFile(attributionPath, 'utf8');
    const doc = yaml.load(raw) as AttributionEvidence;
    const records = doc.records ?? [];

    if (records.length === 0) {
      return;
    }

    expect(records.length).toBeGreaterThan(0);

    const allAdrIds = records.flatMap(recordAdrIds);
    expect(allAdrIds).toContain('ADR-L-0001');
    expect(allAdrIds).toContain('ADR-L-0018');
    expect(allAdrIds).toContain('ADR-L-0004');
    expect(allAdrIds).toContain('ADR-L-0006');
    expect(allAdrIds).toContain('ADR-L-0011');

    const classRecords = records.filter(record => record.implementation_entity_type === 'class');
    expect(classRecords.some(record => recordAdrIds(record).includes('ADR-L-0004'))).toBe(true);
    expect(classRecords.some(record => recordAdrIds(record).includes('ADR-L-0006'))).toBe(true);

    const queryRecords = records.filter(
      record =>
        record.implementation_entity_id?.includes('ConversationalQueryEngine.query') &&
        recordAdrIds(record).includes('ADR-L-0006'),
    );
    expect(queryRecords.length).toBeGreaterThan(0);

    const manifest = await readFile(path.resolve(steRuntimeRoot, 'adrs', 'manifest.yaml'), 'utf8');
    for (const record of records.slice(0, 5)) {
      for (const adrId of recordAdrIds(record)) {
        expect(manifest).toContain(adrId);
      }
      const sourceFile = record.provenance?.source_file;
      if (sourceFile) {
        await expect(access(path.resolve(steRuntimeRoot, sourceFile))).resolves.toBeUndefined();
      }
      if (record.confidence) {
        expect(record.confidence).toBe('declared');
      }
    }
  });
});
