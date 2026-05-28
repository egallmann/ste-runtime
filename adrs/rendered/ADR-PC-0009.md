<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 8525e1860df80e6fb9dda97af1c5e01fed19991edc56c52db119afa4db9c9e2f
rendered_hash: 954979aedaa8207e96d3c7b5ba028e4653ddaeed35a6d52e04c202aed01fc032
-->

# ADR-PC-0009: Workspace Graph Query Engine

**Status:** proposed  
**Created:** 2026-05-22  
**Authors:** erik.gallmann  
**Domains:** workspace, graph, rss  
**Tags:** workspace, graph-traversal, canned-queries, projections  
**Implements Logical:** ADR-L-0018, ADR-L-0009, ADR-L-0016  
**Technologies:** typescript, node.js, yaml


---

## Context

ADR-L-0018 established the capability for deterministic workspace graph
querying. This component implements the loader, three canned query functions,
and three projection renderers that realize that capability. It consumes
workspace slices (per ADR-L-0016 schema contract) and exposes results through
the MCP tool registry (ADR-PC-0001) and CLI (ADR-P-0001).


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing ste-runtime implementation language.

### js-yaml (library)

**Version:** 4.x

**Rationale:**
YAML parsing for workspace slice files, consistent with existing codebase.



## Component Specifications

### COMP-0010: Workspace Graph Query Engine (library)

**Responsibilities:**
- Load workspace graph slices into typed in-memory WorkspaceGraph
- Build outAdj/inAdj adjacency maps at load time for O(1) neighbor lookups
- Execute systemDependencies, componentIntegration, blastRadiusWorkspace queries
- Render results to Mermaid, table, and adjacency matrix projections
- Materialize deterministic projections to output_dir/projections/ on workspace recon (emitProjections)


**Interfaces:**
- **IFACE-0010** (library_api): Programmatic API:
  - loadWorkspaceGraph(outputDir: string): Promise<WorkspaceGraph>
  - systemDepen...
**Dependencies:** COMP-0011

**Implementation Identifiers:**
- Module Path: `src/workspace/workspace-graph-loader.ts`








---

*Generated from ADR-PC-0009 by ADR Architecture Kit*