/**
 * Graph Topology Analyzer
 * 
 * Analyzes semantic graph structure to determine optimal traversal parameters.
 * Per E-ADR-011: Adaptive parameter tuning based on graph topology.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AidocGraph } from '../rss/graph-loader.js';

export type ArchitecturePattern =
  | 'layered'        // Clean layer boundaries, moderate depth
  | 'microservices'  // Wide network, shallow dependencies
  | 'component-tree' // Deep hierarchies (React, Vue)
  | 'flat'           // Minimal dependencies (utilities)
  | 'mixed';         // No clear pattern

export interface GraphMetrics {
  // Basic stats
  totalComponents: number;
  componentsByDomain: Record<string, number>;
  componentsByType: Record<string, number>;
  
  // Depth analysis
  avgDependencyDepth: number;
  maxDependencyDepth: number;
  p95DependencyDepth: number;
  avgDependentDepth: number;
  maxDependentDepth: number;
  
  // Width analysis
  avgDependenciesPerComponent: number;
  avgDependentsPerComponent: number;
  
  // Architecture patterns
  detectedPattern: ArchitecturePattern;
  hasDeepTrees: boolean;
  hasWideNetwork: boolean;
  
  // Recommended defaults
  recommendedDepth: number;
  reasoning: string;
  lastAnalyzed: string;
}

/**
 * Analyze graph topology and calculate optimal traversal parameters.
 *
 * Uses a single-pass BFS (Kahn's algorithm) to compute forward dependency
 * depths in O(N+E). Backward depth metrics (avgDependentDepth,
 * maxDependentDepth) are retained at 0 for serialized cache compatibility
 * but are not computed -- they were never consumed by detectPattern() or
 * calculateOptimalDepth().
 */
export async function analyzeGraphTopology(graph: AidocGraph): Promise<GraphMetrics> {
  const metrics: GraphMetrics = {
    totalComponents: graph.size,
    componentsByDomain: {},
    componentsByType: {},
    avgDependencyDepth: 0,
    maxDependencyDepth: 0,
    p95DependencyDepth: 0,
    avgDependentDepth: 0,
    maxDependentDepth: 0,
    avgDependenciesPerComponent: 0,
    avgDependentsPerComponent: 0,
    detectedPattern: 'mixed',
    hasDeepTrees: false,
    hasWideNetwork: false,
    recommendedDepth: 2,
    reasoning: '',
    lastAnalyzed: new Date().toISOString(),
  };
  
  if (graph.size === 0) {
    metrics.reasoning = 'Empty graph, using default depth=2';
    return metrics;
  }
  
  // 1. Count components by domain/type and collect width stats in O(N)
  const dependencyCounts: number[] = [];
  const dependentCounts: number[] = [];

  for (const node of graph.values()) {
    metrics.componentsByDomain[node.domain] = 
      (metrics.componentsByDomain[node.domain] || 0) + 1;
    metrics.componentsByType[node.type] = 
      (metrics.componentsByType[node.type] || 0) + 1;
    dependencyCounts.push(node.references.length);
    dependentCounts.push(node.referencedBy.length);
  }
  
  // 2. Compute forward dependency depths via single-pass BFS (Kahn's algorithm) -- O(N+E)
  const depths = computeForwardDepths(graph);
  const forwardDepths = [...depths.values()];
  
  metrics.avgDependencyDepth = mean(forwardDepths);
  metrics.maxDependencyDepth = forwardDepths.length > 0 ? Math.max(...forwardDepths) : 0;
  metrics.p95DependencyDepth = percentile(forwardDepths, 0.95);
  
  metrics.avgDependenciesPerComponent = mean(dependencyCounts);
  metrics.avgDependentsPerComponent = mean(dependentCounts);
  
  // 3. Detect architecture pattern
  metrics.hasDeepTrees = metrics.maxDependencyDepth > 5;
  metrics.hasWideNetwork = metrics.avgDependenciesPerComponent > 10;
  metrics.detectedPattern = detectPattern(metrics);
  
  // 4. Calculate recommended depth
  const { depth, reasoning } = calculateOptimalDepth(metrics);
  metrics.recommendedDepth = depth;
  metrics.reasoning = reasoning;
  
  return metrics;
}

/**
 * Compute forward dependency depth for every node using Kahn's algorithm
 * (topological BFS). Runs in O(N+E) -- single pass, no per-node DFS.
 *
 * Nodes in cycles never reach in-degree 0 and receive depth 0 (conservative).
 */
