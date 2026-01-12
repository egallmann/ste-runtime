/**
 * Transaction Detector
 * 
 * Detects multi-file edit transactions (Cursor batch operations).
 * Per E-ADR-011: Wait for transaction completion before triggering RECON.
 */

import type { StableChangeSet } from './edit-queue-manager.js';

export interface Transaction {
  id: string;
  files: Set<string>;
  startTime: number;
  lastChangeTime: number;
  isComplete: boolean;
}

export interface TransactionDetectorOptions {
  /** Time window to consider changes as part of same transaction (ms) */
  transactionWindowMs: number;
  /** Minimum files to consider it a transaction */
  minFilesForTransaction: number;
}

const DEFAULT_OPTIONS: TransactionDetectorOptions = {
  transactionWindowMs: 3000, // 3 seconds
  minFilesForTransaction: 2,
};

/**
 * Transaction Detector
 * 
 * Detects when multiple files are being edited as part of a single transaction
 * (e.g., Cursor batch operations, refactoring tools).
 */
export class TransactionDetector {
  private options: TransactionDetectorOptions;
  private currentTransaction: Transaction | null = null;
  private transactionCounter = 0;
  
  constructor(options: Partial<TransactionDetectorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }
  
  /**
   * Process a change set and determine if it's part of a transaction
   */
  processChangeSet(changeSet: StableChangeSet): {
    isTransaction: boolean;
    isComplete: boolean;
    transaction: Transaction | null;
  } {
    const now = Date.now();
    const fileCount = changeSet.files.size;
    
    // If no current transaction, check if this starts one
    if (!this.currentTransaction) {
      if (fileCount >= this.options.minFilesForTransaction) {
        // Start new transaction
        this.currentTransaction = {
          id: `txn-${++this.transactionCounter}`,
          files: new Set(changeSet.files.keys()),
          startTime: now,
          lastChangeTime: now,
          isComplete: false,
        };
        
        return {
          isTransaction: true,
          isComplete: false,
          transaction: this.currentTransaction,
        };
      }
      
      // Single file change, not a transaction
      return {
        isTransaction: false,
        isComplete: true,
        transaction: null,
      };
    }
    
    // We have an active transaction
    const timeSinceLastChange = now - this.currentTransaction.lastChangeTime;
    
    // Check if this change is within the transaction window
    if (timeSinceLastChange <= this.options.transactionWindowMs) {
      // Add files to transaction
      for (const file of changeSet.files.keys()) {
        this.currentTransaction.files.add(file);
      }
      this.currentTransaction.lastChangeTime = now;
      
      return {
        isTransaction: true,
        isComplete: false,
        transaction: this.currentTransaction,
      };
    }
    
    // Transaction window expired, mark as complete
    const completedTransaction = this.currentTransaction;
    completedTransaction.isComplete = true;
    this.currentTransaction = null;
    
    // Check if new change set starts a new transaction
    if (fileCount >= this.options.minFilesForTransaction) {
      this.currentTransaction = {
        id: `txn-${++this.transactionCounter}`,
        files: new Set(changeSet.files.keys()),
        startTime: now,
        lastChangeTime: now,
        isComplete: false,
      };
    }
    
    return {
      isTransaction: true,
      isComplete: true,
      transaction: completedTransaction,
    };
  }
  
  /**
   * Check if there's an active transaction
   */
  hasActiveTransaction(): boolean {
    return this.currentTransaction !== null && !this.currentTransaction.isComplete;
  }
  
  /**
   * Get current transaction
   */
  getCurrentTransaction(): Transaction | null {
    return this.currentTransaction;
  }
  
  /**
   * Force complete current transaction
   */
  forceComplete(): Transaction | null {
    if (!this.currentTransaction) {
      return null;
    }
    
    this.currentTransaction.isComplete = true;
    const transaction = this.currentTransaction;
    this.currentTransaction = null;
    
    return transaction;
  }
  
  /**
   * Reset detector state
   */
  reset() {
    this.currentTransaction = null;
  }
}

/**
 * Heuristic: Detect if a change set looks like a Cursor batch operation
 */
export function looksLikeCursorBatch(changeSet: StableChangeSet): boolean {
  const fileCount = changeSet.files.size;
  
  // Cursor batch operations typically:
  // 1. Affect multiple files (2-10 usually)
  // 2. Happen in quick succession (within 1-2 seconds)
  // 3. Often involve related files (same directory, similar names)
  
  if (fileCount < 2) {
    return false;
  }
  
  // Check if files are related (same directory or similar names)
  const files = Array.from(changeSet.files.keys());
  const directories = new Set(files.map(f => f.split('/').slice(0, -1).join('/')));
  
  // If most files are in same directory, likely a batch operation
  if (directories.size === 1 && fileCount >= 2) {
    return true;
  }
  
  // If files have similar names (e.g., component.ts, component.test.ts, component.css)
  const basenames = files.map(f => {
    const parts = f.split('/');
    const filename = parts[parts.length - 1];
    return filename.split('.')[0]; // Get base name without extension
  });
  
  const uniqueBasenames = new Set(basenames);
  if (uniqueBasenames.size < fileCount) {
    return true; // Some files share base names
  }
  
  return false;
}



