/**
 * Structured benchmark report for workspace RECON runs.
 */

import type { PhaseTimingRecord } from '../utils/concurrency.js';
import type { ReconResult } from '../recon/index.js';
import type { WorkspaceReconResult, RepoResult } from '../workspace/workspace-recon.js';

export const BENCHMARK_SCHEMA_VERSION = '1.0';

export interface PhaseBenchmarkEntry {
  phase: string;
  duration_ms: number;
  item_count: number;
  throughput_items_per_sec: number;
}

export interface SliceChurnBenchmark {
  created: number;
  modified: number;
  deleted: number;
  unchanged: number;
}

export interface RepoBenchmarkEntry {
  name: string;
  status: RepoResult['status'];
  wall_ms: number | null;
  graph: { nodes: number; edges: number };
  slice_churn: SliceChurnBenchmark;
  phases: PhaseBenchmarkEntry[];
  phase_total_measured_ms: number;
  error?: { stage: string; message: string };
}

export interface SelfPassBenchmarkEntry {
  wall_ms: number;
  success: boolean;
  slice_churn: SliceChurnBenchmark;
  phases: PhaseBenchmarkEntry[];
  phase_total_measured_ms: number;
}

export interface WorkspaceReconBenchmarkReport {
  schema_version: string;
  kind: 'workspace-recon-benchmark';
  generated_at: string;
  ste_runtime_version: string;
  mode: 'incremental' | 'full';
  wall_clock_ms: {
    workspace_pass: number;
    self_pass: number | null;
    total: number;
  };
  orchestration: {
    duration_ms: number;
    repo_count: number;
    throughput_repos_per_sec: number;
  } | null;
  workspace: {
    success: boolean;
    repos_succeeded: number;
    repos_failed: number;
    repos_skipped: number;
    graph_nodes: number;
    graph_edges: number;
    slice_churn: SliceChurnBenchmark;
    projections: number | null;
    multi_res_projections: number | null;
    workspace_index_path: string;
  };
  repos: RepoBenchmarkEntry[];
  self_pass: SelfPassBenchmarkEntry | null;
}

export function phasesToBenchmarkEntries(
  timings: PhaseTimingRecord[] | undefined,
): PhaseBenchmarkEntry[] {
  if (!timings) {
    return [];
  }
  return timings.map(t => ({
    phase: t.phase,
    duration_ms: roundMs(t.durationMs),
    item_count: t.itemCount,
    throughput_items_per_sec: roundThroughput(t.throughput),
  }));
}

export function phaseTotalMeasuredMs(timings: PhaseTimingRecord[] | undefined): number {
  if (!timings || timings.length === 0) {
    return 0;
  }
  return roundMs(timings.reduce((sum, t) => sum + t.durationMs, 0));
}

export function sliceChurnFromRecon(recon: ReconResult | undefined): SliceChurnBenchmark {
  return {
    created: recon?.aiDocCreated ?? 0,
    modified: recon?.aiDocModified ?? 0,
    deleted: recon?.aiDocDeleted ?? 0,
    unchanged: recon?.aiDocUnchanged ?? 0,
  };
}

function repoBenchmarkEntry(repo: RepoResult): RepoBenchmarkEntry {
  const entry: RepoBenchmarkEntry = {
    name: repo.name,
    status: repo.status,
    wall_ms: repo.durationMs != null ? roundMs(repo.durationMs) : null,
    graph: {
      nodes: repo.nodeCount ?? 0,
      edges: repo.edgeCount ?? 0,
    },
    slice_churn: sliceChurnFromRecon(repo.reconResult),
    phases: phasesToBenchmarkEntries(repo.reconResult?.timings),
    phase_total_measured_ms: phaseTotalMeasuredMs(repo.reconResult?.timings),
  };
  if (repo.error) {
    entry.error = { stage: repo.error.stage, message: repo.error.message };
  }
  return entry;
}

function aggregateWorkspaceSliceChurn(repos: RepoResult[]): SliceChurnBenchmark {
  const churn: SliceChurnBenchmark = { created: 0, modified: 0, deleted: 0, unchanged: 0 };
  for (const repo of repos) {
    if (repo.status !== 'success' || !repo.reconResult) {
      continue;
    }
    churn.created += repo.reconResult.aiDocCreated;
    churn.modified += repo.reconResult.aiDocModified;
    churn.deleted += repo.reconResult.aiDocDeleted;
    churn.unchanged += repo.reconResult.aiDocUnchanged;
  }
  return churn;
}

