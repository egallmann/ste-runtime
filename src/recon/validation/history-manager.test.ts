/**
 * Tests for History Manager
 * 
 * Tests validation history management and retention policies.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import {
  loadChecksumHistory,
  saveChecksumEntry,
  pruneOldReports,
} from './history-manager.js';
import type { ChecksumEntry } from './types.js';

describe('History Manager', () => {
  let tempDir: string;
  let stateDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'history-manager-test-'));
    stateDir = path.join(tempDir, '.ste', 'state');
    await fs.mkdir(stateDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('loadChecksumHistory', () => {
    it('should return empty history when file does not exist', async () => {
      const history = await loadChecksumHistory(stateDir);

      expect(history).toEqual({ runs: [] });
    });

    it('should load existing checksum history', async () => {
      const validationDir = path.join(stateDir, 'validation');
      await fs.mkdir(validationDir, { recursive: true });

      const historyData = {
        runs: [
          {
            run_id: 'test-run-1',
            timestamp: '2024-01-01T00:00:00.000Z',
            checksums: [],
          },
        ],
      };

      const checksumPath = path.join(validationDir, 'checksums.yaml');
      await fs.writeFile(checksumPath, yaml.dump(historyData), 'utf-8');

      const history = await loadChecksumHistory(stateDir);

      expect(history.runs).toHaveLength(1);
      expect(history.runs[0].run_id).toBe('test-run-1');
    });

    it('should handle malformed history file', async () => {
      const validationDir = path.join(stateDir, 'validation');
      await fs.mkdir(validationDir, { recursive: true });

      const checksumPath = path.join(validationDir, 'checksums.yaml');
      await fs.writeFile(checksumPath, 'invalid yaml {]', 'utf-8');

      const history = await loadChecksumHistory(stateDir);

      expect(history).toEqual({ runs: [] });
    });

    it('should handle invalid structure', async () => {
      const validationDir = path.join(stateDir, 'validation');
      await fs.mkdir(validationDir, { recursive: true });

      const invalidData = { not: 'valid' };

      const checksumPath = path.join(validationDir, 'checksums.yaml');
      await fs.writeFile(checksumPath, yaml.dump(invalidData), 'utf-8');

      const history = await loadChecksumHistory(stateDir);

      expect(history).toEqual({ runs: [] });
    });
  });

  describe('saveChecksumEntry', () => {
    it('should create validation directory if it does not exist', async () => {
      const checksums: ChecksumEntry[] = [
        {
          artifact_id: 'test-artifact',
          checksum: 'abc123',
          artifact_type: 'slice',
        },
      ];

      await saveChecksumEntry(stateDir, 'run-1', checksums);

      const validationDir = path.join(stateDir, 'validation');
      const stats = await fs.stat(validationDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should save checksum entry', async () => {
      const checksums: ChecksumEntry[] = [
        {
          artifact_id: 'test-artifact',
          checksum: 'abc123',
          artifact_type: 'slice',
        },
      ];

      await saveChecksumEntry(stateDir, 'run-1', checksums);

      const history = await loadChecksumHistory(stateDir);

      expect(history.runs).toHaveLength(1);
      expect(history.runs[0].run_id).toBe('run-1');
      expect(history.runs[0].checksums).toHaveLength(1);
      expect(history.runs[0].checksums[0].artifact_id).toBe('test-artifact');
    });

    it('should append to existing history', async () => {
      const checksums1: ChecksumEntry[] = [
        { artifact_id: 'artifact-1', checksum: 'abc', artifact_type: 'slice' },
      ];
      const checksums2: ChecksumEntry[] = [
        { artifact_id: 'artifact-2', checksum: 'def', artifact_type: 'slice' },
      ];

      await saveChecksumEntry(stateDir, 'run-1', checksums1);
      await saveChecksumEntry(stateDir, 'run-2', checksums2);

      const history = await loadChecksumHistory(stateDir);

      expect(history.runs).toHaveLength(2);
      expect(history.runs[0].run_id).toBe('run-1');
      expect(history.runs[1].run_id).toBe('run-2');
    });

    it('should enforce retention policy of 10 runs', async () => {
      const checksums: ChecksumEntry[] = [
        { artifact_id: 'artifact', checksum: 'abc', artifact_type: 'slice' },
      ];

      // Add 12 runs
      for (let i = 1; i <= 12; i++) {
        await saveChecksumEntry(stateDir, `run-${i}`, checksums);
      }

      const history = await loadChecksumHistory(stateDir);

      expect(history.runs).toHaveLength(10);
      // Should keep the last 10 runs (3-12)
      expect(history.runs[0].run_id).toBe('run-3');
      expect(history.runs[9].run_id).toBe('run-12');
    });

    it('should include timestamp in entry', async () => {
      const checksums: ChecksumEntry[] = [
        { artifact_id: 'test', checksum: 'abc', artifact_type: 'slice' },
      ];

      const before = Date.now();
      await saveChecksumEntry(stateDir, 'run-1', checksums);
      const after = Date.now();

      const history = await loadChecksumHistory(stateDir);
      const timestamp = new Date(history.runs[0].timestamp).getTime();

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('pruneOldReports', () => {
    it('should create runs directory if it does not exist', async () => {
      await pruneOldReports(stateDir);

      const runsDir = path.join(stateDir, 'validation', 'runs');
      const stats = await fs.stat(runsDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should keep last 10 reports', async () => {
      const runsDir = path.join(stateDir, 'validation', 'runs');
      await fs.mkdir(runsDir, { recursive: true });

      // Create 15 reports
      for (let i = 1; i <= 15; i++) {
        const reportName = `2024-01-01T00-00-${String(i).padStart(2, '0')}.yaml`;
        const reportPath = path.join(runsDir, reportName);
        await fs.writeFile(reportPath, `run: ${i}`, 'utf-8');
      }

      await pruneOldReports(stateDir);

      const files = await fs.readdir(runsDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml'));

      expect(yamlFiles).toHaveLength(10);
    });

    it('should keep most recent reports', async () => {
      const runsDir = path.join(stateDir, 'validation', 'runs');
      await fs.mkdir(runsDir, { recursive: true });

      // Create 15 reports with timestamps
      for (let i = 1; i <= 15; i++) {
        const reportName = `2024-01-01T00-00-${String(i).padStart(2, '0')}.yaml`;
        const reportPath = path.join(runsDir, reportName);
        await fs.writeFile(reportPath, `run: ${i}`, 'utf-8');
      }

      await pruneOldReports(stateDir);

      const files = await fs.readdir(runsDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml')).sort();

      // Should keep reports 6-15
      expect(yamlFiles[0]).toBe('2024-01-01T00-00-06.yaml');
      expect(yamlFiles[9]).toBe('2024-01-01T00-00-15.yaml');
    });

    it('should not delete reports when under limit', async () => {
      const runsDir = path.join(stateDir, 'validation', 'runs');
      await fs.mkdir(runsDir, { recursive: true });

      // Create only 5 reports
      for (let i = 1; i <= 5; i++) {
        const reportName = `2024-01-01T00-00-0${i}.yaml`;
        const reportPath = path.join(runsDir, reportName);
        await fs.writeFile(reportPath, `run: ${i}`, 'utf-8');
      }

      await pruneOldReports(stateDir);

      const files = await fs.readdir(runsDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml'));

      expect(yamlFiles).toHaveLength(5);
    });

    it('should ignore non-YAML files', async () => {
      const runsDir = path.join(stateDir, 'validation', 'runs');
      await fs.mkdir(runsDir, { recursive: true });

      // Create YAML and non-YAML files
      await fs.writeFile(path.join(runsDir, 'report.yaml'), 'data', 'utf-8');
      await fs.writeFile(path.join(runsDir, 'readme.txt'), 'info', 'utf-8');
      await fs.writeFile(path.join(runsDir, 'data.json'), '{}', 'utf-8');

      await pruneOldReports(stateDir);

      const files = await fs.readdir(runsDir);

      // Non-YAML files should still exist
      expect(files).toContain('readme.txt');
      expect(files).toContain('data.json');
    });
  });
});

