# MCP Setup Guide for Cursor

This guide explains how to set up ste-runtime as an MCP server in Cursor.

## What is MCP?

Model Context Protocol (MCP) is a standardized protocol that allows AI assistants like Cursor to discover and use tools. ste-runtime implements MCP to expose its semantic graph operations directly to Cursor.

## Architecture

ste-runtime provides a unified MCP server that combines:

1. **File Watcher** - Monitors project files and triggers incremental RECON
2. **Incremental RECON Engine** - Keeps AI-DOC state fresh
3. **In-Memory RSS Context** - Fast semantic graph queries (<100ms)
4. **MCP Server** - Exposes RSS operations via stdio

```
┌─────────────┐
│ Cursor IDE  │
└──────┬──────┘
       │ MCP Protocol (stdio)
       ▼
┌─────────────────────────────┐
│   ste-runtime MCP Server    │
│                             │
│  • Structural Queries       │
│  • Context Assembly         │
│  • Graph Health             │
│                             │
│  Backed by:                 │
│  • In-Memory RSS Graph      │
│  • Incremental RECON        │
│  • File Watcher             │
└─────────────────────────────┘
```

## Prerequisites

1. **Node.js** 18+ installed
2. **ste-runtime** installed in your project
3. **Cursor** editor installed

## Installation

### 1. Install ste-runtime

```bash
cd your-project
npm install ste-runtime
# or globally
npm install -g ste-runtime
```

### 2. Run Initial RECON

Before starting the MCP server, run an initial RECON to build the semantic graph:

```bash
npx ste recon
```

This creates the `.ste/state/` directory with AI-DOC files.

### 3. Configure Cursor MCP

Create or edit `~/.cursor/mcp.json` (or `%USERPROFILE%\.cursor\mcp.json` on Windows):

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

**Explanation:**
- `command`: The `ste` executable (from package.json bin)
- `args`: Starts watch mode with MCP enabled
- `cwd`: Runs in your workspace folder

### 4. Configure ste-runtime (Optional)

Create `ste.config.json` in your project root to customize behavior:

```json
{
  "languages": ["typescript", "python"],
  "sourceDirs": ["src", "lib"],
  "watchdog": {
    "enabled": true,
    "debounceMs": 500,
    "aiEditDebounceMs": 2000,
    "patterns": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.py"]
  },
  "mcp": {
    "transport": "stdio",
    "logLevel": "info"
  },
  "rss": {
    "stateRoot": ".ste/state",
    "defaultDepth": 2,
    "maxResults": 50
  }
}
```

**Key Settings:**
- `watchdog.enabled`: Enable automatic RECON on file changes (default: false)
- `watchdog.debounceMs`: Wait time for manual edits (default: 500ms)
- `watchdog.aiEditDebounceMs`: Wait time for AI edits (default: 2000ms)
- `rss.defaultDepth`: Graph traversal depth (adaptive based on your codebase)

### 5. Restart Cursor

After configuring MCP, restart Cursor to load the new server.

## Using ste-runtime in Cursor

Once configured, ste-runtime tools are available in Cursor's AI assistant. The assistant can discover and use these tools automatically.

### Available Tools

**`find`** - Semantic search by meaning/name
```
Query: "find authentication handlers"
```

**`show`** - Full implementation with dependencies
```
Query: "show src/api/auth.ts"
```

**`usages`** - Where a symbol is used
```
Query: "where is UserService used?"
```

**`impact`** - Change impact analysis
```
Query: "impact of changing data/entity/User"
```

**`similar`** - Find similar code patterns
```
Query: "find similar patterns to UserService"
```

**`overview`** - Codebase structure overview
```
Query: "overview of the auth domain"
```

**`diagnose`** - Graph health/coverage checks
```
Query: "diagnose graph health"
```

**`refresh`** - Force graph refresh
```
Query: "refresh graph"
```

## Example Workflows

### 1. Understanding a Feature

```
You: "Tell me how authentication works in this codebase"

Cursor uses:
1. find("authentication")
2. show("api/function/authenticate")
3. show("authentication flow")

Result: Full context with source code
```

### 2. Impact Analysis

```
You: "What would break if I change the User entity?"

Cursor uses:
1. show("data/entity/User")
2. impact("data/entity/User")

Result: List of affected components
```

### 3. Finding Similar Code

```
You: "Show me other services similar to UserService"

Cursor uses:
1. find("UserService")
2. similar("UserService")

Result: Similar patterns with source
```

## File Watching

If `watchdog.enabled: true` in your config:

- **Manual edits**: RECON triggers after 500ms of inactivity
- **AI edits**: RECON triggers after 2000ms (handles Cursor streaming)
- **Multi-file edits**: Waits for transaction completion
- **Graph updates**: MCP server reloads context automatically

This keeps the semantic graph always fresh without manual intervention.

## Troubleshooting

### "Cannot find module" Error

**Symptom:**
```
Error: Cannot find module 'C:\Users\YourName\dist\cli\index.js'
```

**Cause:** Cursor is trying to run `node dist/cli/index.js` from the wrong directory, or the path is incorrect.

**Solution:** Use the globally installed `ste` command instead:

