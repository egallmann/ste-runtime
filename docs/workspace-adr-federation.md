# Workspace ADR federation

**Status:** Implemented (ADR-L-0022 consumption; adr-kit ADR-L-0012 authority)  
**Artifact:** `.ste-workspace/workspace-attribution-federation.yaml` (derived)

**AI / builder orientation (full context):** [docs/ai-orientation-workspace-attribution-federation.md](../../docs/ai-orientation-workspace-attribution-federation.md)

## Problem

Each repository maintains its own `adrs/manifest.yaml` and per-repo
`implementation-attribution-evidence.yaml` with **bare** `ADR-L-XXXX` ids.
The same bare id in two repos (for example `ADR-L-0013` in adr-architecture-kit
vs ste-runtime) denotes **different decisions**. Per-repo `adr attribution check`
is correct locally; workspace-wide reasoning must not collapse homonyms.

## Qualified identity

| Field | Format |
|-------|--------|
| `qualified_id` | `{workspaceRepoKey}:{bareAdrId}` e.g. `ste-runtime:ADR-L-0013` |
| `workspaceRepoKey` | `name` from root `workspace.yaml` `repos[]` |

Bare `implements_adr('ADR-L-XXXX')` in source remains valid within each repo.

## Traceability workflow

1. **Manifest** — `adrs/manifest.yaml` in the **named repo** (confirm id + title).
2. **ADR YAML** — canonical intent for that repo only.
3. **Attribution** — `.ste-workspace/state/{repo}/attribution/implementation-attribution-evidence.yaml`.
4. **Cross-repo** — `.ste-workspace/workspace-attribution-federation.yaml` (homonym groups + per-qualified embodiment).

Shortcut: `adr attribution workspace-report --workspace-root <STE-workspace-root>`.

## Entity URIs (locator registry)

Architecture entities (ADR, decision, invariant) use **repo-qualified** URIs:

- `entity://ste-runtime/ADR-L-0013`

Infra/graph slice nodes continue to use workspace-scoped URIs:

- `entity://workspace/Lambda%3Arepo%3Afn`

## Authority split

| Component | Role |
|-----------|------|
| [ADR-L-0012](../../adr-architecture-kit/adrs/logical/ADR-L-0012-federation-authority-and-qualified-identity.yaml) (kit) | Federation + qualified identity doctrine |
| [ADR-L-0022](../adrs/logical/ADR-L-0022-workspace-attribution-federation-consumption.yaml) (ste-runtime) | Orchestrates `workspace-report` after `recon:workspace` |
| `build_workspace_attribution_federation` (adr-kit) | Single merge implementation |

Requires `adr` CLI on PATH (or `ADR_CLI`) from adr-architecture-kit.

## Non-goals

- Global ADR renumbering across repos.
- Qualified decorators in source (`ste-runtime:ADR-L-XXXX` in `@implements_adr`).
- Feeding federation YAML into per-repo `architectureMerge` (single-corpus only).
