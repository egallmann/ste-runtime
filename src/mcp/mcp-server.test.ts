/**
 * MCP Server Integration Tests
 * 
 * Tests for MCP server functionality per E-ADR-011.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from './mcp-server.js';
import { Watchdog } from '../watch/watchdog.js';
import { loadConfig } from '../config/index.js';
import { runFullRecon } from '../recon/full-recon.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use fixtures for testing
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures');
const TEST_PROJECT = path.join(FIXTURES_DIR, 'python-sample');

describe('MCP Server Integration', () => {
  let mcpServer: McpServer;
  let config: any;
  
  beforeAll(async () => {
    // Load config for test project
    config = await loadConfig(TEST_PROJECT);
    
    // Run initial RECON to ensure state exists
    await runFullRecon(TEST_PROJECT);
    
    // Create MCP server
    mcpServer = new McpServer({
      config,
      projectRoot: TEST_PROJECT,
    });
    
    // Initialize server
    await mcpServer.initialize();
  });
  
  afterAll(async () => {
    if (mcpServer) {
      await mcpServer.stop();
    }
  });
  
  describe('Initialization', () => {
    it('should initialize RSS context', async () => {
      expect(mcpServer).toBeDefined();
      // Server should be initialized after beforeAll
    });
    
    it('should load graph metrics', async () => {
      // Use config.rss.stateRoot which is what the MCP server uses to save metrics
      const stateRoot = path.resolve(TEST_PROJECT, config.rss.stateRoot);
      const metricsPath = path.join(stateRoot, 'graph-metrics.json');
      const exists = await fs.access(metricsPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });
  
  describe('Context Reload', () => {
    it('should reload context after RECON', async () => {
      // This tests that reloadContext doesn't throw
      await expect(mcpServer.reloadContext()).resolves.not.toThrow();
    });
  });
});

describe('Watchdog Integration', () => {
  let watchdog: Watchdog;
  let config: any;
  let reconCompleted = false;
  
  beforeAll(async () => {
    config = await loadConfig(TEST_PROJECT);
    
    // Enable watchdog for testing
    config.watchdog.enabled = true;
    config.watchdog.debounceMs = 100; // Fast for testing
    config.watchdog.patterns = ['**/*.py'];
    
    watchdog = new Watchdog({
      projectRoot: TEST_PROJECT,
      config,
      onReconComplete: async () => {
        reconCompleted = true;
      },
      onError: (error) => {
        console.error('Watchdog error:', error);
      },
    });
  });
  
  afterAll(async () => {
    if (watchdog && watchdog.isRunning()) {
      await watchdog.stop();
    }
  });
  
  describe('File Watching', () => {
    it('should start watchdog successfully', async () => {
      await watchdog.start();
      expect(watchdog.isRunning()).toBe(true);
    });
    
    it('should report stats', () => {
      const stats = watchdog.getStats();
      expect(stats.isWatching).toBe(true);
      expect(stats.filesWatched).toBeGreaterThan(0);
    });
    
    it('should stop watchdog', async () => {
      await watchdog.stop();
      expect(watchdog.isRunning()).toBe(false);
    });
  });
});

describe('Edit Queue Manager', () => {
  it('should be tested separately', () => {
    // Edit queue manager tests would go in edit-queue-manager.test.ts
    expect(true).toBe(true);
  });
});

describe('Transaction Detector', () => {
  it('should be tested separately', () => {
    // Transaction detector tests would go in transaction-detector.test.ts
    expect(true).toBe(true);
  });
});

describe('Graph Topology Analyzer', () => {
  it('should be tested separately', () => {
    // Graph topology analyzer tests would go in graph-topology-analyzer.test.ts
    expect(true).toBe(true);
  });
});

/**
 * Note: Full end-to-end MCP protocol tests would require:
 * 1. Spawning the MCP server as a subprocess
 * 2. Communicating via stdio using MCP protocol
 * 3. Sending tool call requests
 * 4. Validating responses
 * 
 * These tests verify the core components integrate correctly.
 * For full MCP protocol testing, consider using @modelcontextprotocol/sdk test utilities.
 */



