<!--
integrity_schema_version: 1
generated: deterministic_projection_v1
artifact_kind: rendered_adr_markdown
generator_id: adr-projection-markdown
generator_version: 2
hash_algorithm: sha256
source_hash: 36740522cc176d7cb1eac693707baf18bd0d236f32f299636066e433bb8f96a1
rendered_hash: 6ccbcb608e2c58e376d01d402da873317932fdc6df555cc3f05fb94d61453b8a
-->

# ADR-L-0002: RECON Self-Validation Strategy

**Status:** accepted  
**Created:** 2026-01-07  
**Authors:** erik.gallmann  
**Domains:** recon, validation, governance  
**Tags:** recon, validation, self-validation, ste-compliance  
**Alias name:** recon-self-validation-strategy  

## Context

RECON generates AI-DOC state from source code extraction. The question arose: How should RECON validate its own output to ensure consistency and quality?

Key tensions:

1. **Blocking vs. Non-Blocking:** Should validation failures halt RECON execution?
2. **Verdict vs. Evidence:** Should validation declare correctness or surface observations?
3. **Scope:** What aspects of AI-DOC state should be validated?
4. **Integration:** When does validation run in the RECON pipeline?

---

## Relationship graph

```mermaid
flowchart LR
  n_019ff84e_4ece_7378_b637_eaea5a1d3bc2["ADR-L-0002"]
  n_019ff84e_4ece_76c1_bb3e_45323e77f7ec["DEC-0002"]
  n_019ff84e_4ece_791b_822f_21f537c95340["ADR-L-0001"]
  n_019ff84e_4ed0_79c2_843f_57944e4ec69c["ADR-P-0001"]
  n_019ff84e_4ed0_7c04_af35_82ee16e5dc81["ADR-P-0005"]
  n_019ff84e_4ece_76c1_bb3e_45323e77f7ec -->|"declared_in"| n_019ff84e_4ece_7378_b637_eaea5a1d3bc2
  n_019ff84e_4ed0_79c2_843f_57944e4ec69c -->|"implements_logical"| n_019ff84e_4ece_7378_b637_eaea5a1d3bc2
  n_019ff84e_4ed0_7c04_af35_82ee16e5dc81 -->|"implements_logical"| n_019ff84e_4ece_7378_b637_eaea5a1d3bc2
  n_019ff84e_4ece_7378_b637_eaea5a1d3bc2 -->|"references"| n_019ff84e_4ece_791b_822f_21f537c95340
  n_019ff84e_4ece_791b_822f_21f537c95340 -->|"references"| n_019ff84e_4ece_7378_b637_eaea5a1d3bc2
```

## Related ADRs

### ADR-L-0001 — RECON Provisional Execution for Project-Level Semantic State

**Relationships:**
- 019ff84e-4ece-791b-822f-21f537c95340 -[:references]-> this ADR
- this ADR -[:references]-> 019ff84e-4ece-791b-822f-21f537c95340

**Context:** The STE Architecture Specification defines RECON (Reconciliation Engine) as the mechanism for extracting semantic state from source code and populating AI-DOC. The question arose: How should RECON operate during the exploratory development phase when foundational components are still being built?

[Open projection](ADR-L-0001-recon-provisional-execution-for-project-level-semantic-state.md)
### ADR-P-0001 — RSS CLI Implementation for Developer-Invoked Graph Traversal

**Relationships:**
- 019ff84e-4ed0-79c2-843f-57944e4ec69c -[:implements_logical]-> this ADR

**Context:** The STE Architecture Specification Section 4.6 defines RSS (Runtime State-Slicing) as the component responsible for graph traversal and context assembly from AI-DOC state. RSS provides six core operations:

[Open projection](../physical/ADR-P-0001-rss-cli-implementation-for-developer-invoked-graph-traversal.md)
### ADR-P-0005 — Extractor Validation Requirements

**Relationships:**
- 019ff84e-4ed0-7c04-af35-82ee16e5dc81 -[:implements_logical]-> this ADR

**Context:** (no context)

[Open projection](../physical/ADR-P-0005-extractor-validation-requirements.md)







## Decisions

### DEC-0002: RECON self-validation is non-blocking, report-only, and exploratory.

**Rationale:**
### 1. Non-Blocking Preserves Learning

If validation blocked execution on every finding, RECON would become unusable during exploratory development. Many validation findings are informational or represent known limitations in extraction algorithms.

By remaining non-blocking, validation:
- Captures all findings without losing work
- Allows developers to review findings at their discretion
- Generates historical data for pattern analysis
- Avoids false positive friction

### 2. Evidence Over Verdicts

During exploratory development, the validators themselves are evolving. A "verdict" implies confidence that is premature. Instead, validators generate:
- Observations about state structure
- Anomalies that may indicate issues
- Coverage gaps in extraction
- Repeatability concerns

Developers interpret findings; validators do not judge.

### 3. Categorization Enables Prioritization

All findings are categorized:

| Category | Meaning | Action |
|----------|---------|--------|
| ERROR | Structural issue that may indicate a bug | Investigate promptly |
| WARNING | Anomaly that may indicate a problem | Review when convenient |
| INFO | Observation for awareness | Log for future reference |

---


**Consequences:**

**Positive:**
- Continuous quality visibility without workflow disruption
- Historical trend data for extraction algorithm improvement
- Early detection of regression in extractors
- Developer confidence through transparency

**Negative:**
- Findings may be ignored if too numerous
- No enforcement of quality gates
- Report accumulation without review
- Periodic finding review as part of development process
- Track finding counts over time for trend analysis
- Prioritize ERROR findings for immediate investigation
- Use findings to guide extractor improvements




---

*Generated from ADR-L-0002 by ADR Architecture Kit*