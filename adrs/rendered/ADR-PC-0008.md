<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-rendered-markdown
generator_version: 1
hash_algorithm: sha256
source_hash: 26b93b64666720500c7794e7d5ffa98d83205bb1a0749da334fccda339d500b4
rendered_hash: 951392b08a2893c69646a64ea2b677c44e62f1e33f382df13d61962903e825d6
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
- Map all extracted CFN resources to graph IDs using the shared cfn-type-mapping module (InfraResource fallback for unmapped types)
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
- Emit all extracted CFN resources as workspace graph nodes (no allowlist gate; InfraResource fallback for unmapped types)
- Emit Stack nodes from infrastructure/template slices with contains edges to child resources
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




## Implementation Decisions

### IMPL-0008: Resource-to-node emission policy: all RECON-extracted infrastructure resources become slice nodes. The previous silent omission of unmapped CFN types is replaced by diagnostic-aware emission via the shared cfn-type-mapping module. Unmapped types produce InfraResource nodes with cfn_type preserved in attributes.


**Rationale:**
Silent omission caused frontend and MFE monorepo infrastructure to disappear from the workspace graph. The graph must be pattern-agnostic.








---

*Generated from ADR-PC-0008 by ADR Architecture Kit*