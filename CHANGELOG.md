# Changelog

All notable changes to ste-runtime are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Transient EPERM/EACCES/EBUSY failures on Windows during atomic file
  rename in RECON population. `atomicWriteFile` now retries up to 3 times
  with exponential backoff + jitter (50ms base). Prevents silently missing
  slices caused by AV scanners, IDE indexers, or concurrent RECON passes
  racing on directory metadata.

- Ad-hoc temp+rename patterns in `cross-repo-edges.ts` (deterministic
  `.tmp` suffix, collision-prone) and `repo-sentinel.ts` (pid-based temp)
  replaced with `atomicWriteFile`, gaining retry behavior and random
  collision-resistant temp names.

- MCP server startup hang caused by O(N x DFS) topology analysis algorithm.
  Replaced per-node recursive DFS with single-pass BFS layering (Kahn's
  algorithm) completing in O(N+E). The 5000-node synthetic graph test
  completes under 100ms.

- Redundant graph loading on MCP startup: `initialize()` and `reloadContext()`
  each called `loadAidocGraph` twice (once via `initRssContext`, once for
  topology analysis). Both now reuse the already-loaded `rssContext.graph`,
  halving cold-start I/O.

- Self-analysis branch in `initialize()` suffered the same redundant load;
  now reuses `selfContext.graph` directly.

- Stale `graph-metrics.json` accepted without validation. Added a node-count
  delta check: metrics are recomputed when cached `totalComponents` diverges
  from `graph.size` by more than 10%.

- Sequential YAML file reads in `loadAidocGraph` replaced with bounded-
  concurrency parallel reads using `ioLimiter` (16 concurrent). At N=5000,
  reduces sequential ~50s I/O to ~2s.

### Changed

- ADR-PC-0001 amended: added implementation decisions IMPL-0001 (BFS
  layering), IMPL-0002 (single graph load), IMPL-0003 (staleness check);
  added INV-0026 (O(N+E) startup bound); closed GAP-0001 (implicit
  performance gap).

- ADR-PS-0001 amended: added `startup_latency` operational requirement
  mandating O(N+E) startup operations and sub-10s cold-start at N=5000.

- Manifest, architecture index, and rendered docs regenerated via
  adr-architecture-kit.

### Added

- Full infrastructure domain emission: workspace graph slices now emit all
  RECON-extracted CFN resources as nodes, replacing the previous 8-type
  backend-biased allowlist. Supports backend services, frontend SPAs, and
  MFE monorepos equally.

- 16 new workspace graph node types: Stack, Distribution, WebACL, Certificate,
  DNSRecord, APIGateway, SecurityGroup, Secret, DBCluster, DBProxy, LogGroup,
  Alarm, DeliveryStream, EventRule, Role, and InfraResource (catch-all fallback).

- Shared `cfn-type-mapping` module (`src/workspace/cfn-type-mapping.ts`):
  single source of truth for CFN-to-graph-type mapping used by both
  slice-emitter and resource-resolver, preventing mapping drift.

- Stack nodes emitted from infrastructure/template slices with `contains`
  edges to child resources, surfacing nested stack topology in the graph.

- InfraResource fallback: unmapped AWS::* types are emitted as InfraResource
  nodes with `cfn_type` preserved in attributes for downstream classification.

- Generic name resolution via `NODE_NAME_KEYS`: display names resolved from
  type-specific CFN property keys with `logicalId` as last-resort fallback.
  No resource is dropped due to null name.

- `contains` verb added to ratified edge vocabulary for structural
  containment relationships (stack-contains-resource, stack-contains-stack).

- Auxiliary node suppression at L0-L2 projections: Role, SecurityGroup,
  LogGroup, Alarm, Certificate, and DNSRecord nodes are compressed at
  overview resolutions while remaining visible at L3-L4.

- Unit tests for full infrastructure domain emission including frontend
  resource types, InfraResource fallback, auxiliary marking, and logicalId
  name resolution.

### Changed

- ADR-L-0016 amended: CONST-0010 expanded with 16 new ratified node types,
  CONST-0011 expanded with `contains` verb, INV-0019 added for emission
  completeness invariant.

- ADR-PC-0007 amended: CFN type completeness expectations documented,
  GAP-0001 (Serverless::StateMachine) closed, intrinsic handling boundaries
  defined.

- ADR-PC-0008 amended: resource-to-node emission policy defined (all
  extracted resources become nodes), SDK-to-graph-type mapping expanded.

