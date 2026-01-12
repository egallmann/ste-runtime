# RSS Programmatic API

**Authority:** E-ADR-004 (RSS CLI Implementation for Developer-Invoked Graph Traversal)  
**Audience:** AI coding assistants (Cursor, Copilot, etc.) and machine consumers  
**Version:** 1.0.0

---

## Overview

RSS (Runtime State Slicing) exposes a **TypeScript API** for programmatic access to the semantic graph. RSS is a graph traversal protocol for deterministic context assembly. This is the preferred interface for AI coding assistants and automated tools.

**Key Point:** The CLI (`rss-cli.js`) is a wrapper for human developers. Machines should use the programmatic API directly for:
- Faster execution (no process spawning)
- Structured data (typed objects, not parsed terminal output)
- Better integration with tooling

---

## Quick Start

### Installation

The RSS API is exported from the `ste-runtime` package:

```typescript
import {
  // Core
  initRssContext,
  search,
  lookup,
  lookupByKey,
  
  // Traversal
  dependencies,
  dependents,
  blastRadius,
  byTag,
  
  // Context assembly
  findEntryPoints,
  assembleContext,
  
  // Statistics & validation
  getGraphStats,
  validateGraphHealth,
  validateBidirectionalEdges,
  findOrphanedNodes,
  findAllBrokenEdges,
  
  // Hybrid workflow helpers
  extractFilePaths,
  getRelevantFiles,
  
  // Types
  type RssContext,
  type RssQueryResult,
  type BrokenEdge,
  type BidirectionalInconsistency,
} from 'ste-runtime';
```

Or import directly from the source:

```typescript
import { initRssContext, search } from './ste-runtime/src/rss/rss-operations.js';
```

### Basic Usage

```typescript
// 1. Initialize context (load the semantic graph)
const ctx = await initRssContext('.ste/state');

// 2. Search for components
const results = search(ctx, 'authentication');

// 3. Traverse relationships
if (results.nodes.length > 0) {
  const impact = blastRadius(ctx, results.nodes[0].key);
  console.log(`Impact surface: ${impact.nodes.length} nodes`);
}
```

---

## API Reference

### `initRssContext(stateRoot?: string): Promise<RssContext>`

Initialize the RSS context by loading the AI-DOC graph from disk.

**Parameters:**
- `stateRoot` - Path to the state directory (default: `.ste/state`)

**Returns:** `RssContext` containing the loaded graph

**Example:**
```typescript
const ctx = await initRssContext('.ste/state');
console.log(`Loaded ${ctx.graph.size} nodes`);
```

---

### `search(ctx, query, options?): RssQueryResult`

Entry point discovery via natural language or keyword search.

**Parameters:**
- `ctx: RssContext` - Initialized context
- `query: string` - Search query
- `options.domain?: string` - Filter by domain
- `options.type?: string` - Filter by type  
- `options.maxResults?: number` - Limit results (default: 50)

**Returns:** `RssQueryResult` with matching nodes ranked by relevance

**Example:**
```typescript
const results = search(ctx, 'lambda handler', { maxResults: 10 });
for (const node of results.nodes) {
  console.log(`${node.key} - ${node.path}`);
}
```

---

### `lookup(ctx, domain, id): AidocNode | null`

Direct retrieval by domain and ID.

**Parameters:**
- `ctx: RssContext` - Initialized context
- `domain: string` - Domain (e.g., 'graph', 'infrastructure', 'data')
- `id: string` - Node ID

**Returns:** The matching node or `null`

**Example:**
```typescript
const node = lookup(ctx, 'graph', 'validateToken');
if (node) {
  console.log(`Found: ${node.key}`);
}
```

---

### `lookupByKey(ctx, key): AidocNode | null`

Direct retrieval by full key.

**Parameters:**
- `ctx: RssContext` - Initialized context
- `key: string` - Full key in format `domain/type/id`

**Returns:** The matching node or `null`

**Example:**
```typescript
const node = lookupByKey(ctx, 'infrastructure/resource/AccountsTable');
```

---

### `dependencies(ctx, startKey, maxDepth?, maxNodes?): RssQueryResult`

Forward traversal - what does this node depend on?

**Parameters:**
- `ctx: RssContext` - Initialized context
- `startKey: string` - Starting node key
- `maxDepth: number` - Traversal depth (default: 2)
- `maxNodes: number` - Maximum nodes to return (default: 100)

**Returns:** `RssQueryResult` with dependent nodes

**Example:**
```typescript
const deps = dependencies(ctx, 'graph/function/processOrder', 3);
console.log(`Depends on ${deps.nodes.length} components`);
```

