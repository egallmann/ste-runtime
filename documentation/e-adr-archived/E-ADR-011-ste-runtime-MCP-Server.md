# E-ADR-011: ste-runtime MCP Server Implementation

**Status:** Accepted  
**Implementation:** Planned  
**Date:** 2026-01-11  
**Author:** Erik Gallmann  
**Authority:** Exploratory ADR (Reversible)

> **Purpose:** Define comprehensive architecture for ste-runtime as a unified MCP server with file watching capabilities, enabling governed cognition in the Workspace Development Boundary.

> **Implementation Note (2026-02-08):** The current MCP server exposes 8 AI-optimized tools (`find`, `show`, `usages`, `impact`, `similar`, `overview`, `diagnose`, `refresh`). The detailed tool specifications below reflect the original layered design and serve as historical/roadmap context.

---

## Context

Per STE Architecture Section 3.1, the Workspace Development Boundary requires:
- **Provisional state** maintenance (pre-merge, feature branches)
- **Soft + hard enforcement** (LLM instruction-following + validation tools)
- **Post-reasoning validation** (catch violations after generation)
- **Context assembly via RSS** (CEM Stage 2: State Loading)

Currently, ste-runtime provides:
- ✅ Incremental RECON (maintains fresh AI-DOC)
- ✅ RSS operations (semantic graph traversal)
- ✅ CLI interface (human-friendly commands)
- ❌ No long-running process (graph reloaded on every query)
- ❌ No MCP interface (Cursor can't discover tools automatically)
- ❌ No automatic file watching (manual RECON invocation required)

**Gap:** Cursor (and other AI assistants) need:
1. **Always-fresh semantic state** (automatic updates on file changes)
2. **Fast queries** (in-memory graph, <100ms response)
3. **Tool auto-discovery** (MCP protocol for semantic operations)
4. **Deterministic context** (RSS graph traversal, not probabilistic search)

---

## Decision

**Implement ste-runtime as a unified MCP server that combines:**

1. **File Watcher** - Monitors project files, triggers incremental RECON on changes
2. **Incremental RECON Engine** - Maintains fresh AI-DOC state (O(changed files))
3. **In-Memory RSS Context** - Fast semantic graph queries (<100ms)
4. **MCP Server** - Exposes RSS operations as tools for Cursor integration

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│          Workspace Development Boundary                     │
│                                                             │
│  ┌──────────────┐                                           │
│  │ Cursor IDE   │                                           │
│  └──────┬───────┘                                           │
│         │ MCP Protocol (stdio)                              │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           ste-runtime Process                       │   │
│  │                                                     │   │
│  │  ┌──────────────┐      ┌──────────────────┐        │   │
│  │  │ MCP Server   │◄─────┤ In-Memory RSS    │        │   │
│  │  │ (stdio)      │      │ Context (Graph)  │        │   │
│  │  └──────────────┘      └────────▲─────────┘        │   │
│  │                                 │                  │   │
│  │  ┌──────────────┐      ┌────────┴─────────┐        │   │
│  │  │ File Watcher │──────► Incremental      │        │   │
│  │  │ (chokidar)   │      │ RECON Engine     │        │   │
│  │  └──────────────┘      └────────┬─────────┘        │   │
│  │                                 │                  │   │
│  └─────────────────────────────────┼──────────────────┘   │
│                                    │                      │
│                                    ▼                      │
│                        ┌─────────────────────┐             │
│                        │ .ste/state/         │             │
│                        │ (AI-DOC YAML files) │             │
│                        └─────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

### Two-Layer Innovation: RSS + Context Assembly

**Potentially Novel Architectural Pattern:** Separate fast structural queries from rich context loading. We have not found prior work that combines these elements, but welcome references to similar systems.

```
┌────────────────────────────────────────────────────────────────┐
│               LAYER 2: CONTEXT ASSEMBLY                        │
│         (Semantic Graph + Source Code + Invariants)            │
│                                                                 │
│  What it does: Combines RSS queries with filesystem access     │
│  What it returns: Slices + source code + invariants            │
│  Performance: Slower (disk I/O), but targeted                  │
│                                                                 │
│  MCP Tools:                                                     │
│  • assemble_context(query, includeSource=true)                │
│    → Returns: Relevant slices with full source code           │
│                                                                 │
│  • get_implementation_context(key, depth=2)                   │
│    → Returns: Slice + dependencies with implementations       │
│                                                                 │
│  • get_related_implementations(key, maxResults=10)            │
│    → Returns: Similar code patterns from codebase             │
│                                                                 │
│  Strategy:                                                      │
│  1. Query RSS for relevant slice keys (fast, structural)       │
│  2. Load source code ONLY for those slices (targeted I/O)      │
│  3. Inject applicable invariants from .ste/invariants/         │
│  4. Optimize for LLM context budget (only send what's needed)  │
└────────────────────────────────────────────────────────────────┘
                              ↓ uses
┌────────────────────────────────────────────────────────────────┐
│               LAYER 1: RSS (Pure Semantic Graph)               │
│                                                                 │
│  What it does: Graph traversal and structural queries          │
│  What it returns: Slice metadata only (no source code)         │
│  Performance: Fast (<100ms, in-memory)                         │
│                                                                 │
│  MCP Tools:                                                     │
│  • search(query) → Find relevant slice keys                   │
│  • get_dependencies(key) → What this component uses           │
│  • get_dependents(key) → What uses this component             │
│  • get_blast_radius(key) → Full impact analysis               │
│  • lookup(key) / by_tag(tag) → Direct queries                 │
│                                                                 │
│  Storage: .ste/state/*.aidoc (YAML)                            │
│  Maintained by: Incremental RECON + File Watcher              │
└────────────────────────────────────────────────────────────────┘
```

**Why This Is Novel:**

1. **Token Efficiency:** Most semantic tools return either metadata OR source. We do structural search first (cheap), then targeted source loading (expensive but precise).

2. **Composable Queries:** LLMs can chain operations:
   - "Search for auth handlers" → get 10 slice keys (RSS layer)
   - "Show implementations for top 3 results" → load source for 3 files (Context Assembly)
   - Result: 3 files loaded instead of entire codebase

3. **CEM Stage Mapping:**
   - **Stage 2 (State Loading):** RSS layer identifies WHAT is relevant
   - **Stage 3 (Analysis):** Context Assembly loads HOW it works (source + invariants)
   - **Stage 4-9:** LLM reasons over assembled context

4. **Performance:** RSS queries are <100ms (in-memory graph). Context Assembly only pays filesystem I/O cost for slices that matter.

5. **Separation of Concerns:**
   - RSS stays pure (graph operations, no I/O side effects)
   - Context Assembly handles integration (filesystem, invariants, formatting)

**Example: Two Ways to Answer "What calls authenticate()?"**

```typescript
// Fast (RSS Layer): Get structural information
search("calls to authenticate function")
→ Returns: ["api/function/login-handler", "api/function/refresh-token"]
→ Time: 45ms

// Rich (Context Assembly): Get implementations
assemble_context("show implementations that call authenticate", includeSource=true)
→ Returns: Slice metadata + full source code + invariants for auth domain
→ Time: 380ms (but only loads 2 relevant files, not entire codebase)
```

### Key Design Decisions

#### 1. Unified Process Architecture
**Decision:** Single process combines MCP server + file watcher  
**Rationale:** Shared in-memory graph, no IPC overhead, simpler deployment  
**Alternative rejected:** Separate processes (complexity, synchronization issues)

#### 2. MCP Over HTTP
**Decision:** Primary interface is MCP (stdio), not HTTP REST API  
**Rationale:**
- Native Cursor integration (stdio transport)
- Tool auto-discovery (Cursor sees available tools automatically)
- Schema validation (MCP enforces input/output schemas)
- Standardized protocol (works with any MCP-compatible AI assistant)

#### 3. Workspace Boundary Only
**Decision:** ste-runtime is local, per-project, pre-merge state  
**Rationale:** Different from ADF (org-wide, post-merge canonical state)  
**Boundary:** Source code is truth → RECON extracts → MCP serves

#### 4. Configuration-Driven
**Decision:** Configure via `ste.config.json` with sensible defaults  
**Rationale:** Balance flexibility with zero-config experience

---

## Specification

### §1 MCP Tools Specification

#### Layer 1: RSS Operations (Pure Semantic Graph)

**Characteristics:**
- Fast (<100ms), in-memory queries
- Returns slice metadata only (no source code)
- Pure graph traversal operations

```typescript
{
  name: "search_semantic_graph",
  description: "Search the semantic graph for components, functions, entities",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query (natural language)" },
      maxResults: { type: "number", default: 50 }
    },
    required: ["query"]
  }
}

{
  name: "get_dependencies",
  description: "Find what a component depends on (forward traversal)",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Component key (domain/type/id)" },
      depth: { type: "number", default: 2, description: "Traversal depth" }
    },
    required: ["key"]
  }
}

{
  name: "get_dependents",
  description: "Find what depends on this component (backward traversal)",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Component key (domain/type/id)" },
      depth: { type: "number", default: 2 }
    },
    required: ["key"]
  }
}

{
  name: "get_blast_radius",
  description: "Analyze full impact surface of changing this component",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Component key (domain/type/id)" },
      depth: { type: "number", default: 2 }
    },
    required: ["key"]
  }
}

{
  name: "lookup_by_key",
  description: "Direct retrieval of component by full key",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Full key (domain/type/id)" }
    },
    required: ["key"]
  }
}

{
  name: "lookup",
  description: "Direct retrieval of component by domain and id",
  inputSchema: {
    type: "object",
    properties: {
      domain: { type: "string", description: "AI-DOC domain (api, data, graph, etc.)" },
      id: { type: "string", description: "Component ID" }
    },
    required: ["domain", "id"]
  }
}

{
  name: "by_tag",
  description: "Find all components with a specific tag",
  inputSchema: {
    type: "object",
    properties: {
      tag: { type: "string", description: "Tag to search for" },
      maxResults: { type: "number", default: 50 }
    },
    required: ["tag"]
  }
}

{
  name: "get_graph_stats",
  description: "Get statistics about the semantic graph",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

#### Layer 2: Context Assembly Operations (Semantic + Source + Invariants)

**Characteristics:**
- Slower (disk I/O), but targeted
- Returns slice metadata + source code + invariants
- Optimized for LLM context budget

```typescript
{
  name: "assemble_context",
  description: "Assemble task-relevant context for LLM reasoning (CEM Stage 2→3)",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Task description (natural language)" },
      includeSource: { type: "boolean", default: true, description: "Include source code" },
      includeInvariants: { type: "boolean", default: true, description: "Include domain invariants" },
      depth: { type: "number", default: 2, description: "Dependency traversal depth" },
      maxNodes: { type: "number", default: 50, description: "Max components to return" },
      maxSourceLines: { type: "number", default: 100, description: "Max lines per file" }
    },
    required: ["query"]
  }
}

