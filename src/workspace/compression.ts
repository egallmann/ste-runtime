/**
 * Deterministic semantic compression engine for multi-resolution
 * architecture projections. Transforms raw canned-query results into
 * compressed projections at configurable resolution levels (L0-L4).
 *
 * Preserves traceability to source graph nodes via memberIds on
 * aggregate nodes and sourceEdgeIds on compressed edges.
 */

import type { WorkspaceNode, WorkspaceEdge } from './workspace-graph-loader.js';
import type {
  CannedQueryResult,
  SystemDependencyResult,
  ComponentIntegrationResult,
  WorkspaceBlastRadiusResult,
} from './canned-queries.js';
import { AUXILIARY_NODE_TYPES } from './cfn-type-mapping.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ResolutionLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export interface ResolutionConfig {
  level: ResolutionLevel;
  groupingThreshold: number;
  suppressAlarmTopics: boolean;
  capabilityExtractor: 'path-prefix';
  maxNodes?: number;
  minimumGroupSize: number;
}

export interface ProjectionMetadata {
  level: ResolutionLevel;
  family: string;
  intent: string;
  sourceQuery: string;
  derivation: 'deterministic';
  confidence: 'high' | 'medium';
  nodeCount: number;
  edgeCount: number;
  compressionRatio: number;
  generationHash: string;
  drillDown?: string;
  drillUp?: string;
}

export interface CompressedNode {
  id: string;
  label: string;
  type: string;
  repo: string;
  isAggregate: boolean;
  memberCount?: number;
  memberIds?: string[];
}

export interface CompressedEdge {
  from: string;
  to: string;
  verb: string;
  multiplicity: number;
  isCompressed: boolean;
  sourceEdgeIds?: Array<{ from: string; to: string; verb: string }>;
}

export interface NodeGroup {
  id: string;
  label: string;
  domain: string;
  repo: string;
  memberNodes: string[];
}

export interface CompressedProjection {
  nodes: CompressedNode[];
  edges: CompressedEdge[];
  groups: NodeGroup[];
  metadata: ProjectionMetadata;
  sourceResult: CannedQueryResult;
}

// ---------------------------------------------------------------------------
// Edge tier taxonomy
// ---------------------------------------------------------------------------

const VERB_TIER: Record<string, number> = {
  calls: 1,
  publishes: 1,
  consumes: 1,
  deploys_to: 2,
  invokes: 2,
  contains: 2,
  has_contract: 3,
  reads: 4,
  writes: 4,
  references: 5,
};

function getVerbTier(verb: string): number {
  return VERB_TIER[verb] ?? 5;
}

// ---------------------------------------------------------------------------
// Default config factory
// ---------------------------------------------------------------------------

export function defaultResolutionConfig(level: ResolutionLevel): ResolutionConfig {
  return {
    level,
    groupingThreshold: 3,
    suppressAlarmTopics: level === 'L0' || level === 'L1',
    capabilityExtractor: 'path-prefix',
    minimumGroupSize: 2,
  };
}

// ---------------------------------------------------------------------------
// Capability domain extraction (path-prefix algorithm)
// ---------------------------------------------------------------------------

/**
 * Extract a capability domain name from an endpoint node ID.
 * Format: Endpoint:{repo}:{method}:{path-segments}
 * Extracts the second path segment (first after 'api-').
 */
export function extractCapabilityDomain(endpointId: string): string | null {
  const parts = endpointId.split(':');
  if (parts.length < 4) return null;

  const pathSegments = parts.slice(3).join(':');
  const segments = pathSegments.split('-').filter(Boolean);

  if (segments.length < 2) return null;

  const firstSeg = segments[0]!.toLowerCase();
  if (firstSeg === 'api' && segments.length >= 2) {
    return segments[1]!;
  }

  return firstSeg;
}

