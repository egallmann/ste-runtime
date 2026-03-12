# Adaptive Tool Parameters Implementation Guide

**Purpose:** Dynamically adjust MCP tool parameter defaults based on semantic graph topology.

**Status:** Ready for Implementation  
**Priority:** High (Core Feature)  
**Related:** E-ADR-011 §3

---

## Overview

The MCP server analyzes the semantic graph structure at startup and adjusts tool parameter defaults (especially traversal depth) to match the codebase's architecture pattern.

**Key Insight:** A React app with deep component trees needs `depth=4`, while a layered Python backend works best with `depth=2`. The system should detect this automatically.

---

## Components

### 1. Graph Topology Analyzer

**File:** `src/rss/graph-topology-analyzer.ts` ✅ Created

**Responsibilities:**
- Analyze graph structure (depth, width, patterns)
- Detect architecture patterns (component-tree, layered, microservices, etc.)
- Calculate optimal traversal depth
- Cache results to `.ste/state/graph-metrics.json`

**Key Functions:**
```typescript
analyzeGraphTopology(graph: AIDocGraph): Promise<GraphMetrics>
loadOrAnalyzeMetrics(stateRoot: string, graph: AIDocGraph): Promise<GraphMetrics>
hasSignificantChange(old: GraphMetrics, new: GraphMetrics): boolean
```

### 2. MCP Server Integration

**File:** `src/mcp/mcp-server.ts` (to be created)

**Integration Points:**

#### A. Initialization
```typescript
async function initializeMCPServer(config: Config) {
  // Load graph
  const graph = await loadGraph(config.rss.stateRoot);
  
  // Analyze topology
  const metrics = await loadOrAnalyzeMetrics(config.rss.stateRoot, graph);
  
  // Log recommendations
  console.log(`[MCP Server] Graph analysis complete:`);
  console.log(`  - Pattern: ${metrics.detectedPattern}`);
  console.log(`  - Components: ${metrics.totalComponents}`);
  console.log(`  - Avg dependency depth: ${metrics.avgDependencyDepth.toFixed(1)}`);
  console.log(`  - Recommended traversal depth: ${metrics.recommendedDepth}`);
  console.log(`  - Reasoning: ${metrics.reasoning}`);
  
  // Update tool schemas
  updateToolDefaults(metrics.recommendedDepth);
  
  return { graph, metrics };
}
```

#### B. Tool Schema Updates
```typescript
function updateToolDefaults(recommendedDepth: number) {
  // Update all traversal tools
  const toolsToUpdate = [
    'get_dependencies',
    'get_dependents',
    'get_blast_radius',
    'assemble_context'
  ];
  
  for (const toolName of toolsToUpdate) {
    const tool = toolSchemas.get(toolName);
    if (tool?.inputSchema.properties.depth) {
      tool.inputSchema.properties.depth.default = recommendedDepth;
      tool.inputSchema.properties.depth.description = 
        `Traversal depth (default: ${recommendedDepth}, auto-detected from graph)`;
    }
  }
}
```

#### C. RECON Event Handler
```typescript
// After incremental RECON completes
async function onReconComplete() {
  const graph = await loadGraph(config.rss.stateRoot);
  const newMetrics = await analyzeGraphTopology(graph);
  
  if (hasSignificantChange(currentMetrics, newMetrics)) {
    console.log(`[MCP Server] Graph structure changed significantly`);
    console.log(`  - Old: ${currentMetrics.detectedPattern}, depth=${currentMetrics.recommendedDepth}`);
    console.log(`  - New: ${newMetrics.detectedPattern}, depth=${newMetrics.recommendedDepth}`);
    
    currentMetrics = newMetrics;
    updateToolDefaults(newMetrics.recommendedDepth);
    await saveGraphMetrics(config.rss.stateRoot, newMetrics);
  }
}
```

### 3. Configuration

**File:** `ste.config.json`

Add new section:
```json
{
  "rss": {
    "stateRoot": ".ste/state",
    "defaultDepth": 2,
    "adaptiveDepth": true,
    "maxResults": 50
  }
}
```

**Field Descriptions:**
- `adaptiveDepth` - Enable automatic depth calculation (default: true)
- `defaultDepth` - Fallback if adaptive calculation fails (default: 2)

---

## Architecture Pattern Detection

### Pattern Definitions

| Pattern | Characteristics | Example | Recommended Depth |
|---------|----------------|---------|-------------------|
| **component-tree** | Deep hierarchies, narrow fan-out | React/Vue apps | 4 |
| **microservices** | Wide network, shallow depth | Distributed systems | 3 |
| **layered** | Moderate depth, clear boundaries | Django/Rails apps | 2 |
| **flat** | Minimal dependencies | Utility libraries | 2 |
| **mixed** | No clear pattern | Diverse codebases | 3 |

