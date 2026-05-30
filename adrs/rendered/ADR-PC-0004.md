<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: c38024673d002db24fde9cced2af35fb053e72b6902bd312b6f829f138b80477
rendered_hash: 0f66ff3ff7b6b9f733b62b9385132f0fed73b0f297f8ffed99738f65996184a6
-->

# ADR-PC-0004: Obligation Projection and Context Assembly

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** erik.gallmann  
**Domains:** obligations, context, rss  

**Implements Logical:** ADR-L-0006, ADR-L-0007  
**Technologies:** typescript, node.js, zod


---

## Context

This component projects invalidated validations and change-driven obligations,
assembles implementation context, and loads source-backed evidence for
assistant-facing reasoning.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing implementation language.



## Component Specifications

### COMP-0004: Obligation Projection and Context Assembly (service)

**Responsibilities:**
- Project obligations from change intent and graph state
- Surface invalidated validations and advisories
- Load source-backed implementation context
- Format runtime context for assistant consumption


**Interfaces:**
- **IFACE-0004** (library_api): Public surfaces:
- projectObligations
- assembleContextTool
- getImplementationContext
- loadSourceG...

**Implementation Identifiers:**
- Module Path: `src/mcp/obligation-projector.ts`








---

*Generated from ADR-PC-0004 by ADR Architecture Kit*