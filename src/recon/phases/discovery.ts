/**
 * RECON Phase 1: Discovery
 * 
 * Discover files to process in the working tree.
 * 
 * Supports multiple languages (TypeScript, Python) and configurable
 * source directories. Designed for portability - ste-runtime can be
 * dropped into any project.
 * 
 * Per E-ADR-001 §5.1: Single repository only, incremental reconciliation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { globby } from 'globby';
import type { DiscoveredFile } from './index.js';
import type { SupportedLanguage, ResolvedConfig } from '../../config/index.js';
import { toPosixPath } from '../../utils/paths.js';
import { log } from '../../utils/logger.js';

/**
 * Language-specific file patterns
 */
const LANGUAGE_PATTERNS: Record<SupportedLanguage, string[]> = {
  typescript: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  python: ['**/*.py'],
  cloudformation: ['**/*.yaml', '**/*.yml', '**/*.json'],
  json: ['**/*.json'],  // E-ADR-005: JSON data extraction
  // E-ADR-006: Angular semantic extraction
  angular: [
    '**/*.component.ts',
    '**/*.service.ts',
    '**/*.guard.ts',
    '**/*.pipe.ts',
    '**/*.directive.ts',
    '**/*.component.html',
    '**/app.routes.ts',
    '**/*-routing.module.ts',
    '**/routes.ts',
  ],
  // E-ADR-006: CSS/SCSS extraction (standalone, cross-cutting)
  css: [
    '**/*.css',
    '**/*.scss',
    '**/*.sass',
    '**/*.less',
  ],
};

/**
 * Language-specific ignore patterns (in addition to global ignores)
 */
const LANGUAGE_IGNORES: Record<SupportedLanguage, string[]> = {
  typescript: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.test.tsx',
    '**/*.spec.tsx',
    '**/*.d.ts',
  ],
  python: [
    '**/test_*.py',
    '**/*_test.py',
    '**/conftest.py',
  ],
  cloudformation: [
    '**/parameters/**',  // Parameter files are not templates (handled by JSON extractor)
    '**/package.json',   // Not CFN
    '**/tsconfig.json',  // Not CFN
    '**/angular.json',   // Not CFN  
  ],
  // E-ADR-005: JSON data extraction ignores
  json: [
    '**/package.json',
    '**/package-lock.json',
    '**/tsconfig.json',
    '**/angular.json',
    '**/jest.config.json',
    '**/*.test.json',
    '**/fixtures/**',
    '**/node_modules/**',
  ],
  // E-ADR-006: Angular ignores
  angular: [
    '**/*.spec.ts',
    '**/*.test.ts',
  ],
  // E-ADR-006: CSS ignores
  css: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.min.css',
  ],
};

/**
 * Get file extension to language mapping
 */
function getLanguageForFile(filePath: string, content?: string): SupportedLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  const posixPath = toPosixPath(filePath);
  
  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
      return 'typescript';
    case '.py':
      return 'python';
    case '.yaml':
    case '.yml':
    case '.json':
      // Need to check if it's a CloudFormation template
      // This is determined by content inspection in the caller
      return null; // Will be handled specially for CFN
    case '.css':
    case '.scss':
    case '.sass':
    case '.less':
      return 'css';  // E-ADR-006
    case '.html':
      // HTML files are only Angular templates if they match the pattern
      if (posixPath.endsWith('.component.html')) {
        return 'angular';  // E-ADR-006
      }
      return null;
    default:
      return null;
  }
}

/**
 * Check if a TypeScript file is an Angular file (per E-ADR-006)
 */