- `ste setup` CLI command: one-command workspace onboarding that detects
  workspace type (multi-repo vs single-repo), scaffolds `workspace.yaml` or
  `ste.config.json`, creates workspace-level `.cursor/mcp.json` with correct
  absolute paths and `--project-root`, updates `.gitignore`, and runs initial
  RECON. Supports `--dry-run` and `--ste-runtime-path` flags.

- `documentation/guides/setup.md`: single authoritative setup guide
  consolidating fragments from README, WORKSPACE-SETUP, RECON-README, and
  mcp-setup guides.

- Unit and integration tests for `ste setup` command (11 tests covering
  workspace-type detection, MCP config generation, .gitignore idempotency,
  and --dry-run mode).

### Changed

- MATURITY.md revised to reflect current production use and verified data:
  - Status updated from EXPERIMENTAL to PRODUCTION WORKSPACE TOOLING
  - CEM assessment corrected from "NOT IMPLEMENTED" to "PARTIALLY IMPLEMENTED"
    (substrate exists via bounded context assembly, convergent subgraph expansion,
    ADR integration; invariant validation not operationalized)
  - Performance benchmarks updated to workspace scale (15 repos, ~952K LOC, ~23s)
  - Coverage numbers flagged as stale (January 2026); CLI Tools now has tests
  - Removed inapplicable compliance concerns
  - Consolidated use case guidance; reframed path to full maturity

### Fixed

- Replaced stale `ste-runtime-private` references with `ste-runtime` in
  `scripts/init.cjs`.

- Updated MATURITY.md version from `0.9.0-experimental` to
  `0.10.0-experimental` to match package.json.

- Added "Command Prerequisite" note to troubleshooting guide explaining that
  bare `ste` commands require `npm link` since the package is not published.

- Added `npm link` documentation and `npm run init` instructions to
  CONTRIBUTING.md Local Development section.

### Changed

- Rewrote README Quick Start to present exactly two setup paths: add-to-project
  via `ste setup` and standalone via `npm run init`.

- Documented existing automation commands (`npm run init`, `ste init`,
  `npm run recon:init`) in README Common Commands and workspace initialization
  guide.

- Consolidated setup guide references: instructions/WORKSPACE-SETUP.md now
  redirects to `documentation/guides/setup.md`; duplicate Quick Starts removed
  from instructions/README.md and RECON-README.md.

- Rewrote `SYSTEM-OVERVIEW.md` to accurately describe ste-runtime capabilities
  (RECON, RSS, MCP, CLI, extractors, workspace mode) and standalone operation.
  Previous content was a misplaced copy from adr-architecture-kit referencing
  Python paths and `src/adr_kit/`.

### Added

- Phase 2 semantic enrichment: `contradicts` symmetric relationship type for
  detecting contradictory decisions. Emits bidirectional edges from author-
  declared `contradicts` fields on decisions.

- Phase 2 `rule` entity type (`RULE-NNNN`): first-class architecture rules
  extracted from logical ADR `rules[]` sections. Rules are evaluable
  conditions (distinct from invariants, which are static constraints).
  Includes `enforces`/`governs` relationship derivation for rules.

- Phase 2 ADR subgraph projection (`adrSubgraph`): entity-type filtering,
  relationship-type filtering, domain scoping, and ADR-scoped subgraph
  extraction over the compiled ADR model.

- Phase 2 `admission_status` field on NormalizedEntity: `candidate`,
  `admitted`, or `rejected`. Defaults to `admitted` for all compiled
  entities. Reserved for ste-kernel admission signal integration.

- Phase 2 DEC lifecycle metadata on decision entities: typed
  `dec_lifecycle_stage`, `reevaluation_conditions`, and
  `accumulated_consequences` fields extracted from ADR YAML, replacing
  untyped metadata bag storage.

- Phase 3 `architectureMerge` wired with real `ReconArchitectureSnapshot`
  data (version `1`). Attribution records from RECON evidence are merged
  into entity metadata as `embodiment_count`, `attributed_code_slices`,
  and `enforcing_code_slices`.

- Phase 3 Architecture Consequence Surface (`consequenceSurface`): computes
  transitive consequence closure for change-impact queries, distinguishing
  hard consequences (enforces, governs, implements, supersedes, contradicts)
  from soft consequences (related_to, references, refines, enables).

