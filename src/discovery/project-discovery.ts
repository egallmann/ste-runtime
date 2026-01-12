/**
 * Project Structure Discovery
 * 
 * Automatically discovers domain architecture by analyzing:
 * - Directory naming patterns
 * - File types and patterns
 * - Framework indicators
 * - Project structure conventions
 * 
 * E-ADR-009: Self-Configuring Domain Discovery
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// Core Types
// ============================================================================

export enum DomainType {
  CLIENT = 'client',
  SERVER = 'server',
  INFRASTRUCTURE = 'infrastructure',
  DATA = 'data',
  SHARED = 'shared',
  UNKNOWN = 'unknown'
}

export interface DiscoveredDomain {
  /** Domain name discovered from project (e.g., "frontend", "client", "web") */
  name: string;
  
  /** Domain type classification */
  type: DomainType;
  
  /** Root paths where this domain's files are located */
  rootPaths: string[];
  
  /** Signals that led to this identification */
  indicators: string[];
  
  /** Confidence score 0-1 */
  confidence: number;
  
  /** Detected framework (e.g., "angular", "react", "express") */
  framework?: string;
}

export interface ProjectStructure {
  /** Project root directory */
  rootDir: string;
  
  /** Discovered domains */
  domains: DiscoveredDomain[];
  
  /** Architecture type */
  architecture: 'monorepo' | 'multi-package' | 'single';
  
  /** Discovery timestamp */
  discoveredAt: Date;
}

interface Signal {
  type: 'directory' | 'file' | 'framework' | 'pattern';
  value: string;
  weight: number;
}

// ============================================================================
// Discovery Heuristics
// ============================================================================

/** Directory names that indicate CLIENT domain */
const CLIENT_DIR_PATTERNS = [
  'frontend', 'client', 'web', 'ui', 'app', 'www',
  'src/app', 'src/client', 'src/web', 'src/frontend'
];

/** Directory names that indicate SERVER domain */
const SERVER_DIR_PATTERNS = [
  'backend', 'server', 'api', 'services', 'service',
  'src/server', 'src/api', 'src/backend', 'lambda', 'functions'
];

/** Directory names that indicate INFRASTRUCTURE domain */
const INFRA_DIR_PATTERNS = [
  'infrastructure', 'infra', 'iac', 'terraform', 'cloudformation',
  'cfn', 'k8s', 'kubernetes', 'helm', 'deploy'
];

/** Directory names that indicate DATA domain */
const DATA_DIR_PATTERNS = [
  'data', 'models', 'schemas', 'entities', 'database', 'db'
];

/** File patterns that indicate CLIENT code */
const CLIENT_FILE_PATTERNS = [
  /\.component\.ts$/,
  /\.component\.tsx$/,
  /\.component\.jsx$/,
  /\.vue$/,
  /\.svelte$/,
  /\.page\.tsx?$/,
  /\.view\.tsx?$/
];

/** File patterns that indicate SERVER code */
const SERVER_FILE_PATTERNS = [
  /\.handler\.(ts|js|py)$/,
  /\.controller\.(ts|js)$/,
  /\.route\.(ts|js)$/,
  /\.service\.(ts|js|py)$/,
  /\.endpoint\.(ts|js|py)$/,
  /lambda_handler\.py$/,
  /handler\.py$/
];

/** File patterns that indicate INFRASTRUCTURE code */
const INFRA_FILE_PATTERNS = [
  /\.yaml$/,
  /\.yml$/,
  /\.tf$/,
  /\.tfvars$/,
  /\.k8s\.yaml$/
];

/** Framework detection patterns */
const FRAMEWORK_INDICATORS = {
  angular: ['angular.json', 'src/app/app.module.ts', '.component.ts'],
  react: ['package.json', '.jsx', '.tsx'],
  vue: ['vue.config.js', '.vue'],
  svelte: ['svelte.config.js', '.svelte'],
  next: ['next.config.js', 'pages/'],
  express: ['package.json', '.route.js', '.controller.js'],
  fastapi: ['requirements.txt', 'main.py', '@app.'],
  flask: ['requirements.txt', 'app.py', '@app.route'],
  lambda: ['handler.py', 'lambda_handler', 'handler.js'],
  cloudformation: ['.yaml', 'Resources:', 'AWSTemplateFormatVersion'],
  terraform: ['.tf', 'provider "aws"', 'resource "aws_']
};

