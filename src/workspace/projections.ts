/**
 * Projection renderers that convert canned-query results into Mermaid
 * diagrams, structured tables, and adjacency matrices.
 *
 * Resolution-aware renderers (toMermaidAtResolution, toTableAtResolution)
 * consume CompressedProjection from the compression engine and produce
 * multi-resolution output with navigation bars and drill-down links.
 */

import type { WorkspaceNode, WorkspaceEdge } from './workspace-graph-loader.js';
import type {
  CannedQueryResult,
  SystemDependencyResult,
  ComponentIntegrationResult,
  WorkspaceBlastRadiusResult,
  WhatCallsResult,
  WhatDependsOnResult,
  NodeBlastRadiusResult,
} from './canned-queries.js';
import type {
  CompressedProjection,
  CompressedNode,
  CompressedEdge,
  ResolutionConfig,
  ResolutionLevel,
} from './compression.js';

// ---------------------------------------------------------------------------
// Mermaid helpers
// ---------------------------------------------------------------------------

const MERMAID_SHAPE: Record<string, [string, string]> = {
  Lambda:         ['[', ']'],
  Service:        ['[', ']'],
  Queue:          ['[/', '\\]'],
  Topic:          ['[/', '\\]'],
  Database:       ['[(', ')]'],
  Bucket:         ['[(', ')]'],
  StateMachine:   ['[[', ']]'],
  Endpoint:       ['([', '])'],
  Schema:         ['{{', '}}'],
  ExternalSystem: ['>', ']'],
};

function mermaidId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

function mermaidNodeDef(node: WorkspaceNode): string {
  const id = mermaidId(node.id);
  const [open, close] = MERMAID_SHAPE[node.type] ?? ['[', ']'];
  const label = node.name.length > 40 ? node.name.slice(0, 37) + '...' : node.name;
  return `  ${id}${open}"${label}"${close}`;
}

// ---------------------------------------------------------------------------
// toMermaid
// ---------------------------------------------------------------------------

export function toMermaid(result: CannedQueryResult): string {
  switch (result.kind) {
    case 'system-dependencies':
      return mermaidSystemDeps(result);
    case 'component-integration':
      return mermaidComponentIntegration(result);
    case 'blast-radius':
      return mermaidBlastRadius(result);
    case 'what-calls':
      return mermaidNodeList(result.targetId, 'callers', result.callers);
    case 'what-depends-on':
      return mermaidNodeList(result.targetId, 'dependents', result.dependents);
    case 'node-blast-radius':
      return mermaidNodeList(result.targetId, 'affected', result.affected);
  }
}

function mermaidNodeList(targetId: string, label: string, nodes: string[]): string {
  const lines: string[] = ['flowchart TD'];
  const safeTarget = targetId.replace(/[^a-zA-Z0-9_]/g, '_');
  lines.push(`  ${safeTarget}["${targetId}"]`);
  for (const node of nodes) {
    const safeNode = node.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`  ${safeNode}["${node}"]`);
    lines.push(`  ${safeNode} -->|${label}| ${safeTarget}`);
  }
  return lines.join('\n');
}

function tableNodeList(targetId: string, role: string, nodes: string[]): Array<Record<string, string>> {
  return nodes.map((n) => ({ target: targetId, [role]: n }));
}

function mermaidSystemDeps(result: SystemDependencyResult): string {
  const lines: string[] = ['flowchart TD'];
  const repoIds = new Map<string, string>();

  for (const repo of result.repos) {
    const id = mermaidId(repo.name);
    repoIds.set(repo.name, id);
    const types = Object.entries(repo.nodeTypes)
      .map(([t, c]) => `${t}:${c}`)
      .join(', ');
    lines.push(`  ${id}["${repo.name}<br/>${types}"]`);
  }

  for (const dep of result.dependencies) {
    const fromId = repoIds.get(dep.from) ?? mermaidId(dep.from);
    const toId = repoIds.get(dep.to) ?? mermaidId(dep.to);
    const label = dep.verbs.join(', ');
    lines.push(`  ${fromId} -->|"${label}"| ${toId}`);
  }

  return lines.join('\n');
}

