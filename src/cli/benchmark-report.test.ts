import { describe, it, expect } from 'vitest';
import type { PhaseTimingRecord } from '../utils/concurrency.js';
import type { ReconResult } from '../recon/index.js';
import type { WorkspaceReconResult } from '../workspace/workspace-recon.js';
import {
  BENCHMARK_SCHEMA_VERSION,
  buildWorkspaceReconBenchmarkReport,
  phaseTotalMeasuredMs,
  phasesToBenchmarkEntries,
  sliceChurnFromRecon,
} from './benchmark-report.js';

function makeRecon(overrides: Partial<ReconResult> = {}): ReconResult {
  return {
    success: true,
    conflictsDetected: 0,
    aiDocUpdated: 10,
    aiDocCreated: 4,
    aiDocModified: 6,
    aiDocDeleted: 1,
    aiDocUnchanged: 20,
    validationErrors: 0,
    validationWarnings: 0,
    validationInfo: 0,
    errors: [],
    warnings: [],
    timings: [
      {
        phase: 'Phase 2: Extraction',
        startMs: 0,
        endMs: 100,
        durationMs: 100,
        itemCount: 50,
        throughput: 500,
      },
      {
        phase: 'Phase 5: Population',
        startMs: 100,
        endMs: 600,
        durationMs: 500,
        itemCount: 50,
        throughput: 100,
      },
    ],
    ...overrides,
  };
}

function makeWorkspaceResult(overrides: Partial<WorkspaceReconResult> = {}): WorkspaceReconResult {
  return {
    success: true,
    workspaceIndexPath: '/tmp/.ste-workspace/workspace-index.yaml',
    orchestrationTiming: {
      phase: 'Workspace Orchestration',
      startMs: 0,
      endMs: 5000,
      durationMs: 5000,
      itemCount: 2,
      throughput: 0.4,
    },
    repos: [
      {
        name: 'repo-a',
        status: 'success',
        nodeCount: 3,
        edgeCount: 1,
        durationMs: 1200,
        reconResult: makeRecon(),
      },
      {
        name: 'repo-b',
        status: 'skipped',
        durationMs: 5,
      },
    ],
    projectionResult: { fileCount: 10, filePaths: [] },
    multiResProjectionResult: { fileCount: 18, filePaths: [] },
    ...overrides,
  };
}

describe('benchmark-report', () => {
  it('maps phase timings to benchmark entries', () => {
    const timings: PhaseTimingRecord[] = [
      {
        phase: 'Phase 2: Extraction',
        startMs: 0,
        endMs: 12.34,
        durationMs: 12.34,
        itemCount: 10,
        throughput: 810.37,
      },
    ];

    expect(phasesToBenchmarkEntries(timings)).toEqual([
      {
        phase: 'Phase 2: Extraction',
        duration_ms: 12.3,
        item_count: 10,
        throughput_items_per_sec: 810.4,
      },
    ]);
    expect(phaseTotalMeasuredMs(timings)).toBe(12.3);
  });

  it('builds workspace benchmark report with repo and self-pass sections', () => {
    const wsResult = makeWorkspaceResult();
    const selfResult = makeRecon({
      aiDocCreated: 1,
      aiDocModified: 2,
      aiDocDeleted: 0,
      aiDocUnchanged: 3,
    });

    const report = buildWorkspaceReconBenchmarkReport({
      wsResult,
      mode: 'full',
      steRuntimeVersion: '0.10.0-test',
      wallClockMs: {
        workspacePass: 5100,
        selfPass: 900,
        total: 6000,
      },
      selfResult,
    });

    expect(report.schema_version).toBe(BENCHMARK_SCHEMA_VERSION);
    expect(report.kind).toBe('workspace-recon-benchmark');
    expect(report.mode).toBe('full');
    expect(report.wall_clock_ms.total).toBe(6000);
    expect(report.orchestration).toEqual({
      duration_ms: 5000,
      repo_count: 2,
      throughput_repos_per_sec: 0.4,
    });
    expect(report.workspace.graph_nodes).toBe(3);
    expect(report.workspace.slice_churn.created).toBe(4);
    expect(report.repos).toHaveLength(2);
    expect(report.repos[0]?.phase_total_measured_ms).toBe(600);
    expect(report.self_pass?.slice_churn).toEqual(sliceChurnFromRecon(selfResult));
  });
});
