<!--
document_type: system-overview
audience: ai-first
project: ste-runtime
status: active
purpose: >
  Orientation for AI and human contributors working in ste-runtime. Use this
  file first to discover runtime authority, public surface boundaries,
  canonical workflows, required tools, and safe extension points.
authority_order:
  - ste-spec public contracts and doctrine
  - ste-runtime ADRs under adrs/
  - runtime source under src/
  - generated runtime state under .ste*/ and workspace output directories
first_read: true
last_updated: 2026-05-27
generation_note: >
  Corrected manually because adr-architecture-kit generate-system-overview is
  not scope-aware in this workspace and currently emits adr-architecture-kit
  content when invoked for ste-runtime.
-->

# SYSTEM-OVERVIEW

## Why This File Exists

This file is the fastest correct orientation path for an AI working in
`ste-runtime`.

Its job is to prevent three failures:

1. Treating runtime graph state as canonical architecture authority.
2. Folding Kernel admission or public schema authority into runtime code.
3. Missing existing runtime workflows for RECON, RSS, evidence emission,
   workspace graph construction, and projection generation.

## System Purpose

`ste-runtime` is the runtime evidence and semantic extraction repository for
STE.

It provides:

- RECON semantic extraction over source, infrastructure, API, data, and ADR YAML
  material.
- RSS graph traversal and context assembly over runtime-owned state.
- Local CLI and MCP surfaces for querying runtime-owned graph state.
- `ArchitectureEvidence` payloads for runtime bundle health, freshness, and
  subject-linked factual evidence.
- Workspace-mode orchestration across repositories, including per-repo slices,
  cross-repo edges, merged workspace graph output, and deterministic
  multi-resolution projections.
- Implementation attribution evidence extracted from explicit implementation
  intent metadata, such as `@implements_adr` and `@enforces_invariant`.

It does not define STE doctrine, public cross-repo schemas, or admission
semantics. Those authorities remain in `ste-spec` and `ste-kernel`.

## Authority Hierarchy

Use this order when resolving ambiguity:

1. `ste-spec` - public contracts, schema authority, artifact classification,
   and STE doctrine.
2. `ste-runtime/adrs/` - runtime-local architecture authority for extraction,
   workspace graph, evidence, and projection behavior.
3. `ste-runtime/src/` - current implementation of runtime behavior.
4. Runtime state and workspace graph outputs - derived artifacts useful for
   evidence, queries, and projections; not canonical intent.

If runtime code and runtime ADRs disagree, treat the ADRs as authoritative
unless the task is explicitly to correct stale ADRs. If runtime ADRs and
`ste-spec` disagree on public contract semantics, `ste-spec` wins.

## First Discovery Order

When entering this repo cold, use this order:

1. Read this file.
2. Read [`README.md`](README.md) for repository boundary and authority split.
3. Read [`COMPILER-AUTHORITY.md`](COMPILER-AUTHORITY.md) for runtime compiler
   posture and graph/ADR boundary rules.
4. Inspect [`package.json`](package.json) for supported scripts and CLI entry
   points.
5. Inspect [`src/cli/`](src/cli/) for `ste`, `recon`, `rss`, and evidence
   command surfaces.
6. Inspect [`src/recon/`](src/recon/) before changing extraction behavior.
7. Inspect [`src/workspace/`](src/workspace/) before changing workspace graph,
   slice, merge, query, or projection behavior.
8. Inspect [`src/mcp/`](src/mcp/) before changing assistant-facing runtime
   tools.
9. Inspect `ste-spec/contracts/` before changing any public handoff shape.

Do not start by editing derived graph state. Change canonical artifacts or
runtime implementation, then regenerate through the owning workflow.

## Canonical Runtime Capabilities

Core implementation areas:

- RECON orchestration: [`src/recon/index.ts`](src/recon/index.ts)
- RECON CLI: [`src/cli/recon-cli.ts`](src/cli/recon-cli.ts)
- RSS CLI and operations: [`src/cli/rss-cli.ts`](src/cli/rss-cli.ts),
  [`src/rss/`](src/rss/)
