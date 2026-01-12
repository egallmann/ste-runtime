# Getting Started with ste-runtime

A step-by-step tutorial to get you up and running with ste-runtime, a component implementation of the [STE Specification](https://github.com/egallmann/ste-spec).

---

## Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** or **yarn**
- A codebase to analyze (or use ste-runtime itself)

---

## Step 1: Installation

### Option A: Clone and Build

```bash
# Clone the repository
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime

# Install dependencies
npm install

# Build the project
npm run build
```

### Option B: Global Install

```bash
cd ste-runtime
npm install -g .
```

**Verify installation:**
```bash
ste --version
# Should show: 1.0.0
```

---

## Step 2: Run Your First RECON

### Self-Documentation (Recommended First Step)

Analyze ste-runtime itself to see how it works:

```bash
cd ste-runtime
npm run recon:self
```

**What happens:**
1. RECON discovers TypeScript files
2. Extracts semantic assertions (functions, classes, imports)
3. Infers relationships (imports → graph edges)
4. Creates AI-DOC slices in `.ste-self/state/`
5. Reports completion

**Expected output:**
```
[RECON] Discovery: 256 files
[RECON] Extraction: 864 assertions
[RECON] Inference: 1,243 relationships
[RECON] Normalization: 864 slices
[RECON] Population: 864 slices written
[RECON] Validation: 0 errors, 3 warnings, 15 info
[RECON] Complete
```

---

## Step 3: Query the Graph

### Check Graph Statistics

```bash
npm run rss:stats
```

**Output:**
```
Graph Statistics:
  Components: 864
  Domains: 5
  Types: 12
  Relationships: 1,243
  Pattern: hierarchical
  Recommended depth: 2
```

### Search for Components

```bash
# Search for authentication-related code
npm run rss -- search "authentication"

# Search for MCP server
npm run rss -- search "mcp server"
```

**Output:**
```
Found 3 components:
  1. graph/function/src/mcp/mcp-server.ts:initialize
  2. graph/module/src/mcp/mcp-server.ts
  3. graph/function/src/mcp/mcp-server.ts:start
```

### Get Dependencies

```bash
# Find what a component depends on
npm run rss -- dependencies graph/function/src/mcp/mcp-server.ts:initialize
```

**Output:**
```
Dependencies (12):
  - graph/module/src/config/index.ts
  - graph/module/src/rss/graph-loader.ts
  - graph/function/src/rss/graph-loader.ts:loadGraph
  ...
```

### Impact Analysis

```bash
# See what would break if you change this component
npm run rss -- blast-radius graph/function/src/mcp/mcp-server.ts:initialize
```

**Output:**
```
Blast Radius (45 components):
  Direct dependencies: 12
  Transitive dependencies: 18
  Dependents: 15
  Total impact: 45 components
```

---

## Step 4: Use Your Own Project

### Analyze Your Codebase

```bash
# Navigate to your project
cd /path/to/your-project

# Run RECON
ste recon --mode=full
```

**What happens:**
1. RECON auto-detects your project structure
2. Discovers source files
3. Extracts semantics based on detected languages
4. Creates `.ste/state/` directory

**Note:** First run may take 5-15 seconds depending on project size.

### Query Your Codebase

```bash
# Search for components
ste rss search "user authentication"

# Get context for a task
ste rss context "implement rate limiting"
```

---

## Step 5: Configure (Optional)

### Generate Configuration File

```bash
ste recon --init
```

This creates `ste.config.json` with defaults.

### Customize Configuration

Edit `ste.config.json`:

```json
{
  "languages": ["typescript", "python"],
  "sourceDirs": ["src", "lib"],
  "ignorePatterns": ["**/test/**"],
  "watchdog": {
    "enabled": true,
    "debounceMs": 500
  }
}
```

**See:** [Configuration Reference](./configuration-reference.md) for all options.

---

## Step 6: Set Up MCP Server (Optional)

### Install Globally

```bash
cd ste-runtime
npm install -g .
```

### Configure Cursor

Edit `~/.cursor/mcp.json` (or `C:\Users\YourName\.cursor\mcp.json` on Windows):

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

### Restart Cursor

Fully quit and restart Cursor. Tools should appear automatically.

**See:** [MCP Setup Guide](./mcp-setup.md) for detailed instructions.

---

## Step 7: Enable File Watching (Optional)

### Enable Watchdog

Edit `ste.config.json`:

```json
{
  "watchdog": {
    "enabled": true,
    "debounceMs": 500,
    "aiEditDebounceMs": 2000
  }
}
```

**What happens:**
- Watchdog monitors file changes
- Automatically triggers incremental RECON
- Keeps semantic graph always fresh

**Note:** Watchdog is opt-in and disabled by default.

---

## Common Workflows

### Workflow 1: Understanding a Feature

```bash
# 1. Search for the feature
ste rss search "authentication"

# 2. Get full context
ste rss context "authentication flow"

# 3. Check dependencies
ste rss dependencies graph/function/src/auth/authenticate.ts:authenticate

# 4. See impact
ste rss blast-radius graph/function/src/auth/authenticate.ts:authenticate
```

### Workflow 2: Impact Analysis Before Changes

```bash
# 1. Find the component
ste rss search "User entity"

# 2. Check blast radius
ste rss blast-radius data/entity/User

# 3. Review affected components
# 4. Make changes
# 5. Run RECON to update graph
ste recon
```

### Workflow 3: Finding Similar Code

```bash
# 1. Find a component
ste rss search "UserService"

# 2. Find similar implementations
ste rss -- get-related-implementations graph/module/src/services/user-service.ts
```

---

## Next Steps

### Learn More

- **Configuration:** [Configuration Reference](./configuration-reference.md)
- **Troubleshooting:** [Troubleshooting Guide](./troubleshooting.md)
- **FAQ:** [Frequently Asked Questions](./faq.md)
- **Glossary:** [Terminology](./glossary.md)

### Advanced Topics

- **Extractor Development:** [Extractor Development Guide](../e-adr/E-ADR-008-Extractor-Development-Guide.md)
- **Architecture:** [E-ADRs](../e-adr/)
- **Performance:** [Performance Benchmarks](../reference/performance-benchmarks.md)

### Integration

- **MCP Setup:** [MCP Setup Guide](./mcp-setup.md)
- **Programmatic API:** [RSS Programmatic API](../../instructions/RSS-PROGRAMMATIC-API.md)
- **CLI Usage:** [RSS Usage Guide](../../instructions/RSS-USAGE-GUIDE.md)

---

## Troubleshooting

### RECON finds no files

**Check:**
- Files are in `sourceDirs` or project root
- Not in ignored directories
- Language is supported

**See:** [Troubleshooting Guide](./troubleshooting.md#recon-issues)

### RSS queries return empty

**Check:**
- RECON has been run
- State directory exists (`.ste/state/`)
- Query is not too specific

**See:** [Troubleshooting Guide](./troubleshooting.md#rss-query-issues)

### MCP server not starting

**Check:**
- `ste` is in PATH
- Configuration is correct
- Cursor is fully restarted

**See:** [MCP Setup Guide](./mcp-setup.md#troubleshooting)

---

## Example: Complete Workflow

```bash
# 1. Install
cd ste-runtime
npm install
npm run build

# 2. Test self-documentation
npm run recon:self

# 3. Check stats
npm run rss:stats

# 4. Search
npm run rss -- search "mcp"

# 5. Get context
npm run rss -- context "MCP server implementation"

# 6. Use in your project
cd /path/to/your-project
ste recon --mode=full
ste rss search "your feature"
```

---

## Getting Help

- **Documentation:** Check `documentation/` directory
- **Troubleshooting:** [Troubleshooting Guide](./troubleshooting.md)
- **FAQ:** [Frequently Asked Questions](./faq.md)
- **Contributing:** [Contributing Guide](../../CONTRIBUTING.md)

---

**Congratulations!** You're now ready to use ste-runtime. Start with self-documentation, then apply it to your own projects.

---

**Last Updated:** 2026-01-11