- Phase 3 embodiment density projection (`computeEmbodimentDensity`):
  per-ADR, per-capability, per-system, per-component, per-invariant
  coverage metrics based on attribution evidence. Reports covered, partial,
  and unlinked entities with coverage ratio summary.

- Phase 3 governance projection (`buildGovernanceProjection`): reads
  authority boundaries, invariant coverage, and decision governance chains
  directly from ADR entity/relationship registries. Replaces the stub that
  previously delegated to `componentIntegration`.

- Phase 4 (experimental) negative-space entity extraction: `rejection`
  entity type (`REJ-NNNN`) extracted from logical ADR `rejections[]`
  sections. Linked to decisions via `rejects`/`rejected_by` relationship
  types.

- Phase 4 (experimental) DEC gravity computation (`computeDecGravity`):
  scores decisions by downstream dependency count, invariant enforcement
  count, component governance count, capability enablement count, and
  accumulated consequence count. Weighted composite score for change-risk
  assessment.

- Phase 4 (experimental) MVC context assembly rationale
  (`assembleContextWithRationale`): extends traversal API to return
  inclusion/exclusion rationale for every entity (traversal path, boundary
  reason, domain filter, entity type filter, broken edge).

### Changed

- `ReconArchitectureSnapshot` type upgraded from stub (version `0`) to
  real data carrier (version `1`) with `attribution_records` array.

- `governance-projection` family source query changed from
  `componentIntegration` to `governanceFromArchitecture`.

- Legacy workspace-graph package retired: `merge` and `emit-evidence` CLI commands emit
  runtime deprecation warnings. Package reclassified as archived read-only
  query shim.

### Added

- ADR YAML RECON extractor (`src/extractors/adr-yaml/index.ts`): new `adr-yaml`
  language added to the RECON pipeline. Extracts ADR YAML source files into
  first-class graph slices, enabling `find`, `impact`, `usages`, and `similar`
  queries against architecture decision records, invariants, decisions,
  capabilities, component specifications, and system boundaries.

- Architecture AI-DOC domain: new `architecture` domain with 6 slice types
  (`adr`, `invariant`, `decision`, `capability`, `component`, `system`) emitted
  to `.ste-self/state/architecture/` subdirectories. Slice IDs follow canonical
  ADR entity ID scheme (`adr:ADR-L-0001`, `invariant:INV-0001`, etc.).

- Architecture inference rules: `declared_in`, `references`, `implements_logical`,
  `implements_system`, `enables`, `enforces`, `implemented_by`, and `embodied_in`
  edges inferred from ADR YAML metadata. Tags include `status:*`, `adr-type:*`,
  `domain:*`, `enforcement:*`, and `scope:*`.

- ADR-PC-0011 (ADR YAML Semantic Extraction): new physical-component ADR
  governing the ADR YAML extractor component (COMP-0012), documenting the
  `architecture` domain, 6 element types, and failure-path contracts.

### Changed

- ADR-L-0001 INV-0006: added `ADR YAML (see ADR-PC-0011)` to the multi-language
  support invariant.

- ADR-PS-0002: added ADR YAML Semantic Extractor as fourth component in the
  Semantic Extraction Subsystem topology, with `ADR-PC-0011` in
  `references_components` and `adr-yaml` in technologies.

- Inverse relationship types: 7 new derived inverse types (declares, referenced_by,
  enforced_by, governed_by, implements, embodies, refined_by) added to the
  relationship vocabulary. All 12 directional relationship types now have
  compiler-derived inverse edges emitted with provenance_classification 'derived',
  enabling bidirectional graph traversal without O(|E|) scans.

- Lifecycle stage on NormalizedEntity: new required `lifecycle_stage` field
  (proposed | active | deprecated | superseded) derived from ADR metadata.status
  and propagated to child entities via declared_in parent ADR. Replaces hardcoded
  'active' value in legacy entity projection.

- ADR graph traversal API (`src/architecture/adr-traversal.ts`): bounded BFS
  traversal functions `adrDependencies`, `adrDependents`, and `adrBlastRadius`
  with maxDepth/maxNodes bounds, cycle detection, truncation tracking, and broken
  edge detection. Mirrors the rss-operations.ts traversal pattern.

- Removed architecture-graph.yaml dangling reference from architecture-bundle
  loader. Traversal API operates on in-memory ArchModelState; no persisted graph
  artifact is emitted.

