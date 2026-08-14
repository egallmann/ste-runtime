# ste-runtime

`ste-runtime` observes source repositories and workspaces, extracts observed
implementation state into queryable semantic structure, and assembles bounded
context and runtime evidence for human and AI engineering work.

Engineering systems contain implementation truth that is expensive to
reconstruct repeatedly. ste-runtime makes that observed state available for
repository exploration, task-scoped context, workspace queries, and evidence
production without replacing canonical architecture or governance authority.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)

## Runtime boundary and AI orientation

ste-runtime is the runtime observation and context layer within System of
Thought Engineering (STE). It consumes source and canonical architecture
inputs, produces derived semantic/runtime state and runtime-owned evidence,
and exposes bounded results to human and AI engineering tools.

It does not invent architecture authority, replace canonical ADRs, or make
`ste-kernel` admission decisions. Generated runtime state is evidence and
derived state, not a source of truth. AI use is currently supervised and
human-in-the-loop; the runtime is not an autonomous engineering agent.

## Quick Start

The supported path is a source checkout. Requires Node.js 22 or later and npm.
Python 3 is also required by some extractors.

```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime
npm ci
npm run build
npm run recon:self
npm run rss -- stats
npm run rss -- search "authentication"
```

The first two runtime commands reconstruct the checkout's derived state and
run a useful RSS query against it. For another repository or a workspace, use
the verified setup path after building:

```bash
node dist/cli/index.js setup --project-root /absolute/path/to/project \
  --ste-runtime-path /absolute/path/to/ste-runtime --dry-run
```

Review the dry run, then repeat without `--dry-run` when ready. See the
[setup guide](documentation/guides/setup.md) for onboarding details. The npm
package remains private and unpublished, so `npm install ste-runtime` is not
the supported installation path.

## Minimal Example

For a self-analysis checkout, the useful transformation is:

```text
source repository and canonical inputs
          │
        RECON
          ▼
derived semantic/runtime state
          │
         RSS
          ▼
task-scoped matches, context, or evidence
```

RECON records what can be observed from the repository and workspace. RSS then
searches or traverses that derived state instead of asking a human or an AI
system to rediscover the whole codebase for every task. The resulting state is
runtime evidence; canonical ADR sources remain authoritative for architecture.

## What It Does

- **RECON** extracts source, workspace, and implementation-linkage state.
- **RSS (Runtime State Slicing)** searches and traverses runtime state to
  assemble bounded task context, dependencies, dependents, and blast radius.
- **Workspace composition** connects repository-level dependencies,
  integrations, locators, and multi-resolution views.
- **Architecture evidence** combines canonical ADR inputs with observed
  runtime state for factual downstream review and tooling.
- **MCP and watch workflows** provide local integration and supported
  incremental refresh paths.

## Core Workflow

The runtime supports several related paths rather than one universal compiler
pipeline:

```text
source repositories ──> RECON ──> derived runtime state ──> RSS ──> bounded context
                                      │                         │
                                      └─ optional workspace graph ─┘

canonical ADR YAML + runtime observations ───────────────> runtime evidence

local MCP/watch integration ───────────────> exposes or refreshes supported paths
```

RECON and workspace composition establish the runtime view. RSS selects a
task-scoped slice from that view. Architecture evidence is a related
runtime-owned output path, while MCP/watch can expose or refresh local flows.

## Key Concepts

- **RECON** — repository and workspace observation that extracts implementation
  state into derived runtime data.
- **RSS / Runtime State Slicing** — search, traversal, and context assembly over
  runtime state for a bounded task or question.
- **Semantic state** — queryable relationships and observations extracted from
  source and workspace inputs; it is not canonical architecture.
- **Workspace graph** — a composed view of repositories, dependencies,
  integrations, locators, and impact relationships.
- **Runtime evidence** — machine-readable observations assembled for review,
  tooling, or downstream admission workflows.
- **Canonical versus derived state** — ADR YAML and established contracts are
  authoritative; generated projections, registries, graphs, and evidence are
  derived or runtime-owned outputs.

## Who Owns What

STE repositories have distinct responsibilities:

| Repository | Responsibility |
| --- | --- |
| `ste-handbook` | Explanatory model, theory, and teaching material |
| `ste-spec` | Shared public contracts and cross-repository schemas where established |
| `adr-architecture-kit` | ADR authoring, schema validation, authoring workflows, and ADR-side projections |
| `ste-runtime` | Runtime observation, semantic extraction, runtime evidence, and runtime-owned machine artifacts |
| `ste-kernel` | Admission decisions and lifecycle enforcement where established |
| `ste-rules-library` | Advisory and custom governance rules |

Compiler and authority language is artifact-specific: ADR Kit handles
authoring-side ADR validation and projection work; ste-runtime handles the
runtime-owned compilation/evidence responsibilities established by this
repository. Neither is the universal compiler for every architecture artifact.
See [COMPILER-AUTHORITY.md](COMPILER-AUTHORITY.md) for the detailed boundary.

## Common Workflows

### RECON and RSS

```bash
npm run recon:full
npm run recon:self
npm run rss -- stats
npm run rss -- search "authentication"
npm run rss -- context "trace the authentication flow"
```