```json
{
  "mcpServers": {
    "ste-runtime": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "ste",
      "args": ["watch", "--mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

**Why This Works:**
- `ste` is globally installed and in your PATH
- Cursor can find it from any directory
- The `cwd: "${workspaceFolder}"` ensures correct working directory

**Alternative (If Global Install Issues):**
If you have issues with the global install, use an absolute path:

```json
{
  "mcpServers": {
    "ste-runtime": {
      "command": "node",
      "args": [
        "/absolute/path/to/ste-runtime/dist/cli/index.js",
        "watch",
        "--mcp"
      ],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

### MCP Server Not Starting

**Verify ste is in PATH:**
```bash
# Windows
where.exe ste

# macOS/Linux
which ste
```

Should show the path where `ste` is installed (typically `C:\Users\YourName\AppData\Roaming\npm\ste` on Windows).

**Test manually from any directory:**
```bash
cd ~
ste --version
```

Should show: `1.0.0`

**Rebuild and reinstall if needed:**
```bash
cd /path/to/ste-runtime
npm run build
npm install -g .
```

**Test the server manually:**
```bash
cd your-project
ste watch --mcp
```

**Common issues:**
- `ste` not in PATH → Install globally or use `npx ste`
- No manifest → Run `ste recon` first
- Config errors → Check `ste.config.json` syntax

**Expected Output Verification:**

When the MCP server is working correctly, you should see in the logs:

```
[ste watch] Project root: /path/to/ste-runtime
[ste watch] State directory: .ste/state
[MCP Server] Graph analysis complete:
  - Pattern: flat
  - Components: 24
  - Recommended depth: 2
[MCP Server] Started on stdio
[ste watch] Ready (press Ctrl+C to stop)
```

If you see this output, the server is running correctly.

### Tools Not Appearing in Cursor

1. **Check configuration:**
   - Verify `~/.cursor/mcp.json` (or `C:\Users\YourName\.cursor\mcp.json` on Windows) has correct configuration
   - Ensure `"disabled": false` is set

2. **Restart Cursor completely:**
   - Not just the window - fully quit the application
   - On Windows: Check Task Manager to ensure no Cursor processes are running
   - Restart Cursor

3. **Check Cursor's MCP server logs:**
   - In Cursor, open Output panel
   - Select "MCP user-ste-runtime" from dropdown
   - Look for error messages

4. **Verify MCP status:**
   - Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Type "MCP"
   - Look for MCP server status
   - You should see `ste-runtime` listed

### Graph Out of Sync

**Run RECON manually:**
```bash
# Incremental update
ste recon

# Full reconciliation
ste recon --mode=full
```

**Check state directory:**
```bash
# Should exist and contain graph files
ls .ste/state/graph/
```

### Graph Analysis Shows Wrong Pattern

The graph analyzer learns from your codebase structure. It should adapt as your project grows. If the pattern seems incorrect, the analyzer will update as your codebase structure evolves.

### Performance Issues

**If queries are slow:**
- Check graph size: `ste rss-stats`
- Reduce `rss.maxResults` in config
- Use more specific queries

**If memory is high:**
- Disable file watching (`watchdog.enabled: false`)
- Reduce watched file patterns
- Run RECON less frequently

## Advanced Configuration

### Custom Debounce Times

```json
{
  "watchdog": {
    "enabled": true,
    "debounceMs": 300,        // Faster for small projects
    "aiEditDebounceMs": 3000, // Longer for large AI edits
    "transactionWindowMs": 3000
  }
}
```

### Polling Mode (for network drives)

```json
{
  "watchdog": {
    "enabled": true,
    "fallbackPolling": true,
    "pollingInterval": 5000
  }
}
```

### Periodic Full Reconciliation

```json
{
  "watchdog": {
    "enabled": true,
    "fullReconciliationInterval": 300000  // 5 minutes
  }
}
```

## Architecture Notes

ste-runtime follows established patterns from:

- **Sourcegraph Cody AI**: Retrieval → Ranking phases, semantic graph
- **Snyk**: Context engineering principles
- **Industry Standard**: Graph-based code analysis, incremental updates

### Two-Layer Design

**Layer 1 (Structural)**: Fast in-memory graph queries (<100ms)
- Returns slice metadata only
- Used for entry point discovery

**Layer 2 (Context Assembly)**: Targeted source loading
- Combines metadata + source code
- Optimized for LLM context budget

This design minimizes token usage while providing rich context.

## What to Expect

### First Time in Cursor
1. Cursor starts ste-runtime MCP server for your workspace
2. Server runs RECON if needed (first time: ~1-2 seconds)
3. Server analyzes graph topology
4. Server loads RSS context into memory
5. Server reports ready (~3 seconds total startup)
6. You can now query via Cursor chat

### During Development
- **Without watchdog:** State stays fixed until you run `ste recon` manually
- **With watchdog:** State updates automatically when you save files (~500ms-2s delay)

### Query Performance
- **Structural queries (RSS):** <100ms (in-memory)
- **Context assembly:** 100-500ms (depends on how many files need loading)
- **Graph stats:** <10ms (cached)

## Best Practices

1. **Run RECON regularly** - Keep graph fresh
2. **Use specific queries** - Better results, faster
3. **Enable file watching** - Automatic updates
4. **Monitor graph health** - Use `diagnose`
5. **Start with structural queries** - Then load source if needed

## Support

- **Documentation**: `documentation/` folder
- **Issues**: Report bugs to ste-runtime repo
- **Examples**: See `fixtures/` for sample projects

## See Also

- [E-ADR-011: MCP Server Implementation](../e-adr/E-ADR-011-ste-runtime-MCP-Server.md)
- [RSS Usage Guide](../instructions/RSS-USAGE-GUIDE.md)
- [RECON README](../instructions/RECON-README.md)





