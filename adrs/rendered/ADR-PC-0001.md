<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 124b9a4968efc26746983ee0c404de800bebad79a7c3de716d32bba26622ee51
rendered_hash: a1849ed793672277c98ea5e292db378b24bdb14d9b1a13fe94bdf16bdd7dec12
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








---

*Generated from ADR-PC-0001 by ADR Architecture Kit*