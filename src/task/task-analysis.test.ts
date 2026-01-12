/**
 * Tests for Task Analysis
 * 
 * Tests the task analysis wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runTaskAnalyze, type TaskAnalyzeOptions } from './task-analysis.js';
import { execa } from 'execa';

vi.mock('execa');

describe('Task Analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runTaskAnalyze', () => {
    it('should call Python script with task argument', async () => {
      const mockedExeca = vi.mocked(execa);
      mockedExeca.mockResolvedValue({} as any);

      await runTaskAnalyze('test task');

      expect(mockedExeca).toHaveBeenCalled();
      const callArgs = mockedExeca.mock.calls[0];
      expect(callArgs[1]).toContain('--task');
      expect(callArgs[1]).toContain('test task');
    });

    it('should pass stateRoot option', async () => {
      const mockedExeca = vi.mocked(execa);
      mockedExeca.mockResolvedValue({} as any);

      await runTaskAnalyze('test task', { stateRoot: '/custom/state' });

      const callArgs = mockedExeca.mock.calls[0];
      expect(callArgs[1]).toContain('--state');
      expect(callArgs[1]).toContain('/custom/state');
    });

    it('should pass format option', async () => {
      const mockedExeca = vi.mocked(execa);
      mockedExeca.mockResolvedValue({} as any);

      await runTaskAnalyze('test task', { format: 'json' });

      const callArgs = mockedExeca.mock.calls[0];
      expect(callArgs[1]).toContain('--format');
      expect(callArgs[1]).toContain('json');
    });

    it('should pass top option', async () => {
      const mockedExeca = vi.mocked(execa);
      mockedExeca.mockResolvedValue({} as any);

      await runTaskAnalyze('test task', { top: 10 });

      const callArgs = mockedExeca.mock.calls[0];
      expect(callArgs[1]).toContain('--top');
      expect(callArgs[1]).toContain('10');
    });

    it('should pass threshold option', async () => {
      const mockedExeca = vi.mocked(execa);
      mockedExeca.mockResolvedValue({} as any);

      await runTaskAnalyze('test task', { threshold: 0.5 });

      const callArgs = mockedExeca.mock.calls[0];
      expect(callArgs[1]).toContain('--threshold');
      expect(callArgs[1]).toContain('0.5');
    });

    it('should handle all options together', async () => {
      const mockedExeca = vi.mocked(execa);
      mockedExeca.mockResolvedValue({} as any);

      const options: TaskAnalyzeOptions = {
        stateRoot: '/custom/state',
        format: 'table',
        top: 5,
        threshold: 0.7,
      };

      await runTaskAnalyze('test task', options);

      const callArgs = mockedExeca.mock.calls[0];
      expect(callArgs[1]).toContain('--task');
      expect(callArgs[1]).toContain('--state');
      expect(callArgs[1]).toContain('--format');
      expect(callArgs[1]).toContain('--top');
      expect(callArgs[1]).toContain('--threshold');
    });

    it('should use inherit stdio for live output', async () => {
      const mockedExeca = vi.mocked(execa);
      mockedExeca.mockResolvedValue({} as any);

      await runTaskAnalyze('test task');

      const callArgs = mockedExeca.mock.calls[0];
      expect(callArgs[2]).toEqual({ stdio: 'inherit' });
    });
  });
});

