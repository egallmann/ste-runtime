# RECON - Reconciliation Engine

**Authority:** E-ADR-001 (Provisional Execution of RECON for Project-Level Semantic State)  
**Status:** Operational  
**Version:** 1.0.0

---

## What is RECON?

RECON (Reconciliation Engine) is a **portable semantic extraction tool** that generates AI-DOC state from source code. It is designed to be **dropped into any project** and immediately work.

**RECON provides:**
- Multi-language semantic extraction (TypeScript, Python, CloudFormation, JSON, Angular, CSS/SCSS)
- Relationship inference between code elements
- Content-addressable state storage
- Validation and self-healing
- Incremental update capability

**Key insight:** RECON transforms source code into a queryable semantic graph, enabling AI assistants to understand codebases through structured data rather than raw text search.

---

## Portability

RECON is designed to be **dropped into any project** as a self-contained directory:

1. **Copy** the `ste-runtime` folder into your project
2. **Run** `npm install && npm run build` in `ste-runtime/`
3. **Execute** `npm run recon` from within `ste-runtime/`

RECON will:
- **Auto-detect** the parent project root
- **Auto-detect** languages (TypeScript, Python, CloudFormation, JSON, Angular, CSS/SCSS)
- **Scan** the parent project's source directories
- **Generate** AI-DOC state inside `ste-runtime/.ste/state/`

### Self-Contained Design

Everything lives INSIDE `ste-runtime/`:

```
your-project/
├── .gitignore                 # Should contain: ste-runtime/
├── your-source-code/          # RECON analyzes this
└── ste-runtime/               # Drop-in, fully self-contained
    ├── ste.config.json        # Optional config (created locally)
    ├── src/                   # Runtime implementation (modifiable)
    ├── dist/                  # Compiled JavaScript
    ├── .ste/                  # Generated state for PARENT project
    │   └── state/
    │       ├── graph/         # Module, function, class slices
    │       ├── api/           # API endpoint slices
    │       ├── data/          # Data model slices
    │       ├── infrastructure/# CloudFormation resources
    │       ├── frontend/      # Angular components, services
    │       └── validation/    # Validation reports
    ├── .ste-self/             # Generated state for ste-runtime itself
    │   └── state/             # (created by `npm run recon:self`)
    └── python-scripts/        # Python AST parser
```

**Note:** Developers may modify `ste-runtime/src/` as needed. Use `npm run recon:self` to regenerate self-documentation after changes.

**Portability principle:** The entire `ste-runtime/` directory should be gitignored by the parent project. Copy from a clean source, not between projects.

**Easy to add:** Copy `ste-runtime/` into your project, add `ste-runtime/` to `.gitignore`  
**Easy to remove:** Delete `ste-runtime/`

---

## Common Human Prompts → Actions

**For AI Assistants: When a human says these phrases, execute these commands.**

| Human Says | Execute | Working Directory |
|------------|---------|-------------------|
| "run full recon" | `npm run recon:full` | `ste-runtime/` |
| "run recon" | `npm run recon` | `ste-runtime/` |
| "regenerate the semantic graph" | `npm run recon:full` | `ste-runtime/` |
| "update the graph" | `npm run recon` | `ste-runtime/` |
| "refresh AI-DOC" | `npm run recon` | `ste-runtime/` |
| "recon self" | `npm run recon:self` | `ste-runtime/` |
| "initialize recon config" | `npm run recon:init` | `ste-runtime/` |
| "graph stats" | `npm run rss:stats` | `ste-runtime/` |
| "search the graph for X" | `npm run rss -- search "X"` | `ste-runtime/` |

### Execution Pattern

1. **Locate `ste-runtime/`** in the project (search for `ste-runtime` directory)
2. **Navigate** to that directory
3. **Execute** the npm command

```bash
# Navigate to ste-runtime directory first
cd <path-to-ste-runtime>

# Then run the requested command
npm run recon:full
```

**Important:** All RECON and RSS CLI commands must be run from inside `ste-runtime/`.

---

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm
- Python 3.x (for Python extraction)

### Installation

```bash
cd ste-runtime
npm install
npm run build
```

### Execute RECON

**Scan the parent project (auto-detect):**

```bash
cd ste-runtime
npm run recon
```

**Full reconciliation (slower, more thorough):**

