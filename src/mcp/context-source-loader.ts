/**
 * Context Source Loader
 * 
 * Loads source code for specific slices to support Layer 2 context assembly.
 * Per E-ADR-011: Context Assembly operations that combine graph metadata with source code.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AidocNode } from '../rss/graph-loader.js';

export interface SourceContext {
  /** Slice key (domain/type/id) */
  key: string;
  /** Source file path */
  filePath: string;
  /** Source code content */
  content: string;
  /** Line range if available from slice */
  lineRange?: { start: number; end: number };
  /** Extracted lines (respecting maxLines limit) */
  lines: string[];
  /** Whether content was truncated */
  truncated: boolean;
}

export interface LoadSourceOptions {
  /** Maximum lines to load per file (token budget control) */
  maxLines?: number;
  /** Project root for resolving relative paths */
  projectRoot?: string;
  /** Include full file content even if slice has line range */
  includeFullFile?: boolean;
}

/**
 * Load source code for a single slice
 */
export async function loadSourceForSlice(
  node: AidocNode,
  options: LoadSourceOptions = {}
): Promise<SourceContext | null> {
  const { maxLines = 100, projectRoot = process.cwd(), includeFullFile = false } = options;
  
  // Get the primary source file for this slice
  const sourceFile = node.sourceFiles[0];
  if (!sourceFile) {
    return null;
  }
  
  const filePath = path.isAbsolute(sourceFile) 
    ? sourceFile 
    : path.resolve(projectRoot, sourceFile);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const allLines = content.split('\n');
    
    let lines: string[];
    let truncated = false;
    let lineRange: { start: number; end: number } | undefined;
    
    // If slice has line range and we're not including full file, extract that range
    if (node.slice && !includeFullFile) {
      const start = Math.max(0, (node.slice.start ?? 1) - 1); // Convert to 0-based
      const end = Math.min(allLines.length, node.slice.end ?? allLines.length);
      lineRange = { start: start + 1, end }; // Store as 1-based
      
      lines = allLines.slice(start, end);
      
      // Apply maxLines limit
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        truncated = true;
      }
    } else {
      // No line range, take from beginning up to maxLines
      lines = allLines.slice(0, maxLines);
      truncated = allLines.length > maxLines;
    }
    
    return {
      key: node.key,
      filePath: sourceFile,
      content,
      lineRange,
      lines,
      truncated,
    };
  } catch (error) {
    // File might not exist or not readable
    return null;
  }
}

/**
 * Load source code for multiple slices
 */
export async function loadSourceForSlices(
  nodes: AidocNode[],
  options: LoadSourceOptions = {}
): Promise<SourceContext[]> {
  const results = await Promise.all(
    nodes.map(node => loadSourceForSlice(node, options))
  );
  
  return results.filter((ctx): ctx is SourceContext => ctx !== null);
}

/**
 * Load source code grouped by file (more efficient for multiple slices from same file)
 */
export async function loadSourceGroupedByFile(
  nodes: AidocNode[],
  options: LoadSourceOptions = {}
): Promise<Map<string, SourceContext[]>> {
  const { projectRoot = process.cwd() } = options;
  const fileGroups = new Map<string, AidocNode[]>();
  
  // Group nodes by source file
  for (const node of nodes) {
    const sourceFile = node.sourceFiles[0];
    if (!sourceFile) continue;
    
    const filePath = path.isAbsolute(sourceFile)
      ? sourceFile
      : path.resolve(projectRoot, sourceFile);
    
    if (!fileGroups.has(filePath)) {
      fileGroups.set(filePath, []);
    }
    fileGroups.get(filePath)!.push(node);
  }
  
  // Load each file once and extract contexts for all slices
  const result = new Map<string, SourceContext[]>();
  
  for (const [filePath, groupNodes] of fileGroups.entries()) {
    const contexts: SourceContext[] = [];
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      for (const node of groupNodes) {
        const ctx = await extractContextFromContent(node, content, filePath, options);
        if (ctx) {
          contexts.push(ctx);
        }
      }
    } catch (error) {
      // Skip file if not readable
      continue;
    }
    
    if (contexts.length > 0) {
      result.set(filePath, contexts);
    }
  }
  
  return result;
}

/**
 * Extract context from already-loaded file content
 */
async function extractContextFromContent(
  node: AidocNode,
  content: string,
  filePath: string,
  options: LoadSourceOptions
): Promise<SourceContext | null> {
  const { maxLines = 100, includeFullFile = false } = options;
  const allLines = content.split('\n');
  
  let lines: string[];
  let truncated = false;
  let lineRange: { start: number; end: number } | undefined;
  
  if (node.slice && !includeFullFile) {
    const start = Math.max(0, (node.slice.start ?? 1) - 1);
    const end = Math.min(allLines.length, node.slice.end ?? allLines.length);
    lineRange = { start: start + 1, end };
    
    lines = allLines.slice(start, end);
    
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      truncated = true;
    }
  } else {
    lines = allLines.slice(0, maxLines);
    truncated = allLines.length > maxLines;
  }
  
  return {
    key: node.key,
    filePath: node.sourceFiles[0] || filePath,
    content,
    lineRange,
    lines,
    truncated,
  };
}

/**
 * Format source context for LLM consumption
 */
export function formatSourceForLLM(
  contexts: SourceContext[],
  options: { includeLineNumbers?: boolean; includeFilePath?: boolean } = {}
): string {
  const { includeLineNumbers = true, includeFilePath = true } = options;
  const sections: string[] = [];
  
  for (const ctx of contexts) {
    const parts: string[] = [];
    
    if (includeFilePath) {
      parts.push(`File: ${ctx.filePath}`);
      if (ctx.lineRange) {
        parts.push(`Lines: ${ctx.lineRange.start}-${ctx.lineRange.end}`);
      }
      parts.push('');
    }
    
    if (includeLineNumbers && ctx.lineRange) {
      const startLine = ctx.lineRange.start;
      const numberedLines = ctx.lines.map((line, idx) => {
        const lineNum = startLine + idx;
        return `${lineNum.toString().padStart(4, ' ')} | ${line}`;
      });
      parts.push(numberedLines.join('\n'));
    } else {
      parts.push(ctx.lines.join('\n'));
    }
    
    if (ctx.truncated) {
      parts.push('');
      parts.push('... (truncated)');
    }
    
    sections.push(parts.join('\n'));
  }
  
  return sections.join('\n\n---\n\n');
}



