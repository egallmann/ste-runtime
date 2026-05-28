<!--
document_type: system-overview
audience: ai-first
project: ste-runtime
status: active
purpose: >
  Single-file orientation for AI and human contributors. Use this file first to discover project authority, public surface boundaries, canonical workflows, required tools, and safe extension points before making changes.
authority_order:
  - ste-spec doctrine
  - PROJECT.yaml project authority
  - ADRs under adrs/
  - code under src/ as implementation
first_read: true
last_updated: 2026-05-28
-->

# SYSTEM-OVERVIEW

## Why This File Exists

This file is the fastest correct orientation path for an AI working in this repository.

Its job is to prevent two common failures:

1. Missing project-native capabilities that already exist, such as extractors, CLI commands, and MCP tools.
2. Making path, scope, or artifact assumptions that conflict with repository authority.

Read this file before writing code, generating artifacts, or modifying repository outputs.

## System Purpose

`ste-runtime` is a semantic extraction and graph traversal tool for software projects.

It provides:

- **RECON** -- semantic extraction over source code into a structured graph (`.ste/state/`)
- **RSS** -- graph traversal, search, dependency analysis, blast radius, and context assembly
- **MCP server** -- Model Context Protocol integration for AI assistants (Cursor, etc.)
- **CLI** -- developer-facing commands for extraction, querying, and evidence production
- **Architecture evidence** -- factual `ArchitectureEvidence` JSON from ADR bundles
- **Workspace mode** -- multi-repository extraction and cross-repo graph queries

`ste-runtime` delivers value as a standalone tool on any codebase. It can also participate in the broader STE ecosystem when `ste-spec` contracts and `adr-architecture-kit` ADR authoring are available.

## Authority Hierarchy

Use this order when resolving ambiguity:

1. `ste-spec`
   Normative doctrine and shared contracts. This repo must not override them. When `ste-spec` is unavailable, `ste-runtime` operates independently using its own ADRs and bundled schema fixtures.
2. [`PROJECT.yaml`](PROJECT.yaml)
   Project-local quality gates, metadata, and operating policy.
3. [`adrs/`](adrs/)
   Architectural authority for this repository.
4. [`src/`](src/)
   Current implementation of the above.

If code and ADRs disagree, treat the ADRs and project policy as authoritative unless the task is explicitly to correct the ADRs.

## First Discovery Order

When an AI enters this repo cold, use this order:

1. Read [`PROJECT.yaml`](PROJECT.yaml).
2. Read this file.
3. Inspect [`package.json`](package.json) for scripts, dependencies, and bin entrypoints.
4. Inspect the CLI entrypoints: [`src/cli/index.ts`](src/cli/index.ts) and [`src/cli/recon-cli.ts`](src/cli/recon-cli.ts).
5. Inspect extractors in [`src/extractors/`](src/extractors/).
6. Inspect MCP tools in [`src/mcp/`](src/mcp/).
7. Inspect RECON phases in [`src/recon/phases/`](src/recon/phases/).
8. Only then decide whether new code is needed.

Do not start by hand-writing state artifacts if an extractor or RECON phase already covers the target.

## Canonical Capabilities

### Extractors (`src/extractors/`)

Language-specific semantic extraction:

- **Python:** [`python/python-extractor.ts`](src/extractors/python/python-extractor.ts) -- Flask, FastAPI, Django routes; functions, classes
- **C#:** [`csharp/index.ts`](src/extractors/csharp/index.ts) -- .NET controllers, services
- **CloudFormation:** [`cfn/`](src/extractors/cfn/) + [`recon/phases/extraction-cloudformation.ts`](src/recon/phases/extraction-cloudformation.ts) -- Lambda, S3, DynamoDB, Step Functions, IAM
- **JSON:** [`json/json-extractor.ts`](src/extractors/json/json-extractor.ts) -- schemas, config files, data entities
- **Angular/CSS:** [`angular/`](src/extractors/angular/), [`css/`](src/extractors/css/) -- component trees, style analysis
- **ADR YAML:** [`adr-yaml/`](src/extractors/adr-yaml/) -- architecture decision records

