/**
 * History Manager - Manage validation historical state
 * 
 * Authority: E-ADR-002 (RECON Self-Validation, Non-Blocking)
 * 
 * Stores checksums with retention policy (last 10 runs).
 * Lightweight: no full artifact copies.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { ChecksumHistory, ChecksumEntry } from './types.js';

const CHECKSUM_FILE = 'checksums.yaml';
const MAX_HISTORY_RUNS = 10;

/**
 * Load checksum history from validation state directory.
 */
export async function loadChecksumHistory(stateDir: string): Promise<ChecksumHistory> {
  const validationDir = path.join(stateDir, 'validation');
  const checksumPath = path.join(validationDir, CHECKSUM_FILE);
  
  try {
    const content = await fs.readFile(checksumPath, 'utf-8');
    const history = yaml.load(content) as ChecksumHistory;
    
    // Validate structure
    if (!history || !Array.isArray(history.runs)) {
      return { runs: [] };
    }
    
    return history;
  } catch {
    // File doesn't exist or is malformed, return empty history
    return { runs: [] };
  }
}

/**
 * Save checksum entry for current run.
 * Maintains retention policy (last 10 runs).
 */
export async function saveChecksumEntry(
  stateDir: string,
  runId: string,
  checksums: ChecksumEntry[]
): Promise<void> {
  const validationDir = path.join(stateDir, 'validation');
  const checksumPath = path.join(validationDir, CHECKSUM_FILE);
  
  try {
    // Ensure validation directory exists
    await fs.mkdir(validationDir, { recursive: true });
    
    // Load existing history
    const history = await loadChecksumHistory(stateDir);
    
    // Add new run
    history.runs.push({
      run_id: runId,
      timestamp: new Date().toISOString(),
      checksums,
    });
    
    // Apply retention policy: keep last 10 runs
    if (history.runs.length > MAX_HISTORY_RUNS) {
      history.runs = history.runs.slice(-MAX_HISTORY_RUNS);
    }
    
    // Write updated history
    const yamlContent = yaml.dump(history, {
      noRefs: true,
      lineWidth: -1,
      sortKeys: false,
    });
    
    await fs.writeFile(checksumPath, yamlContent, 'utf-8');
  } catch (error) {
    // Non-blocking: log error but don't throw
    console.warn('[History Manager] Failed to save checksum history:', error);
  }
}

/**
 * Prune old run reports from runs/ directory.
 * Keeps last 10 timestamped reports.
 */
export async function pruneOldReports(stateDir: string): Promise<void> {
  const runsDir = path.join(stateDir, 'validation', 'runs');
  
  try {
    // Ensure runs directory exists
    await fs.mkdir(runsDir, { recursive: true });
    
    // List all YAML files in runs/
    const files = await fs.readdir(runsDir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml')).sort();
    
    // Keep last 10 files, delete older ones
    if (yamlFiles.length > MAX_HISTORY_RUNS) {
      const filesToDelete = yamlFiles.slice(0, yamlFiles.length - MAX_HISTORY_RUNS);
      
      for (const file of filesToDelete) {
        const filePath = path.join(runsDir, file);
        await fs.unlink(filePath);
      }
    }
  } catch (error) {
    // Non-blocking: log error but don't throw
    console.warn('[History Manager] Failed to prune old reports:', error);
  }
}

