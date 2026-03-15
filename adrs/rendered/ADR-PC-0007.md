<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: e1dc6027342bf4681b8f443e07a73758a3b0731b337f8d3e5f7afebe9230cca6
rendered_hash: 99344b7baeaa28e0abf44f3fc6ad88accc0d14a490114b63a51fe97a05f75678
-->

# ADR-PC-0007: CloudFormation Semantic Extraction

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** ste-runtime  
**Domains:** extraction, cloudformation, recon  

**Implements Logical:** ADR-L-0001  
**Technologies:** typescript, cloudformation, yaml, json


---

## Context

CloudFormation semantic extraction captures templates, resources, outputs,
parameters, infrastructure relationships, and template-level implementation
intent from CloudFormation sources.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing implementation language.



## Component Specifications

### COMP-0007: CloudFormation Semantic Extractor (library)

**Responsibilities:**
- Extract template, parameter, resource, and output semantics
- Derive infrastructure relationships and API/data model evidence
- Preserve template-level implementation intent metadata


**Interfaces:**
- **IFACE-0007** (library_api): Public surfaces:
- src/recon/phases/extraction-cloudformation.ts
- src/extractors/cfn/*
...

**Implementation Identifiers:**
- Module Path: `src/recon/phases/extraction-cloudformation.ts`








---

*Generated from ADR-PC-0007 by ADR Architecture Kit*