### Detection Algorithm

```typescript
function detectPattern(metrics: GraphMetrics): ArchitecturePattern {
  // Component trees: deep (>5 levels) but narrow (<5 avg deps)
  if (metrics.hasDeepTrees && !metrics.hasWideNetwork) {
    return 'component-tree';
  }
  
  // Microservices: wide (>10 avg deps) but shallow (<3 levels)
  if (metrics.hasWideNetwork && metrics.avgDependencyDepth < 3) {
    return 'microservices';
  }
  
  // Layered: moderate depth (2-4), not wide
  if (metrics.avgDependencyDepth >= 2 && 
      metrics.avgDependencyDepth <= 4 && 
      !metrics.hasWideNetwork) {
    return 'layered';
  }
  
  // Flat: minimal dependencies
  if (metrics.avgDependencyDepth <= 2 && 
      metrics.avgDependenciesPerComponent <= 3) {
    return 'flat';
  }
  
  return 'mixed';
}
```

---

## Metrics File Format

**Path:** `.ste/state/graph-metrics.json`

```json
{
  "totalComponents": 450,
  "componentsByDomain": {
    "api": 120,
    "data": 80,
    "graph": 150,
    "ui": 100
  },
  "componentsByType": {
    "function": 280,
    "class": 120,
    "react-component": 50
  },
  "avgDependencyDepth": 4.7,
  "maxDependencyDepth": 12,
  "p95DependencyDepth": 8,
  "avgDependentDepth": 3.2,
  "maxDependentDepth": 10,
  "avgDependenciesPerComponent": 4.3,
  "avgDependentsPerComponent": 4.3,
  "detectedPattern": "component-tree",
  "hasDeepTrees": true,
  "hasWideNetwork": false,
  "recommendedDepth": 4,
  "reasoning": "Deep component hierarchies detected, adjusted up to 4 based on P95 depth (8.0)",
  "lastAnalyzed": "2026-01-11T10:30:00.000Z"
}
```

---

## Example Behaviors

### Example 1: React Frontend

```bash
$ ste watch

[RECON] Full reconciliation starting...
[RECON] Extracted 450 components
[RECON] Generated 450 slices
[RECON] Saved to .ste/state/

[MCP Server] Graph analysis complete:
  - Pattern: component-tree
  - Components: 450
  - Avg dependency depth: 4.7
  - Recommended traversal depth: 4
  - Reasoning: Deep component hierarchies detected

[MCP Server] Started on stdio
[MCP Server] Available tools: 11
[MCP Server] Tool defaults adjusted:
  - get_dependencies: depth=4 (was 2)
  - get_dependents: depth=4 (was 2)
  - assemble_context: depth=4 (was 2)
```

### Example 2: Python Backend

```bash
$ ste watch

[RECON] Full reconciliation starting...
[RECON] Extracted 120 components
[RECON] Generated 120 slices
[RECON] Saved to .ste/state/

[MCP Server] Graph analysis complete:
  - Pattern: layered
  - Components: 120
  - Avg dependency depth: 2.3
  - Recommended traversal depth: 2
  - Reasoning: Clean layer boundaries, moderate depth

[MCP Server] Started on stdio
[MCP Server] Tool defaults: depth=2 (default)
```

### Example 3: Graph Evolution

```bash
# Developer adds React frontend to Python backend

[Watchdog] File changes detected (15 new files)
[RECON] Incremental reconciliation...
[RECON] Added 50 new components

[MCP Server] Graph structure changed significantly
  - Old: layered, depth=2
  - New: mixed, depth=3
  - Reasoning: Architecture now mixed, using conservative depth=3

[MCP Server] Tool defaults updated
```

---

## Testing Strategy

### Unit Tests

**File:** `src/rss/__tests__/graph-topology-analyzer.test.ts`

