<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: b41ce8c5cf04c7d8a79ace4cd64fcfc2fb7455aacaba7f15f04ac831bc621217
rendered_hash: 8953bed52e86f32d3bbe60cd45479f00f29f776ab99477aa6d507872bcfc5f88
-->

# ADR-PC-0011: ADR YAML Semantic Extraction

**Status:** proposed  
**Created:** 2026-05-26  
**Authors:** erik.gallmann  
**Domains:** extraction, architecture, recon  

**Implements Logical:** ADR-L-0001, ADR-L-0005  
**Technologies:** typescript, node.js, js-yaml, adr-yaml

**Related ADRs:** ADR-PC-0005, ADR-PC-0006, ADR-PC-0007

---

## Context

ADR YAML semantic extraction converts Architecture Decision Records authored
in the ADR-kit YAML schema into first-class RECON graph slices. This enables
the MCP query tools (find, impact, usages, similar) to operate over the
architecture domain alongside code-derived domains (graph, behavior, data,
api, infrastructure).

The extractor recognizes three ADR types (logical, physical-system,
physical-component) and emits six element types: adr_document, adr_invariant,
adr_decision, adr_capability, adr_component, and adr_system. A new AI-DOC
domain 'architecture' with subdirectories (adrs, invariants, decisions,
capabilities, components, systems) is introduced.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing implementation language.

### js-yaml (library)

**Version:** 4.x

**Rationale:**
YAML parsing for ADR source files.



## Component Specifications

### COMP-0012: ADR YAML Semantic Extractor (library)

**Responsibilities:**
- Detect and classify ADR YAML files via path-prefix and content sniffing
- Parse ADR YAML using js-yaml
- Extract ADR documents, invariants, decisions, capabilities, component
  specifications, and system boundaries as RawAssertions
- Emit source provenance (serialized YAML snippets) for traceability
- Handle failure paths: malformed YAML, missing adr_type, unknown adr_type


**Interfaces:**
- **IFACE-0012** (library_api): Public surfaces:
- src/extractors/adr-yaml/index.ts (extractFromAdrYaml)
...

**Implementation Identifiers:**
- Module Path: `src/extractors/adr-yaml/index.ts`








---

*Generated from ADR-PC-0011 by ADR Architecture Kit*