<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 1f110e8b84f1983604bc915733370f6f66fa1f26e9a2fc0196bdd1bcc82d83d2
rendered_hash: 7910af2e101eba576d8c2a1ca0c043fa032d12d96ca1e4e2e0e023c22c4b107f
-->

# ADR-PC-0006: Frontend Semantic Extraction

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** ste-runtime  
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