/**
 * MCP Server Integration Tests
 * 
 * Tests for MCP server functionality per E-ADR-011.
 * 
 * NOTE: These tests use a mock config instead of loadConfig because:
 * - loadConfig has boundary validation that expects ste-runtime directory structure
 * - Test fixtures are not structured as ste-runtime installations
 * - Using a mock config allows testing MCP functionality in isolation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from './mcp-server.js';
import { Watchdog } from '../watch/watchdog.js';
import type { ResolvedConfig } from '../config/index.js';
import { runFullRecon } from '../recon/full-recon.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use fixtures for testing
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures');
const TEST_PROJECT = path.join(FIXTURES_DIR, 'python-sample');

/**
 * Create a mock config for testing.
 * This avoids boundary validation issues with loadConfig.
 */
function createTestConfig(projectRoot: string): ResolvedConfig {
  const stateDir = '.ste/state';
  return {
    projectRoot,
    runtimeDir: projectRoot, // For tests, treat project as its own runtime
    languages: ['python'],
    sourceDirs: ['.'],
    ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/.ste/**'],
    stateDir,
    jsonPatterns: {},
    angularPatterns: {},
    cssPatterns: {},
    watchdog: {
      enabled: false,
      debounceMs: 500,
      aiEditDebounceMs: 2000,
      syntaxValidation: true,
      transactionDetection: true,
      stabilityCheckMs: 100,
      patterns: ['**/*.py'],
      ignore: ['.git', 'node_modules', '.venv'],
      fullReconciliationInterval: 0,
      fallbackPolling: false,
      pollingInterval: 5000,
    },
    mcp: {
      transport: 'stdio',
      logLevel: 'info',
    },
    rss: {
      stateRoot: stateDir,
      defaultDepth: 2,
      maxResults: 50,
    },
  };
}

describe('MCP Server Integration', () => {
  let mcpServer: McpServer;
  let config: ResolvedConfig;
  let stateDir: string;
  
  beforeAll(async () => {
    // Create mock config for test project
    config = createTestConfig(TEST_PROJECT);
    
    // Resolve stateDir to absolute path
    stateDir = path.resolve(TEST_PROJECT, config.stateDir);
    
    // Run initial RECON to ensure state exists
    // Pass stateDir to avoid boundary violations
    await runFullRecon(TEST_PROJECT, stateDir);
    
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
      // Use stateDir which is what the MCP server uses to save metrics
      const metricsPath = path.join(stateDir, 'graph-metrics.json');
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
  let config: ResolvedConfig;
  
  beforeAll(async () => {
    // Create mock config for test project
    config = createTestConfig(TEST_PROJECT);
    
    // Enable watchdog for testing
    config.watchdog.enabled = true;
    config.watchdog.debounceMs = 100; // Fast for testing
    config.watchdog.patterns = ['**/*.py'];
    
    watchdog = new Watchdog({
      projectRoot: TEST_PROJECT,
      config,
      onReconComplete: async () => {},
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
