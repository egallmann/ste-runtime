/**
 * MCP Tools - Operational
 * 
 * Health checks, diagnostics, and operational tools.
 * Per E-ADR-011: Operational tools for graph health and extractor detection.
 */

import type { RssContext } from '../rss/rss-operations.js';
import {
  validateGraphHealth,
  findOrphanedNodes,
  findAllBrokenEdges,
  validateBidirectionalEdges,
} from '../rss/rss-operations.js';
import { runFullRecon } from '../recon/full-recon.js';
import { executeRecon } from '../recon/index.js';
import { loadConfig, loadConfigFromFile, type ResolvedConfig } from '../config/index.js';
import { globby } from 'globby';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Tool: detect_missing_extractors
 * 
 * Analyze project and identify missing language/framework extractors.
 */
export async function detectMissingExtractors(
  args: {
    projectRoot?: string;
  }
) {
  const { projectRoot = process.cwd() } = args;
  
  const detectedLanguages: string[] = [];
  const missingExtractors: string[] = [];
  const availableExtractors = ['python', 'typescript', 'javascript', 'cloudformation', 'json', 'angular', 'css'];
  
  // Detect Python
  const pythonFiles = await globby(['**/*.py'], {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.venv/**', '**/__pycache__/**'],
    absolute: false,
  });
  if (pythonFiles.length > 0) {
    detectedLanguages.push('python');
  }
  
  // Detect TypeScript/JavaScript
  const tsFiles = await globby(['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'], {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**'],
    absolute: false,
  });
  if (tsFiles.length > 0) {
    detectedLanguages.push('typescript');
  }
  
  // Detect Java
  const javaFiles = await globby(['**/*.java'], {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/target/**'],
    absolute: false,
  });
  if (javaFiles.length > 0) {
    detectedLanguages.push('java');
    if (!availableExtractors.includes('java')) {
      missingExtractors.push('java');
    }
  }
  
  // Detect Go
  const goFiles = await globby(['**/*.go'], {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/vendor/**'],
    absolute: false,
  });
  if (goFiles.length > 0) {
    detectedLanguages.push('go');
    if (!availableExtractors.includes('go')) {
      missingExtractors.push('go');
    }
  }
  
  // Detect Rust
  const rustFiles = await globby(['**/*.rs'], {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/target/**'],
    absolute: false,
  });
  if (rustFiles.length > 0) {
    detectedLanguages.push('rust');
    if (!availableExtractors.includes('rust')) {
      missingExtractors.push('rust');
    }
  }
  
  // Detect C#
  const csharpFiles = await globby(['**/*.cs'], {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/bin/**', '**/obj/**'],
    absolute: false,
  });
  if (csharpFiles.length > 0) {
    detectedLanguages.push('csharp');
    if (!availableExtractors.includes('csharp')) {
      missingExtractors.push('csharp');
    }
  }
  
  // Detect Ruby
  const rubyFiles = await globby(['**/*.rb'], {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/vendor/**'],
    absolute: false,
  });
  if (rubyFiles.length > 0) {
    detectedLanguages.push('ruby');
    if (!availableExtractors.includes('ruby')) {
      missingExtractors.push('ruby');
    }
  }
  
  return {
    projectRoot,
    detectedLanguages,
    availableExtractors,
    missingExtractors,
    recommendations: missingExtractors.length > 0
      ? `Consider implementing extractors for: ${missingExtractors.join(', ')}`
      : 'All detected languages have available extractors',
  };
}

/**
 * Tool: get_graph_health
 * 
 * Get validation status and health metrics for the semantic graph.
 */
export async function getGraphHealth(ctx: RssContext) {
  const health = validateGraphHealth(ctx);
  
  return {
    isHealthy: health.summary.isHealthy,
    summary: {
      totalNodes: health.summary.totalNodes,
      totalEdges: health.summary.totalEdges,
      brokenEdgeCount: health.summary.brokenEdgeCount,
      inconsistencyCount: health.summary.inconsistencyCount,
      orphanCount: health.summary.orphanCount,
    },
    brokenEdges: health.brokenEdges.slice(0, 10).map(edge => ({
      fromKey: edge.fromKey,
      toKey: edge.toKey,
      edgeType: edge.edgeType,
    })),
    bidirectionalInconsistencies: health.bidirectionalInconsistencies.slice(0, 10).map(inc => ({
      sourceKey: inc.sourceKey,
      targetKey: inc.targetKey,
      missing: inc.missing,
    })),
    orphanedNodes: health.orphanedNodes.slice(0, 10).map(node => ({
      key: node.key,
      domain: node.domain,
      type: node.type,
      id: node.id,
    })),
    graphVersion: ctx.graphVersion,
  };
}