- Workspace graph merge (`src/workspace/workspace-merge.ts`): loads per-repo
  slices, validates via Zod, merges nodes (first-wins collision detection),
  filters to high-confidence edges, resolves dangling references, folds
  cross-repo edges from workspace-edges.yaml, and emits graph.yaml. Wired
  into workspace RECON as a non-fatal post-processing step.

- Zod slice validation (`src/workspace/slice-schema.ts`): closed vocabulary
  schemas for workspace graph slices with 10 node types and 12 edge verbs
  (9 existing + 3 cross-repo: calls, triggers, publishes_to). Starts in
  warn mode (logs unknown types/verbs but accepts the slice).

- Node-level graph queries (`src/workspace/canned-queries.ts`): `whatCalls`
  (depth-1 reverse on invoke/publish verbs), `whatDependsOn` (forward
  transitive closure), `blastRadiusNode` (reverse transitive closure).
  All are cycle-safe.

- MCP workspace tools: `ws_what_calls`, `ws_what_depends_on`, and
  `ws_node_blast_radius` registered in mcp-server.ts, exposing the
  node-level query functions to MCP consumers.

- Semantic Compression Engine (`src/workspace/compression.ts`): deterministic
  aggregation layer that transforms canned-query results into multi-resolution
  `CompressedProjection` at five levels (L0-L4). Implements endpoint path-prefix
  grouping into capability domains, same-type node aggregation above configurable
  threshold, 5-tier edge verb taxonomy with per-level suppression rules, edge
  multiplicity compression, maxNodes safety valve, and infrastructure condensation
  for alarm/monitoring resources at L0-L1. All compression preserves traceability
  via `memberIds` on aggregate nodes and `sourceEdgeIds` on compressed edges.

- Resolution-Aware Renderers: `toMermaidAtResolution()` and
  `toTableAtResolution()` in `projections.ts` consume `CompressedProjection` and
  produce multi-resolution Mermaid diagrams with capability subgraphs, aggregate
  node shapes, and navigation bars linking all resolution levels. L4 backward
  compatibility preserved: `toMermaid()` remains unchanged.

- Multi-Resolution Projection Emission (`src/workspace/emit-multi-res-projections.ts`):
  emits `system-context-L0.md`, `service-topology-L1.md`, `capability-domains-L2.md`,
  per-repo `capability-domains-L2-{repo}.md`, `contract-integration-L3.md`, and
  per-repo `contract-integration-L3-{repo}.md` alongside existing L4 files. Each
  file includes YAML frontmatter (projection_level, compression_ratio, generation_hash,
  drill_down/drill_up links) and navigation bars. Wired into `executeWorkspaceRecon`
  as non-fatal post-processing.

- Resolution parameter for MCP and CLI: `ws_dependencies` and `ws_integration` MCP
  tools accept optional `resolution` parameter (L0|L1|L2|L3|L4, default L4). CLI
  `ws deps` and `ws integration` commands accept `--resolution` flag. When resolution
  is specified, results route through the compression engine before rendering.
  Omitting resolution produces identical L4 output (backward compatible).

- Projection Family Registry (`src/workspace/projection-families.ts`):
  `ProjectionFamily` interface and registry with five built-in families:
  `architecture-overview` (L0+L2), `integration-topology` (L1-L3),
  `dependency-projection` (L0-L1), `governance-projection` (L0-L1, stub),
  `runtime-projection` (L1-L2, stub). Extensible via `registerFamily()`.

- ADR-L-0019: Multi-Resolution Architecture Projection logical ADR (CAP-0019,
  DEC-0021, INV-0022, INV-0023).
- ADR-PC-0010: Semantic Compression Engine physical-component ADR (COMP-0011).
- Amended ADR-L-0018: added multi-resolution projection as enabled capability,
  added INV-0024 for projection level metadata.
- Amended ADR-PC-0009: added COMP-0011 dependency, resolution-aware API to
  IFACE-0010, and new module paths.

- Bilateral cross-repo edge extraction via httpCalls + api_endpoint matching.
  The workspace resolver now produces HIGH confidence edges when a TypeScript
  frontend's `this.http.get/post/put/delete` calls match a C# backend's
  `[Route]+[HttpVerb]` endpoint contracts (path-suffix alignment). Unilateral
  claims (outbound call with no matching inbound endpoint) produce MEDIUM
  confidence edges when manifest `kind=service` confirms the target repo.
  Bilateral enrichment writes `referenced_by` / `references` backlinks on
  both caller and callee slice files.