```typescript
describe('Graph Topology Analyzer', () => {
  it('detects component-tree pattern', () => {
    const graph = createReactGraph(); // Deep tree: 8 levels
    const metrics = analyzeGraphTopology(graph);
    
    expect(metrics.detectedPattern).toBe('component-tree');
    expect(metrics.recommendedDepth).toBe(4);
  });
  
  it('detects layered pattern', () => {
    const graph = createLayeredGraph(); // 3 layers
    const metrics = analyzeGraphTopology(graph);
    
    expect(metrics.detectedPattern).toBe('layered');
    expect(metrics.recommendedDepth).toBe(2);
  });
  
  it('adjusts depth based on P95', () => {
    const graph = createDeepGraph(); // P95 = 10
    const metrics = analyzeGraphTopology(graph);
    
    expect(metrics.p95DependencyDepth).toBeGreaterThan(5);
    expect(metrics.recommendedDepth).toBeGreaterThan(3);
  });
  
  it('caps depth at 5', () => {
    const graph = createVeryDeepGraph(); // P95 = 20
    const metrics = analyzeGraphTopology(graph);
    
    expect(metrics.recommendedDepth).toBe(5);
    expect(metrics.reasoning).toContain('capped at 5');
  });
});
```

### Integration Tests

**Scenario 1:** MCP server starts with adaptive depth
```typescript
it('updates tool schemas on startup', async () => {
  const server = await initializeMCPServer(config);
  const depTool = server.getTool('get_dependencies');
  
  // Should be adjusted based on graph
  expect(depTool.inputSchema.properties.depth.default).toBeGreaterThan(1);
});
```

**Scenario 2:** Metrics recalculate after significant change
```typescript
it('recalculates after architecture change', async () => {
  const server = await initializeMCPServer(config);
  const oldDepth = server.metrics.recommendedDepth;
  
  // Add 100 deep components
  await addReactComponents(100);
  await server.onReconComplete();
  
  expect(server.metrics.recommendedDepth).toBeGreaterThan(oldDepth);
});
```

---

## Performance Considerations

### Analysis Time

| Graph Size | Analysis Time | Acceptable? |
|------------|---------------|-------------|
| 100 components | ~10ms | ✅ Fast |
| 500 components | ~50ms | ✅ Fast |
| 2000 components | ~200ms | ✅ Acceptable |
| 10000 components | ~1s | ⚠️ Consider optimization |

**Optimization strategies for large graphs:**
- Cache metrics (1 hour TTL)
- Only recalculate on significant changes (>10% component count change)
- Sample-based analysis for graphs >5000 nodes

### Memory Usage

Analysis is O(N) in graph size:
- 100 components: ~1MB
- 1000 components: ~10MB
- 10000 components: ~100MB

All metrics fit in memory comfortably.

---

## Edge Cases

### Empty Graph
```typescript
metrics = {
  totalComponents: 0,
  recommendedDepth: 2,
  reasoning: 'Empty graph, using default depth=2'
}
```

### Single Component
```typescript
metrics = {
  totalComponents: 1,
  recommendedDepth: 2,
  reasoning: 'Small graph, using minimum depth=2'
}
```

### Circular Dependencies
The BFS traversal tracks visited nodes, so cycles don't cause infinite loops.

### Disconnected Components
Each component is analyzed independently, metrics reflect overall graph structure.

---

## Future Enhancements

### Phase 2: Per-Component Depth
```typescript
// Different depth based on WHAT you're querying
calculateDepthForComponent(component: Component): number {
  // Leaf nodes (utilities): show who uses them (depth=4)
  if (component.dependents.length > 5 && component.dependencies.length < 2) {
    return 4;
  }
  
  // Root nodes (entry points): shallow (depth=1)
  if (component.dependencies.length > 10) {
    return 1;
  }
  
  return this.metrics.recommendedDepth;
}
```

### Phase 3: Learning from Usage
```typescript
// Track which depths users actually use
logToolUsage(toolName: string, args: any) {
  if (args.depth) {
    usageStats.record(toolName, args.depth);
  }
}

// Adjust recommendations based on actual usage
if (usageStats.get('get_dependencies').avgDepth > recommendedDepth) {
  recommendedDepth = Math.ceil(usageStats.avgDepth);
}
```

---

## Success Criteria

### Functional
- ✅ Correctly detects 4 main architecture patterns
- ✅ Recommends depth within ±1 of optimal for 80% of queries
- ✅ Updates defaults when architecture changes significantly
- ✅ Gracefully handles empty/small graphs

### Performance
- ✅ Analysis completes in <200ms for graphs <2000 nodes
- ✅ Metrics cached to avoid repeated analysis
- ✅ No impact on MCP server response time (<5ms overhead)

### UX
- ✅ Users never need to manually configure depth
- ✅ Clear logging explains why a depth was chosen
- ✅ Transparent behavior (can see reasoning in graph-metrics.json)

---

## References

- [ADR-P-0004 §3: Adaptive Tool Parameters](../adrs/rendered/ADR-P-0004.md)
- [Graph Topology Analyzer Implementation](../src/rss/graph-topology-analyzer.ts)
- [RSS Programmatic API](./RSS-PROGRAMMATIC-API.md)




