# E-ADR-014: Architecture Analysis Engine for ADR-EDR Alignment

**Status:** Proposed  
**Implementation:** Planned  
**Date:** 2026-01-31  
**Author:** System  
**Authority:** Exploratory ADR (Reversible)

> **Purpose:** Define a role-specific architecture analysis engine that encodes ADR intent, derives embodied decisions from the semantic graph, and surfaces alignment between intent and implementation.

---

## Context

STE requires a disciplined way to compare declared architectural intent (ADRs) with embodied architectural decisions (EDRs) derived from observed system structure. Current tooling provides semantic graphs (observed implementation) and ADR markdown (declared intent), but no standardized engine exists to:

- Normalize ADR intent into a graph-native model.
- Derive a defensible embodied decision from observed evidence.
- Report alignment, divergence, and gaps with explicit evidence labeling.
- Produce concise human documentation for rapid orientation.

This ADR specifies the role behavior and output format for such an analysis engine.

---

## Decision

Implement a role-specific **Architecture Analysis Engine** that:

1. Parses ADR markdown into a normalized intent model.
2. Encodes intent into graph-native nodes with traceability.
3. Selects one embodied decision candidate from the observed semantic graph.
4. Generates a single EDR using observed and inferred evidence.
5. Aligns the EDR against relevant ADRs.
6. Produces one HUMAN-DOC component page tied to the EDR.

The engine is explicitly **evidence-forward** and uses strict labeling to distinguish declared, observed, inferred, and uncertain claims.

---

## Scope

- Inputs: ADR markdown files and a semantic graph of observed implementation state.
- Outputs: One ADR ingestion summary per ADR, one EDR, one alignment section, and one HUMAN-DOC component page.
- Out of scope: generating business rationale, validating correctness, or inventing intent beyond provided sources.

---

## Constraints

The engine **MUST**:

- Treat ADR text as the only source of declared intent.
- Map ADR scope to components only when determinable from text; otherwise record a gap.
- Label all claims as **Declared**, **Observed**, **Inferred**, or **Uncertain**.
- Produce evidence-linked alignment statements.
- Avoid marketing language and avoid stating correctness or optimality.

The engine **MUST NOT**:

- Invent business rationale or history.
- Guess ADR-to-component mapping when scope is ambiguous.
- Claim correctness or compliance.
- Assume missing evidence.

---

## Interfaces and Contracts

### Inputs

- **Semantic Graph**: nodes (components, functions, modules, data models, interfaces, boundaries) and edges (calls, dependencies, data flows, constraints, trust relationships).
- **ADR Markdown**: human-ratified declarations of architectural intent.

### Outputs

- **Normalized ADR Model** (per ADR):
  - `adr_id`, `title`, `status`, `date`
  - `decision_summary`
  - `scope`
  - `constraints`
  - `interfaces`
  - `quality_attributes`

- **EDR Document** (single):
  - `edr_id`, `title`, `status`, `decision`, `scope`, `constraints`, `interfaces`, `observed_evidence`, `consequences`, `confidence_level`, `limitations`

- **ADR-EDR Alignment** (for each candidate ADR):
  - `alignment_status`, `alignment_notes`, `evidence_links`, `gaps`

- **HUMAN-DOC Component Page**:
  - Component Overview, Responsibilities, Key Dependencies, Role in Embodied Decisions, Operational Implications, Confidence and Gaps

---

## Quality Attributes

- **Traceability:** Every non-trivial statement links to ADR text or graph evidence.
- **Determinism:** The output format is stable and machine-parseable.
- **Conservatism:** Inference is cautious and explicitly labeled.
- **Completeness (bounded):** Exactly one EDR and one component page are produced per run.

---

## Output Format

- Markdown.
- Neutral, machine-generated tone.
- Clear section headers.
- Evidence-forward language.
- No emojis.

---

## Consequences

- Enables repeatable ADR ingestion and EDR derivation without conflating intent and embodiment.
- Surfaces gaps between declared intent and observed implementation with explicit evidence.
- Provides a fast human onboarding artifact for one relevant component.

---

## Success Criteria

- ADR intent is normalized without loss of material constraints.
- EDR claims are linked to concrete graph evidence and labeled appropriately.
- Alignment results are conservative and explicitly indicate gaps.
- HUMAN-DOC page reduces orientation time for the chosen component.

---

## References

- STE framework role requirements (provided in task prompt)

---

**End of E-ADR-014**