### Fixed

- LANG_MAP for dotnet/csharp repos now includes `csharp` language, enabling
  `.cs` file discovery and extraction in workspace mode.
- `getExtractorName()` returns `recon-csharp-extractor-v1` for csharp language
  (was falling through to `recon-unknown-extractor-v1`).
- C# extractor now finds action-level `[Route("...")]` attributes in addition
  to inline `[HttpGet("...")]` route suffixes, and searches up to 12 lines
  ahead for the method signature (was limited to 5).

### Added

- Auto-publish deterministic graph projections to `output_dir/projections/` on
  workspace recon completion (`src/workspace/emit-projections.ts`). After all
  slices, cross-repo edges, and the workspace index are emitted, `emitProjections`
  loads the workspace graph and writes: `system-dependencies.md` (repo-level
  dependency DAG as Mermaid + table), `component-integration.md` (workspace-wide),
  per-repo `component-integration-{repoName}.md`, and `architecture-overview.md`
  (deterministic skeleton with `<!-- LLM-ENRICHMENT: ... -->` markers for optional
  narrative enrichment). Projection emission is non-fatal; failures are logged
  without affecting the recon run status. CLI reports projection file count.

- Per-repo filtering for workspace MCP tools: `find`, `show`, `usages`,
  `impact`, `similar`, and `overview` now accept an optional `repo` parameter
  that restricts results to nodes from a specific repository in workspace mode.
  `overview` returns a per-repo breakdown (`repos` section) with node counts and
  domain summaries when no repo filter is applied. `AidocNode` gains a `repo`
  field derived from the file path during graph loading. `CodeMatch` includes
  `repo` in all tool responses. Single-project mode is unaffected (`repo`
  defaults to `undefined`).

- Workspace Graph Loader (`src/workspace/workspace-graph-loader.ts`): loads
  workspace slice YAML files into a typed in-memory `WorkspaceGraph` with
  pre-built `outAdj`/`inAdj` adjacency lists for O(1) neighbor lookups.
- Canned Queries (`src/workspace/canned-queries.ts`): three deterministic,
  non-LLM graph traversal functions:
  - `systemDependencies()` -- repo-level dependency DAG with verb-labeled edges
  - `componentIntegration()` -- subgraph grouped by integration pattern
    (HTTP API, Event Stream, Shared Database, Invocation, Deployment)
  - `blastRadiusWorkspace()` -- BFS blast radius with tiered classification
    and risk assessment (low/medium/high/critical)
- Projection Renderers (`src/workspace/projections.ts`):
  - `toMermaid()` -- flowchart TD with subgraph blocks per repo and
    type-specific node shapes
  - `toTable()` -- structured row arrays with query-specific column schemas
  - `toAdjacencyMatrix()` -- square matrix with verb-labeled cells
- CLI Commands (`ste ws deps`, `ste ws integration`, `ste ws blast`):
  workspace graph queries with `--output mermaid|table|matrix|json` format
  selection and `--workspace <path>` directory targeting.
- MCP Tools (`ws_dependencies`, `ws_integration`, `ws_blast_radius`):
  workspace graph queries exposed via MCP protocol, returning Mermaid
  diagrams and structured tables.
- Programmatic API: all workspace graph types and functions exported from
  the `ste-runtime` package entry point (`src/index.ts`).

- Workspace Initialization Guide (`documentation/guides/workspace-initialization.md`):
  end-to-end walkthrough for setting up ste-runtime in a multi-repo workspace,
  covering `workspace.yaml` schema, workspace-level MCP config, running
  `recon:workspace`, and verification.
- Workspace Mode section in RECON-README (`instructions/RECON-README.md`)
  documenting `--workspace` usage, output structure, and resilience behavior.

### Changed

- Workspace auto-discovery: bare `--workspace` now checks `ste.config.json`
  `projectRoot` for `workspace.yaml` before walking upward from cwd, enabling
  `recon --workspace` when ste-runtime lives outside the workspace tree.
- MCP server workspace state loading: when `--project-root` points at a
  directory containing `workspace.yaml`, the MCP server now loads the graph
  from `output_dir/state/` (the workspace recon output) instead of the
  single-project `.ste/state` path.
- MCP Setup Guide (`documentation/guides/mcp-setup.md`): replaced outdated
  `npm install ste-runtime` / `npx ste` installation instructions with the
  actual clone-and-build workflow; replaced `${workspaceFolder}` patterns with
  absolute-path MCP configs; added workspace-level vs global config options.
