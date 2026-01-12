/**
 * Update Coordinator - Generation-Based Update Tracking
 * 
 * Prevents cascading infinite loops by tracking entire update batches
 * and their affected slices, allowing the watchdog to ignore transitive
 * updates (e.g., slices updated during inference phase).
 * 
 * Part of E-ADR-007 Phase 1: Critical Safeguards
 */

import path from 'node:path';

interface UpdateBatch {
  generation: number;
  sourceFiles: Set<string>;
  affectedSlices: Set<string>;
  startTime: number;
  endTime?: number;
}

/**
 * Coordinates RECON updates to prevent cascading loops
 */
export class UpdateCoordinator {
  private activeUpdates: Map<number, UpdateBatch> = new Map();
  private currentGeneration: number = 0;

  /**
   * Start a new update batch
   * Returns the generation number for this batch
   */
  startUpdate(sourceFiles: string[]): number {
    this.currentGeneration++;

    this.activeUpdates.set(this.currentGeneration, {
      generation: this.currentGeneration,
      sourceFiles: new Set(sourceFiles.map((f) => path.resolve(f))),
      affectedSlices: new Set(),
      startTime: Date.now(),
    });

    return this.currentGeneration;
  }

  /**
   * Record that this update batch wrote a slice
   */
  recordSliceWrite(generation: number, sliceFilepath: string): void {
    const batch = this.activeUpdates.get(generation);
    if (batch) {
      batch.affectedSlices.add(path.resolve(sliceFilepath));
    }
  }

  /**
   * Complete an update batch
   * Keeps the batch for a short window to handle delayed events
   */
  completeUpdate(generation: number): void {
    const batch = this.activeUpdates.get(generation);
    if (batch) {
      batch.endTime = Date.now();

      // Keep for 5 seconds, then cleanup
      setTimeout(() => {
        this.activeUpdates.delete(generation);
      }, 5000);
    }
  }

  /**
   * Check if a slice change is from an active update
   * Returns true if this slice is part of an active or recently completed update
   */
  isFromActiveUpdate(sliceFilepath: string): boolean {
    const normalizedPath = path.resolve(sliceFilepath);

    for (const batch of this.activeUpdates.values()) {
      // Still active (no endTime) or recently completed (within 2 second window)
      const isActive = !batch.endTime || Date.now() - batch.endTime < 2000;

      if (isActive && batch.affectedSlices.has(normalizedPath)) {
        return true; // This slice change is from our update
      }
    }

    return false; // External change
  }

  /**
   * Get the current generation number
   */
  getCurrentGeneration(): number {
    return this.currentGeneration;
  }

  /**
   * Get statistics about active updates
   */
  getStats(): {
    activeUpdates: number;
    totalGenerations: number;
    oldestActiveStartTime: number | null;
  } {
    const activeBatches = Array.from(this.activeUpdates.values());
    return {
      activeUpdates: activeBatches.length,
      totalGenerations: this.currentGeneration,
      oldestActiveStartTime:
        activeBatches.length > 0 ? Math.min(...activeBatches.map((b) => b.startTime)) : null,
    };
  }

  /**
   * Clear all updates (useful for testing)
   */
  clear(): void {
    this.activeUpdates.clear();
    this.currentGeneration = 0;
  }
}

// Singleton instance
export const updateCoordinator = new UpdateCoordinator();