See the [RSS usage guide](instructions/RSS-USAGE-GUIDE.md) for query forms.

### Workspace graph

```bash
node dist/cli/index.js ws deps --workspace /absolute/path/to/.workspace-graph
node dist/cli/index.js ws integration --workspace /absolute/path/to/.workspace-graph
node dist/cli/index.js ws blast /service/example --workspace /absolute/path/to/.workspace-graph
```

Use `node dist/cli/index.js ws --help` for the current workspace query surface.

### Architecture and runtime evidence

```bash
node dist/cli/index.js architecture compile --project-root . --dry-run
node dist/cli/index.js evidence architecture --project-root .
```

Compilation consumes canonical ADR YAML and source inputs. Non-dry runs may
produce runtime-owned registries and indexes; do not hand-edit those outputs.

### MCP and watch

```bash
node dist/cli/index.js watch --project-root /absolute/path/to/project --no-watch
```

The watch command starts the local MCP server. See the [MCP setup guide](documentation/guides/mcp-setup.md)
before connecting an editor.

## Programmatic Use

After building a source checkout, the current implementation exports can be
imported from `dist/index.js`:

```js
import { initRssContext, search, blastRadius } from './dist/index.js';

const ctx = await initRssContext('.ste/state');
const matches = search(ctx, 'authentication');
const impact = matches.nodes[0]
  ? blastRadius(ctx, matches.nodes[0].key)
  : { nodes: [] };

console.log({ matches: matches.nodes.length, impact: impact.nodes.length });
```

This describes source-checkout use of current exports, not a production
package compatibility guarantee. See the verified
[RSS programmatic API guide](instructions/RSS-PROGRAMMATIC-API.md).

## Architecture Records and Generated State

- Canonical ADR source records live under [`adrs/`](adrs/) and currently use
  ADR Architecture Kit schema v1.3.
- Human-readable generated ADR projections live under
  [`adrs/adr-projection/`](adrs/adr-projection/).
- [`SYSTEM-OVERVIEW.md`](SYSTEM-OVERVIEW.md), `adrs/manifest.yaml`, runtime
  registries, indexes, graphs, and evidence are generated or derived views.

Do not hand-edit canonical projections, manifests, registries, graphs, or
system overviews. Change the owning canonical source and regenerate through
the appropriate tool. See the [architecture guide](documentation/architecture.md)
for deeper implementation detail.

## Maturity and Stability

The implementation is a functioning supervised reference implementation with
meaningful workspace-oriented use. Its maturity boundaries are separate:

- **Execution:** human-supervised and human-in-the-loop; not autonomous.
- **Distribution:** public source, but `package.json` remains `private: true`
  and the package is unpublished to npm.
- **API:** source exports exist for local integration, but there is no
  production-supported compatibility commitment yet.
- **Security:** current assumptions are local/single-user and bounded by the
  implemented project-boundary controls; this is not presented as a hardened
  multi-user or hostile-input service.

See [MATURITY.md](MATURITY.md) for current evidence and limitations.

## Documentation

### Start here

| Document | Purpose |
| --- | --- |
| [SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md) | Generated repository orientation and authority order |
| [Setup guide](documentation/guides/setup.md) | Single-repository and workspace onboarding |
| [Architecture guide](documentation/architecture.md) | Runtime architecture and implementation orientation |

### Runtime and consumer guides

| Document | Purpose |
| --- | --- |
| [RSS usage](instructions/RSS-USAGE-GUIDE.md) | CLI search, traversal, and context workflows |
| [RSS programmatic API](instructions/RSS-PROGRAMMATIC-API.md) | Verified source-checkout export surface |
| [Workspace guides](documentation/guides/README.md) | Workspace initialization and operations |
| [MCP setup](documentation/guides/mcp-setup.md) | Local MCP and watch integration |

### Architecture and governance

| Document | Purpose |
| --- | --- |
| [Canonical ADRs](adrs/) | Architecture source records |
| [Compiler authority](COMPILER-AUTHORITY.md) | Artifact-family ownership boundaries |
| [MATURITY.md](MATURITY.md) | Evidence-backed maturity and limitations |
| [Boundary enforcement](documentation/security/boundary-enforcement.md) | Implemented project-boundary controls |
| [Security policy](SECURITY.md) | Vulnerability reporting, security scope, and trust boundary |

### Contributors

| Document | Purpose |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development, validation, and promotion workflow |
| [Instructions index](instructions/README.md) | RECON/RSS and repository instructions |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing the repository. Keep
canonical architecture sources and generated state in their defined roles,
run the documented validation suite, and use the reviewed
`feature/* → develop → main` promotion path.

## Security

`ste-runtime` is currently designed for local, human-supervised use and is not
presented as a hardened multi-user or hostile-input service.

Please report suspected security vulnerabilities privately. Do not disclose
sensitive vulnerability details through public GitHub issues.

See [SECURITY.md](SECURITY.md) for the reporting process, current trust
boundary, supported-version posture, and vulnerability scope. Technical details
for the implemented filesystem and project-scope controls are documented in
[boundary enforcement](documentation/security/boundary-enforcement.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