// ============================================================================
// Discovery Engine
// ============================================================================

export class ProjectDiscovery {
  private cachedStructure?: ProjectStructure;
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /**
   * Discover project structure by analyzing directories, files, and frameworks
   */
  async discover(): Promise<ProjectStructure> {
    if (this.cachedStructure) {
      return this.cachedStructure;
    }

    console.log(`[Discovery] Scanning project at: ${this.rootDir}`);

    // 1. Scan directory structure
    const directories = await this.scanDirectories(this.rootDir);
    console.log(`[Discovery] Found ${directories.length} directories`);

    // 2. Collect signals from directory names
    const directorySignals = this.analyzeDirectoryNames(directories);
    
    // 3. Sample files to detect patterns
    const fileSignals = await this.analyzeFilePatterns(directories);
    
    // 4. Detect frameworks
    const frameworkSignals = await this.detectFrameworks();

    // 5. Combine signals to identify domains
    const domains = this.identifyDomains(directorySignals, fileSignals, frameworkSignals);
    
    // 6. Determine architecture type
    const architecture = this.inferArchitecture(domains);

    const structure: ProjectStructure = {
      rootDir: this.rootDir,
      domains,
      architecture,
      discoveredAt: new Date()
    };

    this.cachedStructure = structure;
    
    console.log(`[Discovery] Identified ${domains.length} domains:`);
    domains.forEach(d => {
      console.log(`  - ${d.name} (${d.type}, confidence: ${d.confidence.toFixed(2)}, framework: ${d.framework || 'unknown'})`);
    });

    return structure;
  }

  /**
   * Get domain for a specific file path
   */
  getDomainForFile(filePath: string): string | null {
    if (!this.cachedStructure) {
      throw new Error('Must call discover() before getDomainForFile()');
    }

    const normalizedPath = this.normalizePath(filePath);

    // Find domain by checking if file path starts with any domain root path
    for (const domain of this.cachedStructure.domains) {
      for (const rootPath of domain.rootPaths) {
        if (normalizedPath.startsWith(rootPath)) {
          return domain.name;
        }
      }
    }

    return null;
  }

  /**
   * Get domain type for a domain name
   */
  getDomainType(domainName: string): DomainType | null {
    if (!this.cachedStructure) {
      throw new Error('Must call discover() before getDomainType()');
    }

    const domain = this.cachedStructure.domains.find(d => d.name === domainName);
    return domain?.type || null;
  }

  /**
   * Get framework for a domain
   */
  getFramework(domainName: string): string | null {
    if (!this.cachedStructure) {
      throw new Error('Must call discover() before getFramework()');
    }

    const domain = this.cachedStructure.domains.find(d => d.name === domainName);
    return domain?.framework || null;
  }

  /**
   * Check if a domain is of a specific type
   */
  isDomainType(domainName: string, type: DomainType): boolean {
    return this.getDomainType(domainName) === type;
  }

  // ============================================================================
  // Private Methods - Discovery Logic
  // ============================================================================

  private async scanDirectories(rootDir: string, depth: number = 0, maxDepth: number = 4): Promise<string[]> {
    if (depth > maxDepth) return [];

    const directories: string[] = [];
    
    try {
      const entries = await fs.readdir(rootDir, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip common ignored directories
        if (this.shouldSkipDirectory(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          const fullPath = path.join(rootDir, entry.name);
          
          // CRITICAL: Boundary check - ensure directory is within project root
          // This prevents scanning directories outside the project scope
          const relativePath = path.relative(this.rootDir, fullPath);
          if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            throw new Error(
              `CRITICAL BOUNDARY VIOLATION: Attempted to scan directory outside project root.\n` +
              `  Directory: ${fullPath}\n` +
              `  Project root: ${this.rootDir}\n` +
              `  This would scan outside the allowed project scope, which is FORBIDDEN.`
            );
          }
          
          directories.push(relativePath);
          
          // Recursively scan subdirectories
          const subdirs = await this.scanDirectories(fullPath, depth + 1, maxDepth);
          directories.push(...subdirs);
        }
      }
    } catch (error) {
      // Ignore permission errors or invalid directories
    }

    return directories;
  }

