import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import {
  collectImplementationAttributionEvidence,
  normalizeImplementationIntent,
  writeImplementationAttributionEvidence,
} from './implementation-intent.js';
import type { NormalizedAssertion } from './phases/index.js';

vi.mock('node:fs/promises');

describe('implementation intent helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  it('normalizes declared implementation intent objects', () => {
    const normalized = normalizeImplementationIntent({
      implements_adrs: ['ADR-L-0004'],
      enforced_invariants: ['INV-0006'],
      confidence: 'declared',
      source: 'decorator',
    });

    expect(normalized).toEqual({
      implements_adrs: ['ADR-L-0004'],
      enforced_invariants: ['INV-0006'],
      confidence: 'declared',
      source: 'decorator',
    });
  });

  it('collects evidence records from slices with implementation intent', () => {
    const assertions: NormalizedAssertion[] = [
      {
        _slice: {
          id: 'function:claims.py:process:12',
          domain: 'graph',
          type: 'function',
          source_files: ['claims.py'],
        },
        element: {
          id: 'function:claims.py:process:12',
          name: 'process_claim',
          implementation_intent: {
            implements_adrs: ['ADR-L-0004', 'ADR-PC-0006'],
            enforced_invariants: ['INV-0006'],
            confidence: 'declared',
            source: 'decorator',
          },
        },
        provenance: {
          extracted_at: '2026-03-14T00:00:00Z',
          extractor: 'recon-python-extractor-v1',
          file: 'claims.py',
          line: 12,
          language: 'python',
        },
      },
    ];

    const evidence = collectImplementationAttributionEvidence(assertions);

    expect(evidence.schema_version).toBe('1.0');
    expect(evidence.type).toBe('implementation_attribution_evidence');
    expect(evidence.records).toHaveLength(1);
    expect(evidence.records[0].implementation_entity_type).toBe('function');
    expect(evidence.records[0].attributed_adrs).toEqual(['ADR-L-0004', 'ADR-PC-0006']);
    expect(evidence.records[0].enforced_invariants).toEqual(['INV-0006']);
    expect(evidence.records[0].provenance.source_file).toBe('claims.py');
  });

  it('writes implementation attribution evidence to state', async () => {
    const assertions: NormalizedAssertion[] = [
      {
        _slice: {
          id: 'cfn_template:stack.yaml:stack',
          domain: 'infrastructure',
          type: 'template',
          source_files: ['stack.yaml'],
        },
        element: {
          id: 'cfn_template:stack.yaml:stack',
          name: 'stack',
          implementation_intent: {
            implements_adrs: ['ADR-L-0004'],
            enforced_invariants: [],
            confidence: 'declared',
            source: 'metadata',
          },
        },
        provenance: {
          extracted_at: '2026-03-14T00:00:00Z',
          extractor: 'recon-cloudformation-extractor-v1',
          file: 'stack.yaml',
          line: 1,
          language: 'cloudformation',
        },
      },
    ];

    await writeImplementationAttributionEvidence('/tmp/.ste/state', assertions);

    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('implementation-attribution-evidence.yaml'),
      expect.stringContaining('implementation_attribution_evidence'),
      'utf-8',
    );
  });
});
