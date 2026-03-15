<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 91b9bec1a06e6e686950ae0dce67591da36fa534372e27ae65a6605fa893d175
rendered_hash: 729060cb077a378a2746ea341e374255848c73d37d8a8d4d8a698bf357919cdc
-->

# ADR-PC-0001: MCP Server and Tool Registry

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** ste-runtime  
**Domains:** mcp, integration, runtime  

**Implements Logical:** ADR-L-0004, ADR-L-0006, ADR-L-0007  
**Technologies:** typescript, node.js, mcp, zod


---

## Context

This component exposes assistant-facing runtime tools over MCP and binds
structural, operational, context, optimized, and obligation-oriented tool
surfaces into one discoverable server boundary.


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
- Register structural, operational, context, optimized, and obligation tools
- Route tool requests onto runtime graph and context services


**Interfaces:**
- **IFACE-0001** (CLI): Entry surfaces:
- src/mcp/mcp-server.ts
- MCP stdio tool registration for structural, operational, c...

**Implementation Identifiers:**
- Module Path: `src/mcp/mcp-server.ts`








---

*Generated from ADR-PC-0001 by ADR Architecture Kit*