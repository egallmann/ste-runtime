/**
 * Write Tracker - Content-Hash Based Write Tracking
 * 
 * Prevents infinite loops by tracking watchdog's own writes using content hashing
 * rather than timestamps, making it resilient to delayed file system events.
 * 
 * Part of E-ADR-007 Phase 1: Critical Safeguards
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LRUCache } from 'lru-cache';

interface WriteRecord {
  filepath: string;
  contentHash: string;
  timestamp: number;
}

/**
 * Tracks writes by content hash to detect watchdog's own modifications
 */
export class WriteTracker {
  private recentWrites: LRUCache<string, WriteRecord>;

  constructor() {
    this.recentWrites = new LRUCache({
      max: 10000, // Maximum 10k entries (typical project < 1000 files)
      ttl: 30_000, // Auto-expire after 30 seconds
      updateAgeOnGet: false, // Don't refresh TTL on read
      dispose: (_value: WriteRecord, _key: string) => {
        // Optional: Log evictions for debugging
        // console.log(`[Write Tracker] Evicted: ${key}`);
      },
    });
  }

  /**
   * Record a write with its content hash
   */
  async recordWrite(filepath: string, content: string): Promise<void> {
    const normalizedPath = path.resolve(filepath);
    const contentHash = this.hashContent(content);

    this.recentWrites.set(normalizedPath, {
      filepath: normalizedPath,
      contentHash,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if a file change is from our own write
   * Returns true if content matches a recent write (this is our own write)
   */
  async isOwnWrite(filepath: string): Promise<boolean> {
    const normalizedPath = path.resolve(filepath);
    const record = this.recentWrites.get(normalizedPath);

    if (!record) {
      return false; // No recent write recorded
    }

    try {
      // Read current file content
      const currentContent = await fs.readFile(normalizedPath, 'utf-8');
      const currentHash = this.hashContent(currentContent);

      // If content matches our recorded write, it's our write
      return currentHash === record.contentHash;
    } catch {
      // File read error - assume not our write
      return false;
    }
  }

  /**
   * Get statistics about tracked writes
   */
  getStats(): { size: number; oldestTimestamp: number | null } {
    const entries = Array.from(this.recentWrites.values());
    return {
      size: entries.length,
      oldestTimestamp: entries.length > 0 ? Math.min(...entries.map((e: WriteRecord) => e.timestamp)) : null,
    };
  }

  /**
   * Clear all tracked writes (useful for testing)
   */
  clear(): void {
    this.recentWrites.clear();
  }

  /**
   * Hash content using SHA-256
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }
}

// Singleton instance
export const writeTracker = new WriteTracker();
