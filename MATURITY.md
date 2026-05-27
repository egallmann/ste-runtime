# ste-runtime Project Maturity & Production Readiness

**Current Status:** EXPERIMENTAL / RESEARCH PROTOTYPE

**Version:** 0.10.0-experimental

**Last Updated:** 2026-05-27

---

## Critical Status Summary

`ste-runtime` is a component implementation and research prototype of the STE
runtime role. It is useful as a supervised local developer tool and as a
reference implementation for runtime evidence, semantic extraction, graph
queries, and workspace projection behavior.

### What This Is

- Working implementation of RECON semantic extraction.
- Working RSS graph traversal over runtime-owned state.
- Local MCP and CLI surfaces for supervised assistant integration.
- Runtime-owned `ArchitectureEvidence` emission for bundle health, freshness,
  diagnostics, and subject-linked factual evidence.
- Workspace-mode orchestration that emits per-repo slices, cross-repo edges,
  a merged workspace graph, and deterministic multi-resolution projections.
- Implementation attribution evidence extraction from explicit decorator or
  metadata-style implementation intent where extractors support it.

### What This Is Not

- Not production-ready software.
- Not autonomous agent execution infrastructure.
- Not a public STE schema authority.
- Not Kernel admission or governance enforcement.
- Not a security-hardened, multi-user, networked service.

`ste-runtime` produces runtime evidence and derived graph/projection state. It
does not define canonical STE doctrine, public handoff schemas, or admission
semantics.

---

## Authority and Autonomy Boundaries

`ste-runtime` requires human oversight for architecture-significant use. Its
outputs are inputs to reasoning, review, and Kernel evaluation; they are not
governance decisions.

| Surface | Runtime role | Boundary |
| --- | --- | --- |
| RECON state | Derived semantic extraction output | Not canonical intent |
| RSS results | Query over derived graph state | Requires freshness/provenance checks |
| `ArchitectureEvidence` | Factual bundle health and freshness evidence | Non-decision-bearing |
| Workspace slices / graph | Derived runtime graph artifacts | Not Architecture IR |
| Multi-resolution projections | Derived views for humans/tools | Not authority; must retain traceability |
| Preflight / obligation projection | Readiness and advisory obligation signals | Not admission |
| MCP tool responses | Assistant-facing runtime outputs | Supervised use only |

Autonomous execution remains out of scope. Runtime can provide graph context,
freshness indicators, and obligation signals, but it does not supply the full
governed cognition layer required for unattended architectural change.

---

## Current Capability Matrix

| Capability | Status | Notes |
| --- | --- | --- |
| RECON core extraction | Functional | Multi-domain extraction with fixture coverage. |
| ADR YAML semantic extraction | Functional | Produces architecture-domain slices for ADR documents, decisions, invariants, capabilities, components, and systems. |
| Implementation attribution evidence | Functional / partial coverage | Extracts explicit implementation intent where language extractors support it; coverage remains staged. |
| RSS graph traversal | Functional | Supports lookup, search, dependencies, dependents, blast radius, tags, and context assembly. |
| Runtime evidence CLI | Functional | Emits `ArchitectureEvidence` v2-shaped bundle health and freshness evidence. |
| Architecture compile path | Functional / experimental | Produces runtime-owned machine artifacts from canonical ADR YAML and source-derived state. |
| Workspace RECON | Functional / experimental | Orchestrates declared repositories, emits slices and workspace index, and handles partial failures. |
| Workspace graph merge | Functional / experimental | Merges validated slices, folds cross-repo edges, and emits derived `graph.yaml`. |
| Multi-resolution projections | Functional / experimental | Emits deterministic L0-L3 projections and preserves L4 full-fidelity views. |
| Preflight reconciliation | Prototype | Performs targeted freshness checks and may run incremental reconciliation. |
| Obligation projection | Prototype | Projects declared and graph-derived obligations for change intents; advisory, not admission. |
| MCP server | Functional / experimental | Local supervised integration only. |

No capability is currently classified as production-ready.

---

## Production Readiness Assessment

### Overall: Not Production-Ready

`ste-runtime` is appropriate for local supervised development, research, and
architecture tooling experimentation. It is not appropriate as a mission-critical
gate without additional hardening, operational policy, and downstream Kernel /
governance integration.

### Main Gaps

- **Autonomy:** Runtime does not provide full governed cognition or autonomous
  change authority.
- **Security:** Local boundary validation exists, but runtime is not hardened
  for hostile inputs, multi-user operation, or secret exposure.
- **Robustness:** Workspace and projection paths support partial failure, but
  broader failure-mode testing is still needed.
- **Coverage:** Implementation attribution and ADR extraction are useful but
  not complete across every supported artifact class.
- **Contract promotion:** Workspace slices, workspace graph, and projection
  metadata are runtime-owned derived artifacts; public contract promotion
  requires `ste-spec` governance.

---

## Appropriate Use Cases

Use `ste-runtime` for:

- Local semantic extraction with human review.
- Runtime evidence generation for supervised Kernel integration experiments.
- Workspace graph and projection generation for architecture review.
- Research into deterministic context assembly and assistant-facing graph
  queries.
- Validating how implementation attribution can connect code and ADR authority.

Do not use `ste-runtime` for:

- Unsupervised autonomous agent execution.
- Public admission decisions.
- Replacing `ste-spec` contracts or ADR authority.
- Directly editing generated graph/projection state.
- Mission-critical or compliance-regulated production gates without a separate
  hardening and governance program.

---

## Path to Production

To become a robust local developer tool, `ste-runtime` needs:

- Broader extractor coverage and explicit coverage reporting.
- Failure-mode tests for malformed inputs, partial workspaces, stale state, and
  interrupted runs.
- Hardened path and input validation.
- Secret-handling policy for extracted state.
- Stable contract guards for any mirrored or promoted contract surface.
- Clear Kernel and governance integration boundaries for evidence, preflight,
  and obligation projection.
- Performance regression coverage across diverse large repositories.

---

## Common Misinterpretations to Avoid

1. **"Workspace graph exists, so it is Architecture IR."**
   No. Workspace graph output is derived runtime state. Architecture IR public
   contracts remain under `ste-spec`.

2. **"Preflight can block unsafe work, so it is admission."**
   No. Preflight is a readiness and context-safety gate. Kernel admission and
   governance decisions remain outside runtime.

3. **"Implementation attribution evidence proves correctness."**
   No. It proves an extracted attribution claim exists with provenance. ADR-Kit
   validation and downstream evidence determine whether the claim is acceptable.

4. **"Multi-resolution projections are summaries that can be hand-curated."**
   No. They are deterministic derived views. Fix upstream graph/intent or
   projection logic, then regenerate.

---

## Related Documentation

- [README.md](README.md) - repository boundary and quick orientation.
- [SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md) - AI-first runtime orientation.
- [COMPILER-AUTHORITY.md](COMPILER-AUTHORITY.md) - compiler and runtime machine artifact authority.
- [Architecture Documentation](documentation/architecture.md) - implementation architecture overview.
- [Multi-resolution projections guide](documentation/guides/multi-resolution-projections.md) - projection levels and metadata.
- [STE Specification](https://github.com/egallmann/ste-spec) - public STE contracts and doctrine.

---

This document establishes the maturity boundary for `ste-runtime`. Claims about
capabilities, autonomy, or production readiness should remain consistent with
this file.