---

### `dependents(ctx, startKey, maxDepth?, maxNodes?): RssQueryResult`

Backward traversal - what depends on this node?

**Parameters:**
- `ctx: RssContext` - Initialized context
- `startKey: string` - Starting node key
- `maxDepth: number` - Traversal depth (default: 2)
- `maxNodes: number` - Maximum nodes to return (default: 100)

**Returns:** `RssQueryResult` with nodes that depend on the target

**Example:**
```typescript
const rdeps = dependents(ctx, 'data/entity/UsersTable', 2);
console.log(`${rdeps.nodes.length} components use this table`);
```

---

### `blastRadius(ctx, startKey, maxDepth?, maxNodes?): RssQueryResult`

Bidirectional traversal - full impact surface.

**Parameters:**
- `ctx: RssContext` - Initialized context  
- `startKey: string` - Starting node key
- `maxDepth: number` - Traversal depth (default: 2)
- `maxNodes: number` - Maximum nodes to return (default: 100)

**Returns:** `RssQueryResult` with all connected nodes

**Example:**
```typescript
const impact = blastRadius(ctx, 'graph/module/auth-service.ts', 3);
console.log(`Blast radius: ${impact.nodes.length} nodes affected`);
```

---

### `byTag(ctx, tag, maxNodes?): RssQueryResult`

Cross-domain query by tag.

**Parameters:**
- `ctx: RssContext` - Initialized context
- `tag: string` - Tag in format `category:value`
- `maxNodes: number` - Maximum nodes to return (default: 100)

**Supported Tags:**
- `handler:lambda` - Lambda handler functions
- `layer:api` - API layer components
- `lang:python` - Python modules
- `lang:typescript` - TypeScript modules
- `aws:dynamodb` - DynamoDB resources
- `storage:dynamodb` - DynamoDB data models

**Example:**
```typescript
const handlers = byTag(ctx, 'handler:lambda');
console.log(`Found ${handlers.nodes.length} Lambda handlers`);
```

---

### `findEntryPoints(ctx, nlQuery, maxEntryPoints?): { entryPoints, searchTerms }`

Analyze a natural language query and find relevant entry points.

**Parameters:**
- `ctx: RssContext` - Initialized context
- `nlQuery: string` - Natural language task description
- `maxEntryPoints: number` - Maximum entry points (default: 10)

**Returns:** Object with:
- `entryPoints: AidocNode[]` - Ranked entry points
- `searchTerms: string[]` - Extracted search terms

**Example:**
```typescript
const { entryPoints, searchTerms } = findEntryPoints(
  ctx, 
  'implement user password reset'
);
console.log(`Terms: ${searchTerms.join(', ')}`);
console.log(`Entry points: ${entryPoints.map(n => n.key).join(', ')}`);
```

---

### `assembleContext(ctx, entryPoints, options?): { nodes, summary }`

Assemble a context bundle from entry points.

**Parameters:**
- `ctx: RssContext` - Initialized context
- `entryPoints: AidocNode[]` - Starting nodes
- `options.maxDepth?: number` - Traversal depth (default: 2)
- `options.maxNodes?: number` - Maximum nodes (default: 100)

**Returns:** Object with:
- `nodes: AidocNode[]` - Assembled context
- `summary` - Statistics about the context

**Example:**
```typescript
const { entryPoints } = findEntryPoints(ctx, 'add email notifications');
const context = assembleContext(ctx, entryPoints, { maxDepth: 2 });

console.log(`Context: ${context.summary.totalNodes} nodes`);
console.log(`By domain:`, context.summary.byDomain);
```

---

### `getGraphStats(ctx): GraphStats`

Get statistics about the semantic graph.

**Returns:** Object with:
- `totalNodes: number`
- `byDomain: Record<string, number>`
- `byType: Record<string, number>`
- `totalEdges: number`

**Example:**
```typescript
const stats = getGraphStats(ctx);
console.log(`Graph has ${stats.totalNodes} nodes, ${stats.totalEdges} edges`);
```

---

### `validateGraphHealth(ctx): GraphHealthReport`

Comprehensive graph health check for all traversability issues.

**Returns:** Object with:
- `brokenEdges: BrokenEdge[]` - Dangling references
- `bidirectionalInconsistencies: BidirectionalInconsistency[]` - Asymmetric edges
- `orphanedNodes: AidocNode[]` - Isolated nodes
- `summary: { totalNodes, totalEdges, brokenEdgeCount, inconsistencyCount, orphanCount, isHealthy }`

