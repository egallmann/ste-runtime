<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-projection-markdown
generator_version: 2
hash_algorithm: sha256
source_hash: 11ca3bcef056f421930c27d48e53e593c720bfe73dd57aff91632d0bf915ad6e
rendered_hash: 0e14292311200ea408b9121efe1fb65fbf2bb9a11a8c715ac3d7c11c268249c6
-->

# ADR-PC-0006: Frontend Semantic Extraction

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** erik.gallmann  
**Domains:** extraction, frontend, recon  
**Alias name:** frontend-semantic-extraction  

**Implements Logical:** [ADR-L-0001](../logical/ADR-L-0001-recon-provisional-execution-for-project-level-semantic-state.md)  
**Technologies:** typescript, angular, css, scss  

**Implements System:** [ADR-PS-0002](../physical-system/ADR-PS-0002-semantic-extraction-subsystem.md)  

## Context

Frontend semantic extraction captures Angular and CSS/SCSS-specific semantics
beyond generic TypeScript structure and feeds them into RECON normalization.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing implementation language.


## Relationship graph

```mermaid
flowchart LR
  n_019ff84e_4ece_791b_822f_21f537c95340["ADR-L-0001"]
  n_019ff84e_4ecf_73e1_8c0f_19a06db3004b["ADR-PC-0006"]
  n_019ff84e_4ecf_745c_9a2f_9fef67bdbe8d["COMP-0006"]
  n_019ff84e_4ecf_7900_893e_359d4c304446["IFACE-0006"]
  n_019ff84e_4ed0_73d5_aa3f_dfbfd18b339c["ADR-PS-0002"]
  n_019ff84e_4ed0_767d_a90d_e98e673532cc["SYS-0002"]
  n_019ff84e_4ecf_745c_9a2f_9fef67bdbe8d -->|"declared_in"| n_019ff84e_4ecf_73e1_8c0f_19a06db3004b
  n_019ff84e_4ecf_7900_893e_359d4c304446 -->|"declared_in"| n_019ff84e_4ecf_73e1_8c0f_19a06db3004b
  n_019ff84e_4ecf_745c_9a2f_9fef67bdbe8d -->|"embodied_in"| n_019ff84e_4ed0_767d_a90d_e98e673532cc
  n_019ff84e_4ecf_73e1_8c0f_19a06db3004b -->|"implements_logical"| n_019ff84e_4ece_791b_822f_21f537c95340
  n_019ff84e_4ecf_745c_9a2f_9fef67bdbe8d -->|"provides_interface"| n_019ff84e_4ecf_7900_893e_359d4c304446
  n_019ff84e_4ed0_73d5_aa3f_dfbfd18b339c -->|"related_to"| n_019ff84e_4ecf_73e1_8c0f_19a06db3004b
```

## Related ADRs

### ADR-L-0001 — RECON Provisional Execution for Project-Level Semantic State

**Relationships:**
- this ADR -[:implements_logical]-> 019ff84e-4ece-791b-822f-21f537c95340

**Context:** The STE Architecture Specification defines RECON (Reconciliation Engine) as the mechanism for extracting semantic state from source code and populating AI-DOC. The question arose: How should RECON operate during the exploratory development phase when foundational components are still being built?

[Open projection](../logical/ADR-L-0001-recon-provisional-execution-for-project-level-semantic-state.md)
### ADR-PS-0002 — Semantic Extraction Subsystem

**Relationships:**
- 019ff84e-4ed0-73d5-aa3f-dfbfd18b339c -[:related_to]-> this ADR

**Context:** ste-runtime extraction is now a subsystem containing multiple first-class
extractors and normalization flows rather than a pair of isolated physical
slices. This ADR groups the implemented extractor estate under a concrete
system boundary.

[Open projection](../physical-system/ADR-PS-0002-semantic-extraction-subsystem.md)


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