# E-ADR-003: CEM Implementation Deferral

**Status:** Accepted  
**Implementation:** N/A (Deferral Decision)  
**Date:** 2026-01-07  
**Author:** Erik Gallmann  
**Authority:** Exploratory ADR (Reversible)

> **Next Step:** Revisit when foundation components (RECON, AI-DOC, RSS) reach stability.

---

## Context

The STE Architecture Specification (ste-spec) defines a 9-stage Cognitive Execution Model (CEM):

```
Perception → Orientation → Analysis → Deliberation →
Planning → Execution → Observation → Reflection → Adaptation
```

CEM is intended to orchestrate governed AI cognition, calling RSS for context assembly, enforcing DAP for human-in-the-loop decisions, and maintaining audit trails.

The question arose: Should CEM be implemented early in ste-runtime development, or deferred until foundational components are stable?

---

## Decision

**CEM implementation is intentionally deferred.**

CEM will be built as one of the final components of ste-runtime, after the governing components it orchestrates are in place:

| Build Now (Foundation) | Build Later (Orchestration) |
|------------------------|----------------------------|
| RECON (extraction pipeline) | CEM (cognitive execution) |
| AI-DOC (semantic state) | DAP (deliberation protocol) |
| RSS (graph traversal) | Agent governance |
| Inference (relationships) | Audit/compliance trails |

---

## Rationale

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

## Constraints

1. **Human-in-loop required:** Until CEM is implemented, all agent operations require human oversight. Autonomous execution is not supported.

2. **No formal audit trail:** Agent decisions are traceable via chat/edit history, not structured audit logs.

3. **DAP is implicit:** Deliberation activation occurs through natural conversation, not formalized protocol.

---

## Consequences

### Positive
- Foundation components can be built and tested independently
- API surfaces stabilize before CEM integration
- Reduced rework and premature abstraction
- Faster iteration on extraction/inference/traversal

### Negative
- Autonomous agent execution blocked until CEM exists
- Formal governance auditing deferred
- Potential for API drift if CEM requirements not considered

### Mitigation
- Document CEM's expected API contracts in ste-spec
- Periodically review foundation components against CEM needs
- Use execution pressure to surface integration gaps

---

## Relationship to Other Decisions

- **E-ADR-001 (RECON Provisional Execution):** RECON proceeds without CEM orchestration
- **E-ADR-002 (AI-DOC State Population):** AI-DOC writes occur without CEM governance
- **Future:** E-ADR-00X will formalize CEM implementation approach when ready

---

## Review Trigger

This decision should be revisited when:
1. Foundation components (RECON, AI-DOC, RSS, Inference) reach stability
2. Autonomous agent execution is required
3. Formal compliance/audit requirements emerge
4. Human-in-loop overhead becomes prohibitive

---

## References

- STE Architecture Specification, Section 4.7: Cognitive Execution Model
- STE Architecture Specification, Section 4.8: Deliberation Activation Protocol
- ISO/IEC/IEEE 42010:2022 Architecture Description