export function computeForwardDepths(graph: AidocGraph): Map<string, number> {
  const depths = new Map<string, number>();
  const inDegree = new Map<string, number>();

  for (const node of graph.values()) {
    inDegree.set(node.key, node.referencedBy.length);
  }

  const queue: string[] = [];
  for (const [key, deg] of inDegree) {
    if (deg === 0) {
      queue.push(key);
      depths.set(key, 0);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const key = queue[head++];
    const node = graph.get(key);
    if (!node) continue;
    const currentDepth = depths.get(key) ?? 0;
    for (const edge of node.references) {
      const targetKey = `${edge.domain}/${edge.type}/${edge.id}`;
      const newDepth = currentDepth + 1;
      depths.set(targetKey, Math.max(depths.get(targetKey) ?? 0, newDepth));
      const remaining = (inDegree.get(targetKey) ?? 1) - 1;
      inDegree.set(targetKey, remaining);
      if (remaining <= 0) queue.push(targetKey);
    }
  }

  // Nodes in cycles or not reachable from roots get depth 0
  for (const node of graph.values()) {
    if (!depths.has(node.key)) depths.set(node.key, 0);
  }
  return depths;
}

/**
 * Calculate mean of an array
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate percentile of an array
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Detect architecture pattern from metrics
 */
function detectPattern(metrics: GraphMetrics): ArchitecturePattern {
  const { avgDependencyDepth, avgDependenciesPerComponent, hasDeepTrees, hasWideNetwork } = metrics;
  
  // React/Vue component trees: deep but narrow
  if (hasDeepTrees && !hasWideNetwork && avgDependenciesPerComponent < 5) {
    return 'component-tree';
  }
  
  // Microservices: shallow but wide
  if (!hasDeepTrees && hasWideNetwork && avgDependencyDepth < 3) {
    return 'microservices';
  }
  
  // Layered architecture: moderate depth, clear boundaries
  if (avgDependencyDepth >= 2 && avgDependencyDepth <= 4 && !hasWideNetwork) {
    return 'layered';
  }
  
  // Flat utilities: minimal dependencies
  if (avgDependencyDepth <= 2 && avgDependenciesPerComponent <= 3) {
    return 'flat';
  }
  
  return 'mixed';
}

/**
 * Calculate optimal traversal depth based on metrics
 */
function calculateOptimalDepth(metrics: GraphMetrics): { depth: number; reasoning: string } {
  const { detectedPattern, avgDependencyDepth, p95DependencyDepth, maxDependencyDepth } = metrics;
  
  // Pattern-specific recommendations
  const patternDepths: Record<ArchitecturePattern, number> = {
    'component-tree': 4,   // Deep component hierarchies
    'microservices': 3,    // Peer services with shared deps
    'layered': 2,          // Clear layer boundaries
    'flat': 2,             // Simple utility libraries
    'mixed': 3,            // Conservative default
  };
  
  const baseDepth = patternDepths[detectedPattern];
  
  // Adjust based on actual graph characteristics
  // Use P95 instead of average (avoid outliers)
  const dataDepth = Math.ceil(p95DependencyDepth * 0.6);
  
  // Take max of pattern-based and data-driven, cap at 5
  const recommendedDepth = Math.min(Math.max(baseDepth, dataDepth), 5);
  
  // Generate reasoning
  let reasoning = `Detected ${detectedPattern} architecture. `;
  reasoning += `Avg depth: ${avgDependencyDepth.toFixed(1)}, `;
  reasoning += `P95 depth: ${p95DependencyDepth.toFixed(1)}, `;
  reasoning += `Max depth: ${maxDependencyDepth}. `;
  reasoning += `Recommended depth: ${recommendedDepth}.`;
  
  return { depth: recommendedDepth, reasoning };
}

/**
 * Save graph metrics to file
 */
export async function saveGraphMetrics(
  metrics: GraphMetrics,
  stateRoot: string
): Promise<void> {
  const metricsPath = path.join(stateRoot, 'graph-metrics.json');
  await fs.mkdir(path.dirname(metricsPath), { recursive: true });
  await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2), 'utf-8');
}

/**
 * Load graph metrics from file
 */
export async function loadGraphMetrics(
  stateRoot: string
): Promise<GraphMetrics | null> {
  const metricsPath = path.join(stateRoot, 'graph-metrics.json');
  
  try {
    const content = await fs.readFile(metricsPath, 'utf-8');
    return JSON.parse(content) as GraphMetrics;
  } catch (_error) {
    return null;
  }
}
