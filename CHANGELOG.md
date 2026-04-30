# Changelog

All notable changes to ste-runtime are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Wiring Backlog Gap Closure (Sibling Plan #7)

The following changes close the 47 `missing_edge` items identified in MP-3 validation.
All changes are workspace-agnostic (W-1). Post-fix merged graph: 94 edges, 4 distinct verbs.

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
  merger Pydantic model (extra="forbid").
- Endpoint graph IDs now use lowercase method tokens per Identity Contract.
- `SliceEmitResult` fields renamed from `entityCount`/`relationshipCount` to
  `nodeCount`/`edgeCount`.
- MP-2 close-out (this workspace): `recon --workspace` with `workspace.yaml`,
  `aos-graph --workspace . merge`, merged graph 26 edges using ratified verbs
  `has_contract` and `consumes` only on current slice data; merger produced zero
  warnings and zero Pydantic errors; W-1 enforced on `ste-runtime/src/`; `adr
  validate --scope . --mode complete --cross-references` reports 0 errors.
  Additional wiring verbs (reads, writes, publishes, deploys_to, invokes) await
  stronger env/SDK/ASL resolution signals in RECON state for this workspace.

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
