<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 8d7ecca11c76850989bfdadd00809d2f30703c4d04ad13d22ca07acd11836358
rendered_hash: 4bc304de6e12173f3f6705b6e9c9c562919188956f032814a81fc064b88ca72e
-->

# ADR-PC-0008: Service Wiring Post-Processing

**Status:** proposed  
**Created:** 2026-04-24  
**Authors:** ste-runtime  
**Domains:** workspace, graph, extraction  

**Implements Logical:** ADR-L-0015, ADR-L-0016  
**Technologies:** typescript, node.js, yaml


---

## Context

RECON produces rich per-repository state (call graphs, SDK usage, env
vars, CFN resources, triggers) but the workspace slice emitter collapsed
this to a skeleton with only has_contract edges. Cross-domain joins
(SDK usage to CFN resources via env var bridging) can produce reads,
writes, publishes, consumes, invokes, and deploys_to edges without any
new AST parsing. This wiring must be post-processing on existing RECON
state, never modifying extraction output.


## Technology Stack

### TypeScript (language)

**Version:** 5.3+

**Rationale:**
Existing implementation language.



## Component Specifications

### COMP-0008: Resource Resolver (library)

**Responsibilities:**
- Build env-var-to-CFN-resource join maps from per-repo RECON state
- Build SDK-service-to-graph-type maps (dynamodb->Database, s3->Bucket, etc.)
- Build Lambda-handler-to-function maps from CFN handler metadata
- Resolve cross-stack parameter chains through nested stack topology (ParamResolutionTable)
- Follow master-to-child GetAtt ChildStack.Outputs.X references through to originating resource logical IDs
- All maps keyed by structural type, never by repository name


**Interfaces:**
- **IFACE-0008** (library_api): Public surfaces:
- src/workspace/resource-resolver.ts
Dependencies:
- src/workspace/cfn-stack-resolv...

**Implementation Identifiers:**
- Module Path: `src/workspace/resource-resolver.ts`

### COMP-0009: Slice Emitter Edge Wiring (library)

**Responsibilities:**
- Produce reads/writes edges by joining SDK usage with infrastructure resources via env-var bridge
- Produce publishes edges for SQS/SNS SDK usage
- Improve consumes edge resolution via CFN logical ID lookup
- Produce deploys_to edges from StepFunctions DefinitionBody
- Produce invokes edges from Lambda-to-Lambda env var and SDK patterns
- Emit diagnostics (not edges) when join resolution is ambiguous
- Never modify RECON extraction output
- Use cross-stack parameter resolution (ParamResolutionTable) for trigger and StepFunctions resolution when available


**Interfaces:**
- **IFACE-0009** (library_api): Public surfaces:
- src/workspace/slice-emitter.ts
...

**Implementation Identifiers:**
- Module Path: `src/workspace/slice-emitter.ts`








---

*Generated from ADR-PC-0008 by ADR Architecture Kit*