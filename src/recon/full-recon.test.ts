/**
 * Tests for Full RECON
 * 
 * Tests the full reconciliation orchestration.
 */

import { describe, it, expect } from 'vitest';
import { runFullRecon } from './full-recon.js';

describe('Full RECON', () => {
  it('should export runFullRecon function', () => {
    expect(runFullRecon).toBeDefined();
    expect(typeof runFullRecon).toBe('function');
  });

  // Note: Full integration tests for runFullRecon are complex and require
  // actual project structures. These are covered by integration tests.
  // Unit tests focus on individual phase functions which are already tested.
});

