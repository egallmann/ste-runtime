# STE Specification Gap Analysis

## Document Purpose

This document identifies **potential gaps in the normative ste-spec** surfaced through execution pressure testing on 2026-01-07.

**Critical Distinction:**
- This is NOT a list of implementation features to back-port into the spec
- This IS an analysis of places where the spec may be incomplete, ambiguous, or insufficient
- Each item requires deliberation: Is this a genuine spec gap, or is the spec intentionally silent?

**Execution Pressure Test:** Answer detailed questions about Lambda functions (triggers, permissions, table access) using only the semantic graph, without grep or file system searches.

---

## Analysis Framework

For each identified issue, we ask:

1. **What did execution pressure reveal?**
2. **What does the spec currently say (or not say)?**
3. **Is this a spec gap, intentional flexibility, or out of scope?**
4. **If a gap: What question should the spec answer?**

---

## Findings Summary

| ID | Finding | Spec Status | Deliberation Needed |
|----|---------|-------------|---------------------|
| S1 | 13 domains exclude infrastructure | Silent | Yes - cloud-native systems |
| S2 | 13 domains exclude runtime behavior | Silent | Yes - behavioral analysis |
| S3 | Task Analysis scoring undefined | Vague | Yes - "multi-factor" not defined |
| S4 | RSS lookup return scope undefined | Silent | Maybe - implementation detail? |
| S5 | Divergence resolution undefined | Silent | Maybe - operational concern? |

---

## S1: AI-DOC Domain Model Excludes Infrastructure

### What Execution Pressure Revealed

To answer "what triggers this Lambda?", we need:
- EventBridge rules → Lambda targets
- EventSourceMappings → Lambda + Queue relationships
- API Gateway integrations → Lambda bindings
- IAM policies → permission grants

These are **infrastructure relationships**, not application code relationships.

### What the Spec Says

> **AI-DOC 13-Domain Structure** (Section 4.5):
> Project Identity, Entry Points, API Surface, Data Models, Internal Dependencies, External Integrations, Consumers, Configuration, Error Taxonomy, Testing Landscape, Business Domain, Code Conventions, Observability

The 13 domains focus on **application structure**. Infrastructure-as-Code is not addressed.

### Deliberation Questions

1. **Is infrastructure in scope for AI-DOC?**
   - If yes: The 13 domains need extension or reframing
   - If no: How does an agent reason about triggers, permissions, resources?

2. **Should "External Integrations" encompass IaC?**
   - The spec says: "Outbound APIs, queues, cloud"
   - This could include infrastructure, but the framing is application-centric ("outbound" implies the application calls out)

3. **Is this a cloud-native gap?**
   - The 13 domains may assume traditional application architecture
   - Serverless/cloud-native systems blur the line between code and infrastructure

### Open Question for Spec

> Should AI-DOC include infrastructure semantics (IaC, cloud resources, permissions), and if so, how should it be structured?

---

## S2: AI-DOC Domain Model Excludes Runtime Behavior

### What Execution Pressure Revealed

To answer "which tables does this Lambda write to?", we need:
- `table.put_item()` calls → write operation
- `table.get_item()` calls → read operation
- `sqs.send_message()` calls → downstream effect
- `os.environ['TABLE_NAME']` → runtime configuration binding

This is **behavioral analysis**, not structural analysis.

### What the Spec Says

The 13 domains describe **static structure**:
- What functions exist (Internal Dependencies)
- What APIs are exposed (API Surface)
- What data models are defined (Data Models)

The spec does not address:
- What SDK methods are called at runtime
- Whether operations are reads or writes
- What environment variables are accessed

### Deliberation Questions

1. **Is behavioral extraction in scope for RECON?**
   - RECON Phase 2 is "Extraction" — does this include behavioral patterns?
   - Phase 3 is "Inference" — is behavior inferred from structure?

2. **Is behavior a new domain or an enhancement to existing domains?**
   - Option A: New "Behavior" domain
   - Option B: Enhance "Internal Dependencies" with call semantics
   - Option C: Behavior is out of scope for AI-DOC (handled differently)

3. **Static analysis limitations:**
   - We can extract `boto3.client('dynamodb')` statically
   - We cannot determine runtime behavior (conditionals, loops)
   - Is static behavioral extraction "good enough"?

### Open Question for Spec

> Should AI-DOC capture behavioral patterns (SDK calls, read/write operations, env var access), and if so, is this a new domain or an extension of existing semantics?

---

## S3: Task Analysis "Multi-Factor Scoring" Undefined

### What Execution Pressure Revealed

When implementing entry point discovery, we needed to decide:
- How to score a "partial match" vs "exact match"
- When to ask for clarification vs auto-select
- Whether graph properties (degree, centrality) should influence ranking

We made arbitrary choices (100/80/60/40 scoring) with no normative guidance.

### What the Spec Says

> **Task Analysis Integration** (Section 4.6):
> "Rank candidates by multi-factor scoring"

The spec names "multi-factor scoring" but does not define:
- What factors
- What weights
- What thresholds

### Deliberation Questions

1. **Is this intentional flexibility?**
   - The spec may intentionally leave scoring to implementation
   - Different implementations could use different algorithms
   - This preserves innovation space

2. **Or is this under-specification?**
   - Scoring affects determinism — different scoring = different entry points
   - If RSS is meant to be deterministic, shouldn't scoring be normative?