**Example:**
```typescript
const health = validateGraphHealth(ctx);
if (!health.summary.isHealthy) {
  console.log('Broken edges:', health.summary.brokenEdgeCount);
  console.log('Inconsistencies:', health.summary.inconsistencyCount);
}
```

---

### `validateBidirectionalEdges(ctx): BidirectionalInconsistency[]`

Validate that all edges have reciprocal back-references.

**Example:**
```typescript
const inconsistencies = validateBidirectionalEdges(ctx);
for (const issue of inconsistencies) {
  console.log(`${issue.sourceKey} -> ${issue.targetKey}: missing ${issue.missing}`);
}
```

---

### `findOrphanedNodes(ctx): AidocNode[]`

Find nodes with no incoming or outgoing edges (undiscoverable by traversal).

**Example:**
```typescript
const orphans = findOrphanedNodes(ctx);
console.log(`${orphans.length} orphaned nodes`);
```

---

### `findAllBrokenEdges(ctx): BrokenEdge[]`

Full graph scan for all dangling references.

**Example:**
```typescript
const broken = findAllBrokenEdges(ctx);
for (const edge of broken) {
  console.log(`${edge.fromKey} references missing ${edge.toKey}`);
}
```

---

## Types

### `RssContext`

```typescript
interface RssContext {
  graph: AidocGraph;        // Map<string, AidocNode>
  stateRoot: string;        // Resolved path to state directory
  graphVersion: string;     // Version identifier
}
```

### `RssQueryResult`

```typescript
interface RssQueryResult {
  nodes: AidocNode[];       // Matching nodes
  traversalDepth: number;   // Depth used for traversal
  truncated: boolean;       // True if results were limited
  brokenEdges: BrokenEdge[]; // Dangling references encountered during traversal
}
```

### `AidocNode`

```typescript
interface AidocNode {
  key: string;              // Unique key: domain/type/id
  domain: string;           // Domain: graph, infrastructure, data, frontend, api, behavior
  type: string;             // Type: function, module, class, resource, entity, etc.
  id: string;               // Unique identifier within domain/type
  sourceFiles: string[];    // Source file paths
  references: AidocEdge[];  // Outgoing edges (what this depends on)
  referencedBy: AidocEdge[]; // Incoming edges (what depends on this)
  tags: string[];           // Semantic tags (e.g., 'handler:lambda', 'lang:python')
  path?: string;            // Primary source file path
  slice?: Slice;            // Line range in source file { start, end? }
}
```

### `AidocEdge`

```typescript
interface AidocEdge {
  domain: string;
  type: string;
  id: string;
}
```

### `BrokenEdge`

```typescript
interface BrokenEdge {
  fromKey: string;          // Source node with the broken reference
  toKey: string;            // Target node that doesn't exist
  edgeType: 'references' | 'referenced_by';
}
```

### `BidirectionalInconsistency`

```typescript
interface BidirectionalInconsistency {
  sourceKey: string;        // Source node
  targetKey: string;        // Target node
  missing: 'forward' | 'backward'; // Which direction is missing
}
```

---

## Recommended Workflow for AI Assistants

### 1. Exploring a Codebase

```typescript
// Load graph
const ctx = await initRssContext('.ste/state');

// Get overview
const stats = getGraphStats(ctx);
console.log('Domains:', Object.keys(stats.byDomain));

// Find entry points for the task
const { entryPoints } = findEntryPoints(ctx, 'user authentication flow');

// Get relevant context
const context = assembleContext(ctx, entryPoints);
```

### 2. Understanding Impact Before Changes

```typescript
// Find the component to modify
const results = search(ctx, 'processOrder');
const target = results.nodes[0];

// Check full impact
const impact = blastRadius(ctx, target.key, 3);
console.log(`Modifying this affects ${impact.nodes.length} components`);

// List affected files
const files = new Set(impact.nodes.flatMap(n => n.sourceFiles));
console.log('Files to review:', [...files]);
```

### 3. Finding Related Components

```typescript
// All Lambda handlers
const handlers = byTag(ctx, 'handler:lambda');

// All DynamoDB tables
const tables = byTag(ctx, 'aws:dynamodb');

// All API layer modules
const api = byTag(ctx, 'layer:api');
```

---

## Performance Notes

- **Graph loading** is O(n) where n = number of slices. Cache the context.
- **Lookups** are O(1) - direct map access.
- **Traversals** are bounded by `maxDepth` and `maxNodes` parameters.
- **Search** is O(n) scan with scoring - results are ranked.

For long-running processes, initialize context once and reuse:

```typescript
let rssContext: RssContext | null = null;

async function getRssContext(): Promise<RssContext> {
  if (!rssContext) {
    rssContext = await initRssContext('.ste/state');
  }
  return rssContext;
}
```

