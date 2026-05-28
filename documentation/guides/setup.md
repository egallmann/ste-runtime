# ste-runtime Setup Guide

The single authoritative guide for getting ste-runtime working in your
development environment. This covers both multi-repo workspaces and
single-repo projects.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start: Automated Setup](#quick-start-automated-setup)
- [Quick Start: Standalone Exploration](#quick-start-standalone-exploration)
- [What ste setup Does](#what-ste-setup-does)
- [Manual Setup](#manual-setup)
- [MCP Configuration Details](#mcp-configuration-details)
- [Installation Patterns](#installation-patterns)
- [.gitignore Entries](#gitignore-entries)
- [Verification](#verification)
- [Multi-Workspace Workflow](#multi-workspace-workflow)
- [Next Steps](#next-steps)

---

## Prerequisites

- **Node.js** 18 or later
- **npm**
- **Cursor** editor (for MCP integration)
- **Python 3** (only if developing Python extractors)

---

## Quick Start: Automated Setup

Use this when adding ste-runtime to an existing project or workspace.

```bash
# 1. Clone ste-runtime alongside your project(s)
git clone https://github.com/egallmann/ste-runtime.git

# 2. Install and build
cd ste-runtime
npm install
npm run build

# 3. Run setup from your workspace root
cd ..
node ste-runtime/dist/cli/index.js setup
```

`ste setup` automatically:
1. Detects whether you have a multi-repo workspace or single-repo project
2. Scaffolds `workspace.yaml` (multi-repo) or `ste.config.json` (single-repo)
3. Creates `.cursor/mcp.json` with correct absolute paths
4. Appends `.ste/`, `.ste-self/`, `.workspace-graph/` to `.gitignore`
5. Runs an initial RECON to build the semantic graph
6. Prints verification instructions

Use `--dry-run` to preview all changes before writing:

```bash
node ste-runtime/dist/cli/index.js setup --dry-run
```

If ste-runtime is not a subdirectory of your workspace, specify its location:

```bash
node /path/to/ste-runtime/dist/cli/index.js setup --ste-runtime-path /path/to/ste-runtime
```

---

## Quick Start: Standalone Exploration

Use this to try ste-runtime on its own codebase without integrating it into
another project.

```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime
npm run init
```

`npm run init` is an automated bootstrap that checks prerequisites, installs
dependencies, builds, runs RECON on ste-runtime itself, and validates the
installation. After it completes:

```bash
npm run rss:stats
npm run rss -- search "authentication"
```

---

## What ste setup Does

### Workspace-type detection

`ste setup` scans subdirectories of the current directory for project markers:
`package.json`, `tsconfig.json`, `pyproject.toml`, `setup.py`,
`requirements.txt`, `Cargo.toml`, `go.mod`, `pom.xml`, `.csproj`, `.sln`.

- **2 or more** subdirectories with markers: multi-repo workspace
- **1** subdirectory with markers: single-repo project
- **Running inside ste-runtime itself**: standalone self-analysis

### Config scaffolding

| Workspace type | Config file | Contents |
|----------------|-------------|----------|
| Multi-repo | `workspace.yaml` | Schema version, output directory, list of discovered repos with name, path, kind, and language |
| Single-repo | `ste.config.json` | Project root, output directory, extractor defaults |

### MCP configuration

Creates `.cursor/mcp.json` at the workspace root with:

```json
{
  "mcpServers": {
    "ste-runtime": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": [
        "<absolute-path-to-ste-runtime>/dist/cli/index.js",
        "watch",
        "--mcp",
        "--project-root",
        "<absolute-path-to-workspace>"
      ]
    }
  }
}
```

The `--project-root` flag tells the MCP server which directory to treat as the
project root. This overrides all other resolution logic. The server looks for
`workspace.yaml` at that path; if found, it loads the workspace graph from the
configured `output_dir`. If not, it falls back to `.ste/state`.

### Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview all planned writes without modifying the filesystem |
| `--ste-runtime-path <path>` | Absolute path to ste-runtime when it lives outside the workspace |
| `--skip-recon` | Skip the initial RECON run |
| `--project-root <path>` | Workspace root to set up (defaults to cwd) |

---

## Manual Setup

If you prefer not to use `ste setup`, follow these steps:

### 1. Clone and build

```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime
npm install
npm run build
```

### 2. Scaffold workspace configuration

For a **multi-repo workspace**, create `workspace.yaml` at your workspace root.
You can scaffold it automatically:

```bash
cd /path/to/workspace
node /path/to/ste-runtime/dist/cli/index.js init
```

Or create it manually. See
[workspace-initialization.md](workspace-initialization.md) for the full schema.

For a **single-repo project**, generate `ste.config.json`:

```bash
cd /path/to/ste-runtime
npm run recon:init
```

See [configuration-reference.md](configuration-reference.md) for all config
options.

### 3. Create `.cursor/mcp.json`

Create `.cursor/mcp.json` at the root of the directory you open in Cursor.
Use absolute paths. On Windows, use double-backslashes (`\\`) in JSON strings.

**Windows example:**
```json
{
  "mcpServers": {
    "ste-runtime": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\Projects\\workspace\\ste-runtime\\dist\\cli\\index.js",
        "watch",
        "--mcp",
        "--project-root",
        "C:\\Users\\YourName\\Projects\\workspace"
      ],
      "type": "stdio",
      "timeout": 60
    }
  }
}
```

**Unix/macOS example:**
```json
{
  "mcpServers": {
    "ste-runtime": {
      "command": "node",
      "args": [
        "/home/user/projects/workspace/ste-runtime/dist/cli/index.js",
        "watch",
        "--mcp",
        "--project-root",
        "/home/user/projects/workspace"
      ],
      "type": "stdio",
      "timeout": 60
    }
  }
}
```

A copy-ready template is at `ste-runtime/templates/cursor-mcp.json`.

### 4. Run initial RECON

```bash
cd ste-runtime

# Multi-repo workspace:
npm run recon:workspace

# Single-repo project:
npm run recon:full
```

### 5. Update `.gitignore`

Add the following to your workspace `.gitignore`:

```
.ste/
.ste-self/
.workspace-graph/
```

---

## MCP Configuration Details

For advanced MCP topics (architecture overview, available tools, per-tool
documentation, watchdog configuration), see [mcp-setup.md](mcp-setup.md).

---

## Installation Patterns

### ste-runtime as a subdirectory

```
my-workspace/
  ste-runtime/            <-- ste-runtime lives here
  repo-a/
  repo-b/
  workspace.yaml
  .cursor/mcp.json        <-- points to ./ste-runtime/dist/cli/index.js
```

### ste-runtime as a sibling directory

```
~/Projects/
  my-workspace/
    repo-a/
    repo-b/
    workspace.yaml
    .cursor/mcp.json      <-- points to ../ste-runtime/dist/cli/index.js
  ste-runtime/
```

Use `--ste-runtime-path` with `ste setup` when ste-runtime is not inside the
workspace.

---

## .gitignore Entries

ste-runtime generates state artifacts that should not be committed:

| Directory | Purpose |
|-----------|---------|
| `.ste/` | Single-repo RECON state |
| `.ste-self/` | ste-runtime self-documentation state |
| `.workspace-graph/` | Multi-repo workspace graph output |

`ste setup` appends these automatically. For custom `output_dir` values in
`workspace.yaml`, add those paths manually.

---

## Verification

After setup completes:

1. Restart Cursor (or reload the window) so it picks up `.cursor/mcp.json`
2. Open the Cursor MCP panel and confirm `ste-runtime` appears as a connected
   server
3. In Cursor chat, ask: "call the overview tool"
4. You should see a summary of the semantic graph with node counts and
   available tools

If the overview returns no data or the wrong graph, see
[troubleshooting.md](troubleshooting.md).

---

## Multi-Workspace Workflow

Each Cursor window needs its own `.cursor/mcp.json` pointing at its own
workspace root. When you have multiple Cursor windows open:

```
Window 1: my-workspace-a/
  .cursor/mcp.json -> --project-root .../my-workspace-a
  Serves: .workspace-graph/state/

Window 2: my-workspace-b/
  .cursor/mcp.json -> --project-root .../my-workspace-b
  Serves: .ste/state/
```

Each window launches its own MCP server process. Cursor manages the lifecycle
(start on open, stop on close).

If you have a global MCP entry in `~/.cursor/mcp.json`, set `"disabled": true`
on it to prevent it from shadowing workspace-level configs.

---

## Next Steps

- [configuration-reference.md](configuration-reference.md) -- all config
  options for `ste.config.json` and `workspace.yaml`
- [workspace-initialization.md](workspace-initialization.md) -- detailed
  `workspace.yaml` schema and multi-repo setup
- [mcp-setup.md](mcp-setup.md) -- advanced MCP configuration and tool
  reference
- [troubleshooting.md](troubleshooting.md) -- common issues and solutions
