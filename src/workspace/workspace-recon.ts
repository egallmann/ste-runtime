/**
 * Orchestrates RECON across all repositories declared in a workspace manifest.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedConfig } from '../config/index.js';
import { executeRecon } from '../recon/index.js';
import { discoverFilesFromConfig } from '../recon/phases/discovery.js';
import { log } from '../utils/logger.js';
import { PhaseTimer, repoLimiter } from '../utils/concurrency.js';
import { buildPerRepoConfig, parseWorkspaceManifest, resolveRepoPath } from './manifest.js';
import { emitWorkspaceSlice } from './slice-emitter.js';
import { computeSourceHash, readSentinel, writeSentinel } from './repo-sentinel.js';
import type { RepoSourceFingerprintRow } from './repo-sentinel.js';
import { emitWorkspaceIndex, type RepoIndexEntry } from './workspace-index.js';

export interface WorkspaceReconOptions {
  workspacePath: string;
  mode: 'incremental' | 'full';
  runtimeDir: string;
  failOnAnyError?: boolean;
  skipUnchanged?: boolean;
  timeoutPerRepoMs?: number;
}

export interface RepoResult {
  name: string;
  status: 'success' | 'failed' | 'skipped' | 'timed_out';
  slicePath?: string;
  contentHash?: string;
  error?: { stage: string; message: string; file?: string };
  reconResult?: import('../recon/index.js').ReconResult;
  nodeCount?: number;
  edgeCount?: number;
}

export interface WorkspaceReconResult {
  success: boolean;
  repos: RepoResult[];
  workspaceIndexPath: string;
}

function normalizeOutputDir(raw: string): string {
  const t = raw.trim().replace(/[/\\]+$/, '');
  return t.length > 0 ? t : '.ste-workspace';
}

function repoStateSentinelPath(workspaceRoot: string, outputRel: string, repoName: string): string {
  return path.join(workspaceRoot, outputRel, 'state', repoName, 'recon-run-sentinel.json');
}

async function loadRuntimeVersion(runtimeDir: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(runtimeDir, 'package.json'), 'utf-8');
    const j = JSON.parse(raw) as { version?: string };
    return typeof j.version === 'string' ? j.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function collectRepoSourceFingerprints(config: ResolvedConfig): Promise<RepoSourceFingerprintRow[]> {
  const discovered = await discoverFilesFromConfig(config);
  const rows: RepoSourceFingerprintRow[] = [];
  for (const f of discovered) {
    try {
      const st = await fs.stat(f.path);
      rows.push({
        relativePath: f.relativePath,
        mtimeMs: Math.trunc(st.mtimeMs),
        size: st.size,
      });
    } catch {
      /* skip missing */
    }
  }
  return rows;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function heartbeatCompletionLine(status: RepoResult['status'], name: string, elapsedMs: number): string {
  if (status === 'skipped') {
    return `[RECON] ⏭ ${name}: skipped (unchanged) ${elapsedMs.toFixed(0)}ms\n`;
  }
  const glyph = status === 'success' ? '✓' : '✗';
  return `[RECON] ${glyph} ${name}: ${elapsedMs.toFixed(0)}ms\n`;
}

function toRepoIndexEntries(repos: RepoResult[]): RepoIndexEntry[] {
  return repos.map(r => {
    if (r.status === 'success') {
      return {
        name: r.name,
        status: 'success',
        slice: r.slicePath,
        content_hash: r.contentHash,
      };
    }
    if (r.status === 'skipped') {
      return {
        name: r.name,
        status: 'skipped',
      };
    }
    return {
      name: r.name,
      status: 'failed',
      error: r.error,
    };
  });
}

function repoIsFailure(r: RepoResult): boolean {
  return r.status === 'failed' || r.status === 'timed_out';
}

/**
 * Run RECON once per repository in manifest order; write slices and workspace index at workspace root.
 */
