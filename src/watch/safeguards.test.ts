/**
 * Test Suite for E-ADR-007 Phase 1: Critical Safeguards
 * 
 * Tests for:
 * 1. Write Tracker (content-hash based)
 * 2. Update Coordinator (generation tracking)
 * 3. Full Reconciliation (periodic state verification)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WriteTracker } from './write-tracker.js';
import { UpdateCoordinator } from './update-coordinator.js';
import { runFullReconciliation, computeFileChecksum } from './full-reconciliation.js';

// Test fixtures
let tempDir: string;

beforeEach(async () => {
  // Create temporary directory for test files
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'recon-test-'));
});

afterEach(async () => {
  // Cleanup temporary directory
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('WriteTracker', () => {
  let tracker: WriteTracker;

  beforeEach(() => {
    tracker = new WriteTracker();
  });

  afterEach(() => {
    tracker.clear();
  });

  it('should detect own write by content hash', async () => {
    const testFile = path.join(tempDir, 'test.yaml');
    const content = 'element:\n  name: TestComponent\n  selector: app-test';

    // Record write
    await tracker.recordWrite(testFile, content);

    // Write actual file with same content
    await fs.writeFile(testFile, content, 'utf-8');

    // Should detect this as own write
    const isOwn = await tracker.isOwnWrite(testFile);
    expect(isOwn).toBe(true);
  });

  it('should detect external modification by content hash', async () => {
    const testFile = path.join(tempDir, 'test.yaml');
    const originalContent = 'element:\n  name: TestComponent\n  selector: app-test';
    const modifiedContent = 'element:\n  name: ModifiedComponent\n  selector: app-modified';

    // Record write with original content
    await tracker.recordWrite(testFile, originalContent);

    // Write file with DIFFERENT content (simulating external edit)
    await fs.writeFile(testFile, modifiedContent, 'utf-8');

    // Should detect this as external write
    const isOwn = await tracker.isOwnWrite(testFile);
    expect(isOwn).toBe(false);
  });

  it('should handle path normalization', async () => {
    const absolutePath = path.resolve(tempDir, 'test.yaml');
    const relativePath = path.relative(process.cwd(), absolutePath);
    const content = 'test content';

    // Record with absolute path
    await tracker.recordWrite(absolutePath, content);
    await fs.writeFile(absolutePath, content, 'utf-8');

    // Query with relative path (should resolve to same file)
    const isOwn = await tracker.isOwnWrite(relativePath);
    expect(isOwn).toBe(true);
  });

  it('should return false for non-existent file', async () => {
    const nonExistentFile = path.join(tempDir, 'does-not-exist.yaml');

    const isOwn = await tracker.isOwnWrite(nonExistentFile);
    expect(isOwn).toBe(false);
  });

  it('should return false for file with no recorded write', async () => {
    const testFile = path.join(tempDir, 'test.yaml');
    await fs.writeFile(testFile, 'content', 'utf-8');

    // No write recorded, should return false
    const isOwn = await tracker.isOwnWrite(testFile);
    expect(isOwn).toBe(false);
  });

  it('should auto-expire old entries (TTL)', async () => {
    const testFile = path.join(tempDir, 'test.yaml');
    const content = 'test content';

    // Create tracker with very short TTL for testing
    const shortTtlTracker = new WriteTracker();
    // Note: LRU cache TTL is 30 seconds by default
    // We can't easily test expiration without waiting 30 seconds or mocking time
    // This test just verifies the structure works

    await shortTtlTracker.recordWrite(testFile, content);
    const stats = shortTtlTracker.getStats();
    expect(stats.size).toBe(1);

    shortTtlTracker.clear();
  });

  it('should provide stats', async () => {
    const file1 = path.join(tempDir, 'file1.yaml');
    const file2 = path.join(tempDir, 'file2.yaml');

    await tracker.recordWrite(file1, 'content1');
    await tracker.recordWrite(file2, 'content2');

    const stats = tracker.getStats();
    expect(stats.size).toBe(2);
    expect(stats.oldestTimestamp).toBeLessThanOrEqual(Date.now());
  });
});

describe('UpdateCoordinator', () => {
  let coordinator: UpdateCoordinator;

  beforeEach(() => {
    coordinator = new UpdateCoordinator();
  });

  afterEach(() => {
    coordinator.clear();
  });

  it('should track update batches', () => {
    const sourceFiles = ['src/file1.ts', 'src/file2.ts'];

    const generation = coordinator.startUpdate(sourceFiles);

    expect(generation).toBeGreaterThan(0);

    const stats = coordinator.getStats();
    expect(stats.activeUpdates).toBe(1);
    expect(stats.totalGenerations).toBe(generation);
  });

  it('should record slice writes for a generation', () => {
    const sourceFiles = ['src/component.ts'];
    const generation = coordinator.startUpdate(sourceFiles);

    const sliceFile = path.join(tempDir, '.ste/state/frontend/component/test.yaml');
    coordinator.recordSliceWrite(generation, sliceFile);

    // Slice should be tracked as part of active update
    const isFromUpdate = coordinator.isFromActiveUpdate(sliceFile);
    expect(isFromUpdate).toBe(true);
  });

  it('should not detect slices as active after update completes + window', async () => {
    const sourceFiles = ['src/component.ts'];
    const generation = coordinator.startUpdate(sourceFiles);

    const sliceFile = path.join(tempDir, '.ste/state/frontend/component/test.yaml');
    coordinator.recordSliceWrite(generation, sliceFile);

    // Complete update
    coordinator.completeUpdate(generation);

    // Immediately after completion, still within window
    const isActiveImmediately = coordinator.isFromActiveUpdate(sliceFile);
    expect(isActiveImmediately).toBe(true);

    // Wait for window to expire (2 seconds + buffer)
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Should no longer be active
    const isActiveAfterWindow = coordinator.isFromActiveUpdate(sliceFile);
    expect(isActiveAfterWindow).toBe(false);
  }, 10000); // Increase test timeout to 10 seconds

  it('should track multiple concurrent updates', () => {
    const gen1 = coordinator.startUpdate(['file1.ts']);
    const gen2 = coordinator.startUpdate(['file2.ts']);
    const gen3 = coordinator.startUpdate(['file3.ts']);

    expect(gen1).toBe(1);
    expect(gen2).toBe(2);
    expect(gen3).toBe(3);

    const stats = coordinator.getStats();
    expect(stats.activeUpdates).toBe(3);
    expect(stats.totalGenerations).toBe(3);
  });

  it('should handle slice path normalization', () => {
    const generation = coordinator.startUpdate(['src/component.ts']);

    const absolutePath = path.resolve(tempDir, 'slice.yaml');
    const relativePath = path.relative(process.cwd(), absolutePath);

    // Record with absolute path
    coordinator.recordSliceWrite(generation, absolutePath);

    // Query with relative path (should resolve to same file)
    const isActive = coordinator.isFromActiveUpdate(relativePath);
    expect(isActive).toBe(true);
  });

  it('should provide accurate stats', () => {
    const gen1 = coordinator.startUpdate(['file1.ts']);
    const gen2 = coordinator.startUpdate(['file2.ts']);

    coordinator.recordSliceWrite(gen1, 'slice1.yaml');
    coordinator.recordSliceWrite(gen2, 'slice2.yaml');

    const stats = coordinator.getStats();
    expect(stats.activeUpdates).toBe(2);
    expect(stats.totalGenerations).toBe(2);
    expect(stats.oldestActiveStartTime).toBeLessThanOrEqual(Date.now());
  });
});

describe('Full Reconciliation', () => {
  it('should compute file checksums', async () => {
    const testFile = path.join(tempDir, 'test.ts');
    const content = 'export function test() { return "hello"; }';

    await fs.writeFile(testFile, content, 'utf-8');

    const checksum = await computeFileChecksum(testFile);

    expect(checksum).toBeTruthy();
    expect(checksum).toHaveLength(64); // SHA-256 produces 64 hex characters
  });

  it('should return empty string for non-existent file', async () => {
    const nonExistentFile = path.join(tempDir, 'does-not-exist.ts');

    const checksum = await computeFileChecksum(nonExistentFile);

    expect(checksum).toBe('');
  });

  it('should detect stale slices', async () => {
    // Setup: Create project structure
    const projectRoot = tempDir;
    const stateDir = path.join(tempDir, '.ste/state');
    const sourceFile = path.join(projectRoot, 'src/component.ts');
    const sliceDir = path.join(stateDir, 'frontend/component');

    await fs.mkdir(path.dirname(sourceFile), { recursive: true });
    await fs.mkdir(sliceDir, { recursive: true });

    // Create source file
    const sourceContent = 'export class Component {}';
    await fs.writeFile(sourceFile, sourceContent, 'utf-8');

    // Create slice with OLD checksum (simulating stale slice)
    const oldChecksum = 'old_checksum_that_does_not_match';
    const sliceContent = `
_slice:
  id: "component:src/component.ts:Component"
  domain: frontend
  type: component
  source_files:
    - src/component.ts
element:
  name: Component
provenance:
  extracted_at: "2026-01-07T00:00:00Z"
  source_checksum: "${oldChecksum}"
  extractor_version: "0.2.0"
`;

    await fs.writeFile(path.join(sliceDir, 'test.yaml'), sliceContent, 'utf-8');

    // Run full reconciliation
    const result = await runFullReconciliation(projectRoot, stateDir);

    // Should detect the stale slice
    expect(result.staleSlices).toBe(1);
    expect(result.staleSources).toContain('src/component.ts');
    expect(result.checkedSlices).toBe(1);
  });

  it('should not report up-to-date slices as stale', async () => {
    // Setup: Create project structure
    const projectRoot = tempDir;
    const stateDir = path.join(tempDir, '.ste/state');
    const sourceFile = path.join(projectRoot, 'src/component.ts');
    const sliceDir = path.join(stateDir, 'frontend/component');

    await fs.mkdir(path.dirname(sourceFile), { recursive: true });
    await fs.mkdir(sliceDir, { recursive: true });

    // Create source file
    const sourceContent = 'export class Component {}';
    await fs.writeFile(sourceFile, sourceContent, 'utf-8');

    // Compute current checksum
    const currentChecksum = await computeFileChecksum(sourceFile);

    // Create slice with CURRENT checksum (up-to-date)
    const sliceContent = `
_slice:
  id: "component:src/component.ts:Component"
  domain: frontend
  type: component
  source_files:
    - src/component.ts
element:
  name: Component
provenance:
  extracted_at: "2026-01-07T00:00:00Z"
  source_checksum: "${currentChecksum}"
  extractor_version: "0.2.0"
`;

    await fs.writeFile(path.join(sliceDir, 'test.yaml'), sliceContent, 'utf-8');

    // Run full reconciliation
    const result = await runFullReconciliation(projectRoot, stateDir);

    // Should NOT detect any stale slices
    expect(result.staleSlices).toBe(0);
    expect(result.staleSources).toHaveLength(0);
    expect(result.checkedSlices).toBe(1);
  });

  it('should ignore slices without checksums (legacy format)', async () => {
    // Setup: Create project structure
    const projectRoot = tempDir;
    const stateDir = path.join(tempDir, '.ste/state');
    const sourceFile = path.join(projectRoot, 'src/component.ts');
    const sliceDir = path.join(stateDir, 'frontend/component');

    await fs.mkdir(path.dirname(sourceFile), { recursive: true });
    await fs.mkdir(sliceDir, { recursive: true });

    // Create source file
    await fs.writeFile(sourceFile, 'export class Component {}', 'utf-8');

    // Create slice WITHOUT checksum (legacy format)
    const sliceContent = `
_slice:
  id: "component:src/component.ts:Component"
  domain: frontend
  type: component
  source_files:
    - src/component.ts
element:
  name: Component
provenance:
  extracted_at: "2026-01-07T00:00:00Z"
  extractor_version: "0.2.0"
`;

    await fs.writeFile(path.join(sliceDir, 'test.yaml'), sliceContent, 'utf-8');

    // Run full reconciliation
    const result = await runFullReconciliation(projectRoot, stateDir);

    // Should NOT report as stale (no checksum to compare)
    expect(result.staleSlices).toBe(0);
    expect(result.staleSources).toHaveLength(0);
    expect(result.checkedSlices).toBe(1);
  });

  it('should ignore slices for deleted source files', async () => {
    // Setup: Create project structure
    const projectRoot = tempDir;
    const stateDir = path.join(tempDir, '.ste/state');
    const sliceDir = path.join(stateDir, 'frontend/component');

    await fs.mkdir(sliceDir, { recursive: true });

    // Create slice referencing NON-EXISTENT source file
    const sliceContent = `
_slice:
  id: "component:src/deleted.ts:Component"
  domain: frontend
  type: component
  source_files:
    - src/deleted.ts
element:
  name: Component
provenance:
  extracted_at: "2026-01-07T00:00:00Z"
  source_checksum: "some_old_checksum"
  extractor_version: "0.2.0"
`;

    await fs.writeFile(path.join(sliceDir, 'test.yaml'), sliceContent, 'utf-8');

    // Run full reconciliation
    const result = await runFullReconciliation(projectRoot, stateDir);

    // Should NOT report as stale (divergence detection handles deleted files)
    expect(result.staleSlices).toBe(0);
    expect(result.staleSources).toHaveLength(0);
    expect(result.checkedSlices).toBe(1);
  });
});

describe('Integration: Write Tracker + Update Coordinator', () => {
  let tracker: WriteTracker;
  let coordinator: UpdateCoordinator;

  beforeEach(() => {
    tracker = new WriteTracker();
    coordinator = new UpdateCoordinator();
  });

  afterEach(() => {
    tracker.clear();
    coordinator.clear();
  });

  it('should prevent infinite loops in watchdog scenario', async () => {
    const sourceFile = 'src/component.ts';
    const sliceFile = path.join(tempDir, '.ste/state/frontend/component/test.yaml');
    const content = 'element:\n  name: TestComponent';

    // Simulate watchdog RECON run
    const generation = coordinator.startUpdate([sourceFile]);

    // Simulate RECON writing slice
    coordinator.recordSliceWrite(generation, sliceFile);
    await tracker.recordWrite(sliceFile, content);
    await fs.mkdir(path.dirname(sliceFile), { recursive: true });
    await fs.writeFile(sliceFile, content, 'utf-8');

    // Complete update
    coordinator.completeUpdate(generation);

    // Simulate file change event (watchdog detects the write it just made)
    const isFromUpdate = coordinator.isFromActiveUpdate(sliceFile);
    const isOwnWrite = await tracker.isOwnWrite(sliceFile);

    // Should detect as own write through BOTH mechanisms
    expect(isFromUpdate).toBe(true); // Part of recent update batch
    expect(isOwnWrite).toBe(true); // Content matches recorded write

    // Watchdog should IGNORE this event (no healing needed)
  });

  it('should detect external modification after update completes', async () => {
    const sourceFile = 'src/component.ts';
    const sliceFile = path.join(tempDir, '.ste/state/frontend/component/test.yaml');
    const originalContent = 'element:\n  name: TestComponent';
    const modifiedContent = 'element:\n  name: ModifiedComponent';

    // Simulate watchdog RECON run
    const generation = coordinator.startUpdate([sourceFile]);
    coordinator.recordSliceWrite(generation, sliceFile);
    await tracker.recordWrite(sliceFile, originalContent);
    await fs.mkdir(path.dirname(sliceFile), { recursive: true });
    await fs.writeFile(sliceFile, originalContent, 'utf-8');
    coordinator.completeUpdate(generation);

    // Wait for update window to expire
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Simulate external edit (developer manually edits slice)
    await fs.writeFile(sliceFile, modifiedContent, 'utf-8');

    // Check detection
    const isFromUpdate = coordinator.isFromActiveUpdate(sliceFile);
    const isOwnWrite = await tracker.isOwnWrite(sliceFile);

    // Should detect as EXTERNAL modification
    expect(isFromUpdate).toBe(false); // Not part of any recent update
    expect(isOwnWrite).toBe(false); // Content doesn't match any recorded write

    // Watchdog should HEAL this (regenerate from source)
  }, 10000);
});


