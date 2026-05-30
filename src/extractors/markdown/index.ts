/**
 * Markdown / handbook manuscript extractor.
 *
 * Shallow extraction for documentation repositories (e.g. ste-handbook):
 * chapter documents, section headings, internal links, and STE identifier references.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DiscoveredFile, RawAssertion } from '../../recon/phases/index.js';
import { generateSliceId, toPosixPath } from '../../utils/paths.js';

const HEADING_LINE = /^(#{1,6})\s+(.+)$/;
const STE_ID = /\b(ADR-[A-Z]+-\d+|INV-\d+)\b/g;
const INTERNAL_MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;

const MAX_SOURCE_CHARS = 12_000;

function partFromPath(relativePath: string): string | undefined {
  const seg = relativePath.split('/')[0];
  if (seg && /^\d{2}-/.test(seg)) {
    return seg;
  }
  return undefined;
}

function collectSteIds(content: string): string[] {
  return [...new Set([...content.matchAll(STE_ID)].map(m => m[0]))];
}

function collectInternalLinks(content: string): string[] {
  const links: string[] = [];
  for (const m of content.matchAll(INTERNAL_MD_LINK)) {
    const target = m[2]?.trim();
    if (target && (target.endsWith('.md') || target.includes('.md#'))) {
      links.push(target);
    }
  }
  return [...new Set(links)];
}

/**
 * Extract semantic assertions from a Markdown manuscript file.
 */
export async function extractFromMarkdown(file: DiscoveredFile): Promise<RawAssertion[]> {
  const normalizedPath = toPosixPath(file.relativePath);
  let content: string;
  try {
    content = await fs.readFile(file.path, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const assertions: RawAssertion[] = [];

  let title = path.basename(normalizedPath, '.md');
  const headings: Array<{ level: number; text: string; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = HEADING_LINE.exec(lines[i]);
    if (!match) continue;
    const level = match[1].length;
    const text = match[2].trim();
    headings.push({ level, text, line: i + 1 });
    if (level === 1) {
      title = text;
    }
  }

  const steReferences = collectSteIds(content);
  const internalLinks = collectInternalLinks(content);
  const source =
    content.length > MAX_SOURCE_CHARS ? `${content.slice(0, MAX_SOURCE_CHARS)}\n…` : content;

  assertions.push({
    elementId: generateSliceId('handbook_document', normalizedPath, normalizedPath),
    elementType: 'handbook_document',
    file: normalizedPath,
    line: 1,
    end_line: lines.length,
    language: 'markdown',
    metadata: {
      title,
      part: partFromPath(normalizedPath),
      heading_count: headings.length,
      ste_references: steReferences,
      internal_links: internalLinks,
    },
    source,
  });

  for (const h of headings) {
    assertions.push({
      elementId: generateSliceId(
        'handbook_section',
        normalizedPath,
        `${h.level}:${h.line}:${h.text}`,
      ),
      elementType: 'handbook_section',
      file: normalizedPath,
      line: h.line,
      language: 'markdown',
      metadata: {
        level: h.level,
        title: h.text,
        part: partFromPath(normalizedPath),
        parent_document: normalizedPath,
      },
    });
  }

  return assertions;
}
