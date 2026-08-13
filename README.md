# ste-runtime

`ste-runtime` is the runtime implementation layer of System of Thought
Engineering (STE). It extracts implementation state, builds queryable
semantic and workspace graphs, assembles bounded task context, and emits
runtime architecture evidence.

This repository is a public experimental/reference implementation. The
runtime is intended for supervised, human-in-the-loop use and has meaningful
workspace-oriented functionality, but it is not an autonomous execution
system or a production-supported public package.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## Status and release boundary

- Source and architecture records are public under the repository license.
- `package.json` is the package metadata authority and currently keeps the
  package `private: true`; it is not published to npm.
- Source exports can be used for local experiments and integration, but there
  is no production API compatibility or support commitment yet.
- Execution assumes human supervision. Repository history records supervised
  workspace use; that does not create a public distribution or support promise.
- See [MATURITY.md](MATURITY.md) and
  [ADR-L-0024](adrs/adr-projection/logical/ADR-L-0024-public-source-release-and-production-publication-boundary.md)
  for the current boundary.

## What it does

- **RECON** extracts source and ADR implementation state into AI-DOC semantic
  state for a single repository or a configured multi-repository workspace.
- **RSS (Runtime State Slicing)** searches and traverses that state to produce
  bounded context, dependencies, dependents, blast radius, and task entry
  points.
- **Workspace graphs** resolve repository-level dependencies, integrations,
  blast radius, source locators, and multi-resolution projections.
- **MCP/watch** provides local MCP integration and optional incremental graph
  refresh for supported editor workflows.
- **Architecture evidence** combines canonical ADR inputs with runtime state to
  emit factual evidence for downstream consumers. ste-runtime does not make
  admission decisions.

## Where it fits in STE

| Concern | Authority |
| --- | --- |
| ADR authoring, schema validation, and human authoring workflows | `adr-architecture-kit` |
| Shared public contracts and cross-repository schemas | `ste-spec` |
| Runtime extraction, runtime graphs, runtime evidence, and runtime-owned machine artifacts | `ste-runtime` |
| Admission decisions and lifecycle enforcement | `ste-kernel` |
| Advisory and custom governance rules | `ste-rules-library` |

The distinction is artifact-specific. ADR Kit owns authoring-side ADR
validation and projections. ste-runtime consumes canonical ADR YAML and source
code to produce the runtime-owned registries, indexes, graphs, and evidence
established by this repository. Shared contracts remain owned by `ste-spec`,
and admission remains owned by `ste-kernel`.

See [COMPILER-AUTHORITY.md](COMPILER-AUTHORITY.md) for the detailed boundary.

## Quick start from a source checkout

Requirements: Node.js 18 or later, npm, and Python 3 when working with Python
extractors.

```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime
npm ci
npm run build
npm run recon:self
npm run rss:stats
npm run rss -- search "authentication"
```

For an existing project or workspace, use the setup command after building:

```bash
node dist/cli/index.js setup --project-root /absolute/path/to/project \
  --ste-runtime-path /absolute/path/to/ste-runtime --dry-run
```

Review the dry run, then repeat without `--dry-run` when ready. The
[setup guide](documentation/guides/setup.md) covers single-repository and
multi-repository onboarding. There is no supported `npm install ste-runtime`
installation path while the package remains private and unpublished.

## Common workflows

### RECON

```bash
npm run recon:full
node dist/cli/recon-cli.js --workspace /absolute/path/to/workspace
npm run recon:self
```

RECON writes derived state under the configured `.ste/` or workspace output
directories. Treat that state as generated output, not architecture authority.

### RSS

```bash
npm run rss -- stats
npm run rss -- search "authentication"
npm run rss -- context "trace the authentication flow"
```

The [RSS CLI guide](instructions/RSS-USAGE-GUIDE.md) describes the available
query forms.

### Workspace graph

```bash
node dist/cli/index.js ws deps --workspace /absolute/path/to/.workspace-graph
node dist/cli/index.js ws integration --workspace /absolute/path/to/.workspace-graph
node dist/cli/index.js ws blast /service/example --workspace /absolute/path/to/.workspace-graph
```

Use `node dist/cli/index.js ws --help` for the current workspace query surface.

### Architecture compilation and evidence

```bash
node dist/cli/index.js architecture compile --project-root . --dry-run
node dist/cli/index.js evidence architecture --project-root .
```

Compilation consumes canonical ADR YAML and source inputs. It may produce
runtime-owned registries and indexes when run without `--dry-run`; do not hand-
edit those outputs.

### MCP and watch

```bash
node dist/cli/index.js watch --project-root /absolute/path/to/project --no-watch
```

The watch command starts the local MCP server; file watching can be enabled by
configuration. See the [MCP setup guide](documentation/guides/mcp-setup.md)
before connecting an editor.

## Programmatic use

The built source checkout exposes the current implementation exports from
`dist/index.js`:

```js
import { initRssContext, search, blastRadius } from './dist/index.js';

const ctx = await initRssContext('.ste/state');
const matches = search(ctx, 'authentication');
const impact = matches.nodes[0]
  ? blastRadius(ctx, matches.nodes[0].key)
  : { nodes: [] };

console.log({ matches: matches.nodes.length, impact: impact.nodes.length });
```

This is source-checkout documentation for the current exports, not an npm
package compatibility guarantee. See
[RSS-PROGRAMMATIC-API.md](instructions/RSS-PROGRAMMATIC-API.md) for the
verified RSS surface and its limitations.

## Architecture records and generated views

- Canonical ADR source records live under [`adrs/`](adrs/), currently using
  ADR Kit schema v1.3.
- Generated human-readable ADR projections live under
  [`adrs/adr-projection/`](adrs/adr-projection/).
- [`SYSTEM-OVERVIEW.md`](SYSTEM-OVERVIEW.md), `adrs/manifest.yaml`, and
  runtime registries are generated orientation or machine artifacts.
- Do not hand-edit generated projections, manifests, registries, or system
  overviews. Change canonical sources and regenerate through the owning tool.

For deeper technical architecture, see
[documentation/architecture.md](documentation/architecture.md).

## Maturity and limitations

The implementation is useful for supervised extraction, graph traversal,
workspace analysis, MCP experimentation, and runtime evidence workflows. It
does not currently promise autonomous execution, multi-user service
operation, hostile-input hardening, broad scale guarantees, or stable package
compatibility. Extractor behavior and validation depth vary by language and
feature area, and invariant-based validation over CEM outputs remains
unfinished.

See [MATURITY.md](MATURITY.md) for the evidence-backed posture and
[documentation/security/boundary-enforcement.md](documentation/security/boundary-enforcement.md)
for the implemented project-boundary controls.

## Documentation map

- [MATURITY.md](MATURITY.md) - current posture, evidence, and limitations
- [CONTRIBUTING.md](CONTRIBUTING.md) - local development and promotion workflow
- [COMPILER-AUTHORITY.md](COMPILER-AUTHORITY.md) - runtime artifact authority
- [SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md) - generated repository orientation
- [Architecture guide](documentation/architecture.md) - technical design
- [Guides index](documentation/guides/README.md) - operational guides
- [Instructions index](instructions/README.md) - RECON/RSS instructions
- [ADR directory](adrs/) - canonical architecture records

## License

Apache License 2.0. See [LICENSE](LICENSE).
