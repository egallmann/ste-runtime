# E-ADR-014-ADR-Extraction-EDR-Encoding

**Status:** Proposed  
**Implementation:** Planned  
**Date:** 2026-01-31  
**Author:** System  
**Authority:** Exploratory ADR (Reversible)

> **Purpose:** Define how ADR intent is extracted into semantic slices and how embodied decisions (EDRs) are encoded for alignment with observed graph evidence.

---

## Context

STE needs a repeatable way to compare declared architectural intent (ADRs) with embodied architectural decisions (EDRs) derived from the semantic graph. Current state provides:

- ADR markdown documents (declared intent)
- Semantic graph slices (observed implementation)

What is missing is a standardized, graph-native encoding that:

- Normalizes ADR intent into structured intent slices
- Encodes EDRs with traceable evidence links
- Enables alignment between intent and embodiment

---

## Decision

Adopt a dedicated **architecture** domain in AI-DOC state with the following slice types:

1. **ADR slice** (`architecture/adr`) for normalized declared intent
2. **Intent slice** (`architecture/intent`) for atomic constraints/interfaces/quality attributes
3. **EDR slice** (`architecture/edr`) for embodied decisions with evidence
4. **Alignment slice** (`architecture/alignment`) for ADR-to-EDR linkage
5. **Human-doc slice** (`architecture/human_doc`) for a component page tied to the EDR

All slices must reference graph elements only when scope mapping is deterministic. Ambiguous scope must be recorded as a gap.

---

## Scope

- Inputs: ADR markdown files and semantic graph slices
- Outputs: Architecture-domain slices and alignment artifacts
- Out of scope: business rationale, correctness claims, or speculative mapping

---

## Constraints

The encoder **MUST**:

- Preserve ADR intent faithfully (no invented rationale)
- Label statements as Declared, Observed, Inferred, or Uncertain
- Link intent to graph elements only with deterministic scope
- Record alignment gaps explicitly
- Use evidence-forward, traceable references

The encoder **MUST NOT**:

- Guess ADR-to-component mappings
- Claim compliance or correctness
- Replace ADR content with inferred intent

---

## Slice Schemas

### ADR Slice (`architecture/adr`)

Required fields:
- `adr_id`, `title`, `status`, `date`
- `decision_summary`
- `scope` (components/paths/tags when determinable)
- `constraints` (must/must_not)
- `interfaces`
- `quality_attributes`
- `evidence` (anchors to ADR sections)

### Intent Slice (`architecture/intent`)

Required fields:
- `adr_id`, `intent_id`, `intent_kind`
- `statement`, `modality`
- `scope` (if determinable)
- `evidence_anchor`

### EDR Slice (`architecture/edr`)

Required fields:
- `edr_id`, `title`, `status`
- `decision` (Inferred)
- `scope` (Observed)
- `constraints` (Observed/Inferred)
- `interfaces` (Observed)
- `observed_evidence` (graph references)
- `consequences` (Observed)
- `confidence_level`, `limitations`

### Alignment Slice (`architecture/alignment`)

Required fields:
- `adr_id`, `edr_id`
- `alignment_status`
- `alignment_notes`
- `evidence_links`
- `gaps`

### Human-Doc Slice (`architecture/human_doc`)

Required fields:
- `component_key`
- `overview`, `responsibilities`, `key_dependencies`
- `role_in_edr`, `operational_implications`
- `confidence_and_gaps`

---

## Consequences

- ADRs become machine-alignable to embodied decisions.
- Alignment can be computed per intent node, not just per ADR.
- Gaps become explicit, enabling targeted evidence collection.
- The architecture domain becomes a first-class semantic layer.

---

## Success Criteria

- ADR intent is normalized without loss of material constraints.
- EDRs include evidence-linked graph references.
- Alignment output is conservative and explicit about gaps.
- Human-doc slice reduces component orientation time.

---

## References

- E-ADR-014: Architecture Analysis Engine for ADR-EDR Alignment
- AI-DOC state schema examples in `.ste-self/state`

---

**End of E-ADR-014-ADR-Extraction-EDR-Encoding**