function titleCase(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Infrastructure condensation
// ---------------------------------------------------------------------------

function isAlarmTopic(node: WorkspaceNode): boolean {
  const lower = node.id.toLowerCase();
  return node.type === 'Topic' && (lower.includes('alarm') || lower.includes('monitor'));
}

function isAuxiliaryInfraNode(node: WorkspaceNode): boolean {
  return AUXILIARY_NODE_TYPES.has(node.type);
}

function isSuppressedAtOverview(node: WorkspaceNode): boolean {
  return isAlarmTopic(node) || isAuxiliaryInfraNode(node);
}

// ---------------------------------------------------------------------------
// Edge filtering by resolution level
// ---------------------------------------------------------------------------

function isEdgeAllowed(
  edge: WorkspaceEdge,
  level: ResolutionLevel,
  fromNode: WorkspaceNode | undefined,
  toNode: WorkspaceNode | undefined,
): boolean {
  if (level === 'L4') return true;

  const tier = getVerbTier(edge.verb);
  const isCrossRepo = fromNode && toNode && fromNode.repo !== toNode.repo;

  switch (level) {
    case 'L0':
      return tier <= 1;
    case 'L1':
      if (tier <= 2) return true;
      if (tier === 4 && isCrossRepo) return true;
      return false;
    case 'L2':
      if (tier <= 3) return true;
      if (tier === 4 && isCrossRepo) return true;
      return false;
    case 'L3':
      return true;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hashing (deterministic, simple djb2)
// ---------------------------------------------------------------------------

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function computeGenerationHash(nodes: CompressedNode[], edges: CompressedEdge[]): string {
  const nodeIds = nodes.map(n => n.id).sort().join(',');
  const edgeIds = edges.map(e => `${e.from}->${e.to}:${e.verb}`).sort().join(',');
  return djb2Hash(nodeIds + '|' + edgeIds);
}

// ---------------------------------------------------------------------------
// Core compression: componentIntegration
// ---------------------------------------------------------------------------

function compressComponentIntegration(
  result: ComponentIntegrationResult,
  config: ResolutionConfig,
): CompressedProjection {
  const { level, groupingThreshold, minimumGroupSize } = config;
  const nodeMap = new Map<string, WorkspaceNode>();
  for (const n of result.components) nodeMap.set(n.id, n);

  let workingNodes = [...result.components];
  const allEdges = result.integrations.flatMap(g => g.edges);

  if (config.suppressAlarmTopics) {
    const suppressed = new Set<string>();
    workingNodes = workingNodes.filter(n => {
      if (isSuppressedAtOverview(n)) {
        suppressed.add(n.id);
        return false;
      }
      return true;
    });
  }

  const filteredEdges = allEdges.filter(e => {
    const from = nodeMap.get(e.from);
    const to = nodeMap.get(e.to);
    if (config.suppressAlarmTopics && ((from && isSuppressedAtOverview(from)) || (to && isSuppressedAtOverview(to)))) {
      return false;
    }
    return isEdgeAllowed(e, level, from, to);
  });

  const groups: NodeGroup[] = [];
  const compressedNodes: CompressedNode[] = [];
  const nodeToGroup = new Map<string, string>();

  if (level === 'L0') {
    return compressToL0(result, workingNodes, filteredEdges, config);
  }

  if (level === 'L1') {
    return compressToL1(result, workingNodes, filteredEdges, config);
  }

  if (level === 'L2' || level === 'L3') {
    const endpointNodes = workingNodes.filter(n => n.type === 'Endpoint');
    const nonEndpointNodes = workingNodes.filter(n => n.type !== 'Endpoint');

    const domainBuckets = new Map<string, Map<string, WorkspaceNode[]>>();
    for (const ep of endpointNodes) {
      const domain = extractCapabilityDomain(ep.id);
      const repo = ep.repo;
      const key = `${repo}\0${domain ?? '__ungrouped__'}`;
      const bucket = domainBuckets.get(key);
      if (bucket) {
        const repoList = bucket.get(repo);
        if (repoList) repoList.push(ep);
        else bucket.set(repo, [ep]);
      } else {
        const m = new Map<string, WorkspaceNode[]>();
        m.set(repo, [ep]);
        domainBuckets.set(key, m);
      }
    }

    const repoDomainNodes = new Map<string, WorkspaceNode[]>();
    for (const ep of endpointNodes) {
      const domain = extractCapabilityDomain(ep.id) ?? '__ungrouped__';
      const key = `${ep.repo}\0${domain}`;
      const list = repoDomainNodes.get(key);
      if (list) list.push(ep);
      else repoDomainNodes.set(key, [ep]);
    }

    for (const [key, members] of repoDomainNodes) {
      const [repo, domain] = key.split('\0');
      if (!domain || domain === '__ungrouped__' || members.length < minimumGroupSize) {
        for (const m of members) {
          compressedNodes.push({
            id: m.id,
            label: m.name,
            type: m.type,
            repo: m.repo,
            isAggregate: false,
          });
        }
        continue;
      }

      const domainTitle = titleCase(domain);
      const groupId = `${domainTitle}_Domain_${repo}`;
      const groupLabel = level === 'L2'
        ? `${domainTitle} Domain (${members.length} endpoints)`
        : `${domainTitle} Domain`;

      groups.push({
        id: groupId,
        label: groupLabel,
        domain: domainTitle,
        repo: repo!,
        memberNodes: members.map(m => m.id),
      });

      for (const m of members) {
        nodeToGroup.set(m.id, groupId);
      }

      if (level === 'L2') {
        compressedNodes.push({
          id: groupId,
          label: groupLabel,
          type: 'CapabilityGroup',
          repo: repo!,
          isAggregate: true,
          memberCount: members.length,
          memberIds: members.map(m => m.id),
        });
      } else {
        for (const m of members) {
          compressedNodes.push({
            id: m.id,
            label: m.name,
            type: m.type,
            repo: m.repo,
            isAggregate: false,
          });
        }
      }
    }

    for (const n of nonEndpointNodes) {
      compressedNodes.push({
        id: n.id,
        label: n.name,
        type: n.type,
        repo: n.repo,
        isAggregate: false,
      });
    }
  }

  if (level === 'L4') {
    for (const n of workingNodes) {
      compressedNodes.push({
        id: n.id,
        label: n.name,
        type: n.type,
        repo: n.repo,
        isAggregate: false,
      });
    }
  }

  if (config.maxNodes && compressedNodes.length > config.maxNodes) {
    return applyMaxNodesSafetyValve(result, compressedNodes, filteredEdges, groups, nodeToGroup, config);
  }

  const compressedEdges = compressEdges(filteredEdges, nodeToGroup, level);

  const originalNodeCount = result.components.length || 1;
  const metadata: ProjectionMetadata = {
    level,
    family: 'component-integration',
    intent: intentForLevel(level),
    sourceQuery: 'componentIntegration',
    derivation: 'deterministic',
    confidence: 'high',
    nodeCount: compressedNodes.length,
    edgeCount: compressedEdges.length,
    compressionRatio: +(compressedNodes.length / originalNodeCount).toFixed(2),
    generationHash: computeGenerationHash(compressedNodes, compressedEdges),
  };

  return { nodes: compressedNodes, edges: compressedEdges, groups, metadata, sourceResult: result };
}

// ---------------------------------------------------------------------------
// L0: System Context (1 node per repo)
// ---------------------------------------------------------------------------

function compressToL0(
  result: ComponentIntegrationResult,
  workingNodes: WorkspaceNode[],
  filteredEdges: WorkspaceEdge[],
  config: ResolutionConfig,
): CompressedProjection {
  const nodeMap = new Map<string, WorkspaceNode>();
  for (const n of workingNodes) nodeMap.set(n.id, n);

  const repoNodes = new Map<string, WorkspaceNode[]>();
  for (const n of workingNodes) {
    const list = repoNodes.get(n.repo);
    if (list) list.push(n);
    else repoNodes.set(n.repo, [n]);
  }

  const compressedNodes: CompressedNode[] = [];
  const nodeToRepo = new Map<string, string>();

  for (const [repo, members] of repoNodes) {
    const serviceNode = members.find(m => m.type === 'Service');
    const repoId = `Service_${repo}`;
    compressedNodes.push({
      id: repoId,
      label: repo,
      type: 'Service',
      repo,
      isAggregate: true,
      memberCount: members.length,
      memberIds: members.map(m => m.id),
    });
    for (const m of members) {
      nodeToRepo.set(m.id, repoId);
    }
  }

  const repoPairEdges = new Map<string, { verb: string; count: number; sources: WorkspaceEdge[] }[]>();
  for (const edge of filteredEdges) {
    const fromRepo = nodeToRepo.get(edge.from);
    const toRepo = nodeToRepo.get(edge.to);
    if (!fromRepo || !toRepo || fromRepo === toRepo) continue;

    const pairKey = `${fromRepo}\0${toRepo}`;
    let list = repoPairEdges.get(pairKey);
    if (!list) {
      list = [];
      repoPairEdges.set(pairKey, list);
    }
    const existing = list.find(e => e.verb === edge.verb);
    if (existing) {
      existing.count++;
      existing.sources.push(edge);
    } else {
      list.push({ verb: edge.verb, count: 1, sources: [edge] });
    }
  }

  const compressedEdges: CompressedEdge[] = [];
  for (const [pairKey, verbEntries] of repoPairEdges) {
    const [from, to] = pairKey.split('\0');
    for (const entry of verbEntries) {
      const label = entry.count > 1 ? entry.verb : entry.verb;
      compressedEdges.push({
        from: from!,
        to: to!,
        verb: entry.verb,
        multiplicity: entry.count,
        isCompressed: entry.count > 1,
        sourceEdgeIds: entry.sources.map(s => ({ from: s.from, to: s.to, verb: s.verb })),
      });
    }
  }

  const originalNodeCount = result.components.length || 1;
  const metadata: ProjectionMetadata = {
    level: 'L0',
    family: 'component-integration',
    intent: intentForLevel('L0'),
    sourceQuery: 'componentIntegration',
    derivation: 'deterministic',
    confidence: 'high',
    nodeCount: compressedNodes.length,
    edgeCount: compressedEdges.length,
    compressionRatio: +(compressedNodes.length / originalNodeCount).toFixed(2),
    generationHash: computeGenerationHash(compressedNodes, compressedEdges),
  };

  return { nodes: compressedNodes, edges: compressedEdges, groups: [], metadata, sourceResult: result };
}

// ---------------------------------------------------------------------------
// L1: Service Topology (aggregate same-type nodes)
// ---------------------------------------------------------------------------

function compressToL1(
  result: ComponentIntegrationResult,
  workingNodes: WorkspaceNode[],
  filteredEdges: WorkspaceEdge[],
  config: ResolutionConfig,
): CompressedProjection {
  const nodeMap = new Map<string, WorkspaceNode>();
  for (const n of workingNodes) nodeMap.set(n.id, n);

  const { groupingThreshold } = config;
  const repoTypeGroups = new Map<string, WorkspaceNode[]>();
  for (const n of workingNodes) {
    const key = `${n.repo}\0${n.type}`;
    const list = repoTypeGroups.get(key);
    if (list) list.push(n);
    else repoTypeGroups.set(key, [n]);
  }

  const compressedNodes: CompressedNode[] = [];
  const nodeToCompressed = new Map<string, string>();
  const groups: NodeGroup[] = [];

  const ALWAYS_INDIVIDUAL = new Set(['StateMachine', 'Bucket', 'Service']);

  for (const [key, members] of repoTypeGroups) {
    const [repo, type] = key.split('\0');
    if (members.length >= groupingThreshold && !ALWAYS_INDIVIDUAL.has(type!)) {
      const groupId = `${type}_group_${repo}`;
      const groupLabel = `${type}s (${members.length})`;
      compressedNodes.push({
        id: groupId,
        label: groupLabel,
        type: type!,
        repo: repo!,
        isAggregate: true,
        memberCount: members.length,
        memberIds: members.map(m => m.id),
      });
      groups.push({
        id: groupId,
        label: groupLabel,
        domain: type!,
        repo: repo!,
        memberNodes: members.map(m => m.id),
      });
      for (const m of members) {
        nodeToCompressed.set(m.id, groupId);
      }
    } else {
      for (const m of members) {
        compressedNodes.push({
          id: m.id,
          label: m.name,
          type: m.type,
          repo: m.repo,
          isAggregate: false,
        });
        nodeToCompressed.set(m.id, m.id);
      }
    }
  }

  const compressedEdges = compressEdges(filteredEdges, nodeToCompressed, 'L1');

  const originalNodeCount = result.components.length || 1;
  const metadata: ProjectionMetadata = {
    level: 'L1',
    family: 'component-integration',
    intent: intentForLevel('L1'),
    sourceQuery: 'componentIntegration',
    derivation: 'deterministic',
    confidence: 'high',
    nodeCount: compressedNodes.length,
    edgeCount: compressedEdges.length,
    compressionRatio: +(compressedNodes.length / originalNodeCount).toFixed(2),
    generationHash: computeGenerationHash(compressedNodes, compressedEdges),
  };

  return { nodes: compressedNodes, edges: compressedEdges, groups, metadata, sourceResult: result };
}

// ---------------------------------------------------------------------------
// Edge compression (shared)
// ---------------------------------------------------------------------------

function compressEdges(
  edges: WorkspaceEdge[],
  nodeToCompressed: Map<string, string>,
  level: ResolutionLevel,
): CompressedEdge[] {
  const edgeBuckets = new Map<string, { verb: string; from: string; to: string; sources: WorkspaceEdge[] }>();

  for (const edge of edges) {
    const from = nodeToCompressed.get(edge.from) ?? edge.from;
    const to = nodeToCompressed.get(edge.to) ?? edge.to;
    if (from === to) continue;

    const bucketKey = `${from}\0${to}\0${edge.verb}`;
    const existing = edgeBuckets.get(bucketKey);
    if (existing) {
      existing.sources.push(edge);
    } else {
      edgeBuckets.set(bucketKey, { verb: edge.verb, from, to, sources: [edge] });
    }
  }

  const result: CompressedEdge[] = [];
  for (const entry of edgeBuckets.values()) {
    result.push({
      from: entry.from,
      to: entry.to,
      verb: entry.verb,
      multiplicity: entry.sources.length,
      isCompressed: entry.sources.length > 1,
      sourceEdgeIds: entry.sources.length > 1
        ? entry.sources.map(s => ({ from: s.from, to: s.to, verb: s.verb }))
        : undefined,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// maxNodes safety valve
// ---------------------------------------------------------------------------

function applyMaxNodesSafetyValve(
  result: ComponentIntegrationResult,
  currentNodes: CompressedNode[],
  filteredEdges: WorkspaceEdge[],
  currentGroups: NodeGroup[],
  nodeToGroup: Map<string, string>,
  config: ResolutionConfig,
): CompressedProjection {
  const forcedConfig: ResolutionConfig = {
    ...config,
    groupingThreshold: 2,
    minimumGroupSize: 1,
    maxNodes: undefined,
  };
  const levelDown: ResolutionLevel = config.level === 'L3' ? 'L2' : config.level === 'L2' ? 'L1' : 'L0';
  return compressComponentIntegration(result, { ...forcedConfig, level: levelDown });
}

// ---------------------------------------------------------------------------
// System dependencies compression
// ---------------------------------------------------------------------------

function compressSystemDependencies(
  result: SystemDependencyResult,
  config: ResolutionConfig,
): CompressedProjection {
  const compressedNodes: CompressedNode[] = result.repos.map(r => ({
    id: `Repo_${r.name}`,
    label: r.name,
    type: 'Service',
    repo: r.name,
    isAggregate: true,
    memberCount: Object.values(r.nodeTypes).reduce((a, b) => a + b, 0),
  }));

  const compressedEdges: CompressedEdge[] = result.dependencies.map(dep => ({
    from: `Repo_${dep.from}`,
    to: `Repo_${dep.to}`,
    verb: dep.verbs.join(', '),
    multiplicity: dep.details.length,
    isCompressed: dep.details.length > 1,
    sourceEdgeIds: dep.details.length > 1
      ? dep.details.map(d => ({ from: d.fromNode, to: d.toNode, verb: d.verb }))
      : undefined,
  }));

  const originalNodeCount = result.repos.length || 1;
  const metadata: ProjectionMetadata = {
    level: config.level,
    family: 'system-dependencies',
    intent: intentForLevel(config.level),
    sourceQuery: 'systemDependencies',
    derivation: 'deterministic',
    confidence: 'high',
    nodeCount: compressedNodes.length,
    edgeCount: compressedEdges.length,
    compressionRatio: +(compressedNodes.length / originalNodeCount).toFixed(2),
    generationHash: computeGenerationHash(compressedNodes, compressedEdges),
  };

  return { nodes: compressedNodes, edges: compressedEdges, groups: [], metadata, sourceResult: result };
}

// ---------------------------------------------------------------------------
// Blast radius compression
// ---------------------------------------------------------------------------

function compressBlastRadius(
  result: WorkspaceBlastRadiusResult,
  config: ResolutionConfig,
): CompressedProjection {
  const nodeMap = new Map<string, WorkspaceNode>();
  for (const tier of result.tiers) {
    for (const n of tier.nodes) nodeMap.set(n.id, n);
  }

  const allNodes = result.tiers.flatMap(t => t.nodes);
  const allEdges = result.tiers.flatMap(t => t.edges);

  const filteredEdges = allEdges.filter(e =>
    isEdgeAllowed(e, config.level, nodeMap.get(e.from), nodeMap.get(e.to)),
  );

  const compressedNodes: CompressedNode[] = allNodes.map(n => ({
    id: n.id,
    label: n.name,
    type: n.type,
    repo: n.repo,
    isAggregate: false,
  }));

  const compressedEdges = compressEdges(filteredEdges, new Map(), config.level);

  const originalNodeCount = allNodes.length || 1;
  const metadata: ProjectionMetadata = {
    level: config.level,
    family: 'blast-radius',
    intent: `Blast radius at ${config.level} resolution`,
    sourceQuery: 'blastRadiusWorkspace',
    derivation: 'deterministic',
    confidence: 'high',
    nodeCount: compressedNodes.length,
    edgeCount: compressedEdges.length,
    compressionRatio: +(compressedNodes.length / originalNodeCount).toFixed(2),
    generationHash: computeGenerationHash(compressedNodes, compressedEdges),
  };

  return { nodes: compressedNodes, edges: compressedEdges, groups: [], metadata, sourceResult: result };
}

// ---------------------------------------------------------------------------
// Intent labels
// ---------------------------------------------------------------------------

function intentForLevel(level: ResolutionLevel): string {
  switch (level) {
    case 'L0': return 'System context for human architectural cognition';
    case 'L1': return 'Service topology with infrastructure type annotations';
    case 'L2': return 'Capability domain topology for human architectural cognition';
    case 'L3': return 'Contract/integration topology with full endpoint detail';
    case 'L4': return 'Full graph fidelity for machine consumption';
  }
}

// ---------------------------------------------------------------------------
// Public API: compress
// ---------------------------------------------------------------------------

export function compress(
  result: CannedQueryResult,
  config: Partial<ResolutionConfig> & { level: ResolutionLevel },
): CompressedProjection {
  const fullConfig: ResolutionConfig = {
    ...defaultResolutionConfig(config.level),
    ...config,
  };

  switch (result.kind) {
    case 'system-dependencies':
      return compressSystemDependencies(result, fullConfig);
    case 'component-integration':
      return compressComponentIntegration(result, fullConfig);
    case 'blast-radius':
      return compressBlastRadius(result, fullConfig);
    case 'what-calls':
    case 'what-depends-on':
    case 'node-blast-radius':
      return {
        nodes: [],
        edges: [],
        groups: [],
        metadata: {
          level: fullConfig.level,
          family: 'node-query',
          intent: result.kind,
          sourceQuery: result.kind,
          derivation: 'deterministic' as const,
          confidence: 'high' as const,
          nodeCount: 0,
          edgeCount: 0,
          compressionRatio: 1,
          generationHash: '',
        },
        sourceResult: result,
      };
  }
}
