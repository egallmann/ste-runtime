# ste-runtime

**Component implementation of the STE Specification** — A portable semantic extraction and graph traversal toolkit implementing RECON and RSS components for AI-assisted development.

**See:** [STE Specification](https://github.com/egallmann/ste-spec) for the complete architecture.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-0.9.0--experimental-orange.svg)](package.json)
[![Status](https://img.shields.io/badge/status-experimental-orange.svg)](MATURITY.md)

---

> **⚠️ EXPERIMENTAL STATUS — NOT PRODUCTION-READY**
>
> ste-runtime is a **research prototype and component implementation** of the STE Specification.
>
> - **NOT production-ready** — Lacks security hardening, operational tooling, and production validation
> - **NOT autonomous** — Requires human-in-loop oversight for all operations (CEM not implemented)
> - **Experimental extractors** — Language extractors at varying maturity levels (see maturity matrix)
>
> **See [MATURITY.md](MATURITY.md) for complete production readiness assessment and component maturity matrix.**
>
> **Appropriate for:** Local development assistance, research, experimentation, forking for custom implementations  
> **Not appropriate for:** Autonomous execution, production deployment, security-sensitive or compliance-regulated environments

---

## What is ste-runtime?

**ste-runtime** is a component implementation of the [System of Thought Engineering (STE) Specification](https://github.com/egallmann/ste-spec). This repository provides a subset of the components defined in the complete STE Runtime architecture.

### Components Implemented

This repository implements:

1. **RECON** (Reconciliation Protocol) — Extracts semantic state from source code into AI-DOC format
2. **RSS** (Runtime State Slicing) — Graph traversal protocol for deterministic context assembly
   - Includes **MVC** (Minimally Viable Context) assembly via `assembleContext` function
   - Basic entry point discovery (`findEntryPoints`) for natural language queries
3. **MCP Server** — Model Context Protocol integration for AI assistant tooling
4. **File Watching** — Incremental RECON triggering on file changes

### Complete STE Runtime Architecture

The complete STE Runtime system (per [STE Architecture Specification](https://github.com/egallmann/ste-spec)) includes additional components not implemented in this repository:

- **AI-DOC Fabric** — Attestation authority and canonical state resolution
- **STE Gateway** — Enforcement service for eligibility verification
- **Trust Registry** — Public key distribution and signature verification
- **CEM** (Cognitive Execution Model) — 9-stage execution lifecycle (deferred per [E-ADR-003](documentation/e-adr/E-ADR-003-CEM-Deferral.md))
- **Task Analysis Protocol** — Full natural language to entry point resolution (basic implementation exists, full protocol not implemented)
- **Validation Stack** — CEM self-validation, static analysis, MCP validators

**See:** [STE Architecture Specification](https://github.com/egallmann/ste-spec/tree/main/ste-spec/architecture) for the complete system architecture.

### What This Repository Provides

ste-runtime transforms codebases into **queryable semantic graphs** that AI assistants can understand. Instead of grep-based text searches, get structured semantic queries with relationship traversal, impact analysis, and context assembly.

**Key insight:** AI assistants work better with structured semantic data than raw text. ste-runtime provides deterministic, queryable representations of your codebase through RECON and RSS components.

**Status:** Experimental research prototype with human-in-loop oversight. See [MATURITY.md](MATURITY.md) for production readiness assessment.

---

## Quick Start

### Installation

```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime
npm install
npm run build
```

### Generate Semantic Graph

```bash
npm run recon:full
```

This analyzes your codebase and generates a semantic graph in `.ste/state/`.

**Try self-documentation:**
```bash
npm run recon:self  # Documents ste-runtime itself
```

This demonstrates RECON's capabilities by analyzing its own TypeScript codebase.

### Query the Graph

```bash
# Overview
npm run rss:stats

# Search
npm run rss -- search "authentication"

# Dependencies
node dist/cli/rss-cli.js dependencies graph/function/validateUser

# Impact analysis
node dist/cli/rss-cli.js blast-radius data/entity/UsersTable
```

---

## Why ste-runtime?

### Traditional Approach (grep/text search)
```bash
$ grep -r "validateUser"
# Returns 47 text matches across files
# No context, no relationships, no semantics
```

### ste-runtime Approach (semantic graph)
```bash
# One-shot: Get complete subgraph for a concept
$ npm run rss -- context "validateUser"
# Returns full subgraph (45 nodes):
#   Entry points: 3 matching functions
#   Dependencies: 12 functions it imports
#   Dependents: 18 functions that call them
#   Related APIs: 7 endpoints
#   Data models: 5 tables/entities
#   Traversal depth: 2 (configurable)

# Or query specific relationships:
$ npm run rss -- search "validateUser"        # Find entry points
$ npm run rss -- dependencies graph/function/validateUser
$ npm run rss -- dependents graph/function/validateUser  
$ npm run rss -- blast-radius graph/function/validateUser
```

**Advantage:** O(1) semantic lookups vs O(n) text scans. Complete subgraph assembly in one query.

---

## Features

### RECON — Semantic Extraction

- **Multi-language support**: TypeScript, Python, Angular, CloudFormation, JSON, CSS/SCSS
- **Auto-detection**: No config required — drop into any project and run
- **Incremental updates**: Fast reconciliation after code changes
- **Self-documenting**: Can analyze itself (`npm run recon:self`)
- **Self-validating**: Schema-level validation and reconciliation (not operational fault tolerance)
- **Content-addressable**: Deterministic, reproducible state

### RSS — Graph Traversal

- **Natural language search**: Find components by description
- **Dependency analysis**: Full import/export graph traversal
- **Blast radius**: Impact analysis before making changes
- **Context assembly**: Bundle relevant nodes for AI tasks
- **Conversational queries**: AI-friendly query interface

### Extractors

| Language | Elements Extracted |
|----------|-------------------|
| **TypeScript** | Functions, classes, imports, exports, types |
| **Python** | Functions, classes, Flask/FastAPI endpoints, Pydantic models |
| **CloudFormation** | Resources, parameters, outputs, GSIs, tables |
| **JSON** | Schemas, configurations, reference data |
| **Angular** | Components, services, routes, templates, modules |
| **CSS/SCSS** | Design tokens, variables, animations, breakpoints |

---

## Architecture

```
Source Code  →  [RECON]  →  .ste/state/  →  [RSS]  →  Query Results
                                ↓
                         Semantic Graph
                         (YAML slices)
```

**Semantic graph structure:**
- `graph/modules/` — Source file metadata
- `graph/functions/` — Function signatures and relationships
- `graph/classes/` — Class definitions
- `api/endpoints/` — REST/GraphQL endpoints
- `data/entities/` — Database schemas and models
- `infrastructure/resources/` — CloudFormation/Terraform resources
- `frontend/component/` — UI components
- `validation/` — Self-validation reports

All state is **content-addressable** and **deterministic** — same source code always produces identical state.

**See:** [Architecture Documentation](documentation/architecture.md) for complete system architecture, component relationships, and design decisions.

---

## Usage

### For Human Developers

```bash
# Full reconciliation (initial run)
npm run recon:full

# Incremental update (after changes)
npm run recon

# Self-documentation (scan ste-runtime itself)
npm run recon:self

# Query the graph - One-Shot Context Assembly (RECOMMENDED)
npm run rss -- context "user authentication"  # Full subgraph in one query

# Or use individual queries
npm run rss:stats                             # Graph statistics
npm run rss -- search "your query"            # Find entry points
node dist/cli/rss-cli.js dependencies graph/function/myFunction
node dist/cli/rss-cli.js dependents graph/function/myFunction
node dist/cli/rss-cli.js blast-radius data/entity/MyTable
```

### Self-Documentation with `recon:self`

ste-runtime can **document itself** using RECON. This is particularly useful when:

- Extending extractors or adding new language support
- Understanding the codebase architecture
- Validating that RECON works on TypeScript codebases (dogfooding)
- Generating AI-readable context about ste-runtime's implementation

```bash
npm run recon:self
```

This generates semantic state in `.ste-self/state/` containing:
- All TypeScript functions, classes, and modules in `src/`
- Import/export relationships within ste-runtime
- Complete dependency graph of the implementation

**Use case:** After forking and modifying extractors, run `recon:self` to document your changes and use RSS to query your custom implementation.

### For AI Assistants (Cursor, Copilot, etc.)

**Use the programmatic TypeScript API, not the CLI:**

```typescript
import { initRssContext, findEntryPoints, assembleContext } from 'ste-runtime';

// Initialize
const ctx = await initRssContext('.ste/state');

// ONE-SHOT: Get complete subgraph from natural language (RECOMMENDED)
const { entryPoints, searchTerms } = findEntryPoints(ctx, 'user authentication');
const context = assembleContext(ctx, entryPoints, {
  maxDepth: 2,
  maxNodes: 100
});

// context.nodes contains full subgraph (entry points + all connected nodes)
// context.summary has counts by domain, total nodes, etc.

// OR: Use individual operations for specific queries
import { search, dependencies, dependents, blastRadius } from 'ste-runtime';

const results = search(ctx, 'validateUser');
const deps = dependencies(ctx, results.nodes[0].key);
const callers = dependents(ctx, results.nodes[0].key);
const impact = blastRadius(ctx, 'data/entity/UsersTable');
```

**All outputs are advisory and must be reviewed by a human before use.**

**See [instructions/RSS-PROGRAMMATIC-API.md](instructions/RSS-PROGRAMMATIC-API.md) for full API documentation.**

---

## Documentation

### Architecture
- [System Architecture](documentation/architecture.md) - Complete technical architecture of ste-runtime
- [Architecture Diagrams](documentation/diagrams/) - Visual architecture documentation

### Getting Started
- [Getting Started Tutorial](documentation/guides/getting-started.md) - Step-by-step guide for new users
- [Configuration Reference](documentation/guides/configuration-reference.md) - Complete `ste.config.json` reference
- [FAQ](documentation/guides/faq.md) - Frequently asked questions
- [Glossary](documentation/guides/glossary.md) - Terminology and definitions

### User Guides
- [MCP Setup Guide](documentation/guides/mcp-setup.md) - Set up ste-runtime with Cursor IDE
- [Pre-Commit Hook Setup](documentation/guides/pre-commit-hook-setup.md) - Code quality enforcement
- [Dual-Repo Workflow](documentation/guides/dual-repo-workflow.md) - Managing ste-runtime in projects
- [Troubleshooting Guide](documentation/guides/troubleshooting.md) - Common issues and solutions

### Instructions
| Document | Purpose | Audience |
|----------|---------|----------|
| [instructions/RECON-README.md](instructions/RECON-README.md) | RECON installation & configuration | Developers, AI agents |
| [instructions/RSS-USAGE-GUIDE.md](instructions/RSS-USAGE-GUIDE.md) | RSS CLI usage guide | Human developers |
| [instructions/RSS-PROGRAMMATIC-API.md](instructions/RSS-PROGRAMMATIC-API.md) | RSS TypeScript API | AI assistants, developers |
| [instructions/recon-incremental.md](instructions/recon-incremental.md) | Incremental mode internals | Contributors |

### Architecture & Design
- [System Architecture](documentation/architecture.md) - Complete technical architecture of ste-runtime
- [E-ADRs](documentation/e-adr/) - Architectural decision records
- [Architecture Diagrams](documentation/diagrams/) - Visual architecture documentation
- [Reference Documentation](documentation/reference/) - Technical deep-dives

### Contributing
- [Contributing Guide](CONTRIBUTING.md) - Development standards and future contribution process
  - **Note:** External contributions are not currently being accepted. This guide is for future reference.
- [Extractor Development Guide](documentation/e-adr/E-ADR-008-Extractor-Development-Guide.md) - Create custom extractors

---

## Example: AI-Assisted Development Workflow

```bash
# 1. Generate semantic state
npm run recon:full

# 2. AI retrieves complete subgraph for the task (ONE QUERY)
npm run rss -- context "add rate limiting to auth endpoints"
# Returns: All auth endpoints, their handlers, dependencies, data models, etc.

# 3. (Optional) AI digs deeper on specific nodes
npm run rss -- blast-radius api/endpoint/POST-login
npm run rss -- dependencies graph/function/validateToken

# 4. After implementation, update the graph
npm run recon

# 5. Verify the changes
npm run rss -- context "rate limiting middleware"
# See the new nodes and relationships
```

**Result:** AI gets complete context in one query instead of grep/text search or nested API calls.

---

## Configuration

**RECON auto-detects everything by default** — no configuration required.

If customization is needed, create `ste.config.json`:

```bash
npm run recon:init
```

Example configuration:

```json
{
  "languages": ["typescript", "python"],
  "sourceDirs": ["src", "lib"],
  "ignorePatterns": ["**/generated/**", "**/migrations/**"],
  "stateDir": ".ste/state"
}
```

**See [instructions/RECON-README.md](instructions/RECON-README.md) for full configuration options.**

---

## Portability

ste-runtime is **designed to be dropped into any project** for local development and experimentation:

1. Copy `ste-runtime/` into your project
2. Run `npm install && npm run build`
3. Run `npm run recon`

RECON will:
- Auto-detect the parent project root
- Auto-detect languages and source directories
- Scan and extract semantic state
- Generate `.ste/state/` inside `ste-runtime/`

**To remove:** Delete the `ste-runtime/` directory. That's it.

**⚠️ Important:** This portability is for **local development and experimentation only**. Not for production deployment. See [MATURITY.md](MATURITY.md) for production readiness assessment.

---

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

**Test coverage:** 18 test suites covering extractors, RECON validation, RSS operations, and CLI interfaces.

---

## Project Structure

```
ste-runtime/
├── src/
│   ├── extractors/         # Language-specific extractors
│   ├── recon/              # RECON reconciliation engine
│   ├── rss/                # RSS graph traversal
│   ├── cli/                # CLI entry points
│   ├── watch/              # File watcher & change detection
│   └── config/             # Configuration loader
├── python-scripts/         # Python AST parser
├── instructions/           # Usage guides
├── documentation/          # E-ADRs and reference materials
├── fixtures/               # Test fixtures
├── .ste/                   # Example: Semantic state for parent project
├── .ste-self/              # Self-documentation (npm run recon:self)
└── ste-spec/               # Git submodule: STE specification
```

**Note:** `.ste-self/` contains ste-runtime's own semantic graph, generated by running RECON on itself. This serves as both a reference implementation and a working example of AI-DOC structure.

---

## System of Thought Engineering (STE) Specification

ste-runtime implements **components** of the [System of Thought Engineering (STE) Specification](https://github.com/egallmann/ste-spec), specifically the RECON and RSS components for semantic extraction and graph traversal.

The complete STE architecture includes additional runtime services not implemented in this repository:
- **AI-DOC Fabric** — Attestation authority and canonical state resolution
- **STE Gateway** — Enforcement service for eligibility verification  
- **Trust Registry** — Public key distribution and signature verification
- **Task Analysis** — Natural language to entry point resolution

**See:** [STE Architecture Specification](https://github.com/egallmann/ste-spec/tree/main/ste-spec/architecture) for the complete system architecture.

The full specification is available via git submodule: [spec/ste-spec](spec/ste-spec/)

**Key architectural concepts:**
- **AI-DOC**: 13-domain documentation structure
- **RECON**: Reconciliation engine for semantic extraction
- **Divergence Taxonomy**: Classification of documentation-state drift
- **Invariants**: Constraints that bound system behavior
- **Validation Protocols**: Multi-phase validation pipeline

**See [ste-spec/ste-spec/README.md](ste-spec/ste-spec/README.md) for the full specification.**

---

## Related Repositories

- **[ste-spec](https://github.com/egallmann/ste-spec)** — Semantic Truth Engine specification (architectural documentation)

---

## Roadmap

**Current (v0.x experimental):**
- ✅ Multi-language semantic extraction (TypeScript, Python, Angular, CFN, JSON, CSS)
- ✅ RSS graph traversal with natural language search
- ✅ RECON 6-phase pipeline with schema-level validation and reconciliation (not operational fault tolerance)
- ✅ Content-addressable deterministic state
- ✅ CLI and programmatic TypeScript API
- ✅ One-shot context assembly (`context` command)

**Known Limitations:**
- ⚠️ TypeScript extractor does not capture JSDoc comments (search by name works, search by purpose limited)
- ⚠️ RSS search works on function names and paths, not inline documentation text
- See `documentation/issues/ISSUE-001-typescript-extractor-missing-jsdoc.md` for details

**In Progress:**
- JSDoc extraction for TypeScript (description, params, returns, examples)
- Enhanced semantic search with documentation matching
- Cross-language documentation standardization

**Planned:**
- Additional language extractors (Java, Go, Rust, C#)
- GraphQL API surface extraction
- Terraform/Pulumi infrastructure analysis
- React/Vue component extraction
- Real-time watch mode with live graph updates
- LLM-powered semantic enrichment

---

## Extending & Contributing

### Forking & Customization Encouraged

ste-runtime is **designed to be forked and extended**. Expected use cases:

- **Add new language extractors** (Java, Go, Rust, C#, etc.)
- **Enhance existing extractors** (deeper semantic analysis, additional patterns)
- **Custom RSS queries** (domain-specific graph traversals)
- **Project-specific workflows** (custom validation, reporting, integrations)

**The architecture is modular** — extractors, validators, and RSS operations can be added or modified independently.

**⚠️ Production Use Warning:** If forking for production use, understand that extensive additional work is required. See [MATURITY.md](MATURITY.md) for complete production readiness requirements.

### How to Extend

1. **Fork the repository**
2. **Add your extractor** in `src/extractors/your-language/`
3. **Implement the `BaseExtractor` interface**
4. **Add tests** in `src/extractors/your-language/*.test.ts`
5. **Run `npm run recon:self`** to document your changes
6. **Use RSS** to query and validate your implementation

See [documentation/e-adr/E-ADR-008-Extractor-Development-Guide.md](documentation/e-adr/E-ADR-008-Extractor-Development-Guide.md) for detailed guidance.

### Contributions to Main Repository

**ste-runtime is currently in active development and not accepting external contributions at this time.**

This repository documents a stable implementation that converges with the [STE Specification](https://github.com/egallmann/ste-spec). The codebase is still evolving, and significant changes are planned.

**Project Status:** Experimental research prototype. See [MATURITY.md](MATURITY.md) for maturity assessment and production readiness.

**However:**
- **Issues welcome** — Bug reports, feature requests, and questions are appreciated
- **Forking encouraged** — Feel free to fork and extend for your own use cases
- **Discussions encouraged** — Share your fork, showcase extensions, discuss architectural ideas
- **Forks showcased** — If you build something interesting, open an issue to share it

### Why Fork vs PR?

ste-runtime is designed for **divergent evolution** — different projects have different needs. Rather than maintaining a monolithic "one size fits all" implementation:

- **Fork freely** — Customize for your specific use case
- **Share learnings** — Discuss approaches, patterns, architectural insights
- **Evolve independently** — Your fork can diverge significantly from upstream

If a feature becomes widely adopted across forks, it may be considered for inclusion in the main repository.

---

## License

Copyright 2026-present Erik Gallmann

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

See [LICENSE](LICENSE) file for full text.

---

## Acknowledgments

Built on the shoulders of:
- **TypeScript Compiler API** — AST parsing
- **Python AST** — Python semantic extraction
- **Chokidar** — File watching
- **js-yaml** — YAML serialization
- **Vitest** — Testing framework
- **Zod** — Schema validation

---

**Questions?** See [instructions/README.md](instructions/README.md) for detailed guides.