/**
 * Tool: trigger_full_recon
 * 
 * Manually trigger full RECON (fallback for errors).
 * This is a heavy operation and should be used sparingly.
 * 
 * Uses loadConfig to ensure proper boundary validation and project root detection.
 */
export async function triggerFullRecon(
  args: {
    projectRoot?: string;
  }
) {
  // Determine runtime directory (where ste-runtime is installed)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const runtimeDir = path.resolve(__dirname, '../..');
  
  // CRITICAL: Redirect ALL console output to stderr to prevent breaking MCP JSON protocol
  const originalLog = globalThis.console.log;
  const originalWarn = globalThis.console.warn;
  const originalInfo = globalThis.console.info;
  
  globalThis.console.log = (...args: any[]) => {
    console.error(...args);
  };
  globalThis.console.warn = (...args: any[]) => {
    console.error(...args);
  };
  globalThis.console.info = (...args: any[]) => {
    console.error(...args);
  };
  
  try {
    // Load config - this validates boundaries and detects self-analysis
    // If user provided a projectRoot, we'll validate it by loading config from that location
    let config;
    let finalProjectRoot;
    let finalStateDir: string;
    
    if (args.projectRoot) {
      // User provided a project root - we need to find where ste-runtime is relative to it
      // For now, use the runtimeDir and let loadConfig find the project root
      // The boundary validation in loadConfig will catch if it's too far
      config = await loadConfig(runtimeDir);
      const providedRoot = path.resolve(args.projectRoot);
      
      // Basic validation: provided root should be within reasonable distance
      const relativePath = path.relative(config.projectRoot, providedRoot);
      if (relativePath.startsWith('..') && relativePath.split(path.sep).filter(p => p === '..').length > 3) {
        throw new Error(`Provided project root ${providedRoot} is too far from detected project root ${config.projectRoot}`);
      }
      
      finalProjectRoot = providedRoot;
      
      // CRITICAL FIX: When custom projectRoot is provided, config.stateDir is relative to 
      // config.projectRoot, NOT the provided root. Compute absolute path to avoid doubling.
      // The stateDir should always resolve to runtimeDir/.ste/state for external projects.
      finalStateDir = path.resolve(runtimeDir, '.ste', 'state');
    } else {
      // No project root provided - use the one detected by loadConfig
      config = await loadConfig(runtimeDir);
      finalProjectRoot = config.projectRoot;
      // stateDir from config is already correct relative to projectRoot
      finalStateDir = path.resolve(config.projectRoot, config.stateDir);
    }
    
    const isSelfAnalysis = config.projectRoot === config.runtimeDir;
    
    let cleanupCount = 0;
    let selfResult: Awaited<ReturnType<typeof executeRecon>> | null = null;
    
    // For full recon in self-analysis mode: clean up .ste/state since there's no external project
    if (isSelfAnalysis) {
      const steStateDir = path.resolve(runtimeDir, '.ste', 'state');
      try {
        const stats = await fs.stat(steStateDir);
        if (stats.isDirectory()) {
          // Directly remove all slice files in .ste/state since there's no external project
          const subdirs = ['graph', 'api', 'data', 'infrastructure', 'behavior'];
          
          for (const subdir of subdirs) {
            const subdirPath = path.join(steStateDir, subdir);
            try {
              const entries = await fs.readdir(subdirPath, { recursive: true, withFileTypes: true });
              for (const entry of entries) {
                if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) && entry.name !== 'index.yaml') {
                  const entryPath = 'parentPath' in entry && entry.parentPath 
                    ? path.join(entry.parentPath, entry.name)
                    : path.join(subdirPath, entry.name);
                  await fs.unlink(entryPath);
                  cleanupCount++;
                }
              }
            } catch {
              // Subdirectory doesn't exist, skip
            }
          }
          
          // Also clean up manifest and validation directories
          try {
            await fs.rm(path.join(steStateDir, 'manifest'), { recursive: true, force: true });
          } catch {}
          try {
            await fs.rm(path.join(steStateDir, 'validation'), { recursive: true, force: true });
          } catch {}
          
          // Remove graph-metrics.json if it exists
          try {
            await fs.unlink(path.join(steStateDir, 'graph-metrics.json'));
          } catch {}
        }
      } catch {
        // .ste/state doesn't exist, which is fine - nothing to clean up
      }
    }
    
    // Run RECON for the detected project (external or self-analysis)
    // Use finalStateDir (absolute path) to avoid path doubling when custom projectRoot is provided
    const result = await executeRecon({
      projectRoot: finalProjectRoot,
      sourceRoot: config.sourceDirs[0] ?? '.',
      stateRoot: finalStateDir,  // Use absolute path computed above
      mode: 'full',
      config: { ...config, stateDir: finalStateDir },  // Override stateDir in config too
    });
    
    // If we're not in self-analysis mode, also run self-analysis
    if (!isSelfAnalysis) {
      // Load self-analysis config
      const selfConfigPath = path.join(runtimeDir, 'ste-self.config.json');
      let selfConfig: ResolvedConfig;
      
      try {
        selfConfig = await loadConfigFromFile(selfConfigPath, runtimeDir);
      } catch {
        // No ste-self.config.json, create a default self-analysis config
        selfConfig = {
          ...config,
          projectRoot: runtimeDir,
          runtimeDir: runtimeDir,
          stateDir: '.ste-self/state',
          sourceDirs: ['src'],
          languages: ['typescript' as const],
        };
      }
      
      // Run RECON for ste-runtime self-analysis
      selfResult = await executeRecon({
        projectRoot: selfConfig.projectRoot,
        sourceRoot: selfConfig.sourceDirs[0] ?? 'src',
        stateRoot: selfConfig.stateDir,
        mode: 'full',
        config: selfConfig,
      });
    }
    
    // Restore console methods
    globalThis.console.log = originalLog;
    globalThis.console.warn = originalWarn;
    globalThis.console.info = originalInfo;
    
    const allSuccess = result.success && (!selfResult || selfResult.success);
    
    // Build descriptive message
    // Note: "slice files" refers to YAML files on disk. Each file contains one slice definition,
    // but the in-memory graph may have more nodes due to inferred relationships and expanded references.
    let message: string;
    if (allSuccess) {
      if (isSelfAnalysis) {
        message = `Full RECON completed successfully. ` +
          `Populated .ste-self/state with ${result.aiDocCreated + result.aiDocModified} slice files (graph may contain additional inferred nodes). ` +
          (cleanupCount > 0 ? `Cleaned up ${cleanupCount} orphaned slice files from .ste/state. ` : '') +
          `State directories are now accurate to the reconciled project.`;
      } else {
        message = `Full RECON completed successfully. ` +
          `External project: ${result.aiDocCreated + result.aiDocModified} slice files in .ste/state. ` +
          `Self-analysis: ${selfResult ? selfResult.aiDocCreated + selfResult.aiDocModified : 0} slice files in .ste-self/state. ` +
          `Note: Graph node count may differ from slice file count due to inferred relationships. ` +
          `Both state directories are now accurate to the reconciled projects.`;
      }
    } else {
      message = `Full RECON failed: ${result.errors.join('; ')}`;
    }
    
    return {
      success: allSuccess,
      message,
      projectRoot: finalProjectRoot,
      errors: result.errors,
      warnings: result.warnings,
    };
  } catch (error) {
    // Restore console methods
    globalThis.console.log = originalLog;
    globalThis.console.warn = originalWarn;
    globalThis.console.info = originalInfo;
    
    return {
      success: false,
      message: `Full RECON failed: ${error instanceof Error ? error.message : String(error)}`,
      projectRoot: args.projectRoot || runtimeDir,
    };
  }
}