### RECON Phases (`src/recon/phases/`)

Extraction pipeline stages: discovery, population, extraction, inference, normalization, self-validation, divergence detection.

### RSS (`src/rss/`)

Graph operations: [`graph-loader.ts`](src/rss/graph-loader.ts), [`graph-traversal.ts`](src/rss/graph-traversal.ts), [`rss-operations.ts`](src/rss/rss-operations.ts) (search, dependencies, dependents, blast radius, context assembly).

### MCP Server (`src/mcp/`)

Tools exposed to AI assistants: [`mcp-server.ts`](src/mcp/mcp-server.ts), structural tools, context tools, obligation tools, operational tools, optimized architecture tools.

### Architecture Pipeline (`src/architecture/`)

ADR bundle compilation: [`compile-architecture.ts`](src/architecture/compile-architecture.ts), [`adr-traversal.ts`](src/architecture/adr-traversal.ts), [`bundle.ts`](src/architecture/bundle.ts), evidence emission.

### Workspace (`src/workspace/`)

Multi-repo orchestration: manifest parsing, workspace RECON, graph merging, cross-repo edge detection, slice emission, projections.

### CLI Entrypoints

- `ste` -- primary CLI ([`src/cli/index.ts`](src/cli/index.ts)): watch, init, architecture compile, evidence
- `recon` -- extraction CLI ([`src/cli/recon-cli.ts`](src/cli/recon-cli.ts)): full, incremental, self, workspace modes
- `rss` -- graph query CLI: stats, search, dependencies, context

## Artifact Model

Repository artifact classes:

- RECON state: `.ste/state/` (modules, functions, API endpoints, data entities, infrastructure, validation)
- Self-documentation state: `.ste-self/state/` (ste-runtime documenting itself)
- ADRs: [`adrs/logical/`](adrs/logical/), [`adrs/physical/`](adrs/physical/), [`adrs/physical-component/`](adrs/physical-component/), [`adrs/physical-system/`](adrs/physical-system/)
- Registries and discovery: [`adrs/index/`](adrs/index/)
- Manifest: [`adrs/manifest.yaml`](adrs/manifest.yaml)
- Rendered ADR markdown: [`adrs/rendered/`](adrs/rendered/)
- Project metadata: [`PROJECT.yaml`](PROJECT.yaml)
- Architecture evidence: JSON output from `ste evidence architecture`

## ADR Taxonomy

Use this type model when reasoning about repository architecture artifacts:

- `ADR-L-XXXX`: Logical design -- capabilities, boundaries, contracts, constraints, invariants.
- `ADR-P-XXXX`: Physical implementation specifications.
- `ADR-PS-XXXX`: Physical-System ADRs -- high-level system design with major component boxes and relationships.
- `ADR-PC-XXXX`: Physical-Component ADRs -- implementation-ready executable architecture.

## Canonical Workflows

### Extract semantic state from a project

```bash
npm run recon:full        # full extraction to .ste/state/
npm run recon             # incremental extraction
npm run recon:self        # self-documentation of ste-runtime
npm run recon:workspace   # multi-repo workspace extraction
```

### Query the graph

```bash
npm run rss:stats
npm run rss -- search "authentication"
node dist/cli/rss-cli.js dependencies graph/function/validateUser
node dist/cli/rss-cli.js blast-radius data/entity/UsersTable
```

### Compile architecture evidence

```bash
ste architecture compile --project-root .
ste evidence architecture --project-root .
```

### Build and test

```bash
npm run build             # TypeScript compilation
npm test                  # vitest suite
npm run test:contract-guards  # contract-focused tests
npm run lint              # eslint
```

### Start the MCP server

Configure via `.cursor/mcp.json` pointing at `dist/cli/index.js`. See [`documentation/guides/mcp-setup.md`](documentation/guides/mcp-setup.md).

### Commit at meaningful boundaries

After a coherent implementation slice is verified, commit it before continuing. Do not accumulate unrelated unverified changes.

## Tooling Priority Rules

These are operational rules for AI contributors:

