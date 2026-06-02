<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: d6ee7ddcdd2f9f9609b61fb4eb9c8fef0d0a96de70cb3a535a42aef66dd52ef9
rendered_hash: 16ec691f081e565fdea0589f076c66c736db1c98f920d8a63ac097c9f87124d1
-->

# ADR-PS-0002: Semantic Extraction Subsystem

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** erik.gallmann  
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