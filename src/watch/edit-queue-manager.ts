/**
 * Edit Queue Manager
 * 
 * Smart debouncing for file changes with AI edit detection.
 * Per E-ADR-011: Handles different debounce timings for manual vs AI edits.
 */

import { EventEmitter } from 'node:events';

export interface FileChange {
  path: string;
  event: 'add' | 'change' | 'unlink';
  timestamp: number;
}

export interface StableChangeSet {
  files: Map<string, FileChange>;
  timestamp: number;
}

export interface EditQueueOptions {
  /** Debounce time for manual edits (ms) */
  debounceMs: number;
  /** Debounce time for AI edits (ms) - longer to handle streaming */
  aiEditDebounceMs: number;
  /** Threshold for detecting AI edits (bytes changed per second) */
  aiEditThreshold: number;
}

const DEFAULT_OPTIONS: EditQueueOptions = {
  debounceMs: 500,
  aiEditDebounceMs: 2000,
  aiEditThreshold: 5000, // 5KB/s suggests AI streaming
};

/**
 * Edit Queue Manager
 * 
 * Queues file changes and emits stable change sets after debouncing.
 * Detects AI vs manual edits and applies appropriate debounce timing.
 */
export class EditQueueManager extends EventEmitter {
  private queue: Map<string, FileChange> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private options: EditQueueOptions;
  private recentChanges: Array<{ path: string; size: number; timestamp: number }> = [];
  
  constructor(options: Partial<EditQueueOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }
  
  /**
   * Add a file change to the queue
   */
  enqueue(change: Omit<FileChange, 'timestamp'>) {
    const fileChange: FileChange = {
      ...change,
      timestamp: Date.now(),
    };
    
    // Update or add to queue (coalesce rapid changes to same file)
    this.queue.set(change.path, fileChange);
    
    // Track for AI detection
    this.trackChange(change.path);
    
    // Reset debounce timer
    this.resetDebounceTimer();
  }
  
  /**
   * Track change for AI edit detection
   */
  private trackChange(path: string) {
    const now = Date.now();
    
    // Add to recent changes (we don't have size info from chokidar, so estimate)
    this.recentChanges.push({
      path,
      size: 1000, // Rough estimate, actual size doesn't matter much for detection
      timestamp: now,
    });
    
    // Keep only last 5 seconds of changes
    this.recentChanges = this.recentChanges.filter(
      change => now - change.timestamp < 5000
    );
  }
  
  /**
   * Detect if current editing pattern looks like AI
   */
  private isLikelyAIEdit(): boolean {
    if (this.recentChanges.length < 3) {
      return false; // Need multiple rapid changes
    }
    
    const now = Date.now();
    const recentWindow = 2000; // Look at last 2 seconds
    
    const recentInWindow = this.recentChanges.filter(
      change => now - change.timestamp < recentWindow
    );
    
    // AI edit heuristics:
    // 1. Multiple files changed rapidly (>= 3 in 2 seconds)
    // 2. OR same file changed multiple times rapidly (>= 5 times in 2 seconds)
    
    const uniqueFiles = new Set(recentInWindow.map(c => c.path));
    const sameFileChanges = Math.max(
      ...Array.from(uniqueFiles).map(
        file => recentInWindow.filter(c => c.path === file).length
      )
    );
    
    return uniqueFiles.size >= 3 || sameFileChanges >= 5;
  }
  
  /**
   * Reset the debounce timer with appropriate timing
   */
  private resetDebounceTimer() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // Choose debounce time based on edit pattern
    const isAI = this.isLikelyAIEdit();
    const debounceTime = isAI ? this.options.aiEditDebounceMs : this.options.debounceMs;
    
    this.debounceTimer = setTimeout(() => {
      this.emitStableChangeSet();
    }, debounceTime);
  }
  
  /**
   * Emit stable change set
   */
  private emitStableChangeSet() {
    if (this.queue.size === 0) {
      return;
    }
    
    const changeSet: StableChangeSet = {
      files: new Map(this.queue),
      timestamp: Date.now(),
    };
    
    // Clear queue
    this.queue.clear();
    this.debounceTimer = null;
    
    // Emit event
    this.emit('stable', changeSet);
  }
  
  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.size;
  }
  
  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.size === 0;
  }
  
  /**
   * Force emit current queue (for shutdown, etc.)
   */
  flush() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    if (this.queue.size > 0) {
      this.emitStableChangeSet();
    }
  }
  
  /**
   * Clear queue without emitting
   */
  clear() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    this.queue.clear();
    this.recentChanges = [];
  }
}



