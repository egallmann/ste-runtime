/**
 * Tests for Report Generator
 * 
 * Tests validation report generation and formatting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import { generateReport, type ReportVerbosity } from './report-generator.js';
import type { ValidationFinding, ValidationReport } from './types.js';

describe('Report Generator', () => {
  let tempDir: string;
  let stateDir: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-generator-test-'));
    stateDir = path.join(tempDir, '.ste', 'state');
    await fs.mkdir(stateDir, { recursive: true });

    // Spy on console.log
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
  });

  describe('generateReport', () => {
    it('should create validation directory structure', async () => {
      const findings: ValidationFinding[] = [];

      await generateReport(stateDir, 'run-1', findings);

      const validationDir = path.join(stateDir, 'validation');
      const runsDir = path.join(validationDir, 'runs');

      const validationStats = await fs.stat(validationDir);
      const runsStats = await fs.stat(runsDir);

      expect(validationStats.isDirectory()).toBe(true);
      expect(runsStats.isDirectory()).toBe(true);
    });

    it('should write latest.yaml report', async () => {
      const findings: ValidationFinding[] = [
        {
          validator: 'test-validator',
          category: 'ERROR',
          description: 'Test error',
          affected_artifacts: ['artifact-1'],
          suggested_investigation: 'Check artifact-1',
        },
      ];

      await generateReport(stateDir, 'run-1', findings);

      const latestPath = path.join(stateDir, 'validation', 'latest.yaml');
      const content = await fs.readFile(latestPath, 'utf-8');
      const report = yaml.load(content) as ValidationReport;

      expect(report.validation_run.recon_run_id).toBe('run-1');
      expect(report.summary.total_findings).toBe(1);
      expect(report.findings).toHaveLength(1);
    });

    it('should write timestamped run report', async () => {
      const findings: ValidationFinding[] = [];

      await generateReport(stateDir, 'run-1', findings);

      const runsDir = path.join(stateDir, 'validation', 'runs');
      const files = await fs.readdir(runsDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml'));

      expect(yamlFiles).toHaveLength(1);
      expect(yamlFiles[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.yaml$/);
    });

    it('should calculate summary statistics', async () => {
      const findings: ValidationFinding[] = [
        {
          validator: 'test',
          category: 'ERROR',
          description: 'Error 1',
          affected_artifacts: [],
        },
        {
          validator: 'test',
          category: 'ERROR',
          description: 'Error 2',
          affected_artifacts: [],
        },
        {
          validator: 'test',
          category: 'WARNING',
          description: 'Warning 1',
          affected_artifacts: [],
        },
        {
          validator: 'test',
          category: 'INFO',
          description: 'Info 1',
          affected_artifacts: [],
        },
      ];

      await generateReport(stateDir, 'run-1', findings);

      const latestPath = path.join(stateDir, 'validation', 'latest.yaml');
      const content = await fs.readFile(latestPath, 'utf-8');
      const report = yaml.load(content) as ValidationReport;

      expect(report.summary.total_findings).toBe(4);
      expect(report.summary.errors).toBe(2);
      expect(report.summary.warnings).toBe(1);
      expect(report.summary.info).toBe(1);
    });

    it('should include validation metadata', async () => {
      const findings: ValidationFinding[] = [];

      await generateReport(stateDir, 'run-1', findings);

      const latestPath = path.join(stateDir, 'validation', 'latest.yaml');
      const content = await fs.readFile(latestPath, 'utf-8');
      const report = yaml.load(content) as ValidationReport;

      expect(report.validation_run.recon_run_id).toBe('run-1');
      expect(report.validation_run.validation_version).toBeTruthy();
      expect(report.validation_run.timestamp).toBeTruthy();
    });

    describe('verbosity levels', () => {
      it('should output summary by default', async () => {
        const findings: ValidationFinding[] = [
          {
            validator: 'test',
            category: 'ERROR',
            description: 'Test error',
            affected_artifacts: [],
          },
        ];

        await generateReport(stateDir, 'run-1', findings);

        expect(consoleLogSpy).toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Report generated')
        );
      });

      it('should output detailed findings when verbosity is detailed', async () => {
        const findings: ValidationFinding[] = [
          {
            validator: 'test-validator',
            category: 'ERROR',
            description: 'Test error',
            affected_artifacts: ['artifact-1'],
            suggested_investigation: 'Check artifact-1',
          },
        ];

        await generateReport(stateDir, 'run-1', findings, 'detailed');

        expect(consoleLogSpy).toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Detailed findings')
        );
      });

      it('should not output anything when verbosity is silent', async () => {
        const findings: ValidationFinding[] = [
          {
            validator: 'test',
            category: 'ERROR',
            description: 'Test error',
            affected_artifacts: [],
          },
        ];

        await generateReport(stateDir, 'run-1', findings, 'silent');

        expect(consoleLogSpy).not.toHaveBeenCalled();
      });
    });

    it('should handle empty findings', async () => {
      const findings: ValidationFinding[] = [];

      await generateReport(stateDir, 'run-1', findings);

      const latestPath = path.join(stateDir, 'validation', 'latest.yaml');
      const content = await fs.readFile(latestPath, 'utf-8');
      const report = yaml.load(content) as ValidationReport;

      expect(report.summary.total_findings).toBe(0);
      expect(report.summary.errors).toBe(0);
      expect(report.summary.warnings).toBe(0);
      expect(report.summary.info).toBe(0);
      expect(report.findings).toHaveLength(0);
    });

    it('should prune old reports', async () => {
      const findings: ValidationFinding[] = [];
      const runsDir = path.join(stateDir, 'validation', 'runs');
      await fs.mkdir(runsDir, { recursive: true });

      // Create 12 old reports
      for (let i = 1; i <= 12; i++) {
        const reportName = `2024-01-01T00-00-${String(i).padStart(2, '0')}.yaml`;
        const reportPath = path.join(runsDir, reportName);
        await fs.writeFile(reportPath, `run: ${i}`, 'utf-8');
      }

      // Generate new report (should prune old ones)
      await generateReport(stateDir, 'run-13', findings);

      const files = await fs.readdir(runsDir);
      const yamlFiles = files.filter(f => f.endsWith('.yaml'));

      // Should have 10 reports total (pruned to last 10)
      expect(yamlFiles).toHaveLength(10);
    });
  });
});