---

## Hybrid Workflow: RSS + Grep/Read

**Best Practice for AI Coding Assistants**

RSS and grep/read serve complementary purposes:

| Tool | Strength | Weakness |
|------|----------|----------|
| RSS | Deterministic scope discovery | No code content, just structure |
| Grep | Exact text/pattern matching | Probabilistic - misses semantic relationships |
| Read | Full code understanding | Requires knowing which files to read |

### The Hybrid Pattern

**Use RSS first to identify the relevant subgraph, then grep/read for deep understanding:**

```
Task Description
     ↓
[RSS: findEntryPoints + blastRadius]
     ↓
Deterministic subgraph (file paths)
     ↓
[Grep/Read: analyze scoped files]
     ↓
Complete understanding without misses
```

### Why This Works

1. **RSS eliminates misses**: A function might not contain the word "authentication" but is called by the auth flow. RSS finds it via graph traversal; grep would miss it.

2. **Grep provides depth**: RSS tells you `auth-service.ts` is relevant; grep finds the exact line where the bug is.

3. **Deterministic scope**: Instead of grep searching the entire codebase (probabilistic), you search a known-relevant subset (deterministic).

### Implementation Pattern

```typescript
import { initRssContext, findEntryPoints, blastRadius } from 'ste-runtime';

async function getRelevantFiles(task: string): Promise<string[]> {
  const ctx = await initRssContext('.ste/state');
  
  // 1. Find entry points for the task
  const { entryPoints } = findEntryPoints(ctx, task);
  
  // 2. Expand to full impact surface
  const allRelevant = new Set<string>();
  for (const entry of entryPoints) {
    const impact = blastRadius(ctx, entry.key, 2);
    for (const node of impact.nodes) {
      for (const file of node.sourceFiles) {
        allRelevant.add(file);
      }
    }
    // Include entry point's files too
    for (const file of entry.sourceFiles) {
      allRelevant.add(file);
    }
  }
  
  return [...allRelevant];
}

// Usage:
const files = await getRelevantFiles('fix user password reset');
// Returns: ['src/auth/auth-service.ts', 'src/api/users.py', ...]

// Now grep/read ONLY these files for deep understanding
```

### Helper: Extract File Paths from Subgraph

```typescript
/**
 * Extract unique file paths from a set of nodes
 */
function extractFilePaths(nodes: AidocNode[]): string[] {
  const files = new Set<string>();
  for (const node of nodes) {
    for (const file of node.sourceFiles) {
      files.add(file);
    }
  }
  return [...files].sort();
}

// Example: Get all files touched by a component
const impact = blastRadius(ctx, 'graph/function/processOrder', 3);
const filesToRead = extractFilePaths(impact.nodes);
// filesToRead: ['backend/lambda/api/orders.py', 'backend/lambda/shared/db.py', ...]
```

### Workflow for AI Assistants

**When given a task:**

1. **Orient with RSS:**
   ```typescript
   const ctx = await initRssContext('.ste/state');
   const { entryPoints } = findEntryPoints(ctx, taskDescription);
   const context = assembleContext(ctx, entryPoints, { maxDepth: 2 });
   ```

2. **Extract file scope:**
   ```typescript
   const files = extractFilePaths(context.nodes);
   // files = ['src/auth.ts', 'src/api/users.py', 'cfn/template.yaml', ...]
   ```

3. **Deep dive with grep/read on scoped files only:**
   ```typescript
   // Instead of: grep "password" across entire codebase
   // Do: grep "password" only in the files RSS identified
   for (const file of files) {
     // read_file(file) or grep within file
   }
   ```

4. **Make changes with confidence:**
   - You know the complete scope (no misses)
   - You have deep understanding of that scope
   - Changes are accurate and complete

### Comparison: RSS+Grep vs Grep-Only

| Scenario | Grep Only | RSS + Grep |
|----------|-----------|------------|
| "Fix auth bug" | Searches for "auth" - misses `TokenValidator` class | Finds all auth-related code via graph |
| "Add logging" | Might find some handlers, miss utility functions | Finds all handlers + their dependencies |
| "Refactor DB layer" | Searches "DynamoDB" - misses wrapper functions | Finds data entities + all consumers |
| "Update API endpoint" | Finds endpoint, might miss frontend callers | Finds endpoint + infrastructure + frontend |

---

## See Also

- [RSS-USAGE-GUIDE.md](./RSS-USAGE-GUIDE.md) - CLI interface for human developers
- [RECON-README.md](./RECON-README.md) - How to generate the semantic state

