# ADR-L-0011 vs ADR-L-0007 attribution boundary

**Status:** Accepted (Phase 2 targeted retrofit)  
**Date:** 2026-05-30

## Problem

Both ADRs touch `ste-runtime/src/cli/evidence-command.ts` and freshness helpers, but they answer different questions:

| ADR | Question | Primary capability |
|-----|----------|-------------------|
| **ADR-L-0007** | What are graph freshness and obligation projection **semantics**? | CAP-0007 — freshness, invalidation, obligation modeling |
| **ADR-L-0011** | Does ste-runtime conform to the **RuntimeAdapter** publication role? | CAP-0011 — ArchitectureEvidence v2 emission |

Without an explicit boundary, a single `@implements_adr('ADR-L-0007')` on both builder and CLI conflates semantic modeling with adapter conformance.

## Decision

Split claims by **embodiment responsibility**, not by file:

| Symbol | ADR claims | Rationale |
|--------|------------|-----------|
| `resolveArchitectureEvidenceFreshness` | **ADR-L-0007** | Computes freshness status from bundle + canonical ADR sources; no ArchitectureEvidence envelope |
| `buildArchitectureEvidence` | **ADR-L-0007**, **ADR-L-0011** | Composes freshness (0007) into ArchitectureEvidence v2 (0011) |
| `runArchitectureEvidenceCommand` | **ADR-L-0011** | RuntimeAdapter publication entry point; emits ArchitectureEvidence JSON to stdout |
| `deriveSubjectsFromBundle` | *(none)* | Pure helper; subjects derived from bundle manifest, not a public semantic surface |

**Rule:** Freshness **resolution** is 0007-only. Evidence **composition and emission** carry 0011; composition also retains 0007 because freshness fields are part of the logical contract.

## Non-goals

- Do not populate `attributed_capabilities` with CAP-0007 / CAP-0011 (see `attribution-capability-linkage-backlog.md`).
- Do not amend ADR YAML unless publication paths or freshness semantics change in code.

## Verification

After `recon:workspace`, `implementation-attribution-evidence.yaml` must include:

- At least one record with `ADR-L-0011`
- `resolveArchitectureEvidenceFreshness` attributed to `ADR-L-0007` only
- `buildArchitectureEvidence` attributed to both `ADR-L-0007` and `ADR-L-0011`

Contract guards: `retrofit-contract-guards.test.ts` Wave A evidence-command block.
