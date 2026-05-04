<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: c07b9c7fbb2fc805078fe903a81fc1f3109ebb31a8bce68adfbaae1f4b298389
rendered_hash: c8d32aeefbe4d06b92751ee5056906e82ad11bf29bd9233070c16e37d4d35b08
-->

# ADR-PS-0001: Runtime Orchestration and Assistant Integration

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** ste-runtime  
**Domains:** runtime, mcp, rss, watch  
**Tags:** runtime, mcp, watchdog, obligations  
**Implements Logical:** ADR-L-0004, ADR-L-0006, ADR-L-0007  
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