/**
 * STE Configuration Loader
 * 
 * Loads configuration from ste.config.json in the project root.
 * When ste-runtime is dropped into a project, it auto-discovers
 * the parent project and applies appropriate defaults.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

/**
 * Supported languages/formats for extraction
 * 
 * Authority: E-ADR-001, E-ADR-005, E-ADR-006
 */
export const SupportedLanguage = z.enum([
  'typescript',
  'python', 
  'cloudformation', 
  'json',
  'angular',  // E-ADR-006: Angular semantic extraction
  'css',      // E-ADR-006: CSS/SCSS extraction (standalone, cross-cutting)
]);
export type SupportedLanguage = z.infer<typeof SupportedLanguage>;

/**
 * JSON extraction pattern configuration
 * Per E-ADR-005: JSON patterns are configured per-project
 */
export const JsonPatternsSchema = z.object({
  controls: z.string().optional(),
  schemas: z.string().optional(),
  parameters: z.string().optional(),
}).optional();

export type JsonPatterns = z.infer<typeof JsonPatternsSchema>;

/**
 * Angular extraction pattern configuration
 * Per E-ADR-006: Angular patterns are configured per-project
 */
export const AngularPatternsSchema = z.object({
  components: z.string().optional(),
  services: z.string().optional(),
  templates: z.string().optional(),
}).optional();

export type AngularPatterns = z.infer<typeof AngularPatternsSchema>;

/**
 * CSS/SCSS extraction pattern configuration
 * Per E-ADR-006: CSS is a standalone cross-cutting extractor
 */
export const CssPatternsSchema = z.object({
  styles: z.string().optional(),
  designTokens: z.string().optional(),
}).optional();

export type CssPatterns = z.infer<typeof CssPatternsSchema>;

/**
 * Watchdog configuration for file watching and automatic RECON
 * Per E-ADR-011: MCP Server with file watching
 */
export const WatchdogConfigSchema = z.object({
  enabled: z.boolean().default(false),  // Opt-in
  debounceMs: z.number().default(500),
  aiEditDebounceMs: z.number().default(2000),
  syntaxValidation: z.boolean().default(true),
  transactionDetection: z.boolean().default(true),
  stabilityCheckMs: z.number().default(100),
  patterns: z.array(z.string()).default(['**/*.py', '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx']),
  ignore: z.array(z.string()).default(['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build']),
  fullReconciliationInterval: z.number().default(0),  // 0 = disabled
  fallbackPolling: z.boolean().default(false),
  pollingInterval: z.number().default(5000),
}).optional();

export type WatchdogConfig = z.infer<typeof WatchdogConfigSchema>;

/**
 * MCP server configuration
 * Per E-ADR-011: MCP Server implementation
 */
