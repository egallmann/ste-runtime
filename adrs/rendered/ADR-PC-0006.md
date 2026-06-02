<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 3a17d07ebf21f5e2d615e710d583a1d487240eb1d0eedbf9f0cfc31937e90404
rendered_hash: 94a2aea50e32f240a0f1ea4b8e249117bb8c3e05d2fe09647a5fae417515ada1
-->

# ADR-PC-0006: Frontend Semantic Extraction

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** erik.gallmann  
**Domains:** extraction, frontend, recon  

**Implements Logical:** ADR-L-0001  
**Technologies:** typescript, angular, css, scss

**Related ADRs:** ADR-P-0003

---

## Context

Frontend semantic extraction captures Angular and CSS/SCSS-specific semantics
beyond generic TypeScript structure and feeds them into RECON normalization.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing implementation language.



## Component Specifications

### COMP-0006: Frontend Semantic Extractor (library)

**Responsibilities:**
- Extract Angular component, service, route, and template semantics
- Extract CSS/SCSS tokens, styles, and related frontend semantics
- Provide frontend assertions for RECON normalization


**Interfaces:**
- **IFACE-0006** (library_api): Public surfaces:
- src/extractors/angular/angular-extractor.ts
- src/extractors/css/css-extractor.ts...

**Implementation Identifiers:**
- Module Path: `src/extractors/angular/angular-extractor.ts`








---

*Generated from ADR-PC-0006 by ADR Architecture Kit*