export function buildWorkspaceReconBenchmarkReport(params: {
  wsResult: WorkspaceReconResult;
  mode: 'incremental' | 'full';
  steRuntimeVersion: string;
  wallClockMs: {
    workspacePass: number;
    selfPass: number | null;
    total: number;
  };
  selfResult: ReconResult | null;
}): WorkspaceReconBenchmarkReport {
  const { wsResult } = params;
  const succeeded = wsResult.repos.filter(r => r.status === 'success');
  const failed = wsResult.repos.filter(r => r.status === 'failed' || r.status === 'timed_out');
  const skipped = wsResult.repos.filter(r => r.status === 'skipped');

  const graphNodes = succeeded.reduce((sum, r) => sum + (r.nodeCount ?? 0), 0);
  const graphEdges = succeeded.reduce((sum, r) => sum + (r.edgeCount ?? 0), 0);

  const orchestration = wsResult.orchestrationTiming
    ? {
        duration_ms: roundMs(wsResult.orchestrationTiming.durationMs),
        repo_count: wsResult.orchestrationTiming.itemCount,
        throughput_repos_per_sec: roundThroughput(wsResult.orchestrationTiming.throughput),
      }
    : null;

  let selfPass: SelfPassBenchmarkEntry | null = null;
  if (params.selfResult && params.wallClockMs.selfPass != null) {
    selfPass = {
      wall_ms: roundMs(params.wallClockMs.selfPass),
      success: params.selfResult.success,
      slice_churn: sliceChurnFromRecon(params.selfResult),
      phases: phasesToBenchmarkEntries(params.selfResult.timings),
      phase_total_measured_ms: phaseTotalMeasuredMs(params.selfResult.timings),
    };
  }

  return {
    schema_version: BENCHMARK_SCHEMA_VERSION,
    kind: 'workspace-recon-benchmark',
    generated_at: new Date().toISOString(),
    ste_runtime_version: params.steRuntimeVersion,
    mode: params.mode,
    wall_clock_ms: {
      workspace_pass: roundMs(params.wallClockMs.workspacePass),
      self_pass: params.wallClockMs.selfPass != null ? roundMs(params.wallClockMs.selfPass) : null,
      total: roundMs(params.wallClockMs.total),
    },
    orchestration,
    workspace: {
      success: wsResult.success,
      repos_succeeded: succeeded.length,
      repos_failed: failed.length,
      repos_skipped: skipped.length,
      graph_nodes: graphNodes,
      graph_edges: graphEdges,
      slice_churn: aggregateWorkspaceSliceChurn(wsResult.repos),
      projections: wsResult.projectionResult?.fileCount ?? null,
      multi_res_projections: wsResult.multiResProjectionResult?.fileCount ?? null,
      workspace_index_path: wsResult.workspaceIndexPath,
    },
    repos: wsResult.repos.map(repoBenchmarkEntry),
    self_pass: selfPass,
  };
}

export function formatBenchmarkJson(report: WorkspaceReconBenchmarkReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function printBenchmarkSummary(report: WorkspaceReconBenchmarkReport): void {
  console.log('');
  console.log('=== Workspace RECON Benchmark ===');
  console.log(`  Mode:              ${report.mode}`);
  console.log(`  Wall clock:        ${report.wall_clock_ms.total} ms total`);
  console.log(`                     ${report.wall_clock_ms.workspace_pass} ms workspace`);
  if (report.wall_clock_ms.self_pass != null) {
    console.log(`                     ${report.wall_clock_ms.self_pass} ms self-pass`);
  }
  if (report.orchestration) {
    console.log(
      `  Orchestration:     ${report.orchestration.duration_ms} ms ` +
        `(${report.orchestration.repo_count} repos, ` +
        `${report.orchestration.throughput_repos_per_sec} repos/sec)`,
    );
  }
  console.log(
    `  Service graph:     ${report.workspace.graph_nodes} nodes, ${report.workspace.graph_edges} edges`,
  );
  console.log(
    `  Slice churn:       +${report.workspace.slice_churn.created} ` +
      `~${report.workspace.slice_churn.modified} ` +
      `-${report.workspace.slice_churn.deleted} ` +
      `=${report.workspace.slice_churn.unchanged} unchanged`,
  );
  console.log('');
  console.log('  Per-repo wall time (slowest first):');
  const sorted = [...report.repos].sort((a, b) => (b.wall_ms ?? 0) - (a.wall_ms ?? 0));
  for (const repo of sorted) {
    const wall = repo.wall_ms != null ? `${repo.wall_ms} ms` : 'n/a';
    const phases =
      repo.phase_total_measured_ms > 0 ? ` (${repo.phase_total_measured_ms} ms phases)` : '';
    console.log(`    ${repo.name.padEnd(28)} ${wall.padStart(8)}  ${repo.status}${phases}`);
  }
  if (report.self_pass) {
    console.log('');
    console.log(
      `  Self-pass:         ${report.self_pass.wall_ms} ms wall, ` +
        `${report.self_pass.phase_total_measured_ms} ms phases`,
    );
  }
  console.log('=================================');
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundThroughput(value: number): number {
  return Math.round(value * 10) / 10;
}