1. If an extractor exists for the target language, use or extend it before hand-crafting extraction output.
2. If a RECON phase covers the data type, prefer it over ad hoc scripts.
3. If a CLI command exposes the workflow, prefer it over ad hoc scripts.
4. If an MCP tool provides the capability, use it rather than reimplementing the logic.
5. If frontmatter identifies artifact type, trust frontmatter over folder naming.
6. If public contract authority is relevant, treat `ste-spec` as normative and this repo as a producer/consumer, not a competing schema authority.

## Path and Scope Rules

These rules are mandatory:

1. Derive artifact paths from explicit scope roots and configuration (`ste.config.json`, `ste-self.config.json`).
2. Keep generated and temporary test artifacts inside scope-owned ignored paths.
3. Treat workspace repositories as separate scopes unless workspace mode is explicitly invoked.
4. Never classify artifacts by path shape when authoritative document metadata already exists.

## High-Value Invariants

Start here when you need the non-negotiables (from [`adrs/index/invariant-registry.yaml`](adrs/index/invariant-registry.yaml)):

- **INV-0015 (Workspace Agnosticism):** Source code contains zero references to any specific workspace, repository name, output directory name, or domain vocabulary. All such values are derived from `workspace.yaml` at runtime.
- **INV-0014 (Private Registry Isolation):** All dependencies resolve from public registries only.
- Schema-invalid artifacts are not acceptable.
- Derived artifacts must be regenerated, not manually drifted.

## Standalone Operation

`ste-runtime` works independently on any codebase without requiring the broader STE ecosystem:

- **No external dependencies on `ste-spec`:** Bundled schema fixtures in [`test/fixtures/`](test/fixtures/) allow standalone operation. When `ste-spec` is available as a sibling, contract guard tests verify schema alignment.
- **No dependency on `adr-architecture-kit`:** The architecture pipeline reads ADR YAML directly. ADR authoring tools are optional.
- **No dependency on `ste-kernel`:** Evidence JSON is emitted as files. A consuming kernel is optional.
- **Workspace-agnostic:** Works on any project with any language supported by the extractor set. Multi-repo workspace mode activates only when a `workspace.yaml` manifest is present.

## Fast Target Discovery

Use these heuristics before implementing:

- "Need to extract from a new language":
  Check [`src/extractors/`](src/extractors/) for existing extractors, then [`src/extractors/base-extractor.ts`](src/extractors/base-extractor.ts) for the extension pattern.
- "Need to add a new graph query":
  Check [`src/rss/rss-operations.ts`](src/rss/rss-operations.ts) and MCP tools before writing new query logic.
- "Need to expose a new capability to AI assistants":
  Add it as an MCP tool in [`src/mcp/`](src/mcp/).
- "Need to add workspace-level analysis":
  Check [`src/workspace/`](src/workspace/) for existing projections and canned queries.
- "Need to understand the architecture":
  Read ADRs under [`adrs/`](adrs/), then [`documentation/architecture.md`](documentation/architecture.md).

## Common Failure Modes

Avoid these:

- hand-crafting `.ste/state/` YAML when RECON extraction already covers the target
- using folder names as type authority when ADR frontmatter identifies the type
- computing relative paths without an explicit scope root
- introducing workspace-specific names (repo names, domain terms) into source code (violates INV-0015)
- leaving manifest output stale after artifact changes
- hand-editing rendered ADR markdown instead of regenerating it
- treating this repo's internal registries as if they were the normative public schema (that is `ste-spec`)

## Completion Criteria

A change is not complete unless relevant checks were run.

Minimum close-out expectation:

- run targeted tests for the changed area (`npm test`)
- run `npm run build` to verify TypeScript compilation
- run `npm run lint` for style compliance
- commit each meaningful verified implementation boundary before starting the next slice
- update `README.md` when workflow-facing behavior or orientation guidance changed
- regenerate derived artifacts if their sources changed

## One-Line Orientation

If you only remember one thing:

This repository is extractor-first, graph-first, workspace-agnostic, and capable of delivering full semantic extraction and traversal value on its own.