export const McpConfigSchema = z.object({
  transport: z.literal('stdio').default('stdio'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
}).optional();

export type McpConfig = z.infer<typeof McpConfigSchema>;

/**
 * RSS configuration
 * Per E-ADR-011: RSS operations with adaptive parameters
 */
export const RssConfigSchema = z.object({
  stateRoot: z.string().default('.ste/state'),
  defaultDepth: z.number().default(2),
  maxResults: z.number().default(50),
}).optional();

export type RssConfig = z.infer<typeof RssConfigSchema>;

/**
 * Configuration schema for ste.config.json
 */
export const SteConfigSchema = z.object({
  /**
   * Languages to extract from the project.
   * Default: auto-detect based on file presence
   */
  languages: z.array(SupportedLanguage).optional(),
  
  /**
   * Source directories to scan (relative to project root).
   * Default: scan entire project (excluding common ignore patterns)
   */
  sourceDirs: z.array(z.string()).optional(),
  
  /**
   * Patterns to ignore during discovery.
   * Added to built-in ignore patterns.
   */
  ignorePatterns: z.array(z.string()).optional(),
  
  /**
   * Where to write AI-DOC state (relative to project root).
   * Default: .ste/state
   */
  stateDir: z.string().optional(),
  
  /**
   * Where ste-runtime is located (relative to project root).
   * Auto-detected if not specified.
   */
  runtimeDir: z.string().optional(),
  
  /**
   * JSON extraction patterns (per E-ADR-005).
   * Configures which JSON files to extract as semantic entities.
   */
  jsonPatterns: JsonPatternsSchema,
  
  /**
   * Angular extraction patterns (per E-ADR-006).
   * Configures Angular component, service, and template discovery.
   */
  angularPatterns: AngularPatternsSchema,
  
  /**
   * CSS/SCSS extraction patterns (per E-ADR-006).
   * Configures style and design token discovery.
   * This is a cross-cutting extractor - works with or without Angular.
   */
  cssPatterns: CssPatternsSchema,
  
  /**
   * Watchdog configuration (per E-ADR-011).
   * Configures file watching and automatic RECON triggering.
   */
  watchdog: WatchdogConfigSchema,
  
  /**
   * MCP server configuration (per E-ADR-011).
   * Configures Model Context Protocol server settings.
   */
  mcp: McpConfigSchema,
  
  /**
   * RSS configuration (per E-ADR-011).
   * Configures semantic graph query defaults.
   */
  rss: RssConfigSchema,
});

export type SteConfig = z.infer<typeof SteConfigSchema>;

/**
 * Resolved configuration with all defaults applied
 */
export interface ResolvedConfig {
  projectRoot: string;
  runtimeDir: string;
  languages: SupportedLanguage[];
  sourceDirs: string[];
  ignorePatterns: string[];
  stateDir: string;
  /** JSON extraction patterns per E-ADR-005 */
  jsonPatterns: {
    controls?: string;
    schemas?: string;
    parameters?: string;
  };
  /** Angular extraction patterns per E-ADR-006 */
  angularPatterns: {
    components?: string;
    services?: string;
    templates?: string;
  };
  /** CSS/SCSS extraction patterns per E-ADR-006 */
  cssPatterns: {
    styles?: string;
    designTokens?: string;
  };
  /** Watchdog configuration per E-ADR-011 */
  watchdog: {
    enabled: boolean;
    debounceMs: number;
    aiEditDebounceMs: number;
    syntaxValidation: boolean;
    transactionDetection: boolean;
    stabilityCheckMs: number;
    patterns: string[];
    ignore: string[];
    fullReconciliationInterval: number;
    fallbackPolling: boolean;
    pollingInterval: number;
  };
  /** MCP server configuration per E-ADR-011 */
  mcp: {
    transport: 'stdio';
    logLevel: 'error' | 'warn' | 'info' | 'debug';
  };
  /** RSS configuration per E-ADR-011 */
  rss: {
    stateRoot: string;
    defaultDepth: number;
    maxResults: number;
  };
}

/**
 * Built-in ignore patterns (always applied)
 */
const BUILTIN_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.ste/**',
  '**/venv/**',
  '**/.venv/**',
  '**/__pycache__/**',
  '**/*.egg-info/**',
  '**/ste-runtime/**',  // Don't scan self by default
];

/**
 * Find the project root by looking for common project markers.
 * 
 * Strategy:
 * 1. Start from ste-runtime's PARENT directory (not ste-runtime itself)
 * 2. FIRST: Look for ste.config.json - this is the authoritative project marker
 * 3. THEN: Look for standard project markers (package.json, pyproject.toml, .git, etc.)
 * 4. Stop at the FIRST match - do not traverse further up
 * 
 * This ensures that if a project has ste.config.json at its root, we use that
 * as the definitive project boundary, even if parent directories also have markers.
 */
async function findProjectRoot(startDir: string): Promise<string> {
  // Start from parent of ste-runtime, not ste-runtime itself
  let currentDir = path.resolve(startDir, '..');
  const root = path.parse(currentDir).root;
  
  // Priority 1: ste.config.json is the authoritative project marker
  // Check immediate parent first before traversing
  const steConfigPath = path.join(currentDir, 'ste.config.json');
  try {
    await fs.access(steConfigPath);
    return currentDir; // Found ste.config.json in immediate parent
  } catch {
    // Continue with standard marker search
  }
  
  // Priority 2: Look for standard project markers
  // But STOP at the first directory that has ANY marker
  const markers = [
    'ste.config.json',  // Check again in case it's higher up
    'pyproject.toml',
    'requirements.txt',
    'setup.py',
    'package.json',
    '.git',
  ];
  
  let searchDir = currentDir;
  while (searchDir !== root) {
    for (const marker of markers) {
      const markerPath = path.join(searchDir, marker);
      try {
        await fs.access(markerPath);
        return searchDir;
      } catch {
        // Continue searching
      }
    }
    
    const parentDir = path.dirname(searchDir);
    if (parentDir === searchDir) break;
    searchDir = parentDir;
  }
  
  // Fallback: use startDir's parent (assuming ste-runtime is in project)
  return currentDir;
}

/**
 * Auto-detect languages based on file presence in project
 */
async function detectLanguages(projectRoot: string): Promise<SupportedLanguage[]> {
  const languages: SupportedLanguage[] = [];
  
  // Validate project root exists and is accessible
  try {
    const stat = await fs.stat(projectRoot);
    if (!stat.isDirectory()) {
      // Not a directory, return defaults
      return ['typescript', 'python'];
    }
  } catch (error) {
    // Can't access project root (permission error, doesn't exist, etc.)
    // Return defaults instead of crashing
    return ['typescript', 'python'];
  }
  
  // Check for TypeScript/JavaScript
  const tsMarkers = ['tsconfig.json', 'package.json'];
  for (const marker of tsMarkers) {
    try {
      await fs.access(path.join(projectRoot, marker));
      languages.push('typescript');
      break;
    } catch {
      // Continue
    }
  }
  
  // Check for Python
  const pyMarkers = ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'];
  for (const marker of pyMarkers) {
    try {
      await fs.access(path.join(projectRoot, marker));
      languages.push('python');
      break;
    } catch {
      // Continue
    }
  }
  
  // Check for CloudFormation (look for cloudformation directory or template files)
  const cfnPaths = ['cloudformation', 'backend/cloudformation', 'infrastructure', 'cfn'];
  for (const cfnPath of cfnPaths) {
    try {
      const fullPath = path.join(projectRoot, cfnPath);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        languages.push('cloudformation');
        break;
      }
    } catch {
      // Continue
    }
  }
  
  // Check for JSON data files (controls, schemas, etc.) per E-ADR-005
  const jsonPaths = ['data', 'backend/data', 'schemas', 'controls'];
  for (const jsonPath of jsonPaths) {
    try {
      const fullPath = path.join(projectRoot, jsonPath);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        languages.push('json');
        break;
      }
    } catch {
      // Continue
    }
  }
  
  // Check for Angular (look for angular.json or angular component files) per E-ADR-006
  const angularMarkers = ['angular.json', 'angular.config.js', '.angular'];
  for (const marker of angularMarkers) {
    try {
      await fs.access(path.join(projectRoot, marker));
      languages.push('angular');
      break;
    } catch {
      // Continue
    }
  }
  
  // Check for CSS/SCSS files (styles directory or src/styles) per E-ADR-006
  const cssPaths = ['styles', 'src/styles', 'frontend/src/styles', 'src/assets/styles'];
  for (const cssPath of cssPaths) {
    try {
      const fullPath = path.join(projectRoot, cssPath);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        languages.push('css');
        break;
      }
    } catch {
      // Continue
    }
  }
  
  // Default to typescript and python if none detected
  if (languages.length === 0) {
    return ['typescript', 'python'];
  }
  
  return languages;
}