  private shouldSkipDirectory(name: string): boolean {
    const skipPatterns = [
      'node_modules',
      '.git',
      '.github',
      '.vscode',
      '.idea',
      'dist',
      'build',
      'out',
      'coverage',
      '.next',
      '.nuxt',
      '__pycache__',
      '.pytest_cache',
      'venv',
      '.venv',
      'env',
      '.env'
    ];
    
    return skipPatterns.includes(name) || name.startsWith('.');
  }

  private analyzeDirectoryNames(directories: string[]): Map<string, Signal[]> {
    const signalsByDomain = new Map<string, Signal[]>();

    for (const dir of directories) {
      const dirName = path.basename(dir);
      const normalizedDir = this.normalizePath(dir);

      // Check CLIENT patterns
      if (this.matchesPatterns(normalizedDir, CLIENT_DIR_PATTERNS)) {
        this.addSignal(signalsByDomain, dirName, {
          type: 'directory',
          value: `client:${normalizedDir}`,
          weight: 0.3
        });
      }

      // Check SERVER patterns
      if (this.matchesPatterns(normalizedDir, SERVER_DIR_PATTERNS)) {
        this.addSignal(signalsByDomain, dirName, {
          type: 'directory',
          value: `server:${normalizedDir}`,
          weight: 0.3
        });
      }

      // Check INFRASTRUCTURE patterns
      if (this.matchesPatterns(normalizedDir, INFRA_DIR_PATTERNS)) {
        this.addSignal(signalsByDomain, dirName, {
          type: 'directory',
          value: `infrastructure:${normalizedDir}`,
          weight: 0.3
        });
      }

      // Check DATA patterns
      if (this.matchesPatterns(normalizedDir, DATA_DIR_PATTERNS)) {
        this.addSignal(signalsByDomain, dirName, {
          type: 'directory',
          value: `data:${normalizedDir}`,
          weight: 0.3
        });
      }
    }

    return signalsByDomain;
  }

  private async analyzeFilePatterns(directories: string[]): Promise<Map<string, Signal[]>> {
    const signalsByDomain = new Map<string, Signal[]>();

    // Sample files from each directory (don't scan all files for performance)
    for (const dir of directories.slice(0, 50)) { // Limit to first 50 dirs
      const fullPath = path.join(this.rootDir, dir);
      
      try {
        const entries = await fs.readdir(fullPath);
        const files = entries.slice(0, 20); // Sample first 20 files

        for (const file of files) {
          const domainName = path.basename(dir);

          // Check CLIENT file patterns
          if (this.matchesFilePatterns(file, CLIENT_FILE_PATTERNS)) {
            this.addSignal(signalsByDomain, domainName, {
              type: 'file',
              value: `client:${file}`,
              weight: 0.3
            });
          }

          // Check SERVER file patterns
          if (this.matchesFilePatterns(file, SERVER_FILE_PATTERNS)) {
            this.addSignal(signalsByDomain, domainName, {
              type: 'file',
              value: `server:${file}`,
              weight: 0.3
            });
          }

          // Check INFRASTRUCTURE file patterns
          if (this.matchesFilePatterns(file, INFRA_FILE_PATTERNS)) {
            this.addSignal(signalsByDomain, domainName, {
              type: 'file',
              value: `infrastructure:${file}`,
              weight: 0.3
            });
          }
        }
      } catch (error) {
        // Ignore errors
      }
    }

    return signalsByDomain;
  }

  private async detectFrameworks(): Promise<Map<string, Signal[]>> {
    const signalsByDomain = new Map<string, Signal[]>();

    // Check root directory
    await this.detectFrameworksInDirectory(this.rootDir, 'root', signalsByDomain);

    // Check common subdirectories that might have their own frameworks
    const commonSubdirs = ['frontend', 'backend', 'client', 'server', 'web', 'api'];
    for (const subdir of commonSubdirs) {
      const subdirPath = path.join(this.rootDir, subdir);
      if (await this.fileExists(subdirPath)) {
        try {
          const stat = await fs.stat(subdirPath);
          if (stat.isDirectory()) {
            await this.detectFrameworksInDirectory(subdirPath, subdir, signalsByDomain);
          }
        } catch {
          // Ignore errors
        }
      }
    }

    return signalsByDomain;
  }

