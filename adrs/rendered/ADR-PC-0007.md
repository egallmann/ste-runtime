<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: bf4d6155b7f8a20490263879afbb53cbe4aa0d0fee5381c890c686e2df9b63c8
rendered_hash: 55158f12880acb4b780a22670151c243fe3ca3c89bc94f3df54895a345c6e6a3
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
intent from CloudFormation sources. This includes nested stack topology
detection: master templates that orchestrate child stacks via
AWS::Serverless::Application and AWS::CloudFormation::Stack resource types
are identified by resource type analysis, and cross-template resolution
structures (StackTopology, OutputIndex) are built for downstream service
wiring. All resolution is static analysis of template files on disk; no
runtime AWS API calls are made.


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
- Detect nested stack topology via AWS::Serverless::Application and AWS::CloudFormation::Stack resource types
- Build cross-template resolution structures (StackTopology, OutputIndex) for downstream wiring
- Identify canonical stackId (<repo-relative-template-path>#<logicalId>) as primary identity model


**Interfaces:**
- **IFACE-0007** (library_api): Public surfaces:
- src/recon/phases/extraction-cloudformation.ts
- src/extractors/cfn/*
- src/worksp...

**Implementation Identifiers:**
- Module Path: `src/recon/phases/extraction-cloudformation.ts`







## Gaps

### GAP-0001: AWS::Serverless::StateMachine is not yet handled in extractResourceMetadata. Should SAM state machines use the same DefinitionBody/DefinitionUri extraction as AWS::StepFunctions::StateMachine?


**Impact:** medium  
**Blocking:** No



---

*Generated from ADR-PC-0007 by ADR Architecture Kit*