3. **Does STE require deterministic entry point selection?**
   - The spec says: "Accept bounded probabilism at entry point discovery; achieve determinism at graph traversal"
   - This suggests scoring IS allowed to vary (bounded probabilism)
   - But "bounded" implies limits — what are they?

### Open Question for Spec

> Is Task Analysis scoring intentionally implementation-defined, or should the spec constrain the scoring space to ensure bounded probabilism?

---

## S4: RSS Lookup Return Scope Undefined

### What Execution Pressure Revealed

When using `rss-lookup`, we got graph metadata but not element content:
```json
{
  "key": "behavior/aws_sdk_usage/...",
  "references": [],
  "referencedBy": []
}
```

To get SDK operations, we had to read the YAML file directly. This broke the "semantic graph only" constraint.

### What the Spec Says

> **RSS Operations** (Section 4.6):
> - `lookup(domain, id)` — Direct item retrieval

The spec says "item retrieval" but doesn't specify what constitutes an "item":
- Just graph structure (`_slice`)?
- Full content (`element`)?
- Both?

### Deliberation Questions

1. **Is this implementation detail or semantic requirement?**
   - If RSS is for graph traversal only, metadata is sufficient
   - If RSS is for context assembly, full content is needed
   - The spec says both — traversal AND assembly

2. **Memory vs. completeness tradeoff:**
   - Loading full content uses more memory
   - Loading metadata only requires secondary reads
   - Is this an implementation concern or architectural?

3. **What does `assemble_context(task)` return?**
   - The spec lists this as an RSS operation
   - Does it return slice metadata or full context?
   - This may be the answer — lookup returns metadata, assemble returns content

### Open Question for Spec

> Should RSS `lookup` return graph metadata only, with `assemble_context` responsible for full content retrieval? Or should lookup support both modes?

---

## S5: Divergence Resolution Not Specified

### What Execution Pressure Revealed

When RECON detects `Doc-Orphan` (slice exists but source file deleted), we auto-deleted the slice. But:
- Should we log for audit?
- Should we prompt before deleting?
- What if deletion was accidental?

We made implementation choices with no normative guidance.

### What the Spec Says

> **STE-Divergence-Taxonomy.md** defines divergence classes but not resolution.

The spec classifies divergences but is silent on:
- How to resolve each class
- Which block reasoning vs. warn
- User interaction requirements
- Audit/persistence requirements

### Deliberation Questions

1. **Is resolution operational or architectural?**
   - Divergence taxonomy is architectural (classification)
   - Resolution may be operational (how to handle)
   - The spec may intentionally stop at classification

2. **Does resolution vary by context?**
   - Workspace mode: more tolerant, auto-resolve acceptable
   - Runtime mode: stricter, may require human resolution
   - This context-dependency may explain why resolution is not specified

3. **Is this related to CEM?**
   - CEM Stage 4 is "Divergence Detection"
   - CEM Stage 5 is "Correction"
   - Correction implies resolution, but details are not in the spec

### Open Question for Spec

> Is divergence resolution intentionally left to implementation (context-dependent), or should the spec define resolution semantics per divergence class?


---

## Summary of Open Questions

These questions emerged from execution pressure and require deliberation before spec changes:

| ID | Open Question |
|----|---------------|
| S1 | Should AI-DOC include infrastructure semantics (IaC, cloud resources, permissions)? |
| S2 | Should AI-DOC capture behavioral patterns (SDK calls, read/write operations)? |
| S3 | Is Task Analysis scoring intentionally implementation-defined, or should it be constrained? |
| S4 | Should RSS `lookup` return graph metadata only, with `assemble_context` for full content? |
| S5 | Is divergence resolution intentionally left to implementation (context-dependent)? |

---

## Observations

### The 13-Domain Model May Assume Traditional Architecture

The spec's 13 domains (Project Identity, Entry Points, API Surface, etc.) assume an application that:
- Has entry points in code
- Exposes APIs through code
- Is configured through code

Cloud-native/serverless systems challenge this:
- Entry points are infrastructure (Lambda handlers in CFN)
- APIs are infrastructure (API Gateway in CFN)
- Configuration is infrastructure (env vars in CFN)

This may be a fundamental assumption worth examining.

### Static vs. Dynamic Analysis

The spec's RECON phases focus on static extraction:
- Discovery: files
- Extraction: AST parsing
- Inference: relationships

Behavioral patterns (SDK calls, read/write) are semi-static:
- Extractable from AST
- But represent runtime intent, not just structure

The spec may need to clarify the boundary between structural and behavioral extraction.

---

## Implementation Notes (Non-Normative)

These are implementation choices made in `ste-runtime` pending spec clarification:

| Choice | What We Did | Why |
|--------|-------------|-----|
| Infrastructure domain | Added `infrastructure/` | Required for cloud-native traversal |
| Behavior domain | Added `behavior/` | Required for read/write analysis |
| Scoring algorithm | Basic (100/80/60/40) | No spec guidance, simple is better |
| Orphan resolution | Auto-delete | Least disruptive, most common case |

These may need revision if spec provides different guidance.

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-07 | AI Agent | Initial analysis from execution pressure testing |
| 2026-01-07 | AI Agent | Reframed as spec gap analysis with open questions |


