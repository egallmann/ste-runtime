<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 79a6a7cfa373569b4dbe1188223d58efb29f9b2b4cb4fe8016d18982e8144008
rendered_hash: f935a91b7b20f061a974dacbd4b284735de2c1f5d38d2479dc0b9d0346e0c389
-->

# ADR-PC-0007: CloudFormation Semantic Extraction

**Status:** proposed  
**Created:** 2026-03-15  
**Authors:** erik.gallmann  
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




## Implementation Decisions

### IMPL-0007: CFN type completeness: all extracted AWS::* resources are emitted as workspace graph nodes. Explicitly mapped types receive specific graph type names (Lambda, Queue, Distribution, etc.). Unmapped types receive the InfraResource fallback type with cfn_type preserved in attributes.


**Rationale:**
The workspace graph is pattern-agnostic. Backend services, frontend SPAs, and MFE monorepos all produce infrastructure resources that must appear in the graph for Architecture IR fidelity.







## Gaps

### GAP-0001: AWS::Serverless::StateMachine is now handled via the shared CFN type mapping module (maps to StateMachine graph type). DefinitionBody/ DefinitionUri extraction uses the same logic as AWS::StepFunctions::StateMachine.


**Impact:** medium  
**Blocking:** No



---

*Generated from ADR-PC-0007 by ADR Architecture Kit*