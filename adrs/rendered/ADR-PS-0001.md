<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 3eb6d5c42481f9dd7f034f70f6bdab860e913d0c2ed57702757ff290c57e82c1
rendered_hash: 9f8879f6e8768087fdfc21873a7016c89caa2c5dd07ac5ce60a6ec52987eb5ad
-->

# ADR-PS-0001: Runtime Orchestration and Assistant Integration

**Status:** proposed  
**Created:** 2026-03-15  
**Modified:** 2026-05-22  **Authors:** erik.gallmann  
**Domains:** runtime, mcp, rss, watch  
**Tags:** runtime, mcp, watchdog, obligations  
**Implements Logical:** ADR-L-0004, ADR-L-0006, ADR-L-0007, ADR-L-0018  
**Technologies:** typescript, node.js, mcp, chokidar, zod

**Related ADRs:** ADR-P-0004

---

## Context

ste-runtime now contains a runtime orchestration boundary that keeps semantic
state fresh, exposes assistant-facing MCP tools, performs reconciliation
gating and freshness checks, and assembles implementation context and
obligation projections for agents and operators.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing runtime implementation language.

### Node.js (framework)

**Version:** 18.x+

**Rationale:**
Existing runtime execution environment.

### @modelcontextprotocol/sdk (library)

**Version:** 1.x

**Rationale:**
MCP protocol implementation.

### chokidar (library)

**Version:** 3.x

**Rationale:**
Cross-platform file watching.



## Component Specifications






## Operational Requirements

### Monitoring
Track freshness status, invalidated validations, and runtime health metrics.

### Logging
Structured runtime logs for reconciliation and tool invocation flows.




---

*Generated from ADR-PS-0001 by ADR Architecture Kit*