function mermaidComponentIntegration(result: ComponentIntegrationResult): string {
  const lines: string[] = ['flowchart TD'];

  const byRepo = new Map<string, WorkspaceNode[]>();
  for (const node of result.components) {
    const list = byRepo.get(node.repo);
    if (list) {
      list.push(node);
    } else {
      byRepo.set(node.repo, [node]);
    }
  }

  for (const [repo, nodes] of byRepo) {
    const subId = mermaidId(repo);
    lines.push(`  subgraph ${subId} [${repo}]`);
    for (const node of nodes) {
      lines.push(`  ${mermaidNodeDef(node)}`);
    }
    lines.push('  end');
  }

  const seen = new Set<string>();
  for (const group of result.integrations) {
    for (const edge of group.edges) {
      const key = `${edge.from}|${edge.to}|${edge.verb}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${mermaidId(edge.from)} -->|"${edge.verb}"| ${mermaidId(edge.to)}`);
    }
  }

  return lines.join('\n');
}

function mermaidBlastRadius(result: WorkspaceBlastRadiusResult): string {
  const lines: string[] = ['flowchart TD'];

  for (const tier of result.tiers) {
    const subLabel = tier.tier === 0 ? 'Target' : `Tier ${tier.tier}`;
    const subId = `tier${tier.tier}`;
    lines.push(`  subgraph ${subId} [${subLabel}]`);
    for (const node of tier.nodes) {
      lines.push(`  ${mermaidNodeDef(node)}`);
    }
    lines.push('  end');
  }

  const seen = new Set<string>();
  for (const tier of result.tiers) {
    for (const edge of tier.edges) {
      const key = `${edge.from}|${edge.to}|${edge.verb}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${mermaidId(edge.from)} -->|"${edge.verb}"| ${mermaidId(edge.to)}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// toTable
// ---------------------------------------------------------------------------

export function toTable(result: CannedQueryResult): Array<Record<string, string>> {
  switch (result.kind) {
    case 'system-dependencies':
      return tableSystemDeps(result);
    case 'component-integration':
      return tableComponentIntegration(result);
    case 'blast-radius':
      return tableBlastRadius(result);
    case 'what-calls':
      return tableNodeList(result.targetId, 'caller', result.callers);
    case 'what-depends-on':
      return tableNodeList(result.targetId, 'dependent', result.dependents);
    case 'node-blast-radius':
      return tableNodeList(result.targetId, 'affected', result.affected);
  }
}

function tableSystemDeps(result: SystemDependencyResult): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  for (const dep of result.dependencies) {
    rows.push({
      'From Repo': dep.from,
      'To Repo': dep.to,
      'Connection Type': dep.verbs.join(', '),
      'Details': `${dep.details.length} edge(s)`,
    });
  }
  return rows;
}

function tableComponentIntegration(result: ComponentIntegrationResult): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  for (const group of result.integrations) {
    for (const edge of group.edges) {
      rows.push({
        'Component': edge.from,
        'Type': group.pattern,
        'Connects To': edge.to,
        'Via': edge.verb,
      });
    }
  }
  return rows;
}

function tableBlastRadius(result: WorkspaceBlastRadiusResult): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  for (const tier of result.tiers) {
    for (const node of tier.nodes) {
      rows.push({
        'Tier': String(tier.tier),
        'Component': node.name,
        'Repo': node.repo,
        'Type': node.type,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// toAdjacencyMatrix
// ---------------------------------------------------------------------------

export interface AdjacencyMatrixResult {
  labels: string[];
  matrix: string[][];
}

export function toAdjacencyMatrix(result: CannedQueryResult): AdjacencyMatrixResult {
  switch (result.kind) {
    case 'system-dependencies':
      return matrixSystemDeps(result);
    case 'component-integration':
      return matrixComponentIntegration(result);
    case 'blast-radius':
      return matrixBlastRadius(result);
    case 'what-calls':
    case 'what-depends-on':
    case 'node-blast-radius':
      return { labels: [], matrix: [] };
  }
}

function matrixSystemDeps(result: SystemDependencyResult): AdjacencyMatrixResult {
  const labels = result.repos.map(r => r.name).sort();
  const idx = new Map(labels.map((l, i) => [l, i]));
  const matrix: string[][] = labels.map(() => labels.map(() => ''));

  for (const dep of result.dependencies) {
    const r = idx.get(dep.from);
    const c = idx.get(dep.to);
    if (r !== undefined && c !== undefined) {
      matrix[r]![c] = dep.verbs.join(', ');
    }
  }

  return { labels, matrix };
}

function buildNodeMatrix(
  nodes: WorkspaceNode[],
  edges: WorkspaceEdge[],
): AdjacencyMatrixResult {
  const labels = nodes.map(n => n.id).sort();
  const idx = new Map(labels.map((l, i) => [l, i]));
  const matrix: string[][] = labels.map(() => labels.map(() => ''));

  for (const edge of edges) {
    const r = idx.get(edge.from);
    const c = idx.get(edge.to);
    if (r !== undefined && c !== undefined) {
      const existing = matrix[r]![c];
      if (existing) {
        const verbs = new Set(existing.split(', '));
        verbs.add(edge.verb);
        matrix[r]![c] = [...verbs].sort().join(', ');
      } else {
        matrix[r]![c] = edge.verb;
      }
    }
  }

  return { labels, matrix };
}

function matrixComponentIntegration(result: ComponentIntegrationResult): AdjacencyMatrixResult {
  const allEdges = result.integrations.flatMap(g => g.edges);
  return buildNodeMatrix(result.components, allEdges);
}

function matrixBlastRadius(result: WorkspaceBlastRadiusResult): AdjacencyMatrixResult {
  const allNodes = result.tiers.flatMap(t => t.nodes);
  const allEdges = result.tiers.flatMap(t => t.edges);
  return buildNodeMatrix(allNodes, allEdges);
}

// ---------------------------------------------------------------------------
// Resolution-aware renderers
// ---------------------------------------------------------------------------

const COMPRESSED_SHAPE: Record<string, [string, string]> = {
  ...MERMAID_SHAPE,
  CapabilityGroup: ['([', '])'],
};

function compressedMermaidId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

function compressedNodeDef(node: CompressedNode): string {
  const id = compressedMermaidId(node.id);
  const [open, close] = COMPRESSED_SHAPE[node.type] ?? ['[', ']'];
  const label = node.label.length > 50 ? node.label.slice(0, 47) + '...' : node.label;
  return `  ${id}${open}"${label}"${close}`;
}

function edgeLabel(edge: CompressedEdge): string {
  if (edge.isCompressed && edge.multiplicity > 1) {
    return `${edge.verb} (${edge.multiplicity})`;
  }
  return edge.verb;
}

function navigationBar(currentLevel: ResolutionLevel): string {
  const levels: Array<{ level: ResolutionLevel; label: string; file: string }> = [
    { level: 'L0', label: 'System Context', file: 'system-context-L0.md' },
    { level: 'L1', label: 'Service Topology', file: 'service-topology-L1.md' },
    { level: 'L2', label: 'Capabilities', file: 'capability-domains-L2.md' },
    { level: 'L3', label: 'Contracts', file: 'contract-integration-L3.md' },
    { level: 'L4', label: 'Full Graph', file: 'component-integration.md' },
  ];

  const parts = levels.map(l => {
    if (l.level === currentLevel) return `**${l.level}** ${l.label}`;
    return `${l.level} [${l.label}](${l.file})`;
  });

  return `> **Resolution:** ${parts.join(' | ')}`;
}

export function toMermaidAtResolution(projection: CompressedProjection): string {
  const { nodes, edges, groups, metadata } = projection;
  const level = metadata.level;
  const lines: string[] = ['flowchart TD'];

  const byRepo = new Map<string, CompressedNode[]>();
  for (const node of nodes) {
    const list = byRepo.get(node.repo);
    if (list) list.push(node);
    else byRepo.set(node.repo, [node]);
  }

  if (level === 'L3' && groups.length > 0) {
    const groupsByRepo = new Map<string, typeof groups>();
    for (const g of groups) {
      const list = groupsByRepo.get(g.repo);
      if (list) list.push(g);
      else groupsByRepo.set(g.repo, [g]);
    }

    const groupedNodeIds = new Set(groups.flatMap(g => g.memberNodes));

    for (const [repo, repoNodes] of byRepo) {
      const repoId = compressedMermaidId(repo);
      lines.push(`  subgraph ${repoId} [${repo}]`);

      const repoGroups = groupsByRepo.get(repo) ?? [];
      for (const grp of repoGroups) {
        const grpId = compressedMermaidId(grp.id);
        lines.push(`    subgraph ${grpId} [${grp.label}]`);
        const memberNodes = repoNodes.filter(n => grp.memberNodes.includes(n.id));
        for (const mn of memberNodes) {
          lines.push(`    ${compressedNodeDef(mn)}`);
        }
        lines.push('    end');
      }

      const ungrouped = repoNodes.filter(n => !groupedNodeIds.has(n.id));
      for (const n of ungrouped) {
        lines.push(`  ${compressedNodeDef(n)}`);
      }

      lines.push('  end');
    }
  } else {
    for (const [repo, repoNodes] of byRepo) {
      const repoId = compressedMermaidId(repo);
      lines.push(`  subgraph ${repoId} [${repo}]`);
      for (const node of repoNodes) {
        lines.push(`  ${compressedNodeDef(node)}`);
      }
      lines.push('  end');
    }
  }

  const seen = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}|${edge.verb}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fromId = compressedMermaidId(edge.from);
    const toId = compressedMermaidId(edge.to);
    const label = edgeLabel(edge);
    const arrow = edge.verb === 'references' && level === 'L3' ? '-.->' : '-->';
    lines.push(`  ${fromId} ${arrow}|"${label}"| ${toId}`);
  }

  return lines.join('\n');
}

export function toTableAtResolution(
  projection: CompressedProjection,
): Array<Record<string, string>> {
  const { nodes, edges, groups, metadata } = projection;
  const level = metadata.level;

  if (metadata.family === 'system-dependencies') {
    return edges.map(e => ({
      'From': e.from.replace('Repo_', ''),
      'To': e.to.replace('Repo_', ''),
      'Connection': e.verb,
      'Count': String(e.multiplicity),
    }));
  }

  if (level === 'L0' || level === 'L1') {
    const rows: Array<Record<string, string>> = [];
    for (const node of nodes) {
      const row: Record<string, string> = {
        'Component': node.label,
        'Type': node.type,
        'Repo': node.repo,
      };
      if (node.isAggregate && node.memberCount) {
        row['Members'] = String(node.memberCount);
      }
      rows.push(row);
    }
    return rows;
  }

  if (level === 'L2') {
    const rows: Array<Record<string, string>> = [];
    const capGroups = nodes.filter(n => n.type === 'CapabilityGroup');
    for (const cg of capGroups) {
      rows.push({
        'Capability Domain': cg.label,
        'Repo': cg.repo,
        'Endpoints': String(cg.memberCount ?? 0),
      });
    }
    const nonCap = nodes.filter(n => n.type !== 'CapabilityGroup' && n.type !== 'Service');
    for (const n of nonCap) {
      rows.push({
        'Capability Domain': n.label,
        'Repo': n.repo,
        'Endpoints': '1',
      });
    }
    return rows;
  }

  return edges.map(e => ({
    'From': e.from,
    'To': e.to,
    'Via': e.verb,
    'Count': String(e.multiplicity),
  }));
}

export { navigationBar };