function isAngularFile(filePath: string): boolean {
  const posixPath = toPosixPath(filePath);
  
  const angularPatterns = [
    '.component.ts',
    '.service.ts',
    '.guard.ts',
    '.pipe.ts',
    '.directive.ts',
    'app.routes.ts',
    '-routing.module.ts',
    '/routes.ts',
  ];
  
  for (const pattern of angularPatterns) {
    if (posixPath.endsWith(pattern) || posixPath.includes(pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a JSON file is a semantic data file (per E-ADR-005)
 * 
 * Semantic JSON files are identified by path patterns:
 * - controls, controls-catalog → control definitions
 * - schemas, schema → data schemas
 * - parameters, params → CFN parameters
 * - seed-data, reference → reference data
 */
function isSemanticJsonFile(filePath: string): boolean {
  const posixPath = toPosixPath(filePath);
  
  // Check for semantic directory patterns
  const semanticPatterns = [
    '/controls/',
    '/controls-catalog/',
    '/schemas/',
    '/schema/',
    '/parameters/',
    '/params/',
    '/seed-data/',
    '/reference/',
    '/data/',  // Generic data directory
  ];
  
  for (const pattern of semanticPatterns) {
    if (posixPath.includes(pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a YAML/JSON file is a CloudFormation template
 */
async function isCloudFormationTemplate(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Quick heuristics to identify CFN templates
    // Check for AWSTemplateFormatVersion or Resources section
    if (content.includes('AWSTemplateFormatVersion') || 
        content.includes('AWS::') ||
        (content.includes('Resources:') && content.includes('Type:'))) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

export interface DiscoveryOptions {
  /**
   * Project root directory
   */
  projectRoot: string;
  
  /**
   * Source directories to scan (relative to projectRoot)
   */
  sourceDirs: string[];
  
  /**
   * Languages to discover
   */
  languages: SupportedLanguage[];
  
  /**
   * Additional ignore patterns
   */
  ignorePatterns: string[];
}

/**
 * Discover source files for extraction.
 * 
 * Scans configured source directories for files matching
 * the configured languages. Applies ignore patterns.
 */
export async function discoverFiles(options: DiscoveryOptions): Promise<DiscoveredFile[]> {
  const { projectRoot, sourceDirs, languages, ignorePatterns } = options;
  const discoveredFiles: DiscoveredFile[] = [];
  
  // Build patterns for all configured languages
  const includePatterns: string[] = [];
  const excludePatterns: string[] = [...ignorePatterns];
  
  for (const lang of languages) {
    includePatterns.push(...LANGUAGE_PATTERNS[lang]);
    excludePatterns.push(...LANGUAGE_IGNORES[lang]);
  }
  
  // Scan each source directory
  for (const sourceDir of sourceDirs) {
    const absoluteSourceDir = path.resolve(projectRoot, sourceDir);
    
    try {
      await fs.access(absoluteSourceDir);
    } catch {
      console.warn(`[RECON Discovery] Source directory not found: ${sourceDir}`);
      continue;
    }
    
    // Build patterns relative to sourceDir
    const patterns = includePatterns.map(p => 
      sourceDir === '.' ? p : `${sourceDir}/${p}`
    );
    
    try {
      const files = await globby(patterns, {
        cwd: projectRoot,
        absolute: false,
        gitignore: true,
        ignore: excludePatterns,
      });
      
      for (const file of files) {
        const absolutePath = path.resolve(projectRoot, file);
        
        // CRITICAL: Boundary check - ensure file is within project root
        // This prevents scanning files outside the project scope
        const relativeToProject = path.relative(projectRoot, absolutePath);
        if (relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject)) {
          throw new Error(
            `CRITICAL BOUNDARY VIOLATION: Attempted to scan file outside project root.\n` +
            `  File: ${absolutePath}\n` +
            `  Project root: ${projectRoot}\n` +
            `  This would scan outside the allowed project scope, which is FORBIDDEN.`
          );
        }
        
        let language = getLanguageForFile(file);
        
        // Handle YAML/JSON files - determine if CFN template or JSON data
        const ext = path.extname(file).toLowerCase();
        if (ext === '.yaml' || ext === '.yml' || ext === '.json') {
          // Check for CloudFormation first
          if (languages.includes('cloudformation') && await isCloudFormationTemplate(absolutePath)) {
            language = 'cloudformation';
          }
          // Check for JSON data files (E-ADR-005)
          else if (ext === '.json' && languages.includes('json')) {
            // Check if this is a semantic JSON file (controls, schemas, parameters)
            if (isSemanticJsonFile(file)) {
              language = 'json';
            } else {
              continue; // Not a semantic JSON file, skip
            }
          }
          else {
            continue; // Not CFN or JSON data, skip
          }
        }
        
        // Handle TypeScript files - check if Angular (E-ADR-006)
        if (ext === '.ts' && languages.includes('angular') && isAngularFile(file)) {
          language = 'angular';
        }
        
        // Handle HTML files - check if Angular template (E-ADR-006)
        if (ext === '.html' && languages.includes('angular')) {
          if (file.endsWith('.component.html')) {
            language = 'angular';
          } else {
            continue; // Not an Angular template, skip
          }
        }
        
        if (!language || !languages.includes(language)) {
          continue;
        }
        
        try {
          await fs.access(absolutePath);
          
          discoveredFiles.push({
            path: absolutePath,
            // Normalize to POSIX paths for consistent IDs across platforms
            relativePath: toPosixPath(file),
            language,
            // Without git diff, treat all as 'unchanged' initially
            // Future: Add timestamp-based detection
            changeType: 'unchanged',
          });
        } catch {
          // File not accessible, skip
          continue;
        }
      }
    } catch (error) {
      console.error(`[RECON Discovery] Error scanning ${sourceDir}:`, error);
    }
  }
  
  log(`[RECON Discovery] Found ${discoveredFiles.length} files`);
  log(`[RECON Discovery] Languages: ${languages.join(', ')}`);
  
  // Log breakdown by language
  const byLanguage = new Map<SupportedLanguage, number>();
  for (const file of discoveredFiles) {
    const count = byLanguage.get(file.language) ?? 0;
    byLanguage.set(file.language, count + 1);
  }
  for (const [lang, count] of byLanguage) {
    log(`[RECON Discovery]   ${lang}: ${count} files`);
  }
  
  return discoveredFiles;
}

/**
 * Convenience function using ResolvedConfig
 */
export async function discoverFilesFromConfig(config: ResolvedConfig): Promise<DiscoveredFile[]> {
  return discoverFiles({
    projectRoot: config.projectRoot,
    sourceDirs: config.sourceDirs,
    languages: config.languages,
    ignorePatterns: config.ignorePatterns,
  });
}

/**
 * Legacy function for backward compatibility.
 * @deprecated Use discoverFiles or discoverFilesFromConfig instead
 */
export async function discoverFilesLegacy(
  projectRoot: string,
  sourceRoot: string
): Promise<DiscoveredFile[]> {
  return discoverFiles({
    projectRoot,
    sourceDirs: [sourceRoot],
    languages: ['typescript'],
    ignorePatterns: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.ts',
      '**/*.spec.ts',
    ],
  });
}
