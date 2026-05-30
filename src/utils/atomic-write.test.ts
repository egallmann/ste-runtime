import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile, MAX_RETRIES } from './atomic-write.js';

describe('atomicWriteFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write a file atomically', async () => {
    const filePath = path.join(tempDir, 'test.txt');
    await atomicWriteFile(filePath, 'hello world');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello world');
  });

  it('should create parent directories', async () => {
    const filePath = path.join(tempDir, 'nested', 'deep', 'test.txt');
    await atomicWriteFile(filePath, 'nested content');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('nested content');
  });

  it('should retry on EPERM and succeed after transient failures', async () => {
    const filePath = path.join(tempDir, 'retry-success.txt');
    let renameCallCount = 0;
    const originalRename = fs.rename;

    vi.spyOn(fs, 'rename').mockImplementation(async (src, dest) => {
      renameCallCount++;
      if (renameCallCount <= 2) {
        const err = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
        err.code = 'EPERM';
        throw err;
      }
      return originalRename(src, dest);
    });

    await atomicWriteFile(filePath, 'retry content');

    expect(renameCallCount).toBe(3);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('retry content');
  });

  it('should throw after MAX_RETRIES exhausted on EPERM', async () => {
    const filePath = path.join(tempDir, 'retry-exhaustion.txt');
    let renameCallCount = 0;

    vi.spyOn(fs, 'rename').mockImplementation(async () => {
      renameCallCount++;
      const err = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });

    await expect(atomicWriteFile(filePath, 'will fail')).rejects.toThrow('EPERM');
    expect(renameCallCount).toBe(MAX_RETRIES + 1);
  });

  it('should throw immediately on non-retryable error without retry', async () => {
    const filePath = path.join(tempDir, 'non-retryable.txt');
    let renameCallCount = 0;

    vi.spyOn(fs, 'rename').mockImplementation(async () => {
      renameCallCount++;
      const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    await expect(atomicWriteFile(filePath, 'will fail')).rejects.toThrow('ENOENT');
    expect(renameCallCount).toBe(1);
  });
});
