<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: ddbfe3131597a1fe9f97c6dda0341936bd55fc3114a7e04e579d636b67a7dfe9
rendered_hash: 72105d7a6c27ee908dbc443c7a4dadf25b09ecff0a7636a572754cf0ed9585c8
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


**Interfaces:**
- **IFACE-0010** (library_api): Programmatic API:
  - loadWorkspaceGraph(outputDir: string): Promise<WorkspaceGraph>
  - systemDepen...

**Implementation Identifiers:**
- Module Path: `src/workspace/workspace-graph-loader.ts`








---

*Generated from ADR-PC-0009 by ADR Architecture Kit*