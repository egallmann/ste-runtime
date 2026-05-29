<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: faa5887192f0f63a1e7faeaf1723339da7c53a902a67c61fa4339c61c1633858
rendered_hash: f21db8c9b9178d86552a0df5af850b1b898715f477d7e9651ed0304972f5d458
-->

# ADR-PC-0001: MCP Server and Tool Registry

**Status:** proposed  
**Created:** 2026-03-15  
**Modified:** 2026-05-22  **Authors:** ste-runtime  
**Domains:** mcp, integration, runtime  

**Implements Logical:** ADR-L-0004, ADR-L-0006, ADR-L-0007, ADR-L-0018  
**Technologies:** typescript, node.js, mcp, zod


---

## Context

This component exposes assistant-facing runtime tools over MCP and binds
structural, operational, context, optimized, obligation-oriented, and
workspace graph query tool surfaces into one discoverable server boundary.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing implementation language.

### @modelcontextprotocol/sdk (library)

**Version:** 1.x

**Rationale:**
MCP protocol implementation.



## Component Specifications

### COMP-0001: MCP Server and Tool Registry (service)

**Responsibilities:**
- Serve MCP stdio runtime for assistant integration
- Register structural, operational, context, optimized, obligation, and workspace graph query tools
- Route tool requests onto runtime graph, context, and workspace query services


**Interfaces:**
- **IFACE-0001** (CLI): Entry surfaces:
- src/mcp/mcp-server.ts
- MCP stdio tool registration for structural, operational, c...

**Implementation Identifiers:**
- Module Path: `src/mcp/mcp-server.ts`




## Implementation Decisions

### IMPL-0001: Graph topology analysis uses single-pass BFS layering (Kahn's algorithm) computing forward dependency depths in O(N+E). The original per-node recursive DFS (O(N x (N+E))) caused the MCP server to hang at startup when the graph exceeded ~500 nodes. Backward depth metrics are dead (never consumed by detectPattern() or calculateOptimalDepth()); fields retained at zero for cache compatibility. Alternatives rejected: (1) increase sampling threshold -- constant factor improvement only, (2) skip topology analysis -- loses pattern detection and recommended depth.


**Rationale:**
Infrastructure domain expansion (ADR-L-0016 INV-0025) grew the graph from ~200 to ~1200 nodes, triggering the O(N*DFS) hang. Linear-time analysis is required for the IR substrate to grow to 5K-10K+ nodes.




### IMPL-0002: MCP startup loads the RECON graph exactly once per initialization or reload cycle. rssContext.graph (already in memory from initRssContext) is passed directly to analyzeGraphTopology(). The redundant second call to loadAidocGraph on cache miss and on every reloadContext() is eliminated.


**Rationale:**
At N=5000 with sequential YAML I/O, each redundant loadAidocGraph call added ~50 seconds. Eliminating the double load halves cold-start I/O.




### IMPL-0003: Graph metrics cache (graph-metrics.json) is validated by node-count delta: recompute when |cached.totalComponents - graph.size| exceeds 10% of graph.size. The check is O(1); recomputation is O(N+E) per IMPL-0001.


**Rationale:**
Previously graph-metrics.json was accepted without staleness validation. A stale cache could silently produce incorrect topology metadata after graph growth, leading to suboptimal traversal parameter tuning.







## Gaps

### GAP-0001: The O(N*DFS) topology analysis caused MCP server startup to hang when graph size exceeded ~500 nodes. Was there a performance bound for startup graph analysis?


**Impact:** high  
**Blocking:** No



---

*Generated from ADR-PC-0001 by ADR Architecture Kit*