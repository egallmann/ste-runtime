/**
 * Tests for Edit Queue Manager
 * 
 * Tests smart debouncing and AI edit detection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditQueueManager } from './edit-queue-manager.js';

describe('EditQueueManager', () => {
  let manager: EditQueueManager;
  let emittedChanges: any[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new EditQueueManager({
      debounceMs: 500,
      aiEditDebounceMs: 2000,
      aiEditThreshold: 5000,
    });

    emittedChanges = [];
    manager.on('stable', (changeSet) => {
      emittedChanges.push(changeSet);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    manager.removeAllListeners();
  });

  describe('enqueue', () => {
    it('should enqueue file changes', () => {
      manager.enqueue({ path: 'test.ts', event: 'change' });

      expect(manager['queue'].size).toBe(1);
      expect(manager['queue'].get('test.ts')?.event).toBe('change');
    });

    it('should coalesce rapid changes to the same file', () => {
      manager.enqueue({ path: 'test.ts', event: 'change' });
      manager.enqueue({ path: 'test.ts', event: 'change' });
      manager.enqueue({ path: 'test.ts', event: 'change' });

      expect(manager['queue'].size).toBe(1);
    });

    it('should track multiple different files', () => {
      manager.enqueue({ path: 'a.ts', event: 'change' });
      manager.enqueue({ path: 'b.ts', event: 'change' });
      manager.enqueue({ path: 'c.ts', event: 'change' });

      expect(manager['queue'].size).toBe(3);
    });

    it('should add timestamps to changes', () => {
      const before = Date.now();
      manager.enqueue({ path: 'test.ts', event: 'change' });
      const after = Date.now();

      const change = manager['queue'].get('test.ts');
      expect(change?.timestamp).toBeGreaterThanOrEqual(before);
      expect(change?.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('debouncing', () => {
    it('should emit stable changes after debounce period', () => {
      manager.enqueue({ path: 'test.ts', event: 'change' });

      expect(emittedChanges).toHaveLength(0);

      vi.advanceTimersByTime(500);

      expect(emittedChanges).toHaveLength(1);
      expect(emittedChanges[0].files.size).toBe(1);
    });

    it('should reset debounce timer on new changes', () => {
      manager.enqueue({ path: 'test.ts', event: 'change' });

      vi.advanceTimersByTime(300);
      expect(emittedChanges).toHaveLength(0);

      manager.enqueue({ path: 'test2.ts', event: 'change' });

      vi.advanceTimersByTime(300);
      expect(emittedChanges).toHaveLength(0);

      vi.advanceTimersByTime(200);
      expect(emittedChanges).toHaveLength(1);
      expect(emittedChanges[0].files.size).toBe(2);
    });

    it('should clear queue after emitting', () => {
      manager.enqueue({ path: 'test.ts', event: 'change' });

      vi.advanceTimersByTime(500);

      expect(manager['queue'].size).toBe(0);
    });
  });

  describe('AI edit detection', () => {
    it('should detect AI edits with rapid changes', () => {
      // Simulate rapid file changes (AI streaming)
      for (let i = 0; i < 5; i++) {
        manager.enqueue({ path: `file${i}.ts`, event: 'change' });
        vi.advanceTimersByTime(100);
      }

      const isAI = manager['isLikelyAIEdit']();
      expect(isAI).toBe(true);
    });

    it('should not detect AI for slow manual edits', () => {
      manager.enqueue({ path: 'file1.ts', event: 'change' });
      vi.advanceTimersByTime(1000);
      manager.enqueue({ path: 'file2.ts', event: 'change' });

      const isAI = manager['isLikelyAIEdit']();
      expect(isAI).toBe(false);
    });

    it('should use longer debounce for AI edits', () => {
      // Simulate AI editing pattern
      for (let i = 0; i < 5; i++) {
        manager.enqueue({ path: `file${i}.ts`, event: 'change' });
        vi.advanceTimersByTime(50);
      }

      // Should not emit after normal debounce
      vi.advanceTimersByTime(500);
      expect(emittedChanges).toHaveLength(0);

      // Should emit after AI debounce
      vi.advanceTimersByTime(1500);
      expect(emittedChanges).toHaveLength(1);
    });
  });

  describe('event types', () => {
    it('should handle add events', () => {
      manager.enqueue({ path: 'new.ts', event: 'add' });

      vi.advanceTimersByTime(500);

      expect(emittedChanges[0].files.get('new.ts')?.event).toBe('add');
    });

    it('should handle change events', () => {
      manager.enqueue({ path: 'existing.ts', event: 'change' });

      vi.advanceTimersByTime(500);

      expect(emittedChanges[0].files.get('existing.ts')?.event).toBe('change');
    });

    it('should handle unlink events', () => {
      manager.enqueue({ path: 'deleted.ts', event: 'unlink' });

      vi.advanceTimersByTime(500);

      expect(emittedChanges[0].files.get('deleted.ts')?.event).toBe('unlink');
    });
  });

  describe('cleanup', () => {
    it('should clean up old tracked changes', () => {
      manager.enqueue({ path: 'file1.ts', event: 'change' });

      vi.advanceTimersByTime(6000);

      manager.enqueue({ path: 'file2.ts', event: 'change' });

      // Old changes should be filtered out
      expect(manager['recentChanges'].length).toBeLessThanOrEqual(1);
    });
  });

  describe('options', () => {
    it('should use custom debounce times', () => {
      const customManager = new EditQueueManager({
        debounceMs: 1000,
      });

      const customChanges: any[] = [];
      customManager.on('stable', (changeSet) => {
        customChanges.push(changeSet);
      });

      customManager.enqueue({ path: 'test.ts', event: 'change' });

      vi.advanceTimersByTime(500);
      expect(customChanges).toHaveLength(0);

      vi.advanceTimersByTime(500);
      expect(customChanges).toHaveLength(1);

      customManager.removeAllListeners();
    });
  });
});

