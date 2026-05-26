<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 3b2505bb9e8a57856c8bebebb98e18b03a31f6e7042aa20536afcb008729c351
rendered_hash: a244434cde1fa53c585474c34d429e42ee431130e8c5c6e15c5864c4936dd9fb
-->

# ADR-PS-0002: Semantic Extraction Subsystem

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** ste-runtime  
**Domains:** extraction, recon, normalization  
**Tags:** extraction, recon, semantic-state  
**Implements Logical:** ADR-L-0001, ADR-L-0005  
**Technologies:** typescript, node.js, json, angular, css, cloudformation, adr-yaml

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