- Runtime evidence CLI: [`src/cli/evidence-command.ts`](src/cli/evidence-command.ts)
- Architecture compile path: [`src/architecture/`](src/architecture/)
- Workspace RECON orchestration: [`src/workspace/workspace-recon.ts`](src/workspace/workspace-recon.ts)
- Workspace slice contract: [`src/workspace/slice-schema.ts`](src/workspace/slice-schema.ts)
- Workspace graph merge: [`src/workspace/workspace-merge.ts`](src/workspace/workspace-merge.ts)
- Multi-resolution projection compression:
  [`src/workspace/compression.ts`](src/workspace/compression.ts)
- Multi-resolution projection emission:
  [`src/workspace/emit-multi-res-projections.ts`](src/workspace/emit-multi-res-projections.ts)
- Implementation attribution evidence:
  [`src/recon/implementation-intent.ts`](src/recon/implementation-intent.ts)
- MCP preflight and obligation projection:
  [`src/mcp/preflight.ts`](src/mcp/preflight.ts),
  [`src/mcp/obligation-projector.ts`](src/mcp/obligation-projector.ts)

Primary commands:

- `npm run build`
- `npm test`
- `npm run test:integration`
- `npm run test:contract-guards`
- `ste evidence architecture --project-root <repo>`
- `ste architecture compile --project-root <repo>`
- `recon --self`
- `recon --workspace <workspace.yaml>`
- `rss stats|search|lookup|dependencies|dependents|blast-radius|by-tag|context`

## Artifact Model

Repository artifact classes:

- Runtime ADRs: [`adrs/`](adrs/)
- Runtime source: [`src/`](src/)
- Python helper extractors: [`python-scripts/`](python-scripts/)
- Runtime docs: [`documentation/`](documentation/)
- Fixture state and snapshots: committed proof fixtures where intentionally
  tracked; otherwise runtime state is derived.
- Runtime state: `.ste/`, `.ste-self/`, `.ste-workspace/`, workspace `state/`,
  `slices/`, `graph.yaml`, `workspace-index.yaml`, `workspace-edges.yaml`, and
  `projections/` are derived runtime artifacts.

Workspace graph slices and merged workspace graphs are runtime-owned derived
views. They are not public Architecture IR, not canonical ADR state, and not a
substitute for `ste-spec` contracts.

## Canonical Workflows

### Validate runtime code

Run `npm run build` and the relevant test script. Use
`npm run test:contract-guards` when evidence or spec-mirrored contract behavior
changes.

### Compile runtime-owned architecture artifacts

For ADR-backed runtime machine artifacts, use:

```bash
ste architecture compile --project-root .
```

This path writes runtime-owned generated architecture artifacts. It does not
make `ste-runtime` the public Architecture IR schema authority.

### Run workspace RECON

Use `recon --workspace <workspace.yaml>` to process declared repositories,
emit per-repo slices, compute cross-repo edges, merge a workspace graph, and
emit deterministic projections. Use `--fail-on-any-error` for strict gates and
`--skip-unchanged` when sentinel freshness is acceptable.

## Tooling Priority Rules

1. Treat `ste-spec` as public contract authority.
2. Treat runtime ADRs as local architecture authority.
3. Treat `.ste*` and workspace graph outputs as derived state.
4. Prefer existing RECON, RSS, evidence, and workspace commands over ad hoc
   graph manipulation.
5. Do not add admission decisions to runtime evidence or MCP outputs.
6. Do not duplicate `adr-architecture-kit` or `ste-spec` schema logic in
   runtime unless it is an explicit mirrored fixture with a contract guard.
7. Preserve deterministic output where projections or graph artifacts are used
   in tests or governance.

## Completion Criteria

A change is not complete unless relevant checks were run:

- `npm run build` for TypeScript changes.
- Targeted `npm test` or `npm run test:integration` for behavior changes.
- `npm run test:contract-guards` for public contract or mirrored schema changes.
- `ste architecture compile --project-root .` after runtime ADR changes that
  affect generated architecture artifacts.
- `ste evidence architecture --project-root .` when validating evidence payload
  behavior.
- Workspace RECON when workspace graph, slice, cross-repo edge, or projection
  behavior changes.

## One-Line Orientation

`ste-runtime` observes, extracts, packages evidence, and builds derived runtime
graph/projection state. It does not own public STE doctrine, public schema
authority, or Kernel admission.