- Guides README (`documentation/guides/README.md`): added Workspace
  Initialization Guide to the index.

### Fixed

- Inference phase crash on Angular projects: added `Array.isArray()` guards
  around `callGraph`, `constructorCallGraph`, and `methodCallGraph` lookups
  in `src/recon/phases/inference.ts` to prevent `is not iterable` errors
  when dynamic call graph data is non-array.

### Changed

- Node Identity Namespacing: all resource node IDs now include the owning
  repo name as the first segment after the type
  (`Type:repo:name[:qualifier]`). This eliminates identity collisions when
  multiple repos declare resources with the same logical name. `Service`
  and `ExternalSystem` IDs are exempt (already unique by design). The repo
  segment is optional for backward compatibility when used outside a
  workspace context.

### Added

- ExternalSystem node support: workspace manifest schema extended with optional
  `external_systems` registry; `wireExternalSystemEdges` in slice-emitter creates
  ExternalSystem nodes and `invokes` edges from Lambda env-var matches to registered
  external systems.
- `csharp` added to `availableExtractors` in tools-operational so C# repos are no
  longer flagged as missing extractors.

### Fixed

- StateMachine node extraction: `extractResourceMetadata` overwrote the CFN
  resource type field with the SAM execution type property (e.g., `EXPRESS`),
  preventing downstream matching on `AWS::Serverless::StateMachine`. Renamed
  to `meta.stateMachineType` to preserve the original resource type.
- ASL `DefinitionUri` resolution: external ASL files referenced via
  `DefinitionUri` were resolved relative to the state directory instead of
  the repo checkout. Added the repo path as the primary resolution candidate.
- ASL DefinitionSubstitution variable extraction: `${VarName}` substitution
  placeholders in ASL `Resource` fields are now recognized and mapped back to
  Lambda logical IDs through `DefinitionSubstitutions`. Previously, only
  literal ARNs and CFN intrinsics were extracted from ASL bodies.
- `DefinitionSubstitutions` now captured as metadata for both
  `AWS::StepFunctions::StateMachine` and `AWS::Serverless::StateMachine`.
- Lambda code root resolution: `meta.codeUri` now populated for
  `AWS::Lambda::Function` (derived from Handler path prefix);
  `Environment.Variables` extracted for raw Lambda resources (previously
  only SAM).
- Path normalization: `collectLambdaCodePathPrefixes` and layer ContentUri
  resolution now use `path.posix.normalize` to resolve `..` segments in
  relative CodeUri paths.
- Nested stack collision prevention: `lambdaCodeRoots` now merges (not
  overwrites) entries when the same logical ID appears from multiple nested
  stacks.
- Shared dependency matching: CodeUri parent directory added as additional
  code root, allowing SDK usage in sibling shared directories to match Lambda
  functions.
- ASL YAML discovery: `.asl.yaml`/`.asl.yml` files now discovered and
  classified alongside `.asl.json`.
- YAML ASL parsing: `DefinitionUri` handler accepts `.yaml`/`.yml` files and
  parses them with js-yaml before extracting Lambda references.
- `Fn::Sub` intrinsic unwrap in `extractLambdaArns`: string-form `${VarName}`
  placeholders and map-form `[template, {Var: !GetAtt Fn.Arn}]` now resolved
  to Lambda references in ASL definitions.

### Changed

- Workspace discovery for RECON CLI: `recon --workspace` and `--workspace=auto` resolve the manifest
  directory via `STE_WORKSPACE_ROOT` or by walking upward from cwd for `workspace.yaml` /
  `workspace.yml`. NPM script `recon:workspace` invokes discovery mode.
- ADR-L-0017 RECON Workspace Execution Contract (INV-0019 heartbeat, CONST-0015/0016 incremental
  skip sentinel, CONST-0017 per-repo timeout). Workspace RECON: stdout heartbeat per repo
  (`Processing repo (N/M)` and completion markers); `--skip-unchanged` for cross-run skips using
  `state/<repo>/recon-run-sentinel.json` (SHA-256 over path/mtime/size + package version);
  `--timeout-per-repo <ms>` with `timed_out` status and sibling repos continuing; sentinel
  updated after each successful repo run so subsequent skips are possible.
  `repo-sentinel.ts` and `skipped`/`timed_out` outcomes in `workspace-recon.ts`/`workspace-index`.
