/**
 * Watchdog Orchestration
 * 
 * Main orchestrator for file watching and automatic RECON triggering.
 * Per E-ADR-011: Unified process combining file watcher + incremental RECON + RSS.
 */

import chokidar from 'chokidar';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { EditQueueManager, type StableChangeSet } from './edit-queue-manager.js';
import { TransactionDetector } from './transaction-detector.js';
import { runIncrementalRecon } from '../recon/incremental-recon.js';
import type { ResolvedConfig } from '../config/index.js';

export interface WatchdogOptions {
  projectRoot: string;
  config: ResolvedConfig;
  onReconComplete?: () => void | Promise<void>;
  onError?: (error: Error) => void;
}

export interface WatchdogStats {
  filesWatched: number;
  reconRuns: number;
  lastReconTime: number | null;
  queueSize: number;
  isWatching: boolean;
}

/**
 * Watchdog Orchestrator
 * 
 * Coordinates file watching, edit queuing, transaction detection,
 * and incremental RECON triggering.
 */
export class Watchdog extends EventEmitter {
  private options: WatchdogOptions;
  private watcher: chokidar.FSWatcher | null = null;
  private editQueue: EditQueueManager;
  private transactionDetector: TransactionDetector;
  private stats: WatchdogStats = {
    filesWatched: 0,
    reconRuns: 0,
    lastReconTime: null,
    queueSize: 0,
    isWatching: false,
  };
  private fullReconciliationTimer: NodeJS.Timeout | null = null;
  
  constructor(options: WatchdogOptions) {
    super();
    this.options = options;
    
    // Initialize edit queue manager
    this.editQueue = new EditQueueManager({
      debounceMs: options.config.watchdog.debounceMs,
      aiEditDebounceMs: options.config.watchdog.aiEditDebounceMs,
      aiEditThreshold: 5000,
    });
    
    // Initialize transaction detector
    this.transactionDetector = new TransactionDetector({
      transactionWindowMs: 3000,
      minFilesForTransaction: 2,
    });
    
    // Listen for stable change sets
    this.editQueue.on('stable', (changeSet: StableChangeSet) => {
      this.handleStableChangeSet(changeSet);
    });
  }
  
  /**
   * Start watching files
   */
  async start(): Promise<void> {
    if (this.watcher) {
      throw new Error('Watchdog already started');
    }
    
    const { projectRoot, config } = this.options;
    const watchConfig = config.watchdog;
    
    // Build watch patterns
    const patterns = watchConfig.patterns.map(pattern => 
      path.join(projectRoot, pattern)
    );
    
    // Start file watcher
    this.watcher = chokidar.watch(patterns, {
      ignored: watchConfig.ignore.map(pattern => `**/${pattern}/**`),
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: watchConfig.stabilityCheckMs,
        pollInterval: 100,
      },
      usePolling: watchConfig.fallbackPolling,
      interval: watchConfig.pollingInterval,
    });
    
    // Register event handlers
    this.watcher.on('add', (filePath) => this.handleFileChange(filePath, 'add'));
    this.watcher.on('change', (filePath) => this.handleFileChange(filePath, 'change'));
    this.watcher.on('unlink', (filePath) => this.handleFileChange(filePath, 'unlink'));
    this.watcher.on('error', (error) => this.handleError(error));
    
    // Wait for watcher to be ready
    await new Promise<void>((resolve) => {
      this.watcher!.on('ready', () => {
        this.stats.isWatching = true;
        this.stats.filesWatched = Object.keys(this.watcher!.getWatched()).length;
        this.emit('ready');
        resolve();
      });
    });
    
    // Start periodic full reconciliation if configured
    if (watchConfig.fullReconciliationInterval > 0) {
      this.fullReconciliationTimer = setInterval(
        () => this.triggerFullReconciliation(),
        watchConfig.fullReconciliationInterval
      );
    }
    
    console.log(`[Watchdog] Started watching ${this.stats.filesWatched} files`);
  }
  
  /**
   * Stop watching files
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }
    
    // Stop periodic reconciliation
    if (this.fullReconciliationTimer) {
      clearInterval(this.fullReconciliationTimer);
      this.fullReconciliationTimer = null;
    }
    
    // Flush any pending changes
    this.editQueue.flush();
    
    // Close watcher
    await this.watcher.close();
    this.watcher = null;
    this.stats.isWatching = false;
    
    this.emit('stopped');
    console.log('[Watchdog] Stopped');
  }
  
  /**
   * Handle file change event
   */
  private handleFileChange(filePath: string, event: 'add' | 'change' | 'unlink') {
    const relativePath = path.relative(this.options.projectRoot, filePath);
    
    // Enqueue the change
    this.editQueue.enqueue({
      path: relativePath,
      event,
    });
    
    this.stats.queueSize = this.editQueue.getQueueSize();
    this.emit('file-change', { path: relativePath, event });
  }
  
  /**
   * Handle stable change set from edit queue
   */
  private async handleStableChangeSet(changeSet: StableChangeSet) {
    // Process through transaction detector
    const txResult = this.transactionDetector.processChangeSet(changeSet);
    
    if (txResult.isTransaction && !txResult.isComplete) {
      // Transaction in progress, wait for completion
      console.log(`[Watchdog] Transaction in progress (${changeSet.files.size} files), waiting...`);
      return;
    }
    
    // Transaction complete or not a transaction, trigger RECON
    const fileCount = txResult.transaction 
      ? txResult.transaction.files.size 
      : changeSet.files.size;
    
    console.log(`[Watchdog] Triggering incremental RECON for ${fileCount} file(s)`);
    
    try {
      await this.triggerIncrementalRecon();
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Trigger incremental RECON
   */
  private async triggerIncrementalRecon() {
    const startTime = Date.now();
    
    try {
      await runIncrementalRecon(this.options.projectRoot);
      
      const duration = Date.now() - startTime;
      this.stats.reconRuns++;
      this.stats.lastReconTime = duration;
      this.stats.queueSize = 0;
      
      console.log(`[Watchdog] Incremental RECON completed in ${duration}ms`);
      
      // Notify listeners
      this.emit('recon-complete', { duration, type: 'incremental' });
      
      // Call callback if provided
      if (this.options.onReconComplete) {
        await this.options.onReconComplete();
      }
    } catch (error) {
      console.error('[Watchdog] Incremental RECON failed:', error);
      throw error;
    }
  }
  
  /**
   * Trigger full reconciliation (periodic or manual)
   */
  private async triggerFullReconciliation() {
    console.log('[Watchdog] Triggering periodic full reconciliation');
    
    const startTime = Date.now();
    
    try {
      await runIncrementalRecon(this.options.projectRoot, { fallbackToFull: true });
      
      const duration = Date.now() - startTime;
      console.log(`[Watchdog] Full reconciliation completed in ${duration}ms`);
      
      this.emit('recon-complete', { duration, type: 'full' });
      
      if (this.options.onReconComplete) {
        await this.options.onReconComplete();
      }
    } catch (error) {
      console.error('[Watchdog] Full reconciliation failed:', error);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Handle error
   */
  private handleError(error: Error) {
    console.error('[Watchdog] Error:', error);
    this.emit('error', error);
    
    if (this.options.onError) {
      this.options.onError(error);
    }
  }
  
  /**
   * Get current stats
   */
  getStats(): WatchdogStats {
    return { ...this.stats };
  }
  
  /**
   * Check if watchdog is running
   */
  isRunning(): boolean {
    return this.stats.isWatching;
  }
}



