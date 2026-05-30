<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: b51dc98f2c6b885e4105f06bc181bbc53bf768df6fd84f4730dae6bb78f2af62
rendered_hash: 7f590fcb9c663266b24e75a2184eb77ae71e01e07033451ed396d2bb9a0716d7
-->

# ADR-PC-0005: JSON Semantic Extraction

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** erik.gallmann  
**Domains:** extraction, json, recon  

**Implements Logical:** ADR-L-0001  
**Technologies:** typescript, json, node.js

**Related ADRs:** ADR-P-0002

---

## Context

JSON semantic extraction captures controls, schemas, and configuration
semantics from JSON sources and feeds them into RECON normalization.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing implementation language.



## Component Specifications

### COMP-0005: JSON Semantic Extractor (library)

**Responsibilities:**
- Detect semantically relevant JSON files
- Extract controls, schemas, and configuration semantics
- Provide RECON-ready assertions for normalization


**Interfaces:**
- **IFACE-0005** (library_api): Public surfaces:
- src/extractors/json/index.ts
- src/extractors/json/json-extractor.ts
...

**Implementation Identifiers:**
- Module Path: `src/extractors/json/json-extractor.ts`








---

*Generated from ADR-PC-0005 by ADR Architecture Kit*