<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 915d0d1d6a05c1ce6c02c44401300696dadfc393246d01c41ea06cd055b6e366
rendered_hash: 5767c2485de79a6b79fcf54be77ee4e3af62ba511bfa01b5eedc69876019dbeb
-->

# ADR-PC-0010: Semantic Compression Engine

**Status:** proposed  
**Created:** 2026-05-22  
**Authors:** erik.gallmann  
**Domains:** workspace, graph, projection  
**Tags:** workspace, compression, multi-resolution, projection, deterministic  
**Implements Logical:** ADR-L-0019, ADR-L-0018  
**Technologies:** typescript, node.js


---

## Context

ADR-L-0019 established the capability for multi-resolution architecture
projection using deterministic semantic compression. This component implements
the compression engine, resolution-aware renderers, multi-resolution emission
pipeline, and projection family registry that realize that capability. It
consumes CannedQueryResult from the existing workspace graph query engine
(COMP-0010) and produces CompressedProjection at configurable resolution levels.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing ste-runtime implementation language.



## Component Specifications

### COMP-0011: Semantic Compression Engine (library)

**Responsibilities:**
- Compress CannedQueryResult into CompressedProjection at configurable resolution levels (L0-L4)
- Group endpoints by capability domain using path-prefix extraction
- Aggregate same-type nodes above threshold into count-annotated groups
- Filter edges by 5-tier verb taxonomy with per-level suppression rules
- Compress edge multiplicity (N edges of same verb collapsed to single edge with count)
- Suppress alarm/monitoring infrastructure at L0-L1
- Render compressed projections to Mermaid and table formats with navigation bars
- Emit multi-resolution projection files (L0-L3) alongside existing L4 files
- Manage projection family registry for extensible projection types


**Interfaces:**
- **IFACE-0011** (library_api): Programmatic API:
  - compress(result: CannedQueryResult, config: { level: ResolutionLevel } & Parti...
**Dependencies:** COMP-0010

**Implementation Identifiers:**
- Module Path: `src/workspace/compression.ts`








---

*Generated from ADR-PC-0010 by ADR Architecture Kit*