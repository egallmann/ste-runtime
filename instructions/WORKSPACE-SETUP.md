# Workspace Setup for Multi-Project MCP

**Audience:** Engineers using ste-runtime with Cursor across multiple projects  
**Artifact Type:** Living  
**Purpose:** Configure per-workspace MCP so each project serves its own semantic graph.

---

## Why Per-Workspace Configuration

ste-runtime's MCP server serves a single semantic graph per process. When you work
across 2-3 projects simultaneously, each workspace needs its own MCP server instance
pointed at its own graph. Cursor supports this via workspace-level `.cursor/mcp.json`
files that override (or supplement) the global `~/.cursor/mcp.json`.

---

## Quick Start

### 1. Build ste-runtime (one-time per installation)

```bash
cd <path-to-ste-runtime>
npm install
npm run build
```

### 2. Generate the semantic graph

```bash
# Multi-repo workspace (workspace.yaml at root):
npm run recon:workspace

# Single-repo project:
npm run recon:full
```

### 3. Create `.cursor/mcp.json` in your workspace

Create `.cursor/mcp.json` at the root of the workspace you open in Cursor:

**Windows:**
```json
{
  "mcpServers": {
    "ste-runtime": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\Projects\\my-project\\ste-runtime\\dist\\cli\\index.js",
        "watch",
        "--mcp",
        "--project-root",
        "C:\\Users\\YourName\\Projects\\my-project"
      ],
      "type": "stdio",
      "timeout": 60
    }
  }
}
```

**Unix/macOS:**
```json
{
  "mcpServers": {
    "ste-runtime": {
      "command": "node",
      "args": [
        "/home/user/projects/my-project/ste-runtime/dist/cli/index.js",
        "watch",
        "--mcp",
        "--project-root",
        "/home/user/projects/my-project"
      ],
      "type": "stdio",
      "timeout": 60
    }
  }
}
```

### 4. Disable the global entry (if one exists)

In `~/.cursor/mcp.json`, set `"disabled": true` on any existing `ste-runtime` entry
to prevent it from shadowing your workspace-level config.

### 5. Restart the MCP server

Restart Cursor or reload the MCP server from the Cursor command palette.

---

## How `--project-root` Works

The `--project-root <path>` flag tells the MCP server exactly which directory to treat
as the project root. This overrides all other resolution logic (ste.config.json
`projectRoot` field, `cwd` heuristics).

The server then:
1. Looks for `workspace.yaml` at the given path
2. If found, resolves the `output_dir` field (e.g., `.aos-graph/`) and loads the
   graph from `<output_dir>/state/`
3. If no workspace.yaml, falls back to `.ste/state` within the ste-runtime directory

---

## Installation Patterns

### ste-runtime as a subdirectory or submodule

```
my-project/
  ste-runtime/         <-- ste-runtime lives here
  workspace.yaml
  .cursor/mcp.json     <-- points to ./ste-runtime/dist/cli/index.js
```

### ste-runtime as a sibling directory

```
~/Projects/
  my-project/
    workspace.yaml
    .cursor/mcp.json   <-- points to ../ste-runtime/dist/cli/index.js
  ste-runtime/
```

### Global npm install (future)

```json
{
  "mcpServers": {
    "ste-runtime": {
      "command": "npx",
      "args": ["ste-runtime", "watch", "--mcp", "--project-root", "/path/to/workspace"],
      "type": "stdio",
      "timeout": 60
    }
  }
}
```

---

## Multi-Workspace Workflow

When you have 2-3 Cursor windows open on different projects:

```
Window 1: aos-repositories/
  .cursor/mcp.json → --project-root C:\...\aos-repositories
  Serves: .aos-graph/state/ (los-api, losprocessorv2, etc.)

Window 2: ai-cognition-runtime/
  .cursor/mcp.json → --project-root C:\...\ai-cognition-runtime
  Serves: .ste/state/ or workspace graph (Helix AI Gateway)

Window 3: software-committee-automation/
  .cursor/mcp.json → --project-root C:\...\software-committee-automation
  Serves: .ste/state/ (committee automation components)
```

Each Cursor window launches its own MCP server process scoped to its own graph.
Cursor manages lifecycle (start on open, stop on close).

---

## Troubleshooting

### "overview returns wrong graph" / "find returns nothing for my repos"

**Cause:** The MCP server is pointed at the wrong project root.

**Diagnostic:**
1. Check the MCP server's stderr output in Cursor's output panel for the startup banner:
   ```
   [ste-runtime] Serving: <path>
   [ste-runtime] Graph: <state-dir>
   [ste-runtime] Mode: workspace|single-repo|self
   ```
2. If the path doesn't match your workspace, check `.cursor/mcp.json` in your
   workspace root.
3. If no workspace-level `.cursor/mcp.json` exists, the global `~/.cursor/mcp.json`
   entry is being used. Create a workspace-level one with `--project-root`.

### "Graph has 0 nodes" or "No manifest found"

**Cause:** The semantic graph hasn't been built for this project.

**Fix:** Run `npm run recon:workspace` (or `recon:full`) in the ste-runtime directory,
then restart the MCP server.

### "dist/cli/index.js not found"

**Cause:** ste-runtime hasn't been built.

**Fix:** Run `npm run build` in the ste-runtime directory.

---

## Path Requirements

- Use **absolute paths** in `.cursor/mcp.json`. Relative path resolution from
  workspace root is not reliably supported across all Cursor versions.
- On Windows, use double-backslashes (`\\`) in JSON strings.
- The `--project-root` path must point to an existing directory.

---

## Template

A copy-ready template is available at:
```
ste-runtime/templates/cursor-mcp.json
```

Replace `<ABSOLUTE_PATH_TO_STE_RUNTIME>` and `<ABSOLUTE_PATH_TO_WORKSPACE_ROOT>`
with your actual paths.
