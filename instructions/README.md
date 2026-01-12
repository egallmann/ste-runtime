# STE Runtime Instructions

**Semantic Truth Engine** - A portable semantic extraction and graph traversal toolkit for AI-assisted development.

---

## Instructions Index

| Document | Purpose | Audience |
|----------|---------|----------|
| [RECON-README.md](./RECON-README.md) | Install, configure, and run RECON | Developers, AI agents |
| [RSS-USAGE-GUIDE.md](./RSS-USAGE-GUIDE.md) | Query the semantic graph (CLI) | Human developers |
| [RSS-PROGRAMMATIC-API.md](./RSS-PROGRAMMATIC-API.md) | Query the semantic graph (TypeScript API) | AI assistants, machines |
| [recon-incremental.md](./recon-incremental.md) | Incremental mode internals | Contributors |

---

## For AI Coding Assistants (Cursor, Copilot, etc.)

**Use the programmatic API, not the CLI.**

The CLI (`rss-cli.js`) is designed for human developers at the terminal. AI assistants should import the TypeScript API directly:

```typescript
import { initRssContext, search, blastRadius } from 'ste-runtime';

const ctx = await initRssContext('.ste/state');
const results = search(ctx, 'user authentication');
const impact = blastRadius(ctx, results.nodes[0].key);
```

**See [RSS-PROGRAMMATIC-API.md](./RSS-PROGRAMMATIC-API.md) for full documentation.**

---

## Common Human Prompts → Actions

**For AI Assistants: When a human says these phrases, execute these commands.**

| Human Says | Execute | Working Directory |
|------------|---------|-------------------|
| "run full recon" | `npm run recon:full` | `ste-runtime/` |
| "run recon" | `npm run recon` | `ste-runtime/` |
| "regenerate the semantic graph" | `npm run recon:full` | `ste-runtime/` |
| "update the graph" | `npm run recon` | `ste-runtime/` |
| "graph stats" | `npm run rss:stats` | `ste-runtime/` |
| "search the graph for X" | Use programmatic API (see below) | N/A |

**Execution:** Locate `ste-runtime/` in the project, navigate there, then run the command.

---

## Quick Start

### 1. Install

```bash
cd ste-runtime
npm install
npm run build
```

### 2. Generate Semantic State

```bash
npm run recon:full
```

### 3. Query the Graph

```bash
node dist/cli/rss-cli.js stats
node dist/cli/rss-cli.js search "user authentication"
node dist/cli/rss-cli.js blast-radius graph/module/src-auth-service.ts
```

---

## What is STE Runtime?

STE Runtime provides two core capabilities:

### RECON - Semantic Extraction

Analyzes source code and generates a **semantic graph** containing:

- **Modules** - Source files with exports, imports, relationships
- **Functions** - Signatures, parameters, return types
- **Classes** - Definitions, methods, inheritance
- **API Endpoints** - REST/GraphQL routes and handlers
- **Data Entities** - Database schemas, models
- **Infrastructure** - CloudFormation/Terraform resources
- **Frontend Components** - Angular/React components, services
- **Design Tokens** - CSS variables, breakpoints, animations

### RSS - Graph Traversal

Queries the semantic graph with:

- **Search** - Natural language discovery
- **Lookup** - Direct node retrieval
- **Dependencies/Dependents** - Relationship traversal
- **Blast Radius** - Impact analysis
- **Context Assembly** - Bundle relevant nodes for a task

---

## Supported Languages

| Language | Elements Extracted |
|----------|-------------------|
| TypeScript | Functions, classes, imports, exports |
| Python | Functions, classes, Flask/FastAPI endpoints, Pydantic models |
| CloudFormation | Templates, resources, parameters, outputs |
| JSON | Schemas, configurations, reference data |
| Angular | Components, services, routes, templates |
| CSS/SCSS | Design tokens, variables, animations |

---

## For AI Coding Assistants

STE Runtime is designed for AI-assisted development. Key workflow:

```bash
# 1. Understand the codebase
node dist/cli/rss-cli.js stats

# 2. Find relevant components
node dist/cli/rss-cli.js search "feature you need"

# 3. Get full context for implementation
node dist/cli/rss-cli.js context "your task description"

# 4. Check impact before changes
node dist/cli/rss-cli.js blast-radius component/key
```

**Advantage over grep:** RSS returns structured semantic entities with relationships, not raw text matches. O(1) lookups instead of O(n) scans.

---

## Architecture

```
Source Code → [RECON] → .ste/state/ → [RSS] → Query Results
                           ↓
                    Semantic Graph
                    (YAML slices)
```

All state is stored in `.ste/state/` as content-addressable YAML files.

---

## License

See repository root for license information.

