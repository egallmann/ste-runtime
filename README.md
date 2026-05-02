# ste-runtime

`ste-runtime` is the runtime evidence and semantic extraction repository in the STE workspace.

It provides:
- RECON semantic extraction over source code
- RSS graph traversal and context assembly
- a local MCP server and CLI surfaces for developer workflows
- runtime-owned machine artifacts such as architecture bundle outputs
- factual `ArchitectureEvidence` payloads consumed by `ste-kernel`

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

### RECON

RECON extracts semantic state from a codebase into `.ste/state/`.

Examples of extracted material include:
- modules
- functions
- classes
- API endpoints
- data entities
- infrastructure resources
- validation artifacts

### RSS

RSS traverses the generated graph so humans and agents can ask for:
- search results
- dependency paths
- dependents
- blast radius
- assembled context for a task

### Runtime Evidence

`ste-runtime` also loads architecture bundle artifacts and emits factual `ArchitectureEvidence` JSON that `ste-kernel` can consume.

That evidence reports things like:
- bundle health
- freshness
- subject linkage

It does not report admission eligibility or final governance decisions.

## Quick Start

### Install

```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime
npm install
npm run build
```

### Generate semantic state

```bash
npm run recon:full
```

This generates `.ste/state/` for the current project.

### Document ste-runtime itself

```bash
npm run recon:self
```

This generates `.ste-self/state/` for the repository itself.

### Query the graph

```bash
npm run rss:stats
npm run rss -- search "authentication"
node dist/cli/rss-cli.js dependencies graph/function/validateUser
node dist/cli/rss-cli.js blast-radius data/entity/UsersTable
```

### Emit runtime evidence

```bash
node dist/cli/index.js evidence architecture --project-root .
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
