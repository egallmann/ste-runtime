<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 760452532dceea1e5a4569cc89a5452720d3f67ad93ca4544191b4bf7e2e519f
rendered_hash: 2c76399d58736200fbd32c25921a957957d1ba2bdf94a0bd1f936a5062235613
-->

# ADR-PS-0002: Semantic Extraction Subsystem

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** ste-runtime  
**Domains:** extraction, recon, normalization  
**Tags:** extraction, recon, semantic-state  
**Implements Logical:** ADR-L-0001, ADR-L-0005  
**Technologies:** typescript, node.js, json, angular, css, cloudformation

**Related ADRs:** ADR-P-0002, ADR-P-0003

---

## Context

ste-runtime extraction is now a subsystem containing multiple first-class
extractors and normalization flows rather than a pair of isolated physical
slices. This ADR groups the implemented extractor estate under a concrete
system boundary.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing implementation language.

### Node.js (framework)

**Version:** 18.x+

**Rationale:**
Existing execution environment.



## Component Specifications








---

*Generated from ADR-PS-0002 by ADR Architecture Kit*