  private async detectFrameworksInDirectory(
    dirPath: string,
    domainName: string,
    signalsByDomain: Map<string, Signal[]>
  ): Promise<void> {
    // Check for Angular
    const angularJson = path.join(dirPath, 'angular.json');
    if (await this.fileExists(angularJson)) {
      this.addSignal(signalsByDomain, domainName, {
        type: 'framework',
        value: 'angular',
        weight: 0.4
      });
    }

    // Check for package.json and analyze dependencies
    const packageJson = path.join(dirPath, 'package.json');
    if (await this.fileExists(packageJson)) {
      try {
        const content = await fs.readFile(packageJson, 'utf-8');
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Detect frontend frameworks
        if (deps['@angular/core']) {
          this.addSignal(signalsByDomain, domainName, {
            type: 'framework',
            value: 'angular',
            weight: 0.4
          });
        }
        if (deps['react']) {
          this.addSignal(signalsByDomain, domainName, {
            type: 'framework',
            value: 'react',
            weight: 0.4
          });
        }
        if (deps['vue']) {
          this.addSignal(signalsByDomain, domainName, {
            type: 'framework',
            value: 'vue',
            weight: 0.4
          });
        }
        if (deps['svelte']) {
          this.addSignal(signalsByDomain, domainName, {
            type: 'framework',
            value: 'svelte',
            weight: 0.4
          });
        }
        if (deps['next']) {
          this.addSignal(signalsByDomain, domainName, {
            type: 'framework',
            value: 'next',
            weight: 0.4
          });
        }

        // Detect backend frameworks
        if (deps['express']) {
          this.addSignal(signalsByDomain, domainName, {
            type: 'framework',
            value: 'express',
            weight: 0.4
          });
        }
        if (deps['fastify']) {
          this.addSignal(signalsByDomain, domainName, {
            type: 'framework',
            value: 'fastify',
            weight: 0.4
          });
        }
        if (deps['@nestjs/core']) {
          this.addSignal(signalsByDomain, domainName, {
            type: 'framework',
            value: 'nestjs',
            weight: 0.4
          });
        }
      } catch (error) {
        // Ignore JSON parse errors
      }
    }

    // Check for Python frameworks (only in root or backend-like directories)
    if (domainName === 'root' || domainName === 'backend' || domainName === 'server' || domainName === 'api') {
      const requirementsTxt = path.join(dirPath, 'requirements.txt');
      if (await this.fileExists(requirementsTxt)) {
        try {
          const content = await fs.readFile(requirementsTxt, 'utf-8');
          const lines = content.toLowerCase().split('\n');

          if (lines.some(l => l.includes('fastapi'))) {
            this.addSignal(signalsByDomain, domainName, {
              type: 'framework',
              value: 'fastapi',
              weight: 0.4
            });
          }
          if (lines.some(l => l.includes('flask'))) {
            this.addSignal(signalsByDomain, domainName, {
              type: 'framework',
              value: 'flask',
              weight: 0.4
            });
          }
          if (lines.some(l => l.includes('django'))) {
            this.addSignal(signalsByDomain, domainName, {
              type: 'framework',
              value: 'django',
              weight: 0.4
            });
          }
        } catch (error) {
          // Ignore read errors
        }
      }
    }

    // Check for Terraform (only in root or infra-like directories)
    if (domainName === 'root' || domainName.includes('infra') || domainName === 'terraform') {
      try {
        const entries = await fs.readdir(dirPath);
        if (entries.some(e => e.endsWith('.tf'))) {
          this.addSignal(signalsByDomain, domainName, {
            type: 'framework',
            value: 'terraform',
            weight: 0.4
          });
        }
      } catch (error) {
        // Ignore errors
      }
    }
  }