/**
 * Load configuration from a specific config file path
 */
async function loadConfigFromPath(configPath: string): Promise<SteConfig | null> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    return SteConfigSchema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // Config file doesn't exist, use defaults
    }
    console.warn(`[STE Config] Failed to parse ${configPath}: ${error}`);
    return null;
  }
}

/**
 * Load configuration from ste.config.json if present.
 * 
 * Search order:
 * 1. Project root (parent directory) - authoritative project config
 * 2. Inside ste-runtime/ - self-contained config for portability
 * 
 * This allows projects to have their own ste.config.json at the root,
 * while still supporting self-contained configs inside ste-runtime/.
 */
async function loadConfigFile(runtimeDir: string, projectRoot: string): Promise<SteConfig | null> {
  // Priority 1: Check project root for ste.config.json
  const projectConfigPath = path.join(projectRoot, 'ste.config.json');
  const projectConfig = await loadConfigFromPath(projectConfigPath);
  if (projectConfig) {
    return projectConfig;
  }
  
  // Priority 2: Check inside ste-runtime for self-contained config
  const runtimeConfigPath = path.join(runtimeDir, 'ste.config.json');
  return loadConfigFromPath(runtimeConfigPath);
}

/**
 * Validate that sourceDirs exist relative to project root.
 * Returns only the valid directories, or ['.'] if none are valid.
 */