- Synthetic workspace smoke fixture under `fixtures/recon-workspace-smoke/`.
- ADR-L-0015: Workspace Agnosticism Invariant (W-1) codifying that ste-runtime
  source must contain zero workspace-specific references.
- ADR-L-0016: Workspace Graph Slice Schema Contract defining the slice output
  contract (schema_version, repo, generated_by, generated_at, source_commit,
  nodes, edges, diagnostics).
- ADR-PC-0008: Service Wiring Post-Processing establishing that all edge wiring
  lives in the slice emitter as post-processing joins on existing RECON state.
- `AWS::Serverless::Function` semantic lens in CFN extractor: promotes
  `functionName`, `runtime`, `handler`, `memorySize`, `timeout`,
  `architectures`, `codeUri`, and `environment` as first-class metadata fields.
- SAM `Events` trigger extraction: `extractTriggerRelationships` now parses
  `AWS::Serverless::Function` `Events` property for SQS, SNS, DynamoDB,
  Kinesis, S3, API, HttpApi, Schedule, and EventBridgeRule event sources.
- C#/.NET extractor (MP-4c): `csharp` added to `SupportedLanguage`, `.cs` file
  discovery with `obj/bin` ignore patterns, regex-based shallow extraction of
  classes (including ASP.NET controllers with `[Route]` attributes), HTTP action
  routes (`[HttpGet]`, `[HttpPost]`, etc.), dependency injection registrations
  (`services.AddScoped<T>`, etc.), and namespace detection. Wired into
  extraction routing alongside existing language extractors.
- Atomic file write utility (`utils/atomic-write.ts`, MP-4e): write-to-temp +
  rename pattern for concurrency-safe file writes. Applied to RECON population
  phase (`.ste-self/state` slices) and workspace slice emitter to prevent
  corruption when concurrent workspaces share the same ste-runtime installation.
- ASL (Amazon States Language) extraction pipeline: `.asl.json` files are
  discovered, parsed, and produce `state_machine_definition` and
  `asl_lambda_ref` assertions with normalization support.
- `AWS::StepFunctions::StateMachine` enriched lens: captures `DefinitionBody`,
  parses `DefinitionString` JSON, and records `DefinitionUri` for downstream
  resolution.
- Resource resolver now extracts Lambda ARNs from ASL string patterns
  (`arn:aws:lambda:*:*:function:NAME` and `arn:aws:states:::lambda:invoke`)
  in addition to CFN intrinsics (`Ref`/`GetAtt`).
- Resource resolver follows `DefinitionUri` to load and parse external `.asl.json`
  files for Lambda reference extraction.
- `wireInvokesEdges` now recognizes `AWS::Serverless::Function` as a valid
  invocation target alongside `AWS::Lambda::Function`.

### Wiring Gap Closure

The following changes close the `missing_edge` items identified in graph validation.
All changes are workspace-agnostic (W-1).

#### Gap 1: SAM Events API endpoint extraction

- `extractSamApiEndpoints()` added to `extraction-cloudformation.ts`: iterates
  `AWS::Serverless::Function` `Events` entries of Type `Api` or `HttpApi` and emits
  `api_endpoint` assertions with `framework: sam-events-api`, enabling `has_contract`
  edges for functions declared via SAM event syntax rather than explicit
  `AWS::ApiGateway::*` resources.

#### Gap 2: Nested stack parameter depth

- `extractRefFromIntrinsic` in `extraction-cloudformation.ts` now unwraps the
  map-form `Fn::Sub` (`[template, {Var: {Ref: X}}]`), extracting the inner `Ref`
  target so `EventSourceMapping` `EventSourceArn` values using this pattern yield a
  usable `sourceRef`.
- `wireConsumesEdgesFromTriggers` in `slice-emitter.ts` now falls back through the
  `paramResolutionTable` (cross-stack parameter resolution) when `sourceRef` is not
  directly in `logicalIdToGraphId`, enabling `consumes` edges for Lambda functions
  whose event source ARN is a cross-stack parameter resolved at synthesis time.

#### Gap 3: DynamoDB stream consumption

- `ResourceResolverResult` gains `streamDatabaseLogicalIds: string[]`, populated from
  DynamoDB Table state files with `hasStream: true` in `resource-resolver.ts`.