```bash
npm run recon:full
```

**Self-documentation mode (scan ste-runtime only):**

```bash
npm run recon:self
```

**Initialize config file:**

```bash
npm run recon:init
```

---

## Configuration

RECON uses **auto-detection by default** — no configuration required. It will:
- Detect the parent project root
- Identify languages from project markers (tsconfig.json, requirements.txt, etc.)
- Scan appropriate source directories

If customization is needed, create `ste.config.json` inside `ste-runtime/`:

```bash
npm run recon:init   # Generates ste.config.json
```

### Example ste.config.json

```json
{
  "languages": ["typescript", "python"],
  "sourceDirs": ["src", "lib"],
  "ignorePatterns": ["**/generated/**", "**/migrations/**"],
  "stateDir": ".ste/state",
  "angularPatterns": {
    "components": "**/src/app/**/*.component.ts",
    "services": "**/src/app/**/*.service.ts",
    "templates": "**/src/app/**/*.component.html"
  },
  "cssPatterns": {
    "styles": "**/src/**/*.{css,scss}",
    "designTokens": "**/styles/**/*.scss"
  }
}
```

**Note:** This example uses generic paths. Adjust to match your project structure.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `languages` | `string[]` | Auto-detect | Languages to extract |
| `sourceDirs` | `string[]` | `["."]` | Directories to scan (relative to project root) |
| `ignorePatterns` | `string[]` | `[]` | Additional glob patterns to ignore |
| `stateDir` | `string` | `".ste/state"` | Where to write AI-DOC state |
| `angularPatterns` | `object` | Auto-detect | Angular file patterns |
| `cssPatterns` | `object` | Auto-detect | CSS/SCSS file patterns |

### Built-in Ignore Patterns