async function validateSourceDirs(
  projectRoot: string,
  configuredDirs: string[]
): Promise<{ validDirs: string[]; invalidDirs: string[] }> {
  const validDirs: string[] = [];
  const invalidDirs: string[] = [];
  
  for (const dir of configuredDirs) {
    const fullPath = path.join(projectRoot, dir);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        validDirs.push(dir);
      } else {
        invalidDirs.push(dir);
      }
    } catch {
      invalidDirs.push(dir);
    }
  }
  
  return { validDirs, invalidDirs };
}

/**
 * Detect if ste-runtime is analyzing itself (self-analysis mode)
 */
async function detectSelfAnalysis(runtimeDir: string): Promise<boolean> {
  const resolvedRuntimeDir = path.resolve(runtimeDir);

  // Heuristic 1: Check package.json for name "ste-runtime"
  try {
    const packageJsonPath = path.join(resolvedRuntimeDir, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    if (packageJson.name === 'ste-runtime') {
      return true;
    }
  } catch {
    // Ignore error, continue to next heuristic
  }

  // Heuristic 2: Check if directory name is "ste-runtime"
  if (path.basename(resolvedRuntimeDir) === 'ste-runtime') {
    return true;
  }

  // Heuristic 3: Check for ste-runtime specific structure (e.g., src/cli/index.ts, dist/)
  const cliIndexPath = path.join(resolvedRuntimeDir, 'src', 'cli', 'index.ts');
  const distDirPath = path.join(resolvedRuntimeDir, 'dist');
  try {
    await fs.access(cliIndexPath);
    await fs.access(distDirPath);
    return true;
  } catch {
    // Ignore error
  }

  return false;
}

/**
 * Check if a directory appears to be a user home directory or system directory.
 */
function isSystemOrHomeDirectory(dirPath: string): boolean {
  const normalized = path.normalize(dirPath).toLowerCase();
  const basename = path.basename(normalized).toLowerCase();
  
  // Check for Windows user profile patterns
  if (normalized.includes('\\users\\') && basename !== 'users') {
    return false; // Don't reject based on path alone
  }
  
  // Check for common system root directories
  const systemRoots = [
    'c:\\windows',
    'c:\\program files',
    'c:\\programdata',
    'c:\\users', // Entire Users directory
  ];
  
  return systemRoots.some(root => normalized.startsWith(root));
}

/**
 * Validate that project root is within the allowed scope.
 * For ste-runtime self-analysis, the project root MUST be exactly the runtime directory.
 * 
 * @param projectRoot - The detected project root
 * @param runtimeDir - The ste-runtime directory
 * @param isSelfAnalysis - Whether we're in self-analysis mode
 * @throws Error if project root is outside allowed scope
 */
function validateProjectScope(
  projectRoot: string,
  runtimeDir: string,
  isSelfAnalysis: boolean
): void {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedRuntimeDir = path.resolve(runtimeDir);
  
  if (isSelfAnalysis) {
    // For self-analysis: project root MUST be exactly the runtime directory
    if (resolvedProjectRoot !== resolvedRuntimeDir) {
      throw new Error(
        `CRITICAL BOUNDARY VIOLATION: For self-analysis, project root must equal runtime directory.\n` +
        `  Project root: ${resolvedProjectRoot}\n` +
        `  Runtime dir:  ${resolvedRuntimeDir}\n` +
        `  This would allow scanning outside the ste-runtime directory, which is FORBIDDEN.\n` +
        `  Allowed scope: ${resolvedRuntimeDir}`
      );
    }
  } else {
    // For external projects: project root must be a child of runtime dir's parent
    // But NOT the parent directory itself or higher
    const runtimeParent = path.dirname(resolvedRuntimeDir);
    const projectParent = path.dirname(resolvedProjectRoot);
    
    // CRITICAL: Reject if project root is the parent of runtime dir
    // This prevents scanning the parent directory when we should only scan the specific project
    if (resolvedProjectRoot === runtimeParent) {
      throw new Error(
        `CRITICAL BOUNDARY VIOLATION: Project root is the parent directory of ste-runtime.\n` +
        `  Project root: ${resolvedProjectRoot}\n` +
        `  Runtime dir:  ${resolvedRuntimeDir}\n` +
        `  This would scan outside the intended project scope.\n` +
        `  Please ensure ste.config.json exists in your project directory, not the parent.`
      );
    }
    
    // Reject if project root is higher up the tree than runtime's parent
    if (!resolvedProjectRoot.startsWith(runtimeParent + path.sep) && resolvedProjectRoot !== runtimeParent) {
      // Actually, this is okay - project could be in a sibling directory
      // But validate it's not too far
      const relativePath = path.relative(runtimeParent, resolvedProjectRoot);
      if (relativePath.startsWith('..') && relativePath.split(path.sep).filter(p => p === '..').length > 1) {
        throw new Error(
          `CRITICAL BOUNDARY VIOLATION: Project root is outside the allowed scope.\n` +
          `  Project root: ${resolvedProjectRoot}\n` +
          `  Runtime dir:  ${resolvedRuntimeDir}\n` +
          `  This would scan outside the intended project scope.`
        );
      }
    }
  }
}

/**
 * Validate that project root is within reasonable bounds from runtime directory.
 */
async function validateProjectRootBounds(
  projectRoot: string,
  runtimeDir: string
): Promise<void> {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedRuntimeDir = path.resolve(runtimeDir);
  
  // CRITICAL: Reject system directories
  if (isSystemOrHomeDirectory(resolvedProjectRoot)) {
    throw new Error(
      `Project root appears to be a system or home directory: ${resolvedProjectRoot}. ` +
      `This would scan outside the project scope. Please ensure ste.config.json exists in your project directory.`
    );
  }
  
  // Check if project root is a parent of runtime dir
  if (resolvedRuntimeDir.startsWith(resolvedProjectRoot + path.sep)) {
    const relativePath = path.relative(resolvedProjectRoot, resolvedRuntimeDir);
    const levels = relativePath.split(path.sep).filter(p => p !== '' && p !== '..').length;
    
    // Allow up to 3 levels up
    if (levels > 3) {
      throw new Error(
        `Project root is too far from runtime directory (${levels} levels). ` +
        `Project root: ${resolvedProjectRoot}, Runtime dir: ${resolvedRuntimeDir}. ` +
        `This may indicate incorrect project root detection that could scan outside project scope.`
      );
    }
  }
}

/**
 * Enforce hard boundary that project root never exceeds the runtime directory for self-analysis.
 */
async function enforceProjectBoundary(
  projectRoot: string,
  runtimeDir: string,
  isSelfAnalysis: boolean
): Promise<void> {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedRuntimeDir = path.resolve(runtimeDir);
  
  if (isSelfAnalysis) {
    // For self-analysis: project root MUST equal runtime directory
    if (resolvedProjectRoot !== resolvedRuntimeDir) {
      throw new Error(
        `CRITICAL: For self-analysis, project root must equal runtime directory. ` +
        `Project root: ${resolvedProjectRoot}, Runtime dir: ${resolvedRuntimeDir}. ` +
        `This would allow scanning outside the ste-runtime directory, which is forbidden.`
      );
    }
  } else {
    // For external projects: validate bounds
    await validateProjectRootBounds(projectRoot, runtimeDir);
  }
}

/**
 * Load and resolve STE configuration.
 * 
 * Config is loaded from INSIDE ste-runtime/ for full self-containment.
 * 
 * @param runtimeDir - Path to ste-runtime directory (usually __dirname)
 * @returns Fully resolved configuration
 */
export async function loadConfig(runtimeDir: string): Promise<ResolvedConfig> {
  const resolvedRuntimeDir = path.resolve(runtimeDir);
  
  // CRITICAL: Detect self-analysis mode FIRST before calling findProjectRoot
  // This prevents scanning outside the ste-runtime directory
  const isSelfAnalysis = await detectSelfAnalysis(resolvedRuntimeDir);
  
  let projectRoot: string;
  
  if (isSelfAnalysis) {
    // For self-analysis: ALWAYS use runtime directory as project root
    // Never scan outside the ste-runtime directory
    projectRoot = resolvedRuntimeDir;
    console.error(`[STE Config] Self-analysis mode detected. Project root: ${projectRoot}`);
  } else {
    // For external projects: find project root in parent directory
    projectRoot = await findProjectRoot(resolvedRuntimeDir);
    
    // CRITICAL: Validate project root is within reasonable bounds
    // This prevents scanning outside the intended project scope
    await validateProjectRootBounds(projectRoot, resolvedRuntimeDir);
  }
  
  // CRITICAL: Final validation - project root must never be outside runtime directory
  // for self-analysis, or more than 3 levels up for external projects
  await enforceProjectBoundary(projectRoot, resolvedRuntimeDir, isSelfAnalysis);
  
  // CRITICAL: Additional scope validation - ensure project root is within allowed bounds
  validateProjectScope(projectRoot, resolvedRuntimeDir, isSelfAnalysis);
  
  // For self-analysis, check for ste-self.config.json first
  let configFile: SteConfig | null = null;
  if (isSelfAnalysis) {
    const selfConfigPath = path.join(resolvedRuntimeDir, 'ste-self.config.json');
    configFile = await loadConfigFromPath(selfConfigPath);
  }
  
  // If no self-config found (or not self-analysis), use normal config loading
  if (!configFile) {
    configFile = await loadConfigFile(resolvedRuntimeDir, projectRoot);
  }
  
  // Detect languages if not specified
  const languages = configFile?.languages ?? await detectLanguages(projectRoot);
  
  // Validate sourceDirs if configured
  let sourceDirs: string[];
  if (configFile?.sourceDirs) {
    const { validDirs, invalidDirs } = await validateSourceDirs(
      projectRoot,
      configFile.sourceDirs
    );
    
    if (invalidDirs.length > 0) {
      console.warn(`[STE Config] WARNING: Configured sourceDirs not found in project:`);
      for (const dir of invalidDirs) {
        console.warn(`  - ${dir}`);
      }
      
      if (validDirs.length > 0) {
        console.warn(`[STE Config] Using valid directories only: ${validDirs.join(', ')}`);
        sourceDirs = validDirs;
      } else {
        console.warn(`[STE Config] No valid directories found. Falling back to auto-detection.`);
        sourceDirs = ['.'];
      }
    } else {
      sourceDirs = validDirs;
    }
  } else {
    // Default: scan from project root
    sourceDirs = ['.'];
  }
  
  // Merge ignore patterns
  const ignorePatterns = [
    ...BUILTIN_IGNORE_PATTERNS,
    ...(configFile?.ignorePatterns ?? []),
  ];
  
  // State directory - defaults to INSIDE ste-runtime for easy add/remove
  // The stateDir in config is relative to ste-runtime, not project root
  const configStateDir = configFile?.stateDir ?? '.ste/state';
  
  // For self-analysis (projectRoot === runtimeDir), use stateDir directly
  // For external projects, compute relative path from project root to ste-runtime's state dir
  let stateDir: string;
  if (projectRoot === resolvedRuntimeDir) {
    // Self-analysis: stateDir is relative to project root (which is runtimeDir)
    stateDir = configStateDir;
  } else {
    // External project: compute relative path
    const runtimeRelative = path.relative(projectRoot, resolvedRuntimeDir);
    stateDir = path.join(runtimeRelative, configStateDir).replace(/\\/g, '/');
  }
  
  // JSON patterns with defaults per E-ADR-005
  const jsonPatterns = configFile?.jsonPatterns ?? {};
  
  // Angular patterns with defaults per E-ADR-006
  const angularPatterns = configFile?.angularPatterns ?? {};
  
  // CSS patterns with defaults per E-ADR-006
  const cssPatterns = configFile?.cssPatterns ?? {};
  
  // Watchdog configuration with defaults per E-ADR-011
  const watchdog = {
    enabled: configFile?.watchdog?.enabled ?? false,
    debounceMs: configFile?.watchdog?.debounceMs ?? 500,
    aiEditDebounceMs: configFile?.watchdog?.aiEditDebounceMs ?? 2000,
    syntaxValidation: configFile?.watchdog?.syntaxValidation ?? true,
    transactionDetection: configFile?.watchdog?.transactionDetection ?? true,
    stabilityCheckMs: configFile?.watchdog?.stabilityCheckMs ?? 100,
    patterns: configFile?.watchdog?.patterns ?? ['**/*.py', '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    ignore: configFile?.watchdog?.ignore ?? ['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build'],
    fullReconciliationInterval: configFile?.watchdog?.fullReconciliationInterval ?? 0,
    fallbackPolling: configFile?.watchdog?.fallbackPolling ?? false,
    pollingInterval: configFile?.watchdog?.pollingInterval ?? 5000,
  };
  
  // MCP configuration with defaults per E-ADR-011
  const mcp = {
    transport: 'stdio' as const,
    logLevel: (configFile?.mcp?.logLevel ?? 'info') as 'error' | 'warn' | 'info' | 'debug',
  };
  
  // RSS configuration with defaults per E-ADR-011
  const rss = {
    stateRoot: configFile?.rss?.stateRoot ?? '.ste/state',
    defaultDepth: configFile?.rss?.defaultDepth ?? 2,
    maxResults: configFile?.rss?.maxResults ?? 50,
  };
  
  return {
    projectRoot,
    runtimeDir: resolvedRuntimeDir,
    languages,
    sourceDirs,
    ignorePatterns,
    stateDir,
    jsonPatterns,
    angularPatterns,
    cssPatterns,
    watchdog,
    mcp,
    rss,
  };
}

/**
 * Load configuration from a specific config file (for self-analysis, etc.)
 * 
 * @param configFilePath - Absolute path to the config file
 * @param baseDir - Base directory for resolving relative paths in config
 * @returns Fully resolved configuration
 */
export async function loadConfigFromFile(
  configFilePath: string,
  baseDir: string
): Promise<ResolvedConfig> {
  const resolvedBaseDir = path.resolve(baseDir);
  const configFile = await loadConfigFromPath(configFilePath);
  
  if (!configFile) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }
  
  // For self-analysis, baseDir IS the project root (ste-runtime itself)
  const projectRoot = resolvedBaseDir;
  
  // Detect languages if not specified
  const languages = configFile.languages ?? await detectLanguages(projectRoot);
  
  // Validate sourceDirs if configured
  let sourceDirs: string[];
  if (configFile.sourceDirs) {
    const { validDirs, invalidDirs } = await validateSourceDirs(
      projectRoot,
      configFile.sourceDirs
    );
    
    if (invalidDirs.length > 0) {
      console.warn(`[STE Config] WARNING: Configured sourceDirs not found:`);
      for (const dir of invalidDirs) {
        console.warn(`  - ${dir}`);
      }
      
      if (validDirs.length > 0) {
        console.warn(`[STE Config] Using valid directories only: ${validDirs.join(', ')}`);
        sourceDirs = validDirs;
      } else {
        console.warn(`[STE Config] No valid directories found. Falling back to ['.'].`);
        sourceDirs = ['.'];
      }
    } else {
      sourceDirs = validDirs;
    }
  } else {
    sourceDirs = ['.'];
  }
  
  // Merge ignore patterns
  const ignorePatterns = [
    ...BUILTIN_IGNORE_PATTERNS.filter(p => !p.includes('ste-runtime')), // Allow scanning ste-runtime for self-analysis
    ...(configFile.ignorePatterns ?? []),
  ];
  
  // State directory - relative to baseDir
  const stateDir = configFile.stateDir ?? '.ste/state';
  
  // JSON patterns with defaults per E-ADR-005
  const jsonPatterns = configFile.jsonPatterns ?? {};
  
  // Angular patterns with defaults per E-ADR-006
  const angularPatterns = configFile.angularPatterns ?? {};
  
  // CSS patterns with defaults per E-ADR-006
  const cssPatterns = configFile.cssPatterns ?? {};
  
  // Watchdog configuration with defaults per E-ADR-011
  const watchdog = {
    enabled: configFile.watchdog?.enabled ?? false,
    debounceMs: configFile.watchdog?.debounceMs ?? 500,
    aiEditDebounceMs: configFile.watchdog?.aiEditDebounceMs ?? 2000,
    syntaxValidation: configFile.watchdog?.syntaxValidation ?? true,
    transactionDetection: configFile.watchdog?.transactionDetection ?? true,
    stabilityCheckMs: configFile.watchdog?.stabilityCheckMs ?? 100,
    patterns: configFile.watchdog?.patterns ?? ['**/*.py', '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    ignore: configFile.watchdog?.ignore ?? ['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build'],
    fullReconciliationInterval: configFile.watchdog?.fullReconciliationInterval ?? 0,
    fallbackPolling: configFile.watchdog?.fallbackPolling ?? false,
    pollingInterval: configFile.watchdog?.pollingInterval ?? 5000,
  };
  
  // MCP configuration with defaults per E-ADR-011
  const mcp = {
    transport: 'stdio' as const,
    logLevel: (configFile.mcp?.logLevel ?? 'info') as 'error' | 'warn' | 'info' | 'debug',
  };
  
  // RSS configuration with defaults per E-ADR-011
  const rss = {
    stateRoot: configFile.rss?.stateRoot ?? '.ste/state',
    defaultDepth: configFile.rss?.defaultDepth ?? 2,
    maxResults: configFile.rss?.maxResults ?? 50,
  };
  
  return {
    projectRoot,
    runtimeDir: resolvedBaseDir,
    languages,
    sourceDirs,
    ignorePatterns,
    stateDir,
    jsonPatterns,
    angularPatterns,
    cssPatterns,
    watchdog,
    mcp,
    rss,
  };
}

/**
 * Create a default ste.config.json file inside ste-runtime/.
 * 
 * Config lives inside ste-runtime for full self-containment.
 * 
 * @param runtimeDir - Path to ste-runtime directory
 */
export async function initConfig(runtimeDir: string): Promise<void> {
  const configPath = path.join(runtimeDir, 'ste.config.json');
  
  const defaultConfig: SteConfig = {
    languages: ['typescript', 'python'],
    sourceDirs: ['src', 'lib'],
    ignorePatterns: [],
    // stateDir is relative to ste-runtime, defaults to .ste/state inside ste-runtime
    // This keeps all generated state inside ste-runtime for easy add/remove
  };
  
  await fs.writeFile(
    configPath,
    JSON.stringify(defaultConfig, null, 2) + '\n',
    'utf-8'
  );
  
  console.log(`[STE Config] Created ${configPath}`);
  console.log(`[STE Config] Edit sourceDirs to match your project structure.`);
  console.log(`[STE Config] State will be written to ste-runtime/.ste/state/`);
}

