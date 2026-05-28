# ste-runtime

`ste-runtime` is the runtime evidence and semantic extraction repository in the STE workspace.

It provides:
- RECON semantic extraction over source code (6 language extractors, single-repo and multi-repo workspace modes)
- Inference and cross-repo edge resolution (HTTP call matching, SNS/SQS channels, CFN cross-stack references)
- RSS graph traversal and context assembly for AI-assisted development
- Workspace-level graph queries with multi-resolution projections (L0-L4)
- A persistent MCP server with file watching and incremental RECON for Cursor integration
- Factual `ArchitectureEvidence` payloads consumed by `ste-kernel`

It does not define public cross-repo contracts, admission semantics, or governance authority.

See:
- [ste-spec](https://github.com/egallmann/ste-spec) for normative contracts and architecture doctrine
- [ste-handbook](../ste-handbook/) for deeper explanatory background on STE, subsystem roles, and end-to-end solution structure
- [COMPILER-AUTHORITY.md](COMPILER-AUTHORITY.md) for this repo's authority boundary
- [MATURITY.md](MATURITY.md) for current readiness and limitations

## Authority Boundary

Current STE authority split:

| Concern | Owning repo |
| --- | --- |
| Public schemas and cross-repo contracts | `ste-spec` |
| ADR authoring and ADR -> IR compilation | `adr-architecture-kit` |
| Runtime evidence production | `ste-runtime` |
| Admission decisions and lifecycle enforcement | `ste-kernel` |
| Advisory governance rules | `ste-rules-library` |

For this repository, the key rule is simple:

- `ste-runtime` emits evidence only.
- `ste-runtime` does not emit admission decisions.
- `ste-runtime` does not own shared IR, evidence, or admission schemas.
- Public contract authority lives in `ste-spec/contracts/`.

## Status

This repository is still experimental.

- It is a working component implementation of RECON and RSS.
- It is useful for local development, experimentation, and custom forks.
- It is not positioned as a full production-ready STE system.
- It should not be treated as the authority source for admission or shared contracts.

The detailed readiness assessment remains in [MATURITY.md](MATURITY.md).

## What This Repo Does

### RECON (Semantic Extraction)

RECON analyzes source code through pluggable, language-specific extractors
(TypeScript, Python, CloudFormation, JSON, Angular, CSS/SCSS) and produces a
semantic graph stored as content-addressable YAML slices.

It operates in two modes:

- **Single-repo** (`recon:full`) -- extracts one project into `.ste/state/`
- **Multi-repo workspace** (`recon:workspace`) -- extracts each repo in a
  `workspace.yaml` manifest, then runs cross-repo edge resolution to match
  HTTP calls against API endpoints, detect shared SNS/SQS event channels,
  and resolve CloudFormation cross-stack references. Output goes to
  `.workspace-graph/`.

An inference phase builds intra-repo graph edges (imports, function calls,
class inheritance) so that traversal operations work.

### RSS (Graph Traversal)

RSS traverses the semantic graph so humans and agents can ask for:
- search results (natural language discovery)
- dependency and dependent paths
- blast radius (impact analysis)
- assembled context for a task (bundled nodes for an AI prompt)
- lookup by key or tag

### Workspace Graph Queries

For multi-repo workspaces, a separate query surface operates at the system
level:
- `ws deps` -- repo-to-repo dependency map
- `ws integration` -- component integration map across repos
- `ws blast` -- system-level blast radius

Results can be rendered through multi-resolution projections (L0 system
through L4 full detail) as Mermaid diagrams, tables, adjacency matrices, or
JSON.

### MCP Server and Watchdog

`ste watch --mcp` starts a persistent MCP server that integrates with Cursor:
- A file watcher monitors the project for changes
- Incremental RECON keeps the in-memory graph fresh without manual re-runs
- RSS and workspace query tools are exposed over the MCP protocol
- Cursor agents can search, traverse, and assemble context directly

### Runtime Evidence

The architecture compiler combines ADR bundles (`adrs/`) with semantic graph
state to emit factual `ArchitectureEvidence` JSON payloads consumed by
`ste-kernel` for admission decisions. ste-runtime reports bundle health,
freshness, and subject linkage -- it never makes admission judgments itself.

For the full architecture diagram, see
[instructions/README.md](instructions/README.md#architecture).

## Quick Start

### Option 1: Add to an existing project or workspace (recommended)

Clone ste-runtime alongside your project, install, build, then run the
automated setup from your workspace root:

```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime && npm install && npm run build
cd ..
node ste-runtime/dist/cli/index.js setup
```

`ste setup` detects whether you have a single-repo project or a multi-repo
workspace, scaffolds the appropriate config files (`workspace.yaml` or
`ste.config.json`), creates `.cursor/mcp.json` with correct absolute paths,
updates `.gitignore`, and runs an initial RECON. Use `--dry-run` to preview
all changes before writing.

See [documentation/guides/setup.md](documentation/guides/setup.md) for the
full setup guide.

### Option 2: Clone and explore standalone

Use the automated bootstrap to install, build, run RECON on ste-runtime
itself, and validate the installation:

```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime
npm run init
```

After bootstrap completes, query the graph:

```bash
npm run rss:stats
npm run rss -- search "authentication"
```

## Programmatic API

For AI assistants and other programmatic consumers, use the TypeScript API instead of shelling out when possible.

```ts
import { initRssContext, search, assembleContext, findEntryPoints } from 'ste-runtime';

const ctx = await initRssContext('.ste/state');
const { entryPoints } = findEntryPoints(ctx, 'user authentication');
const context = assembleContext(ctx, entryPoints, { maxDepth: 2, maxNodes: 100 });
const direct = search(ctx, 'validateUser');
```

See [instructions/RSS-PROGRAMMATIC-API.md](instructions/RSS-PROGRAMMATIC-API.md).

## Common Commands

```bash
# Automated bootstrap (install, build, initial RECON, validate)
npm run init

# Build
npm run build

# Run tests
npm test

# Run contract-focused tests
npm run test:contract-guards

# Full reconciliation
npm run recon:full

# Incremental reconciliation
npm run recon

# Self-document this repo
npm run recon:self

# Graph stats
npm run rss:stats

# Scaffold workspace.yaml for a multi-repo workspace
node dist/cli/index.js init

# Generate ste.config.json with auto-detected defaults
npm run recon:init
```

## Repository Scope vs Full STE System

This repository is not the full STE system.

It implements a subset of the overall workspace responsibilities. In particular, the following are outside this repo's authority:
- shared contract definition
- admission decisions
- system-wide governance authority
- handbook-style normative documentation

If you want the full current authority model, read:
- [ste-spec/architecture/authority-map.md](../ste-spec/architecture/authority-map.md)
- [COMPILER-AUTHORITY.md](COMPILER-AUTHORITY.md)

For deeper explanatory background on STE and how the repositories fit together, see [ste-handbook](../ste-handbook/). `ste-handbook` is explanatory only; normative contracts and authority remain in `ste-spec`.

## Documentation

Start here:
- [documentation/guides/setup.md](documentation/guides/setup.md) -- setup and onboarding
- [SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md)
- [MATURITY.md](MATURITY.md)
- [COMPILER-AUTHORITY.md](COMPILER-AUTHORITY.md)
- [../ste-handbook/](../ste-handbook/) for broader STE background and subsystem walkthroughs

Reference and guides:
- [instructions/RECON-README.md](instructions/RECON-README.md)
- [instructions/RSS-USAGE-GUIDE.md](instructions/RSS-USAGE-GUIDE.md)
- [instructions/RSS-PROGRAMMATIC-API.md](instructions/RSS-PROGRAMMATIC-API.md)
- [documentation/guides/README.md](documentation/guides/README.md)
- [documentation/guides/configuration-reference.md](documentation/guides/configuration-reference.md)
- [documentation/guides/mcp-setup.md](documentation/guides/mcp-setup.md)
- [documentation/guides/troubleshooting.md](documentation/guides/troubleshooting.md)

ADR and generated repo artifacts:
- [adrs/](adrs/)
- [adrs/manifest.yaml](adrs/manifest.yaml)
- [adrs/rendered/](adrs/rendered/)
- [PROJECT.yaml](PROJECT.yaml)

## Contribution and Forking

This repository is still evolving. It is a reasonable base for experimentation and local customization.

- Forking is expected.
- Custom extractors and custom workflows are reasonable extension paths.
- External contributions to the main repository may be limited while the repository is still converging.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the current contributor guidance.

## License

Apache-2.0. See [LICENSE](LICENSE).
