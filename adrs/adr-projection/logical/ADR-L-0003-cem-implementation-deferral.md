<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-projection-markdown
generator_version: 2
hash_algorithm: sha256
source_hash: 6d9e2db2be064ebec8988b3b4da49f305f776dbb9463d48c79d48fff55554ba7
rendered_hash: 08dfb29b3b033f97447f05f1559cc29b0e7470e078120c3d6f4081a39d73ac1f
-->

# ADR-L-0003: CEM Implementation Deferral

**Status:** accepted  
**Created:** 2026-01-07  
**Authors:** erik.gallmann  
**Domains:** architecture, governance, cem  
**Tags:** cem, deferral, meta-decision, build-order  
**Alias name:** cem-implementation-deferral  

## Context

The STE Architecture Specification (ste-spec) defines a 9-stage Cognitive Execution Model (CEM):

```
Perception → Orientation → Analysis → Deliberation →
Planning → Execution → Observation → Reflection → Adaptation
```

CEM is intended to orchestrate governed AI cognition, calling RSS for context assembly, enforcing DAP for human-in-the-loop decisions, and maintaining audit trails.

The question arose: Should CEM be implemented early in ste-runtime development, or deferred until foundational components are stable?

---

## Relationship graph

```mermaid
flowchart LR
  n_019ff84e_4ece_7693_ab03_49271bde3535["ADR-L-0003"]
  n_019ff84e_4ece_791b_822f_21f537c95340["ADR-L-0001"]
  n_019ff84e_4ece_7e51_a239_2219f11ef5d4["DEC-0003"]
  n_019ff84e_4ece_7e51_a239_2219f11ef5d4 -->|"declared_in"| n_019ff84e_4ece_7693_ab03_49271bde3535
  n_019ff84e_4ece_7693_ab03_49271bde3535 -->|"references"| n_019ff84e_4ece_791b_822f_21f537c95340
  n_019ff84e_4ece_791b_822f_21f537c95340 -->|"references"| n_019ff84e_4ece_7693_ab03_49271bde3535
```

## Related ADRs

### ADR-L-0001 — RECON Provisional Execution for Project-Level Semantic State

**Relationships:**
- 019ff84e-4ece-791b-822f-21f537c95340 -[:references]-> this ADR
- this ADR -[:references]-> 019ff84e-4ece-791b-822f-21f537c95340

**Context:** The STE Architecture Specification defines RECON (Reconciliation Engine) as the mechanism for extracting semantic state from source code and populating AI-DOC. The question arose: How should RECON operate during the exploratory development phase when foundational components are still being built?

[Open projection](ADR-L-0001-recon-provisional-execution-for-project-level-semantic-state.md)







## Decisions

### DEC-0003: CEM implementation is intentionally deferred.

**Rationale:**
### 1. CEM Orchestrates Components That Must Exist First

CEM's stages call into foundational components:
- **Orientation** calls RSS for context assembly
- **Analysis** reads AI-DOC semantic state
- **Deliberation** invokes DAP for human judgment
- **Observation** checks divergence state

Building CEM before these components are stable would result in:
- Premature abstractions
- Rework as component APIs evolve
- Incomplete orchestration coverage

### 2. Human-in-Loop Provides Implicit CEM Today

During development, Cursor/Claude interaction with the developer satisfies CEM governance:

| CEM Stage | Current Implementation |
|-----------|----------------------|
| Perception | Developer provides task |
| Orientation | Agent queries RSS / searches codebase |
| Analysis | Agent reads code, understands context |
| Deliberation | Agent asks clarifying questions (implicit DAP) |
| Planning | Agent proposes solution |
| Execution | Agent edits files, runs commands |
| Observation | Developer/agent observe results |
| Reflection | Developer accepts/rejects; agent adjusts |
| Adaptation | Future responses incorporate learning |

This implicit CEM is acceptable per ste-spec Section 4.7 because governance is maintained through human oversight.

### 3. CEM is the Hardest Component

CEM requires:
- State machine formalization
- Integration with all other components
- Audit trail persistence
- Configurable governance policies
- Error recovery and rollback semantics

Tackling this complexity after foundations are solid reduces risk.

---


**Consequences:**

**Positive:**
- Foundation components can be built and tested independently
- API surfaces stabilize before CEM integration
- Reduced rework and premature abstraction
- Faster iteration on extraction/inference/traversal

**Negative:**
- Autonomous agent execution blocked until CEM exists
- Formal governance auditing deferred
- Potential for API drift if CEM requirements not considered
- Document CEM's expected API contracts in ste-spec
- Periodically review foundation components against CEM needs
- Use execution pressure to surface integration gaps




---

*Generated from ADR-L-0003 by ADR Architecture Kit*