The following patterns are always ignored:
- `**/node_modules/**`
- `**/dist/**`, `**/build/**`
- `**/.git/**`
- `**/.ste/**`
- `**/venv/**`, `**/.venv/**`
- `**/__pycache__/**`
- `**/ste-runtime/**` (RECON doesn't scan itself by default)
- Test files: `**/*.test.ts`, `**/*.spec.ts`, `**/test_*.py`, etc.

---

## What RECON Does

### Execution Flow

1. **Discovery** - Finds source files in configured directories
2. **Extraction** - Parses AST to extract functions, classes, imports, endpoints, models
3. **Inference** - Infers relationships between elements (imports, handlers, data flows)
4. **Normalization** - Maps to AI-DOC schema (graph, api, data, infrastructure, frontend)
5. **Population** - Writes AI-DOC YAML slices to state directory
6. **Validation** - Validates state for consistency
7. **Self-Healing** - Removes orphaned slices, updates checksums

### Supported Languages

| Language | Extraction Method | Elements Extracted |
|----------|------------------|-------------------|
| TypeScript | Native TS Compiler API | Functions, classes, imports, exports |
| Python | External AST parser | Functions, classes, Flask/FastAPI endpoints, Pydantic models |
| CloudFormation | YAML/JSON parser | Templates, resources, parameters, outputs, GSIs |
| JSON | Semantic pattern matching | Schemas, configurations, reference data |
| Angular | TypeScript AST + decorators | Components, services, routes, templates |
| CSS/SCSS | Regex-based parsing | Design tokens, variables, animations, breakpoints |

**Note:** CSS/SCSS extractor is framework-agnostic - works with Angular, React, Vue, or plain HTML.

### Outputs

All outputs are written to `ste-runtime/.ste/state/`:

| Directory | Contents |
|-----------|----------|
| `graph/modules/` | Module-level slices (source files) |
| `graph/functions/` | Function-level slices |
| `graph/classes/` | Class-level slices |
| `api/endpoints/` | REST/GraphQL endpoint definitions |
| `data/entities/` | Database schemas, models |
| `infrastructure/resources/` | CloudFormation resources |
| `infrastructure/templates/` | Template metadata |
| `frontend/component/` | Angular/React components |
| `frontend/service/` | Services and providers |
| `validation/` | Validation reports |

---

## Command Line Options

```
recon [options]

Options:
  --mode=incremental   Incremental reconciliation (default)
  --mode=full          Full reconciliation
  --init               Create ste.config.json in project root
  --self               Self-documentation mode (scan ste-runtime only)
  --help, -h           Show help message
```

---

## Interpreting RECON Output

### Successful Execution

```
[RECON] AI-DOC updates: 850
[RECON] Conflicts detected: 0
[RECON Validation] 3 total (0 errors, 0 warnings, 3 info)
```

**Meaning:** 850 slices were written, no conflicts, validation passed.

### State Changes

```
AI-DOC State Changes:
  Created:   120
  Modified:  45
  Deleted:   8
  Unchanged: 677
  Total:     850
```

**Meaning:** 120 new slices, 45 updated, 8 removed (orphans), 677 unchanged.

---

## When to Run RECON

### Recommended Usage

- Before starting work on a new feature
- After pulling significant changes
- After refactoring modules
- When onboarding to a new codebase
- Before planning architecture changes

### Incremental vs Full

| Mode | Speed | Use Case |
|------|-------|----------|
| Incremental | Fast | After small changes |
| Full | Slower | Initial run, after major refactoring |

```bash
npm run recon          # Incremental (default)
npm run recon:full     # Full reconciliation
```

---

## Files and Directories

| Path | Purpose |
|------|---------|
| `src/` | Runtime implementation (TypeScript) |
| `src/config/` | Configuration loader |
| `src/recon/` | RECON implementation |
| `src/recon/phases/` | Seven-phase pipeline |
| `src/extractors/` | Language-specific extractors |
| `src/rss/` | Graph traversal operations |
| `src/cli/` | CLI entry points |
| `python-scripts/` | Python AST parser |
| `.ste/state/` | Generated semantic state |
| `instructions/` | Usage instructions |

---

## Troubleshooting

### No Files Discovered

**Check:**
- Are source files in a `sourceDirs` directory?
- Are files being excluded by ignore patterns?
- Run with verbose output to see discovery details

### Python Extraction Fails

**Check:**
- Is Python 3.x installed and in PATH?
- Set `PYTHON_BIN` environment variable if needed
- Check `python-scripts/ast_parser.py` is accessible

### TypeScript Compilation Errors

```bash
cd ste-runtime
npm run build
```

Fix any TypeScript errors before running RECON.

---

## Querying Semantic State (RSS)

After running RECON, use RSS (Runtime State Slicing) to query the semantic graph:

```bash
cd ste-runtime

# Get graph overview
node dist/cli/rss-cli.js stats

# Search for components
node dist/cli/rss-cli.js search "authentication"

# Get dependency tree
node dist/cli/rss-cli.js dependencies graph/function/validateToken

# Full impact analysis
node dist/cli/rss-cli.js blast-radius data/entity/UsersTable
```

**See [RSS-USAGE-GUIDE.md](./RSS-USAGE-GUIDE.md) for complete documentation.**

---

## For AI Coding Assistants

RECON and RSS are designed for AI-assisted development. Key workflow:

```bash
# 1. Generate semantic state
npm run recon:full

# 2. Understand the codebase
node dist/cli/rss-cli.js stats

# 3. Search for relevant concepts
node dist/cli/rss-cli.js search "feature you're implementing"

# 4. Get context bundle for a task
node dist/cli/rss-cli.js context "your implementation task"

# 5. Check blast radius before changes
node dist/cli/rss-cli.js blast-radius component/key
```

**Advantage over grep:** RSS returns structured semantic entities with relationships, not raw text matches.

---

## FAQ

### Is RECON destructive?

**No.** RECON only writes to `.ste/state/`. It never modifies source code.

### Can I use RECON on any project?

**Yes.** RECON is designed to be portable. Copy `ste-runtime/` into any project, install dependencies, and run.

### What if I don't have a ste.config.json?

RECON will auto-detect:
- Project root (by locating package.json, pyproject.toml, etc.)
- Languages (by checking for tsconfig.json, requirements.txt, etc.)
- Source directories (defaults to entire project)

**Auto-detection is the default and recommended approach.** Only create config if customization is needed.

### How do I remove RECON?

Delete the `ste-runtime/` directory. That's it — everything is self-contained.

---

## See Also

- [RSS-USAGE-GUIDE.md](./RSS-USAGE-GUIDE.md) - Query the semantic graph
- [recon-incremental.md](./recon-incremental.md) - Incremental mode internals

