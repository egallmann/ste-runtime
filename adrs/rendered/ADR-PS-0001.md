<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: f0be925a786412e7bfb74f79d0c01fddb29fe0317bbfa9642f81d0fd0d2ace20
rendered_hash: 4f937b55dfafc7428ef634a2c7282daaaa2fd2ce4a2898a97f1bebff0b96e144
-->

# ADR-PS-0001: Runtime Orchestration and Assistant Integration

**Status:** proposed  
**Created:** 2026-03-15  
**Modified:** 2026-05-22  **Authors:** ste-runtime  
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