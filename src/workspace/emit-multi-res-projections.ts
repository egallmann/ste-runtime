/**
 * Emits multi-resolution projection files (L0-L3) alongside existing L4
 * projections. Each file includes YAML frontmatter with projection metadata
 * and a navigation bar linking all resolution levels.
 *
 * Wired into executeWorkspaceRecon as non-fatal post-processing.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { loadWorkspaceGraph } from './workspace-graph-loader.js';
import { systemDependencies, componentIntegration } from './canned-queries.js';
import type { ComponentIntegrationResult } from './canned-queries.js';
import { toMermaidAtResolution, toTableAtResolution, navigationBar } from './projections.js';
import { compress } from './compression.js';
import type { CompressedProjection, ResolutionLevel, ProjectionMetadata } from './compression.js';
import type { WorkspaceManifest } from './manifest.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MultiResEmitResult {
  fileCount: number;
  filePaths: string[];
}

// ---------------------------------------------------------------------------
// Frontmatter and markdown helpers
// ---------------------------------------------------------------------------

function yamlFrontmatter(meta: ProjectionMetadata, extras?: Record<string, string>): string {
  const lines: string[] = [
    '---',
    `projection_level: ${meta.level}`,
    `projection_family: ${meta.family}`,
    `projection_intent: "${meta.intent}"`,
    `source_query: ${meta.sourceQuery}`,
    `generation_timestamp: "${new Date().toISOString()}"`,
    `derivation: ${meta.derivation}`,
    `confidence: ${meta.confidence}`,
    `node_count: ${meta.nodeCount}`,
    `edge_count: ${meta.edgeCount}`,
    `compression_ratio: ${meta.compressionRatio}`,
    `generation_hash: "${meta.generationHash}"`,
  ];
  if (meta.drillDown) lines.push(`drill_down: "${meta.drillDown}"`);
  if (meta.drillUp) lines.push(`drill_up: "${meta.drillUp}"`);
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      lines.push(`${k}: "${v}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

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
// Render a single multi-res projection file
// ---------------------------------------------------------------------------

function renderProjection(
  title: string,
  description: string,
  projection: CompressedProjection,
  level: ResolutionLevel,
): string {
  const navBar = navigationBar(level);
  const frontmatter = yamlFrontmatter(projection.metadata);
  const mermaid = toMermaidAtResolution(projection);
  const table = toTableAtResolution(projection);

  const lines: string[] = [
    frontmatter,
    '',
    `# ${title}`,
    '',
    navBar,
    '',
    `> ${description}`,
    '',
    '## Diagram',
    '',
    mermaidBlock(mermaid),
    '## Summary Table',
    '',
    tableToMarkdown(table),
    '',
    navBar,
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function emitMultiResProjections(
  outputDir: string,
  manifest: WorkspaceManifest,
): Promise<MultiResEmitResult> {
  const resolved = path.resolve(outputDir);
  const projectionsDir = path.join(resolved, 'projections');
  await fs.mkdir(projectionsDir, { recursive: true });

  const graph = await loadWorkspaceGraph(resolved);
  const wsIntegration = componentIntegration(graph);

  const filePaths: string[] = [];

  const l0 = compress(wsIntegration, { level: 'L0' });
  l0.metadata.drillDown = 'service-topology-L1.md';
  const l0Path = path.join(projectionsDir, 'system-context-L0.md');
  await fs.writeFile(
    l0Path,
    renderProjection(
      'System Context (L0)',
      `${l0.metadata.nodeCount} system nodes. Cross-repo edges only.`,
      l0,
      'L0',
    ),
    'utf-8',
  );
  filePaths.push(l0Path);

  const l1 = compress(wsIntegration, { level: 'L1' });
  l1.metadata.drillUp = 'system-context-L0.md';
  l1.metadata.drillDown = 'capability-domains-L2.md';
  const l1Path = path.join(projectionsDir, 'service-topology-L1.md');
  await fs.writeFile(
    l1Path,
    renderProjection(
      'Service Topology (L1)',
      `Services with aggregated infrastructure. ${l1.metadata.nodeCount} nodes.`,
      l1,
      'L1',
    ),
    'utf-8',
  );
  filePaths.push(l1Path);

  const l2 = compress(wsIntegration, { level: 'L2' });
  l2.metadata.drillUp = 'service-topology-L1.md';
  l2.metadata.drillDown = 'contract-integration-L3.md';
  const l2Path = path.join(projectionsDir, 'capability-domains-L2.md');
  await fs.writeFile(
    l2Path,
    renderProjection(
      'Capability Domains (L2)',
      `Endpoint grouping by capability domain. ${l2.metadata.nodeCount} nodes.`,
      l2,
      'L2',
    ),
    'utf-8',
  );
  filePaths.push(l2Path);

  for (const repo of manifest.repos) {
    const repoResult = componentIntegration(graph, { repo: repo.name });
    if (repoResult.summary.totalComponents === 0) continue;

    const repoL2 = compress(repoResult, { level: 'L2' });
    repoL2.metadata.drillUp = 'capability-domains-L2.md';
    repoL2.metadata.drillDown = `contract-integration-L3-${repo.name}.md`;
    const repoL2Path = path.join(projectionsDir, `capability-domains-L2-${repo.name}.md`);
    await fs.writeFile(
      repoL2Path,
      renderProjection(
        `Capability Domains: ${repo.name} (L2)`,
        `Capability domain breakdown for ${repo.name}. ${repoL2.metadata.nodeCount} nodes.`,
        repoL2,
        'L2',
      ),
      'utf-8',
    );
    filePaths.push(repoL2Path);
  }

  const l3 = compress(wsIntegration, { level: 'L3' });
  l3.metadata.drillUp = 'capability-domains-L2.md';
  l3.metadata.drillDown = 'component-integration.md';
  const l3Path = path.join(projectionsDir, 'contract-integration-L3.md');
  await fs.writeFile(
    l3Path,
    renderProjection(
      'Contract Integration (L3)',
      `Full endpoint listing within capability groups. ${l3.metadata.nodeCount} nodes, ${l3.metadata.edgeCount} edges.`,
      l3,
      'L3',
    ),
    'utf-8',
  );
  filePaths.push(l3Path);

  for (const repo of manifest.repos) {
    const repoResult = componentIntegration(graph, { repo: repo.name });
    if (repoResult.summary.totalComponents === 0) continue;

    const repoL3 = compress(repoResult, { level: 'L3' });
    repoL3.metadata.drillUp = `capability-domains-L2-${repo.name}.md`;
    repoL3.metadata.drillDown = `component-integration-${repo.name}.md`;
    const repoL3Path = path.join(projectionsDir, `contract-integration-L3-${repo.name}.md`);
    await fs.writeFile(
      repoL3Path,
      renderProjection(
        `Contract Integration: ${repo.name} (L3)`,
        `Full endpoint detail for ${repo.name}. ${repoL3.metadata.nodeCount} nodes.`,
        repoL3,
        'L3',
      ),
      'utf-8',
    );
    filePaths.push(repoL3Path);
  }

  return { fileCount: filePaths.length, filePaths };
}