  private identifyDomains(
    directorySignals: Map<string, Signal[]>,
    fileSignals: Map<string, Signal[]>,
    frameworkSignals: Map<string, Signal[]>
  ): DiscoveredDomain[] {
    const domains: DiscoveredDomain[] = [];
    const processedDomains = new Set<string>();

    // Extract frameworks from root signals
    const rootFrameworks = (frameworkSignals.get('root') || [])
      .filter(s => s.type === 'framework')
      .map(s => s.value);

    // Combine all signals
    const allDomainNames = new Set([
      ...directorySignals.keys(),
      ...fileSignals.keys(),
      ...frameworkSignals.keys()
    ]);

    for (const domainName of allDomainNames) {
      if (processedDomains.has(domainName) || domainName === 'root') continue;

      const dirSignals = directorySignals.get(domainName) || [];
      const fSignals = fileSignals.get(domainName) || [];
      const fwSignals = frameworkSignals.get(domainName) || [];
      
      const allSignals = [...dirSignals, ...fSignals, ...fwSignals];
      
      if (allSignals.length === 0) continue;

      // Determine domain type and confidence
      const typeScores = this.calculateTypeScores(allSignals);
      const dominantType = this.getDominantType(typeScores);
      const confidence = typeScores.get(dominantType) || 0;

      // Only include if confidence is reasonable
      if (confidence < 0.2) continue;

      // Extract framework - prioritize root frameworks for appropriate domain types
      let framework = this.extractFramework(allSignals);
      
      // If no domain-specific framework, inherit from root based on type
      if (!framework && rootFrameworks.length > 0) {
        if (dominantType === DomainType.CLIENT) {
          // Assign client frameworks to client domains
          const clientFrameworks = ['angular', 'react', 'vue', 'svelte', 'next'];
          framework = rootFrameworks.find(f => clientFrameworks.includes(f));
        } else if (dominantType === DomainType.SERVER) {
          // Assign server frameworks to server domains
          const serverFrameworks = ['express', 'fastapi', 'flask', 'django', 'nestjs'];
          framework = rootFrameworks.find(f => serverFrameworks.includes(f));
        } else if (dominantType === DomainType.INFRASTRUCTURE) {
          // Assign infrastructure frameworks
          const infraFrameworks = ['terraform', 'cloudformation'];
          framework = rootFrameworks.find(f => infraFrameworks.includes(f));
        }
      }

      domains.push({
        name: domainName,
        type: dominantType,
        rootPaths: [domainName],
        indicators: allSignals.map(s => s.value),
        confidence,
        framework
      });

      processedDomains.add(domainName);
    }

    return domains;
  }

  private calculateTypeScores(signals: Signal[]): Map<DomainType, number> {
    const scores = new Map<DomainType, number>();

    for (const signal of signals) {
      const type = this.inferDomainTypeFromSignal(signal);
      const currentScore = scores.get(type) || 0;
      scores.set(type, currentScore + signal.weight);
    }

    // Normalize scores
    const maxScore = Math.max(...Array.from(scores.values()));
    if (maxScore > 0) {
      for (const [type, score] of scores.entries()) {
        scores.set(type, Math.min(score / maxScore, 1.0));
      }
    }

    return scores;
  }

  private inferDomainTypeFromSignal(signal: Signal): DomainType {
    if (signal.value.startsWith('client:')) return DomainType.CLIENT;
    if (signal.value.startsWith('server:')) return DomainType.SERVER;
    if (signal.value.startsWith('infrastructure:')) return DomainType.INFRASTRUCTURE;
    if (signal.value.startsWith('data:')) return DomainType.DATA;
    
    // Framework-based inference
    if (signal.type === 'framework') {
      if (['angular', 'react', 'vue', 'svelte', 'next'].includes(signal.value)) {
        return DomainType.CLIENT;
      }
      if (['express', 'fastapi', 'flask', 'lambda'].includes(signal.value)) {
        return DomainType.SERVER;
      }
      if (['cloudformation', 'terraform'].includes(signal.value)) {
        return DomainType.INFRASTRUCTURE;
      }
    }

    return DomainType.UNKNOWN;
  }

  private getDominantType(typeScores: Map<DomainType, number>): DomainType {
    let maxScore = 0;
    let dominantType = DomainType.UNKNOWN;

    for (const [type, score] of typeScores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        dominantType = type;
      }
    }

    return dominantType;
  }

  private extractFramework(signals: Signal[]): string | undefined {
    const frameworkSignal = signals.find(s => s.type === 'framework');
    return frameworkSignal?.value;
  }

  private inferArchitecture(domains: DiscoveredDomain[]): 'monorepo' | 'multi-package' | 'single' {
    if (domains.length > 2) return 'monorepo';
    if (domains.length === 2) return 'multi-package';
    return 'single';
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private matchesPatterns(value: string, patterns: string[]): boolean {
    const normalized = value.toLowerCase();
    return patterns.some(pattern => 
      normalized.includes(pattern.toLowerCase()) ||
      normalized.endsWith(pattern.toLowerCase())
    );
  }

  private matchesFilePatterns(fileName: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(fileName));
  }

  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }

  private addSignal(map: Map<string, Signal[]>, key: string, signal: Signal): void {
    const existing = map.get(key) || [];
    existing.push(signal);
    map.set(key, existing);
  }
}