{
  name: "get_implementation_context",
  description: "Get full implementation context for a specific component",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Component key (domain/type/id)" },
      includeSource: { type: "boolean", default: true },
      includeDependencies: { type: "boolean", default: true },
      depth: { type: "number", default: 1 }
    },
    required: ["key"]
  }
}

{
  name: "get_related_implementations",
  description: "Find similar code patterns in the codebase",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Component key (domain/type/id)" },
      includeSource: { type: "boolean", default: true },
      maxResults: { type: "number", default: 10 }
    },
    required: ["key"]
  }
}
```

**Operational Tools:**

```typescript
{
  name: "detect_missing_extractors",
  description: "Analyze project and identify missing language/framework extractors",
  inputSchema: {
    type: "object",
    properties: {}
  }
}

{
  name: "get_graph_health",
  description: "Get validation status and health metrics",
  inputSchema: {
    type: "object",
    properties: {}
  }
}

{
  name: "trigger_full_recon",
  description: "Manually trigger full RECON (fallback for errors)",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

### §2 Cross-Platform Considerations

#### Windows-Specific

**Path Normalization:**
- Normalize backslashes to forward slashes for consistency
- Use `path.posix` for AI-DOC paths (always forward slash)
- Use `path.resolve` for file system operations (platform-specific)

**NTFS Characteristics:**
- Case-insensitive but case-preserving
- Normalize paths for comparison: `path.toLowerCase()` on Windows
- Handle long paths (>260 characters) with `\\?\` prefix

**Network Drives:**
- Detect network drives: `path.startsWith('\\\\')` or drive letter check
- Warn user: "Network drives may have delayed/unreliable file system events"
- Recommend: Use local file system for active development
- Fallback: Enable polling mode (`watchdog.fallbackPolling: true`)

**Cloud Sync (OneDrive, Dropbox):**
- Detect cloud sync directories (check for `.onedrive`, `.dropbox` markers)
- Warn user: "Cloud sync may conflict with file watching"
- Recommend: Exclude `.ste/state/` from cloud sync

#### macOS/Linux-Specific

**Case-Sensitive File Systems:**
- Preserve exact case in paths
- No normalization needed for comparison

**Symlink Handling:**
- Follow symlinks by default (`followSymlinks: true` in chokidar)
- Detect circular symlinks (prevent infinite loops)
- Normalize resolved paths

**inotify Limits (Linux):**
- Check system limit: `cat /proc/sys/fs/inotify/max_user_watches`
- Warn if project has more files than limit
- Recommend: Increase limit or use polling mode

#### All Platforms

**`.gitignore` Respect:**
- Use `globby` with `gitignore: true` option
- Automatically exclude `.git/`, `node_modules/`, `.venv/`, `.ste/`

**Large File Handling:**
- Skip files >100MB (unlikely to be source code)
- Binary file detection (check for null bytes in first 8KB)
- Warn on large projects (>10,000 files)

**File System Event Buffer Limits:**
- chokidar has internal buffer (default 10ms)
- Debounce changes (500ms default, configurable)
- Coalesce rapid changes to same file

### §3 Adaptive Tool Parameters

**Problem:** Static defaults for traversal depth are always wrong for some queries. A microservices architecture might need `depth=4`, while a layered monolith works best with `depth=2`.

**Solution:** Analyze graph topology at runtime and dynamically adjust tool parameter defaults.

#### Graph Topology Analysis

```typescript
interface GraphMetrics {
  // Basic stats
  totalComponents: number;
  componentsByDomain: Record<string, number>;
  componentsByType: Record<string, number>;
  
  // Depth analysis
  avgDependencyDepth: number;      // Average forward traversal depth
  maxDependencyDepth: number;      // Deepest dependency chain
  p95DependencyDepth: number;      // 95th percentile
  
  avgDependentDepth: number;       // Average backward traversal depth
  maxDependentDepth: number;       // Deepest dependent chain
  
  // Width analysis
  avgDependenciesPerComponent: number;
  avgDependentsPerComponent: number;
  
  // Architecture patterns
  detectedPattern: 'layered' | 'microservices' | 'component-tree' | 'flat' | 'mixed';
  hasDeepTrees: boolean;           // maxDepth > 5
  hasWideNetwork: boolean;         // avgFanOut > 10
  
  // Recommended defaults
  recommendedDepth: number;
  lastAnalyzed: string;            // ISO timestamp
}
```

#### Analysis Algorithm

```typescript
async function analyzeGraphTopology(graph: AIDocGraph): Promise<GraphMetrics> {
  const metrics: GraphMetrics = {
    totalComponents: graph.nodes.length,
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
    lastAnalyzed: new Date().toISOString()
  };
  
  // 1. Count components by domain/type
  for (const node of graph.nodes) {
    metrics.componentsByDomain[node.domain] = 
      (metrics.componentsByDomain[node.domain] || 0) + 1;
    metrics.componentsByType[node.type] = 
      (metrics.componentsByType[node.type] || 0) + 1;
  }
  
  // 2. Calculate depth statistics
  const forwardDepths: number[] = [];
  const backwardDepths: number[] = [];
  const dependencyCounts: number[] = [];
  const dependentCounts: number[] = [];
  
  for (const node of graph.nodes) {
    // Measure forward depth (dependencies)
    const forwardDepth = measureDepth(graph, node.key, 'forward');
    forwardDepths.push(forwardDepth);
    dependencyCounts.push(node.dependencies?.length || 0);
    
    // Measure backward depth (dependents)
    const backwardDepth = measureDepth(graph, node.key, 'backward');
    backwardDepths.push(backwardDepth);
    dependentCounts.push(node.dependents?.length || 0);
  }
  
  metrics.avgDependencyDepth = mean(forwardDepths);
  metrics.maxDependencyDepth = Math.max(...forwardDepths);
  metrics.p95DependencyDepth = percentile(forwardDepths, 0.95);
  
  metrics.avgDependentDepth = mean(backwardDepths);
  metrics.maxDependentDepth = Math.max(...backwardDepths);
  
  metrics.avgDependenciesPerComponent = mean(dependencyCounts);
  metrics.avgDependentsPerComponent = mean(dependentCounts);
  
  // 3. Detect architecture pattern
  metrics.hasDeepTrees = metrics.maxDependencyDepth > 5;
  metrics.hasWideNetwork = metrics.avgDependenciesPerComponent > 10;
  metrics.detectedPattern = detectPattern(metrics);
  
  // 4. Calculate recommended depth
  metrics.recommendedDepth = calculateOptimalDepth(metrics);
  
  return metrics;
}

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

function calculateOptimalDepth(metrics: GraphMetrics): number {
  const { detectedPattern, avgDependencyDepth, p95DependencyDepth } = metrics;
  
  // Pattern-specific recommendations
  const baseDepth = {
    'component-tree': 4,   // Deep component hierarchies
    'microservices': 3,    // Peer services with shared deps
    'layered': 2,          // Clear layer boundaries
    'flat': 2,             // Simple utility libraries
    'mixed': 3             // Conservative default
  }[detectedPattern];
  
  // Adjust based on actual graph characteristics
  // Use P95 instead of average (avoid outliers)
  const dataDepth = Math.ceil(p95DependencyDepth * 0.6);
  
  // Take max of pattern-based and data-driven, cap at 5
  return Math.min(Math.max(baseDepth, dataDepth), 5);
}
```

#### Dynamic Tool Schema Updates

```typescript
class AdaptiveMCPServer {
  private graphMetrics: GraphMetrics;
  private toolSchemas: Map<string, ToolSchema>;
  
  async initialize() {
    // Load graph and analyze
    const graph = await this.loadGraph();
    this.graphMetrics = await analyzeGraphTopology(graph);
    
    // Update tool schemas with calculated defaults
    this.updateToolDefaults();
    
    // Log recommendations
    console.log(`[MCP Server] Graph analysis complete:`);
    console.log(`  - Pattern: ${this.graphMetrics.detectedPattern}`);
    console.log(`  - Components: ${this.graphMetrics.totalComponents}`);
    console.log(`  - Avg depth: ${this.graphMetrics.avgDependencyDepth.toFixed(1)}`);
    console.log(`  - Recommended traversal depth: ${this.graphMetrics.recommendedDepth}`);
  }
  
  updateToolDefaults() {
    const depth = this.graphMetrics.recommendedDepth;
    
    // Update all traversal tools
    const traversalTools = [
      'get_dependencies',
      'get_dependents',
      'get_blast_radius',
      'assemble_context'
    ];
    
    for (const toolName of traversalTools) {
      const tool = this.toolSchemas.get(toolName);
      if (tool?.inputSchema.properties.depth) {
        tool.inputSchema.properties.depth.default = depth;
        tool.inputSchema.properties.depth.description = 
          `Traversal depth (default: ${depth}, based on graph topology)`;
      }
    }
  }
  
  // Recalculate after significant graph changes
  async onReconComplete() {
    const graph = await this.loadGraph();
    const newMetrics = await analyzeGraphTopology(graph);
    
    // Only update if significant change (20% difference)
    const depthChange = Math.abs(
      newMetrics.recommendedDepth - this.graphMetrics.recommendedDepth
    );
    
    if (depthChange >= 1) {
      console.log(`[MCP Server] Graph structure changed significantly`);
      console.log(`  - Old recommended depth: ${this.graphMetrics.recommendedDepth}`);
      console.log(`  - New recommended depth: ${newMetrics.recommendedDepth}`);
      
      this.graphMetrics = newMetrics;
      this.updateToolDefaults();
      
      // Persist metrics
      await this.saveGraphMetrics(newMetrics);
    }
  }
}
```

#### Metrics Persistence

**File:** `.ste/state/graph-metrics.json`

```json
{
  "totalComponents": 450,
  "componentsByDomain": {
    "api": 120,
    "data": 80,
    "graph": 150,
    "ui": 100
  },
  "avgDependencyDepth": 3.2,
  "maxDependencyDepth": 8,
  "p95DependencyDepth": 5,
  "detectedPattern": "component-tree",
  "hasDeepTrees": true,
  "hasWideNetwork": false,
  "recommendedDepth": 4,
  "lastAnalyzed": "2026-01-11T10:30:00.000Z",
  "reasoning": "Deep component hierarchies detected (React), using depth=4"
}
```

#### Benefits

1. **Automatic Optimization:** Defaults adjust to your codebase structure
2. **Transparent:** Logs explain why a depth was chosen
3. **Self-Improving:** Updates as codebase evolves
4. **No User Tuning:** Works well out-of-the-box
5. **Pattern Detection:** Identifies architecture style automatically

#### Example Behavior

```bash
# React frontend (deep component trees)
[MCP Server] Graph analysis complete:
  - Pattern: component-tree
  - Components: 450
  - Avg depth: 4.7
  - Recommended traversal depth: 4

# Python backend (layered architecture)
[MCP Server] Graph analysis complete:
  - Pattern: layered
  - Components: 120
  - Avg depth: 2.3
  - Recommended traversal depth: 2

# Microservices (wide, shallow)
[MCP Server] Graph analysis complete:
  - Pattern: microservices
  - Components: 85
  - Avg depth: 2.8
  - Recommended traversal depth: 3
```

### §4 Configuration Schema

**File:** `ste.config.json`

```json
{
  "watchdog": {
    "enabled": false,
    "debounceMs": 500,
    "aiEditDebounceMs": 2000,
    "syntaxValidation": true,
    "transactionDetection": true,
    "stabilityCheckMs": 100,
    "patterns": ["**/*.py", "**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"],
    "ignore": [".git", "node_modules", ".venv", "__pycache__", "dist", "build"],
    "fullReconciliationInterval": 300000,
    "fallbackPolling": false,
    "pollingInterval": 5000
  },
  "mcp": {
    "transport": "stdio",
    "logLevel": "info"
  },
  "rss": {
    "stateRoot": ".ste/state",
    "defaultDepth": 2,
    "maxResults": 50
  }
}
```

**Field Descriptions:**

- `watchdog.enabled` - Enable file watching (default: false, opt-in)
- `watchdog.debounceMs` - Wait time after last change before triggering RECON (manual edits)
- `watchdog.aiEditDebounceMs` - Debounce for AI-generated edits (Cursor streaming pattern, default: 2000ms)
- `watchdog.syntaxValidation` - Skip RECON for files with syntax errors (default: true)
- `watchdog.transactionDetection` - Wait for multi-file edits to complete (default: true)
- `watchdog.stabilityCheckMs` - Time to wait for file mtime stability check (default: 100ms)
- `watchdog.patterns` - Glob patterns for files to watch
- `watchdog.ignore` - Directories/patterns to ignore
- `watchdog.fullReconciliationInterval` - Periodic full RECON (ms, 0 = disabled)
- `watchdog.fallbackPolling` - Use polling instead of native events (for network drives)
- `watchdog.pollingInterval` - Polling interval if fallbackPolling enabled
- `mcp.transport` - MCP transport type (stdio only for now)
- `mcp.logLevel` - Logging level (error, warn, info, debug)
- `rss.stateRoot` - Path to AI-DOC state directory
- `rss.defaultDepth` - Default traversal depth for dependencies/dependents
- `rss.maxResults` - Default maximum results for search operations

### §4 CLI Integration

```bash
# Start MCP server with file watching
ste watch [options]
  --mcp          # Explicitly enable MCP mode (default when run by Cursor)
  --no-watch     # Disable file watching (MCP server only)
  --config PATH  # Custom config file path

# One-shot RECON (no server)
ste recon [options]
  --incremental  # Use incremental RECON (default if manifest exists)
  --full         # Force full RECON

# Query operations (hits running server if available, else reads from disk)
ste query <command> [args]
  search <query>
  dependencies <key> [--depth N]
  dependents <key> [--depth N]
  blast-radius <key> [--depth N]
  lookup <domain> <id>
  stats
```

**Cursor MCP Configuration:**

```json
// ~/.cursor/mcp.json
{
  "mcpServers": {
    "ste-runtime": {
      "command": "ste",
      "args": ["watch", "--mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

### §5 Governance Confidence Framework

**Theoretical Estimates (Subject to Empirical Validation):**

#### Layer 1: Explicit State (vs Hallucinated)
- **Target:** ~84% confidence state is correct
- **Components:**
  - AI-DOC extraction accuracy: 95% (deterministic extractors, tested)
  - RSS traversal completeness: 98% (explicit graph, bounded)
  - State freshness: 90% (watchdog + periodic reconciliation)
- **Baseline ungoverned:** ~30% (LLM hallucinates context)

#### Layer 2: Instruction Following (CEM + Invariants)
- **Estimated:** ~44% adherence to process
- Based on known LLM instruction-following rates for complex multi-stage instructions
- **Baseline ungoverned:** ~70-80% for simple instructions

#### Layer 3: Output Validation (Hard Enforcement)
- **Estimated:** ~54% of violations caught
- Depends on validator coverage (static analysis, tests, MCP validators)
- **Critical:** This catches violations even when Layer 2 fails

#### Layer 4: Human Review (Ultimate Enforcement)
- **Estimated:** ~65% of remaining violations caught
- Based on human cognitive limitations, alert fatigue
- **Critical:** Final safety net

**Overall Theoretical Estimate:**
- Compliant path: 84% × 44% = ~37% perfect compliance
- Caught violations: 84% × 56% × 54% = ~25% violations blocked by validation
- Human catch: 84% × 56% × 46% × 65% = ~14% violations caught by human
- **Total governed: ~68-76%** (vs ~25% ungoverned)

**Important Caveats:**
- These are **theoretical estimates** based on enforcement layer analysis
- Actual governance confidence requires **empirical measurement**
- Metrics will vary by:
  - Project complexity
  - Language support and extractor quality
  - Validation coverage
  - Human reviewer expertise
- Baseline ungoverned LLM confidence (~25%) is also an estimate
- **We must validate these claims through empirical testing**

**Measurement Strategy (To Validate Estimates):**
1. Establish baseline (ungoverned LLM on test tasks)
2. Track AI-DOC extraction accuracy against ground truth
3. Monitor RSS traversal completeness (coverage metrics)
4. Log validation pass/fail rates over time
5. Record human approval/rejection rates
6. Compare governed vs ungoverned outputs on same tasks
7. Publish validation methodology and results
8. Iterate on weak enforcement layers

---

## Implementation Notes

### Existing Code Reuse

- **RECON:** Use existing `src/recon/incremental-recon.ts`
- **RSS:** Use existing `src/rss/rss-operations.ts`
- **Change Detection:** Use existing `src/watch/change-detector.ts`
- **Safeguards:** Use existing `src/watch/write-tracker.ts`, `src/watch/update-coordinator.ts`

### New Components Required

- **MCP Server:** `src/mcp/mcp-server.ts` (uses `@modelcontextprotocol/sdk`)
- **Watchdog Loop:** `src/watch/watchdog.ts` (orchestrates watcher + RECON)
- **Edit Queue Manager:** `src/watch/edit-queue-manager.ts` (handles debouncing, syntax validation, transaction detection)
- **Transaction Detector:** `src/watch/transaction-detector.ts` (detects multi-file edits)
- **CLI Entry Point:** `src/cli/watch-cli.ts` (handles `ste watch`)

### Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

**Note:** `chokidar`, `globby`, `js-yaml` already exist in dependencies.

### Integration Testing Strategy

**Test Scenarios:**
1. File change → incremental RECON → graph update → MCP query returns new state
2. **Cursor streaming edits** → multiple rapid saves → single RECON run (not 10+)
3. **Multi-file transaction** → Cursor edits 5 files → wait for completion → single RECON
4. **Syntax error** → invalid code mid-edit → skip RECON → valid code → trigger RECON
5. **AI edit detection** → rapid large changes → 2s debounce (not 500ms)
6. Missing extractor detection → warning to user
7. Concurrent file changes → debouncing → single RECON run
8. Graph corruption → fallback to full RECON
9. Platform-specific path handling (Windows vs Unix)

**Test Implementation:**
- Use temporary project fixtures (`fixtures/` directory)
- Mock file system watcher for determinism
- Verify MCP protocol compliance
- Measure governance improvement over baseline

---

## Future Work

### Phase 1 Extensions

#### 1. Invariant Injection
- Load invariants from `.ste/invariants/`
- Add `get_invariants_for_scope(scope)` MCP tool
- Return context + invariants together
- **Goal:** Raise Layer 2 confidence (instruction following)

#### 2. Divergence Detection
- Currency validation (source vs extracted timestamps)
- Conflict detection in AI-DOC
- Staleness warnings
- **Goal:** Raise Layer 1 confidence (state freshness)

### Phase 2: CEM Integration

#### 3. CEM Orchestration Layer
- Enforce 9-stage execution model
- Structured output validation (require CEM trace)
- Execution trace logging
- **Goal:** Raise Layer 2 confidence (process adherence)

#### 4. Self-Bootstrapping Extractors
- Detect missing language support
- Generate extractor implementation plans using RSS context of existing extractors
- Governed generation with human approval
- **Goal:** 85-90% governance confidence for meta-operations
- **Benefit:** Expand coverage automatically

**Self-Bootstrapping Flow:**
```
1. ste-runtime detects missing extractor (e.g., Java)
2. Cursor queries RSS for existing extractor patterns (Python, Angular)
3. Cursor proposes implementation plan
4. Human reviews and approves
5. Cursor generates: java-extractor.ts + tests
6. Run tests → iterate if needed
7. New extractor ready, coverage expanded
```

### Phase 3: Runtime Boundary

#### 5. ADF Integration
- Remote MCP for org-wide semantic state
- Post-merge canonical state authority
- Multi-environment isolation
- **Goal:** 95-99% governance confidence (cryptographic enforcement)

---

## Success Criteria

### Functional
- ✅ Cursor can discover and call ste-runtime MCP tools
- ✅ File changes trigger incremental RECON within 1 second
- ✅ RSS queries return fresh state (<100ms)
- ✅ Windows/macOS/Linux support with platform-specific optimizations
- ✅ Graceful degradation (fallback to full RECON on errors)

### Non-Functional
- ✅ Memory usage <100MB idle, <500MB under load
- ✅ CPU usage <1% idle, <10% during RECON
- ✅ No infinite loops (WriteTracker + UpdateCoordinator prevent)
- ✅ **Measurable governance improvement** over ungoverned LLM (establish baseline, collect metrics, validate estimates)

### Developer Experience
- ✅ Zero-config startup (`ste watch`)
- ✅ Clear error messages and recovery paths
- ✅ Visible progress indicators
- ✅ Documentation with examples

---

## Why This Matters

### Potentially Novel: Two-Layer Context Architecture

**The Problem:** Existing semantic code tools face a dilemma:
- Return only metadata → LLM lacks implementation details
- Return full source → Token budget explodes, irrelevant code floods context

**Our Solution:** Layered context assembly with query composition

```
Traditional Approach:
User: "Fix the auth bug"
Tool: [Returns entire auth module: 50 files, 15,000 lines, 80,000 tokens]
LLM: [Struggles to find relevant code in noise]

STE Two-Layer Approach:
User: "Fix the auth bug"

Step 1 (RSS Layer): search("authentication bugs")
→ Returns: 12 slice keys in 45ms

Step 2 (LLM narrows): "Show me login-related handlers"
→ get_dependents("api/function/authenticate")
→ Returns: 3 slice keys in 23ms

Step 3 (Context Assembly): assemble_context("login handlers with auth calls")
→ Loads source for 3 files (240 lines, 1,200 tokens)
→ Includes applicable invariants from auth domain
→ Returns in 180ms

LLM: [Works with precise, relevant context]
```

**Why This Matters:**
1. **Token Efficiency:** 98% reduction in context size (80K → 1.2K tokens)
2. **Composability:** LLM can iteratively refine queries (narrow → specific)
3. **Speed:** Fast RSS queries enable conversational narrowing
4. **Precision:** Only load source for slices that matter

**Prior Art Analysis (Preliminary):**

Systems we've examined:
- **GitHub Copilot:** Sends entire files (no semantic graph)
- **OpenAI Code Interpreter:** Executes code, no structural understanding
- **Sourcegraph:** Semantic search, but returns full files
- **LSP (Language Servers):** Local semantic analysis, no graph traversal
- **CodeQL:** Query language for code, but no LLM integration

**What appears to be different:**
- Real-time semantic graph maintenance (file watching + incremental RECON)
- Two-layer context assembly (structural search → targeted source loading)
- Native MCP integration (AI assistants can query directly)
- Governed cognition framework (CEM + invariant injection)

**We have not yet:**
- Conducted exhaustive academic literature review
- Searched patent databases comprehensively
- Reviewed all industry research labs (Google, Microsoft, Meta)
- Received peer review feedback

**We welcome:** References to similar work, corrections, and feedback from the community.

### Self-Expanding Semantic Understanding
- Detect missing extractors → Generate implementation → Validate → Expand coverage
- Each new extractor becomes reference for future extractors
- Knowledge compounds over time
- **Two-layer enables this:** Query existing extractors (RSS) → load implementations (Context Assembly) → generate new extractor

### Measurable Governance
- Quantifiable confidence metrics (pending validation)
- Transparent enforcement layers
- Empirical validation strategy

### OS for AI Cognition
- Not just a tool, but an operating system for governed LLM reasoning
- Explicit state instead of hallucination
- Deterministic traversal instead of probabilistic search
- Layered enforcement instead of best-effort compliance
- **Two-layer enables:** Semantic routing (RSS) → context assembly (rich state) → governed execution (CEM)

---

## References

- [STE Architecture](../../spec/ste-spec/architecture/STE-Architecture.md) - Sections 3.1, 4.6, 5.3
- [E-ADR-007](E-ADR-007-Watchdog-Authoritative-Mode.md) - Workspace Boundary operation
- [E-ADR-004](E-ADR-004-RSS-CLI-Implementation.md) - RSS operations
- [Incremental RECON](../../instructions/recon-incremental.md) - Implementation guide
- [RSS Programmatic API](../../instructions/RSS-PROGRAMMATIC-API.md) - API documentation

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-11 | 0.1 | Initial design document |
| 2026-01-11 | 0.2 | Added two-layer architecture (RSS + Context Assembly), identified as potentially novel innovation |