/**
 * Tool: get_graph_diagnostics
 * 
 * Get detailed diagnostics about graph structure and quality.
 */
export async function getGraphDiagnostics(ctx: RssContext) {
  const brokenEdges = findAllBrokenEdges(ctx);
  const bidirectionalIssues = validateBidirectionalEdges(ctx);
  const orphans = findOrphanedNodes(ctx);
  
  // Calculate connectivity metrics
  const totalNodes = ctx.graph.size;
  const connectedNodes = totalNodes - orphans.length;
  const connectivityRatio = totalNodes > 0 ? connectedNodes / totalNodes : 0;
  
  // Calculate average degree (connections per node)
  let totalConnections = 0;
  for (const node of ctx.graph.values()) {
    totalConnections += node.references.length + node.referencedBy.length;
  }
  const avgDegree = totalNodes > 0 ? totalConnections / totalNodes : 0;
  
  return {
    totalNodes,
    connectedNodes,
    orphanedNodes: orphans.length,
    connectivityRatio,
    avgDegree,
    brokenEdgeCount: brokenEdges.length,
    bidirectionalIssueCount: bidirectionalIssues.length,
    graphVersion: ctx.graphVersion,
    recommendations: generateRecommendations({
      totalNodes,
      orphanedNodes: orphans.length,
      brokenEdges: brokenEdges.length,
      bidirectionalIssues: bidirectionalIssues.length,
      connectivityRatio,
    }),
  };
}

