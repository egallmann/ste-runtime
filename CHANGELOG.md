# Changelog

All notable changes to ste-runtime are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