- `wireConsumesEdgesFromTriggers` stream-database fallback in `slice-emitter.ts`:
  when multiple `Database` nodes exist (singleton check fails) and the trigger
  reference name implies a DynamoDB stream, the single stream-enabled `Database`
  node is used as the `consumes` target.

#### Gap 4: Env-var bridge (reads/writes/publishes)

- `wireReadWriteEdges` and `wirePublishEdges` in `slice-emitter.ts` use the
  per-Lambda `lambdaEnvVars` join with `sdkUsageMatchesLambdaRoots` for precise
  Lambda-to-resource matching. When no env var bridge resolves, a singleton
  resource fallback emits an edge when exactly one node of the matching graph type
  exists in the slice.

### Changed

- ADR-L-0017 source YAML aligned with adr-kit schema: valid `constraints[].type`,
  indented `decision` blocks under `decisions[]`, decision IDs DEC-0017 through
  DEC-0019 (four-digit pattern); regenerated manifest, indexes, rendered ADRs,
  and `SYSTEM-OVERVIEW.md`.

- Slice emitter output fields renamed from `entities`/`relationships` to
  `nodes`/`edges` per Slice Schema ADR contract.
- Slice emitter now emits `generated_by` (from package.json), `generated_at`
  (ISO-8601 UTC), `source_commit` (git rev-parse HEAD), and `diagnostics`
  (default []) on every slice.
- Node `repo` field moved from top-level to provenance object to align with
  the downstream merger schema contract (extra="forbid").
- Endpoint graph IDs now use lowercase method tokens per Identity Contract.
- `SliceEmitResult` fields renamed from `entityCount`/`relationshipCount` to
  `nodeCount`/`edgeCount`.

### Fixed

- Duplicate `consumes` edge emission in `slice-emitter.ts` that bypassed node
  existence and resolver-backed target resolution; SQS/SNS/Dynamo
  `event_source_mapping` `consumes` edges are emitted only from
  `wireConsumesEdgesFromTriggers` after the resource resolver runs.
- `logicalIdToGraphId` in `resource-resolver.ts` now uses the same intrinsic-aware
  display-name rule as slice infrastructure nodes (fall back to CFN logical ID
  when `queueName`, `bucketName`, etc. are intrinsics), aligning resolver graph
  IDs with slice nodes so merged graphs retain `consumes` edges instead of
  dropping them as unknown `to` endpoints.
- Trigger wiring: resolve `sourceRef` parameter names ending in `Arn` to the
  corresponding resource logical id when present in `logicalIdToGraphId`
  (standalone stacks where nested param tables are empty).
- Endpoint IDs violated Identity Contract due to uppercase HTTP method tokens
  (POST, GET, ANY). Methods are now normalized to lowercase via
  `normalizeGraphToken`.

---

## Previous

### Added

- Workspace-mode RECON: `recon --workspace <path>` reads `workspace.yaml`, runs
  RECON per repository with state under the workspace `output_dir/state/<repo>/`,
  emits graph slices to `output_dir/slices/<repo>.yaml`, and writes
  `output_dir/workspace-index.yaml`. Module entry points under `src/workspace/`
  (`manifest.ts`, `workspace-recon.ts`, `slice-emitter.ts`, `workspace-index.ts`).
- `BUILTIN_IGNORE_PATTERNS` and `detectLanguages` exported from `src/config/index.ts`
  for workspace manifest configuration.
- CloudFormation discovery directories extended with `cfn_templates` and `sam` for
  `dotnet`-mapped repositories.

### Changed

- Every RECON invocation now includes an automatic self-pass that updates
  `ste-runtime`'s own graph in `.ste-self/state`. This applies to all entry
  points: `recon` CLI (single-project and `--workspace`), `ste recon`
  (Commander), and MCP `triggerFullRecon`. The self-pass is skipped only when
  the primary target already is `ste-runtime` (`--self` or self-analysis mode).

### Fixed

- `triggerSelfRecon` now passes `{ selfMode: true }` to `loadConfig`, loading
  `ste-self.config.json` instead of `ste.config.json`. Without this flag, the
  workspace-era `projectRoot: ".."` caused the self-analysis guard to always
  reject, making MCP `refresh` with `scope: self` and the self-recon trigger
  inoperable.
- Lambda inference: guard `AWS::Lambda::Function` handler parsing so non-string
  YAML handler values (for example intrinsic objects) do not throw at
  `handler.split`.

### Changed

- No change to default single-repository CLI behavior when `--workspace` is omitted.