function generateRecommendations(metrics: {
  totalNodes: number;
  orphanedNodes: number;
  brokenEdges: number;
  bidirectionalIssues: number;
  connectivityRatio: number;
}): string[] {
  const recommendations: string[] = [];
  
  if (metrics.brokenEdges > 0) {
    recommendations.push(`Found ${metrics.brokenEdges} broken edges. Consider running full RECON to fix.`);
  }
  
  if (metrics.bidirectionalIssues > 0) {
    recommendations.push(`Found ${metrics.bidirectionalIssues} bidirectional inconsistencies. Run full RECON to repair.`);
  }
  
  if (metrics.orphanedNodes > 10) {
    recommendations.push(`${metrics.orphanedNodes} orphaned nodes detected. These may be utility functions or need better linking.`);
  }
  
  if (metrics.connectivityRatio < 0.5) {
    recommendations.push(`Low connectivity ratio (${(metrics.connectivityRatio * 100).toFixed(1)}%). Consider improving cross-references in code.`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Graph health looks good! No major issues detected.');
  }
  
  return recommendations;
}

/**
 * Tool: trigger_self_recon
 * 
 * Manually trigger full RECON for ste-runtime itself (self-documentation).
 * This rebuilds the semantic graph of the runtime's own source code.
 * 
 * Uses the runtime directory as project root and .ste-self/state as state directory.
 * This is automatically detected via loadConfig's self-analysis detection.
 */
export async function triggerSelfRecon() {
  // Determine runtime directory (where this code is running from)
  // When running from dist/mcp/tools-operational.js, go up 2 levels to get to ste-runtime root
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const runtimeDir = path.resolve(__dirname, '../..');
  
  try {
    // Load config - this will automatically detect self-analysis mode
    // and set projectRoot to runtimeDir and stateDir to .ste-self/state
    const config = await loadConfig(runtimeDir);
    
    // Validate that self-analysis was detected
    if (config.projectRoot !== runtimeDir) {
      return {
        success: false,
        message: `Self-analysis not detected. Project root: ${config.projectRoot}, Runtime dir: ${runtimeDir}. This tool should only be used when ste-runtime is analyzing itself.`,
        projectRoot: config.projectRoot,
        runtimeDir,
      };
    }
    
    // CRITICAL: Redirect ALL console output to stderr to prevent breaking MCP JSON protocol
    // MCP uses stdout for JSON, so all logging must go to stderr
    // We need to override at the global level to catch all phase function calls
    const originalLog = globalThis.console.log;
    const originalWarn = globalThis.console.warn;
    const originalInfo = globalThis.console.info;
    
    // Override all console methods that write to stdout
    globalThis.console.log = (...args: any[]) => {
      console.error(...args);
    };
    globalThis.console.warn = (...args: any[]) => {
      console.error(...args);
    };
    globalThis.console.info = (...args: any[]) => {
      console.error(...args);
    };
    
    try {
      // Run full RECON using executeRecon which properly handles TypeScript files
      const result = await executeRecon({
        projectRoot: config.projectRoot,
        sourceRoot: config.sourceDirs[0] ?? '.',
        stateRoot: config.stateDir,
        mode: 'full',
        config: config,
      });
      
      return {
        success: result.success,
        message: result.success 
          ? `Self RECON completed successfully. Created: ${result.aiDocCreated}, Updated: ${result.aiDocModified}, Deleted: ${result.aiDocDeleted}`
          : `Self RECON failed: ${result.errors.join('; ')}`,
        projectRoot: config.projectRoot,
        stateDir: config.stateDir,
        stats: {
          created: result.aiDocCreated,
          modified: result.aiDocModified,
          deleted: result.aiDocDeleted,
          unchanged: result.aiDocUnchanged,
        },
      };
    } finally {
      // Restore original console methods
      globalThis.console.log = originalLog;
      globalThis.console.warn = originalWarn;
      globalThis.console.info = originalInfo;
    }
  } catch (error) {
    return {
      success: false,
      message: `Self RECON failed: ${error instanceof Error ? error.message : String(error)}`,
      runtimeDir,
    };
  }
}

