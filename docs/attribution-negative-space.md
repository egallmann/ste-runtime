# Attribution negative space (permanent)

**Status:** Signed off (Phase 3 closure)  
**Date:** 2026-05-30  
**Triage authority:** [`blog-posts/evidence/retrofit-phase3-triage-matrix.md`](../../blog-posts/evidence/retrofit-phase3-triage-matrix.md)  
**Purpose:** Explicit zones where **no** `ADR-L-*` implementation claims are expected in `implementation-attribution-evidence.yaml`. Prevents false “coverage gap” alarms during retrofit and EDR experiments.

---

## Manifest ADRs with zero evidence (signed off)

| ADR | Title | Classification | Reason |
|-----|-------|----------------|--------|
| **ADR-L-0003** | CEM Implementation Deferral | **Deferral** | Accepted meta-decision to defer CEM; no ste-runtime embodiment |
| **ADR-L-0005** | Self-Configuring Domain Discovery | **Internal** | Domain discovery is internal pipeline (`discovery.ts`); not a public decorated surface |
| **ADR-L-0014** | Private Registry Isolation | **Policy / scanner** | ADR mandates no private registry URLs in source/artifacts; enforced by init constraints and mechanical scanner policy—not a TS public API in ste-runtime |

These three ADRs are **intentionally** absent from attribution evidence. Zero rows is correct, not a retrofit gap.

---

## ADRs with partial coverage (accepted)

| ADR | Gap | Resolution |
|-----|-----|------------|
| **ADR-L-0010** | `initConfig` only vs full bootstrap (`ste setup`, workspace.yaml) | Documented: CJS bootstrap in `scripts/init.cjs` is out of TS RECON scope; TS claim covers runtime config init |
| **ADR-L-0015** | INV-0016 has no implementation anchor | Documented: agnosticism sentinel (`discoverWorkspaceRoot`) attributed; automated zero-reference scan not yet anchored |
| **ADR-L-0017** | Orchestrator only vs helper decomposition | Accepted: `executeWorkspaceRecon` is correct owner |
| **ADR-L-0020** | `resolveLocator` helpers undecorated | Accepted: CEM/MVC + `emitSourceLocatorRegistry` cluster sufficient for retrofit closure |

---

## Code surfaces without ADR-L claims (permanent negative space)

| Surface | Location | Authority / reason |
|---------|----------|-------------------|
| RSS graph operations | `src/rss/rss-operations.ts` (`search`, `dependencies`, `initRssContext`, etc.) | Legacy **E-ADR-004** RSS CLI scope; no matching `ADR-L-*` owner in ste-runtime manifest |
| MCP tool handlers | `src/mcp/` | Cross-cutting assistant integration; no single ADR-L embodiment decision |
| `recon-cli` entry | `src/cli/recon-cli.ts` | Orchestration seam; RECON entry is `executeRecon` (ADR-L-0001) |
| Architecture compile pipeline | `src/architecture/` (`compileArchitecture`, `runArchitecturePipeline`) | **No ADR-L owner** — requires future ADR or explicit negative-space ADR amendment before decoration |
| CJS bootstrap | `scripts/init.cjs` | Out of TS RECON extraction; related to ADR-L-0010 breadth boundary |
| Internal RECON phase wiring | `runReconPhases`, individual validators | Partial by design; orchestrators carry ADR claims |

---

## Review policy

1. **Do not** decorate negative-space surfaces solely to improve coverage metrics.
2. **Do not** decorate without an ADR-amended owner list or explicit triage marking `needs_decoration`.
3. **Do** add claims when an ADR amend or new ADR-L explicitly assigns ownership.
4. **Re-run** `recon:workspace` after any retrofit; diff evidence against this table and the triage matrix.

---

## Retrofit closure (Phase 3)

- **18 / 21** ADR-L entries have evidence rows.
- **3 / 21** have zero rows by signed-off negative space (0003, 0005, 0014).
- Phase 3B optional decoration: **skipped** (no HIGH-confidence `needs_decoration` in triage).

See [`blog-posts/evidence/retrofit-completion-evidence.md`](../../blog-posts/evidence/retrofit-completion-evidence.md) for final gate results.
