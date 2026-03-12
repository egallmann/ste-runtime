/**
 * Coverage Validator - Detect extraction coverage gaps
 * 
 * Authority: E-ADR-002 (RECON Self-Validation, Non-Blocking)
 * 
 * Advisory checks for files added/removed but not reflected in AI-DOC.
 * All findings are INFO or WARNING (never ERROR).
 * 
 * Note: This validator is limited because it doesn't have access to the full
 * project configuration. It performs a best-effort check based on normalized
 * file paths in AI-DOC. The primary purpose is to detect stale entries.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ValidationFinding, ValidatorContext } from './types.js';

/**
 * Normalize a file path for comparison:
 * - Convert backslashes to forward slashes
 * - Remove any drive letter prefix (Windows absolute paths in AI-DOC)
 * - Make relative to project root if possible
 */
function normalizePathForComparison(filePath: string, projectRoot: string): string {
  // Convert to forward slashes
  let normalized = filePath.replace(/\\/g, '/');
  
  // Remove drive letter if present (e.g., C:/Users/...)
  if (/^[A-Za-z]:/.test(normalized)) {
    // This is an absolute Windows path, try to make it relative
    const projectRootNormalized = projectRoot.replace(/\\/g, '/');
    if (normalized.toLowerCase().startsWith(projectRootNormalized.toLowerCase())) {
      normalized = normalized.substring(projectRootNormalized.length);
      // Remove leading slash
      if (normalized.startsWith('/')) {
        normalized = normalized.substring(1);
      }
    }
  }
  
  return normalized;
}

/**
 * Check if a file exists at the given path
 */
async function fileExists(projectRoot: string, relativePath: string): Promise<boolean> {
  try {
    const fullPath = path.resolve(projectRoot, relativePath);
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

export async function validateCoverage(
  context: ValidatorContext
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = [];
  
  try {
    // Get all source files currently in AI-DOC, normalized for comparison
    const aiDocFiles = new Map<string, string>(); // normalized -> original
    for (const assertion of context.assertions) {
      if (assertion._slice.source_files) {
        for (const file of assertion._slice.source_files) {
          const normalized = normalizePathForComparison(file, context.projectRoot);
          aiDocFiles.set(normalized, file);
        }
      }
    }
    
    // Check which AI-DOC files still exist on disk
    // This is more reliable than walking directories since AI-DOC 
    // may contain files from many different source directories
    const removedFiles: string[] = [];
    const existingFiles: string[] = [];
    
    for (const [normalized, original] of aiDocFiles) {
      const exists = await fileExists(context.projectRoot, normalized);
      if (exists) {
        existingFiles.push(normalized);
      } else {
        removedFiles.push(original);
      }
    }
    
    if (removedFiles.length > 0) {
      findings.push({
        category: 'WARNING',
        validator: 'coverage',
        affected_artifacts: removedFiles,
        description: `${removedFiles.length} file(s) in AI-DOC no longer exist in source`,
        suggested_investigation: 'Stale AI-DOC entries; consider cleanup or verify file paths',
      });
    }
    
    // Report overall coverage statistics
    const totalInAiDoc = aiDocFiles.size;
    const totalExisting = existingFiles.length;
    const coveragePercent = totalInAiDoc > 0
      ? Math.round((totalExisting / totalInAiDoc) * 100)
      : 100;
    
    findings.push({
      category: 'INFO',
      validator: 'coverage',
      affected_artifacts: [],
      description: `AI-DOC file validity: ${totalExisting}/${totalInAiDoc} files exist (${coveragePercent}%)`,
      suggested_investigation: coveragePercent < 100
        ? 'Some AI-DOC entries reference deleted files'
        : 'All AI-DOC entries reference valid files',
    });
  } catch (error) {
    findings.push({
      category: 'ERROR',
      validator: 'coverage',
      affected_artifacts: [],
      description: `Coverage validation failed: ${error instanceof Error ? error.message : String(error)}`,
      suggested_investigation: 'Check file system access and project structure',
    });
  }
  
  return findings;
}
