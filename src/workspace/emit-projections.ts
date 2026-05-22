/**
 * Materializes deterministic workspace graph projections to disk after
 * workspace recon completes. Projections are pure derived artifacts
 * (E-ADR-001 S5.4) -- always regenerated, never hand-edited.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { loadWorkspaceGraph } from './workspace-graph-loader.js';
import { systemDependencies, componentIntegration } from './canned-queries.js';
import type { SystemDependencyResult, ComponentIntegrationResult } from './canned-queries.js';
import { toMermaid, toTable } from './projections.js';
import type { WorkspaceManifest } from './manifest.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProjectionEmitResult {
  fileCount: number;
  filePaths: string[];
}

// ---------------------------------------------------------------------------
// Markdown rendering helpers
// ---------------------------------------------------------------------------

function tableToMarkdown(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return '*No data.*\n';
  const cols = Object.keys(rows[0]!);
  const header = `| ${cols.join(' | ')} |`;
  const separator = `| ${cols.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${cols.map(c => r[c] ?? '').join(' | ')} |`).join('\n');
  return `${header}\n${separator}\n${body}\n`;
}

function mermaidBlock(mermaid: string): string {
  return `\`\`\`mermaid\n${mermaid}\n\`\`\`\n`;
}

// ---------------------------------------------------------------------------
// Individual projection renderers
// ---------------------------------------------------------------------------

function renderSystemDependencies(result: SystemDependencyResult): string {
  const lines: string[] = [
    '# System Dependencies',
    '',
    `> Auto-generated from workspace graph. ${result.repos.length} repos, ${result.dependencies.length} cross-repo dependencies.`,
    '',
    '## Dependency Diagram',
    '',
    mermaidBlock(toMermaid(result)),
    '## Dependency Table',
    '',
    tableToMarkdown(toTable(result)),
  ];
  return lines.join('\n');
}

function renderComponentIntegration(
  result: ComponentIntegrationResult,
  title: string,
): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `> Scope: ${result.scope}. ${result.summary.totalComponents} components, ${result.summary.totalEdges} edges.`,
    '',
    '## Integration Diagram',
    '',
    mermaidBlock(toMermaid(result)),
    '## Integration Table',
    '',
  ];

  const rows = toTable(result);
  if (rows.length === 0) {
    lines.push('*No components found.*\n');
  } else {
    lines.push(tableToMarkdown(rows));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Skeleton assembly
// ---------------------------------------------------------------------------

function renderRepoSummaryTable(
  sysDeps: SystemDependencyResult,
): string {
  const header = '| Repository | Node Types |';
  const sep = '| --- | --- |';
  const rows = sysDeps.repos
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(r => {
      const types = Object.entries(r.nodeTypes)
        .map(([t, c]) => `${t}: ${c}`)
        .join(', ');
      return `| ${r.name} | ${types} |`;
    });
  return `${header}\n${sep}\n${rows.join('\n')}\n`;
}

function assembleSkeleton(
  sysDeps: SystemDependencyResult,
  wsIntegration: ComponentIntegrationResult,
  perRepoResults: Array<{ repo: string; result: ComponentIntegrationResult }>,
  generatedAt: string,
): string {
  const lines: string[] = [
    '# Architecture Overview',
    '',
    `*Generated from the workspace semantic graph on ${generatedAt}.*`,
    '',
    '---',
    '',
    '<!-- LLM-ENRICHMENT: system-context -->',
    '',
    '## Workspace Repo Summary',
    '',
    renderRepoSummaryTable(sysDeps),
    '## System Dependencies',
    '',
    mermaidBlock(toMermaid(sysDeps)),
    '## Component Integration (Workspace)',
    '',
    mermaidBlock(toMermaid(wsIntegration)),
  ];

  for (const { repo, result } of perRepoResults) {
    lines.push(`## ${repo}`, '');
    lines.push(`<!-- LLM-ENRICHMENT: narrative-${repo} -->`, '');

    if (result.summary.totalComponents === 0) {
      lines.push('*No components found.*', '');
    } else {
      lines.push(mermaidBlock(toMermaid(result)));
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function emitProjections(
  outputDir: string,
  manifest: WorkspaceManifest,
): Promise<ProjectionEmitResult> {
  const resolved = path.resolve(outputDir);
  const projectionsDir = path.join(resolved, 'projections');
  await fs.mkdir(projectionsDir, { recursive: true });

  const graph = await loadWorkspaceGraph(resolved);

  const sysDeps = systemDependencies(graph);
  const wsIntegration = componentIntegration(graph);

  const perRepoResults: Array<{ repo: string; result: ComponentIntegrationResult }> = [];
  for (const repo of manifest.repos) {
    const result = componentIntegration(graph, { repo: repo.name });
    perRepoResults.push({ repo: repo.name, result });
  }

  const filePaths: string[] = [];

  const sysDepsPath = path.join(projectionsDir, 'system-dependencies.md');
  await fs.writeFile(sysDepsPath, renderSystemDependencies(sysDeps), 'utf-8');
  filePaths.push(sysDepsPath);

  const wsIntPath = path.join(projectionsDir, 'component-integration.md');
  await fs.writeFile(wsIntPath, renderComponentIntegration(wsIntegration, 'Component Integration (Workspace)'), 'utf-8');
  filePaths.push(wsIntPath);

  for (const { repo, result } of perRepoResults) {
    const repoPath = path.join(projectionsDir, `component-integration-${repo}.md`);
    await fs.writeFile(repoPath, renderComponentIntegration(result, `Component Integration: ${repo}`), 'utf-8');
    filePaths.push(repoPath);
  }

  const generatedAt = new Date().toISOString().split('T')[0]!;
  const skeletonPath = path.join(projectionsDir, 'architecture-overview.md');
  await fs.writeFile(
    skeletonPath,
    assembleSkeleton(sysDeps, wsIntegration, perRepoResults, generatedAt),
    'utf-8',
  );
  filePaths.push(skeletonPath);

  return { fileCount: filePaths.length, filePaths };
}
