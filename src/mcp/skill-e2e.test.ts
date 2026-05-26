/**
 * Workspace-Recon Skill E2E Test Suite
 *
 * Three-tier validation:
 *   Tier 1: MCP tool integration against fixtures/python-sample
 *   Tier 2: Skill trigger accuracy (keyword matching on SKILL.md description)
 *   Tier 3: Full workflow simulation (chained tool sequences)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { initRssContext, type RssContext } from '../rss/rss-operations.js';
import { runFullRecon } from '../recon/full-recon.js';
import {
  find,
  show,
  overview,
  diagnose,
  usages,
  impact,
  similar,
  refresh,
} from './tools-optimized.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures');
const TEST_PROJECT = path.join(FIXTURES_DIR, 'python-sample');
const STATE_DIR = path.join(TEST_PROJECT, '.ste/state');

let ctx: RssContext;

beforeAll(async () => {
  await runFullRecon(TEST_PROJECT, STATE_DIR);
  ctx = await initRssContext(STATE_DIR);
});

// =============================================================================
// Tier 1: MCP Tool Integration
// =============================================================================

describe('Tier 1: MCP Tool Integration', () => {
  it('overview returns domains with entry points', async () => {
    const result = await overview(ctx, {});

    expect(result.domains).toBeDefined();
    expect(Object.keys(result.domains).length).toBeGreaterThan(0);
    expect(result.domains['api']).toBeDefined();
    expect(result.domains['api'].components).toBeGreaterThan(0);
    expect(result.meta.queryTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('find returns matches with source for query "user"', async () => {
    const result = await find(ctx, { query: 'user', maxResults: 5 });

    expect(result.matches.length).toBeGreaterThan(0);
    const firstMatch = result.matches[0];
    expect(firstMatch.key).toBeDefined();
    expect(firstMatch.file).toBeDefined();
    expect(firstMatch.type).toBeDefined();
    expect(firstMatch.domain).toBeDefined();
    expect(result.meta.queryTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('show returns component for known endpoint key', async () => {
    const result = await show(ctx, { target: 'api/endpoint/api-GET-api-users' });

    expect(result.found).toBe(true);
    expect(result.component).toBeDefined();
    expect(result.component!.key).toContain('api');
    expect(result.meta.nodesTraversed).toBeGreaterThan(0);
  });

  it('usages returns results for a known module', async () => {
    const result = await usages(ctx, { target: 'graph/module/module-app-api' });

    expect(result.found).toBe(true);
    expect(result.meta.queryTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('impact returns blast radius for a data entity', async () => {
    const result = await impact(ctx, { target: 'data/entity/data-User' });

    expect(result.found).toBe(true);
    expect(result.meta.queryTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('similar returns without error for pattern query', async () => {
    const result = await similar(ctx, { target: 'endpoint', maxResults: 5 });

    expect(result).toBeDefined();
    expect(result.meta.queryTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('diagnose returns health status with node count', async () => {
    const result = await diagnose(ctx, { mode: 'health' });

    expect(result.healthy).toBeDefined();
    expect(result.details.nodeCount).toBeGreaterThan(0);
    expect(result.details.edgeCount).toBeGreaterThanOrEqual(0);
    expect(result.summary).toBeTruthy();
  });

  it('refresh completes without error using mock callback', async () => {
    const mockTrigger = async () => ({ success: true, message: 'mock refresh' });
    const result = await refresh(ctx, { scope: 'full' }, mockTrigger);

    expect(result.success).toBe(true);
    expect(result.message).toBe('mock refresh');
  });
});

// =============================================================================
// Tier 2: Skill Trigger Accuracy
// =============================================================================

describe('Tier 2: Skill Trigger Accuracy', () => {
  let skillDescription: string;

  beforeAll(async () => {
    const skillPath = path.resolve(__dirname, '../../.cursor/skills/workspace-recon/SKILL.md');
    const content = await fs.readFile(skillPath, 'utf-8');
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const descMatch = frontmatterMatch![1].match(/description:\s*"([^"]+)"/);
    expect(descMatch).not.toBeNull();
    skillDescription = descMatch![1].toLowerCase();
  });

  function promptMatchesDescription(prompt: string): boolean {
    const words = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const matchCount = words.filter(w => skillDescription.includes(w)).length;
    return matchCount >= Math.ceil(words.length * 0.4);
  }

  const shouldTrigger = [
    'run full workspace recon',
    'what is in this project',
    'explore the codebase',
    'what repos are here',
    'orient me to this workspace',
    'workspace recon',
  ];

  const shouldNotTrigger = [
    'fix the bug in auth.py',
    'write a unit test for UserService',
    'deploy to AWS',
    'create a new React component',
  ];

  it.each(shouldTrigger)('should trigger on: "%s"', (prompt) => {
    expect(promptMatchesDescription(prompt)).toBe(true);
  });

  it.each(shouldNotTrigger)('should NOT trigger on: "%s"', (prompt) => {
    expect(promptMatchesDescription(prompt)).toBe(false);
  });
});

// =============================================================================
// Tier 3: Full Workflow Simulation
// =============================================================================

describe('Tier 3: Full Workflow Simulation', () => {
  describe('Workflow A: Full Recon (overview -> diagnose -> find -> show)', () => {
    it('executes the complete recon workflow end-to-end', async () => {
      const overviewResult = await overview(ctx, {});
      expect(Object.keys(overviewResult.domains).length).toBeGreaterThan(0);

      const diagnoseResult = await diagnose(ctx, { mode: 'health' });
      expect(diagnoseResult.details.nodeCount).toBeGreaterThan(0);

      const findResult = await find(ctx, { query: 'user' });
      expect(findResult.matches.length).toBeGreaterThan(0);

      const targetKey = findResult.matches[0].key;
      const showResult = await show(ctx, { target: targetKey });
      expect(showResult.found).toBe(true);
      expect(showResult.component).toBeDefined();
    });
  });

  describe('Workflow B: Pre-Change Impact (find -> impact -> usages)', () => {
    it('executes the impact analysis workflow end-to-end', async () => {
      const findResult = await find(ctx, { query: 'user_service' });
      expect(findResult.matches.length).toBeGreaterThan(0);

      const targetKey = findResult.matches[0].key;

      const impactResult = await impact(ctx, { target: targetKey });
      expect(impactResult.found).toBe(true);

      const usagesResult = await usages(ctx, { target: targetKey });
      expect(usagesResult.found).toBe(true);
    });
  });

  describe('Workflow C: Pattern Discovery (similar -> find -> show)', () => {
    it('executes the pattern discovery workflow end-to-end', async () => {
      const similarResult = await similar(ctx, { target: 'API endpoint' });
      expect(similarResult).toBeDefined();

      const findResult = await find(ctx, { query: 'endpoint' });
      expect(findResult.matches.length).toBeGreaterThan(0);

      const targetKey = findResult.matches[0].key;
      const showResult = await show(ctx, { target: targetKey, depth: 2 });
      expect(showResult.found).toBe(true);
    });
  });
});
