import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractFromMarkdown } from './index.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'ste-markdown-extractor-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('extractFromMarkdown', () => {
  it('extracts document, sections, links, and STE references', async () => {
    const rel = '08-runtime/08-05-context-assembly-and-mvc.md';
    const abs = path.join(tempDir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(
      abs,
      `# Context assembly and MVC

## Overview

See [MVC manifest](../04-architecture-model/04-09-projections.md).

Implements ADR-L-0012 and INV-42.
`,
      'utf-8',
    );

    const assertions = await extractFromMarkdown({
      path: abs,
      relativePath: rel,
      language: 'markdown',
      changeType: 'unchanged',
    });

    const doc = assertions.find(a => a.elementType === 'handbook_document');
    expect(doc).toBeDefined();
    expect(doc?.metadata.title).toBe('Context assembly and MVC');
    expect(doc?.metadata.part).toBe('08-runtime');
    expect(doc?.metadata.ste_references).toEqual(
      expect.arrayContaining(['ADR-L-0012', 'INV-42']),
    );
    expect(doc?.metadata.internal_links).toEqual(
      expect.arrayContaining(['../04-architecture-model/04-09-projections.md']),
    );

    const sections = assertions.filter(a => a.elementType === 'handbook_section');
    expect(sections).toHaveLength(2);
    expect(sections.map(s => s.metadata.title)).toEqual(
      expect.arrayContaining(['Context assembly and MVC', 'Overview']),
    );
  });
});