export async function executeWorkspaceRecon(options: WorkspaceReconOptions): Promise<WorkspaceReconResult> {
  const wsTimer = new PhaseTimer('Workspace Orchestration');
  wsTimer.start();

  const runtimeVersion = await loadRuntimeVersion(options.runtimeDir);

  const { manifest, workspaceRoot } = await parseWorkspaceManifest(options.workspacePath);
  const outputRel = normalizeOutputDir(manifest.output_dir).replace(/\\/g, '/');
  const outputRoot = path.resolve(workspaceRoot, outputRel);

  await fs.mkdir(path.join(outputRoot, 'slices'), { recursive: true });
  await fs.mkdir(path.join(outputRoot, 'state'), { recursive: true });

  const total = manifest.repos.length;

  const repos: RepoResult[] = await Promise.all(
    manifest.repos.map((repo, idx) =>
      repoLimiter(async (): Promise<RepoResult> => {
        const startMs = nowMs();
        const elapsedMs = () => nowMs() - startMs;

        process.stdout.write(`[RECON] Processing repo (${idx + 1}/${total}): ${repo.name}...\n`);

        try {
          const repoAbs = await resolveRepoPath(workspaceRoot, repo);
          const config = await buildPerRepoConfig(options.runtimeDir, repo, workspaceRoot, outputRel);
          const sentinelAbs = repoStateSentinelPath(workspaceRoot, outputRel, repo.name);

          if (options.skipUnchanged) {
            const sentinel = await readSentinel(sentinelAbs);
            if (sentinel) {
              const fingerprintRows = await collectRepoSourceFingerprints(config);
              const hashNow = computeSourceHash(fingerprintRows);
              if (sentinel.source_hash === hashNow && sentinel.recon_version === runtimeVersion) {
                process.stdout.write(heartbeatCompletionLine('skipped', repo.name, elapsedMs()));
                return { name: repo.name, status: 'skipped' };
              }
            }
          }

          const runRepoWork = async (): Promise<RepoResult> => {
            const reconResult = await executeRecon({
              projectRoot: config.projectRoot,
              sourceRoot: config.sourceDirs[0] ?? '.',
              stateRoot: config.stateDir,
              mode: options.mode,
              config,
            });
            if (!reconResult.success) {
              const message =
                reconResult.errors.length > 0 ? reconResult.errors.join('; ') : 'RECON reported success: false';
              return {
                name: repo.name,
                status: 'failed',
                error: { stage: 'recon', message },
                reconResult,
              };
            }
            const stateAbs = path.resolve(workspaceRoot, outputRel, 'state', repo.name);
            const sliceAbs = path.join(outputRoot, 'slices', `${repo.name}.yaml`);
            const sliceRel = `slices/${repo.name}.yaml`;
            const emit = await emitWorkspaceSlice(repo.name, stateAbs, sliceAbs, repoAbs, manifest.external_systems);
            const result: RepoResult = {
              name: repo.name,
              status: 'success',
              slicePath: sliceRel,
              contentHash: emit.contentHash,
              reconResult,
              nodeCount: emit.nodeCount,
              edgeCount: emit.edgeCount,
            };
            const fingerprintRows = await collectRepoSourceFingerprints(config);
            const hashNow = computeSourceHash(fingerprintRows);
            await writeSentinel(sentinelAbs, {
              schema_version: '1.0',
              source_hash: hashNow,
              recon_version: runtimeVersion,
              generated_at: new Date().toISOString(),
            });
            return result;
          };

          let result: RepoResult;
          const timeoutMs = options.timeoutPerRepoMs ?? 0;
          if (timeoutMs > 0) {
            try {
              result = await Promise.race([
                runRepoWork(),
                new Promise<never>((_, reject) => {
                  const t = setTimeout(() => reject(new Error('repo-timeout')), timeoutMs);
                  t.unref();
                }),
              ]);
            } catch (e) {
              if (e instanceof Error && e.message === 'repo-timeout') {
                process.stderr.write(
                  `[RECON] Repo ${repo.name} timed out after ${timeoutMs}ms; subprocess or async work may still complete (no SIGKILL).\n`,
                );
                process.stdout.write(heartbeatCompletionLine('timed_out', repo.name, elapsedMs()));
                return {
                  name: repo.name,
                  status: 'timed_out',
                  error: {
                    stage: 'timeout',
                    message: `Repo ${repo.name} timed out after ${timeoutMs}ms`,
                  },
                };
              }
              throw e;
            }
          } else {
            result = await runRepoWork();
          }

          process.stdout.write(heartbeatCompletionLine(result.status, repo.name, elapsedMs()));
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log(`[workspace-recon] repo ${repo.name} failed: ${message}`);
          process.stdout.write(heartbeatCompletionLine('failed', repo.name, elapsedMs()));
          return {
            name: repo.name,
            status: 'failed',
            error: { stage: 'workspace', message },
          };
        }
      }),
    ),
  );

  const anySuccess = repos.some(r => r.status === 'success' || r.status === 'skipped');

  const allSuccess = repos.every(r => !repoIsFailure(r));
  const failedRepos = repos.filter(repoIsFailure);
  const success = options.failOnAnyError ? allSuccess : anySuccess;

  if (options.failOnAnyError && failedRepos.length > 0) {
    log(
      `[workspace-recon] --fail-on-any-error: ${failedRepos.length}/${repos.length} repos failed. ` +
        `Failed: ${failedRepos.map(r => r.name).join(', ')}`,
    );
  }

  const generatedAt = new Date().toISOString();
  await emitWorkspaceIndex(toRepoIndexEntries(repos), outputRoot, generatedAt);
  const workspaceIndexPath = path.join(outputRoot, 'workspace-index.yaml');

  const wsTiming = wsTimer.stop(repos.length);
  log(
    `[workspace-recon] Orchestration: ${wsTiming.durationMs.toFixed(1)}ms ` +
      `(${repos.length} repos, ${wsTiming.throughput.toFixed(1)} repos/sec)`,
  );

  return {
    success,
    repos,
    workspaceIndexPath,
  };
}
