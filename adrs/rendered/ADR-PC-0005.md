<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 08563fb3d721fe653e31daed41cf81d473dc4ce01f3929700b972375eca6d5ca
rendered_hash: 5daa87bd7631944f11f816b0c38447aa40a9569a8a355ba2f1f5935149e071e6
-->

# ADR-PC-0005: JSON Semantic Extraction

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** ste-runtime  
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