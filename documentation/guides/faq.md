# Frequently Asked Questions (FAQ)

Common questions about ste-runtime.

---

## General Questions

### What is ste-runtime?

ste-runtime is a **component implementation** of the [System of Thought Engineering (STE) Specification](https://github.com/egallmann/ste-spec). This repository provides a subset of the components defined in the complete STE Runtime architecture.

**Components implemented in this repository:**

1. **RECON** (Reconciliation Protocol) - Extracts semantic state from source code into AI-DOC format
2. **RSS** (Runtime State Slicing) - Graph traversal protocol for deterministic context assembly
   - Includes **MVC** (Minimally Viable Context) assembly via `assembleContext` function
   - Basic entry point discovery (`findEntryPoints`) for natural language queries
3. **MCP Server** - Model Context Protocol integration for AI assistant tooling
4. **File Watching** - Incremental RECON triggering on file changes

**Complete STE Runtime Architecture:**

The complete STE Runtime system (per [STE Architecture Specification](https://github.com/egallmann/ste-spec)) includes additional components not implemented in this repository:
- AI-DOC Fabric (attestation authority)
- STE Gateway (enforcement service)
- Trust Registry (verification service)
- **CEM** (Cognitive Execution Model) - 9-stage execution lifecycle (deferred per [E-ADR-003](../e-adr/E-ADR-003-CEM-Deferral.md))
- Task Analysis Protocol (full protocol not implemented; basic entry point discovery exists)
- Validation Stack (CEM validation, static analysis)

**See also:** [README.md](../../README.md) and [STE Specification](https://github.com/egallmann/ste-spec)

---

### Why use ste-runtime instead of grep/text search?

**Traditional approach (grep):**
- Returns raw text matches
- No context or relationships
- O(n) linear scans
- No semantic understanding

**ste-runtime approach:**
- Returns structured semantic entities
- Full relationship graph
- O(1) semantic lookups
- Complete subgraph assembly in one query

**Example:**
```bash
# Grep: 47 text matches, no context
grep -r "validateUser"

# ste-runtime: Complete subgraph (45 nodes) with relationships
ste rss context "validateUser"
```

---

### Is ste-runtime production-ready?

**Status:** Yes, production-ready for core use cases.

- ✅ Core features implemented and tested
- ✅ Multi-language support (TypeScript, Python, CloudFormation, JSON, Angular, CSS)
- ✅ MCP server integration
- ✅ File watching (optional)
- ✅ Comprehensive test coverage

**See:** [Implementation Status](../plan/e-adr-implementation-status.md)

---

### What languages are supported?

**Currently supported:**
- TypeScript/JavaScript
- Python
- CloudFormation
- JSON (configurable patterns)
- Angular (components, services, templates)
- CSS/SCSS (design tokens, styles)

**See:** [Extractor Development Guide](../e-adr/E-ADR-008-Extractor-Development-Guide.md) for adding new languages.

---

## Installation & Setup

### Do I need to configure anything?

**No configuration required** - ste-runtime works zero-configuration by default.

It auto-detects:
- Project structure
- Languages used
- Source directories
- File patterns

**Optional:** Create `ste.config.json` for customization.

**See:** [Configuration Reference](./configuration-reference.md)

---

### How do I install ste-runtime?

**Option 1: Clone repository**
```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime
npm install
npm run build
```

**Option 2: Global install**
```bash
cd ste-runtime
npm install -g .
```

**See:** [README.md](../../README.md) for full installation instructions.

---

### Where does ste-runtime store state?

**Default location:** `.ste/state/` in your project root

**Contains:**
- `graph/` - Semantic graph slices (YAML files)
- `validation/` - Validation reports
- `graph-metrics.json` - Graph topology analysis

**Note:** Add `.ste/` to `.gitignore` (generated content).

---

## RECON Questions

### What is RECON?

**RECON** (Reconciliation Engine) extracts semantic state from source code.

**Process:**
1. Discovers source files
2. Extracts semantic assertions
3. Infers relationships
4. Normalizes into AI-DOC slices
5. Writes to `.ste/state/`

**See:** [RECON README](../../instructions/RECON-README.md)

---

### How long does RECON take?

**Typical performance:**
- **256 files (864 slices):** ~9 seconds
- **49 files (TypeScript only):** ~2 seconds
- **Incremental:** ~200ms-2s (depends on files changed)

**See:** [Performance Benchmarks](../reference/performance-benchmarks.md)

---

### When should I run RECON?

**Run RECON:**
- Before starting new features
- After pulling significant changes
- After refactoring modules
- When onboarding to a codebase
- Before planning architecture changes

**With watchdog enabled:** RECON runs automatically on file changes.

---

### What's the difference between incremental and full RECON?

**Incremental RECON:**
- Processes only changed files
- Fast (200ms-2s)
- Use for regular updates

**Full RECON:**
- Processes all files
- Slower (1-10s depending on size)
- Use for initial run or after major refactoring

```bash
ste recon          # Incremental (default)
ste recon --mode=full  # Full reconciliation
```

---

### Why are slices content-addressable (hashed filenames)?

**Benefits:**
- **Deterministic** - Same source → same filename
- **No collisions** - Long component names don't break filesystem
- **Performance** - 11-23% faster than descriptive names
- **Debugging** - Use RSS queries, not filenames

**See:** [Content-Addressable Naming](../reference/content-addressable-naming.md)

---

## RSS Questions

### What is RSS?

**RSS** (Runtime State Slicing) queries the semantic graph. RSS is a graph traversal protocol for deterministic context assembly.

**Operations:**
- `search` - Find components by query
- `dependencies` - What does this depend on?
- `dependents` - What depends on this?
- `blast-radius` - Full impact analysis
- `context` - Assemble complete subgraph

**See:** [RSS Usage Guide](../../instructions/RSS-USAGE-GUIDE.md)

---

### How fast are RSS queries?

**Performance:**
- **Structural queries:** <100ms (in-memory)
- **Context assembly:** 100-500ms (loads source files)
- **Graph stats:** <10ms (cached)

**See:** [Performance Benchmarks](../reference/performance-benchmarks.md)

---

### What's the difference between Layer 1 and Layer 2 queries?

**Layer 1 (Structural):**
- Fast (<100ms)
- Returns metadata only (keys, relationships)
- No source code
- Use for: Entry point discovery, graph traversal

**Layer 2 (Context Assembly):**
- Slower (100-500ms)
- Returns metadata + source code
- Loads files from filesystem
- Use for: LLM reasoning, implementation context

**See:** [Two-Layer Context Assembly](../innovations/Two-Layer-Context-Assembly.md)

---

### Why does blast-radius return empty results?

**Possible causes:**
1. Component has no relationships
2. Graph edges not created (extractor issue)
3. Invalid component key

**Solutions:**
```bash
# Verify component exists
ste rss lookup graph/function/myFunction

# Check dependencies
ste rss dependencies graph/function/myFunction

# Run RECON to update graph
ste recon
```

---

## MCP Server Questions

### What is the MCP server?

**MCP** (Model Context Protocol) server exposes ste-runtime tools to Cursor IDE.

**Features:**
- 8 tools available
- Auto-discovery in Cursor
- File watching (optional)
- Always-fresh semantic state

**See:** [MCP Setup Guide](./mcp-setup.md)

---

### How do I set up MCP in Cursor?

1. **Install ste-runtime globally:**
   ```bash
   npm install -g .
   ```

2. **Configure Cursor:**
   Edit `~/.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "ste-runtime": {
         "command": "ste",
         "args": ["watch", "--mcp"],
         "cwd": "${workspaceFolder}"
       }
     }
   }
   ```

3. **Restart Cursor**

**See:** [MCP Setup Guide](./mcp-setup.md) for detailed instructions.

---

### Why aren't tools appearing in Cursor?

**Common causes:**
1. Cursor not restarted (fully quit application)
2. MCP configuration error
3. `ste` not in PATH
4. State directory missing

**Solutions:**
- See [MCP Setup Troubleshooting](./mcp-setup.md#troubleshooting)
- See [General Troubleshooting](./troubleshooting.md#mcp-server-issues)

---

## Watchdog Questions

### What is Watchdog?

**Watchdog** monitors file changes and automatically triggers incremental RECON.

**Features:**
- File watching (chokidar)
- Debouncing (500ms manual, 2s AI edits)
- Transaction detection (batches multi-file edits)
- Syntax validation

**See:** [E-ADR-007](../e-adr/E-ADR-007-Watchdog-Authoritative-Mode.md)

---

### Should I enable Watchdog?

**Enable if:**
- You want automatic graph updates
- You're using MCP server
- You make frequent code changes

**Disable if:**
- You prefer manual RECON
- You have performance concerns
- You're on a slow system

**Default:** Disabled (opt-in)

---

### Why is Watchdog triggering too many RECON runs?

**Causes:**
- Debounce too short
- AI edit detection not working
- Transaction detection disabled

**Solutions:**
```json
{
  "watchdog": {
    "debounceMs": 1000,
    "aiEditDebounceMs": 3000,
    "transactionDetection": true
  }
}
```

---

## Configuration Questions

### Do I need ste.config.json?

**No** - ste-runtime works zero-configuration by default.

**Auto-generation:**
- `ste.config.json` is automatically generated on initialization
- You can modify it afterwards to customize behavior

**When to customize:**
- You want to customize behavior
- You need specific file patterns
- You want to enable watchdog
- You have non-standard project structure

**See:** [Configuration Reference](./configuration-reference.md)

---

### How do I configure which files to extract?

**Option 1: Source directories**
```json
{
  "sourceDirs": ["src", "lib"]
}
```

**Option 2: Ignore patterns**
```json
{
  "ignorePatterns": ["**/test/**", "**/spec/**"]
}
```

**See:** [Configuration Reference](./configuration-reference.md)

---

### How do I configure JSON extraction?

**Configure patterns:**
```json
{
  "jsonPatterns": {
    "controls": "**/controls/**/*.json",
    "schemas": "**/schemas/**/*.json",
    "parameters": "**/parameters/**/*.json"
  }
}
```

**See:** [E-ADR-005](../e-adr/E-ADR-005-JSON-Data-Extraction.md)

---

## Extractor Questions

### How do I add support for a new language?

1. **Study existing extractors:**
   - See [Extractor Development Guide](../e-adr/E-ADR-008-Extractor-Development-Guide.md)

2. **Create extractor:**
   - Implement extraction logic
   - Emit semantic assertions
   - Handle errors gracefully

3. **Add validation tests:**
   - See [Extractor Validation Quickstart](./extractor-validation-quickstart.md)

4. **Register extractor:**
   - Update discovery logic
   - Add to `SupportedLanguage` enum

**See:** [Contributing Guide](../../CONTRIBUTING.md#extractor-development)

---

### Why aren't graph edges being created?

**Causes:**
1. Extractor not emitting relationship assertions
2. Inference phase not processing relationships
3. Validation tests failing

**Solutions:**
1. Run extractor validation tests
2. Check [Inference Phase Enhancements](../implementation/inference-phase-enhancements.md)
3. Verify extractor emits `elementType: 'import'` or `'dependency'`

**See:** [Extractor Validation Status](../implementation/extractor-validation-status.md)

---

## Performance Questions

### RECON is slow. How can I speed it up?

**Optimizations:**
1. Use incremental mode (default)
2. Reduce source directories
3. Add ignore patterns
4. Disable watchdog if not needed

**See:** [Troubleshooting Guide](./troubleshooting.md#performance-issues)

---

### RSS queries are slow. What can I do?

**Optimizations:**
1. Reduce `rss.maxResults` in config
2. Reduce `rss.defaultDepth`
3. Use more specific queries
4. Check graph size (`ste rss stats`)

**See:** [Troubleshooting Guide](./troubleshooting.md#performance-issues)

---

## State & Data Questions

### What is AI-DOC state?

**AI-DOC** (AI-Documentation) is the semantic graph format.

**Structure:**
- `graph/modules/` - Source file metadata
- `graph/functions/` - Function signatures
- `graph/classes/` - Class definitions
- `api/endpoints/` - REST/GraphQL endpoints
- `data/entities/` - Database schemas

**Format:** YAML files with content-addressable naming

**See:** [E-ADR-001](../e-adr/E-ADR-001-RECON-Provisional-Execution.md)

---

### Can I edit AI-DOC slices manually?

**No** - Slices are derived artifacts, always regenerated from source.

**If you edit manually:**
- RECON will detect the change
- Phase 6 will self-heal (overwrite your edit)
- This is correct behavior

**To change semantics:** Edit source code, then run RECON.

**See:** [Authoritative Semantics Correction](../reference/authoritative-semantics-correction.md)

---

### What are "orphaned slices"?

**Orphaned slices** are slices whose source files have been deleted.

**Behavior:**
- Automatically detected by RECON Phase 6
- Automatically removed
- Logged as informational message

**This is normal** - No action needed.

---

## Security Questions

### Is it safe to run RECON on my codebase?

**Yes** - ste-runtime enforces strict boundaries:

- Never scans outside project root
- Never scans parent directories
- Never scans home directories
- Validates all file paths

**See:** [Boundary Enforcement](../security/boundary-enforcement.md)

---

### What permissions does ste-runtime need?

**Read-only access:**
- Read source files
- Read configuration
- Read project structure

**Write access:**
- Write to `.ste/state/` directory only
- Write to `.ste/cache/` directory (for CloudFormation spec cache)

**Network access:**
- CloudFormation spec fetching (optional, only when analyzing CloudFormation templates)
- **Cached:** Once fetched, the spec is cached for 7 days at `.ste/cache/cfn-spec.json`
- Falls back to expired cache if network is unavailable
- **Note:** The `.ste/cache/` directory is only created when CloudFormation files are detected and processed. If you don't see it, CloudFormation wasn't detected in your project.

---

## Integration Questions

### Can I use ste-runtime with other AI assistants?

**Currently:** Cursor IDE via MCP

**Future:** Other MCP-compatible assistants

**Programmatic API:** Available for custom integrations

**See:** [RSS Programmatic API](../../instructions/RSS-PROGRAMMATIC-API.md)

---

### How do I integrate ste-runtime into my workflow?

**Option 1: CLI**
```bash
ste recon
ste rss search "your query"
```

**Option 2: Programmatic API**
```typescript
import { initRssContext, search } from 'ste-runtime';
const ctx = await initRssContext('.ste/state');
const results = search(ctx, 'your query');
```

**Option 3: MCP Server**
- Configure in Cursor
- Tools available automatically

---

## Troubleshooting Questions

### Where can I find help?

1. **Documentation:**
   - [Troubleshooting Guide](./troubleshooting.md)
   - [Configuration Reference](./configuration-reference.md)
   - [MCP Setup Guide](./mcp-setup.md)

2. **Check logs:**
   ```bash
   ste recon --verbose
   ste watch --mcp  # For MCP issues
   ```

3. **Report issues:**
   - Include full error messages
   - Include configuration (sanitized)
   - Include version: `ste --version`

---

### Common error messages?

**"CRITICAL BOUNDARY VIOLATION"**
- RECON attempted to scan outside project root
- See [Boundary Enforcement](../security/boundary-enforcement.md)

**"Failed to load current AI-DOC graph"**
- Incremental RECON failed, falling back to full recon
- This is automatic recovery

**"Extractor failure: [language]"**
- Language extractor encountered error
- Check source files for syntax errors

**See:** [Troubleshooting Guide](./troubleshooting.md#common-error-messages)

---

## Still Have Questions?

- **Documentation:** Check `documentation/` directory
- **E-ADRs:** See `documentation/e-adr/` for design decisions
- **Troubleshooting:** See [Troubleshooting Guide](./troubleshooting.md)
- **Contributing:** See [Contributing Guide](../../CONTRIBUTING.md)

---

**Last Updated:** 2026-01-11

