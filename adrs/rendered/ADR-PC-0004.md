<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 341c467fcca98fcfbff75eb38eca5554c09ddbc39a382ab8d710a84dad98eed7
rendered_hash: 1506570a390e0981f697bb5156d9c061c0a06d9d761a143503105d88eead852d
-->

# ADR-PC-0004: Obligation Projection and Context Assembly

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** ste-runtime  
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