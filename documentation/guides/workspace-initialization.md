# Workspace Initialization Guide

How to initialize ste-runtime for a multi-repo workspace from scratch.

This guide covers the end-to-end workflow: creating the workspace manifest,
configuring the MCP server, running the first extraction, and verifying the
graph is live.

For single-repo usage, see [RECON-README.md](../../instructions/RECON-README.md).

---

## Prerequisites

- Node.js 18+
- npm
- ste-runtime cloned and built:

```bash
git clone https://github.com/egallmann/ste-runtime.git
cd ste-runtime
npm install
npm run build
```

---

## 1. Create `workspace.yaml`

Create a `workspace.yaml` file at the root of your multi-repo workspace
directory. This file declares all repositories and their metadata.

### Schema

```yaml
schema_version: "1.0"
output_dir: .my-workspace-graph/
seed_scope:
  - repo-a
  - repo-b
repos:
  - { name: repo-a, path: ./repo-a, kind: service, lang: python }
  - { name: repo-b, path: ./repo-b, kind: frontend, lang: typescript }
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `schema_version` | Yes | Always `"1.0"` |
| `output_dir` | Yes | Directory for graph output, relative to workspace root |
| `seed_scope` | Yes | List of repo names to include in the primary extraction scope |
| `repos` | Yes | List of repository declarations |
| `external_systems` | No | External APIs or partner systems (creates ExternalSystem nodes) |

### Repo Entry Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier for this repo |
| `path` | Yes | Relative path from workspace root (e.g., `./my-repo`) |
| `kind` | Yes | `service`, `frontend`, or `contracts` |
| `lang` | Yes | Primary language: `typescript`, `python`, `dotnet` |

### Working Example

This example is from a workspace containing .NET services, Angular frontends,
and Python services:

```yaml
schema_version: "1.0"
output_dir: .workspace-graph/
seed_scope:
  - api-service
  - web-ui
  - processor
repos:
  - { name: api-service,  path: ./api-service,  kind: service,  lang: dotnet }
  - { name: web-ui,       path: ./web-ui,       kind: frontend, lang: typescript }
  - { name: processor,    path: ./processor,    kind: service,  lang: python }
  - { name: schemas,      path: ./schemas,      kind: contracts, lang: python }

external_systems:
  - { key: partner-x, name: PartnerX, kind: partner-api }
```

---

## 2. Create Workspace-Level `.cursor/mcp.json`

Create a `.cursor/mcp.json` file **inside the workspace root directory** (not
in the global `~/.cursor/` location). This tells Cursor to start the
ste-runtime MCP server scoped to this workspace.

```json
{
  "mcpServers": {
    "ste-runtime": {
      "command": "node",
      "args": [
        "/absolute/path/to/ste-runtime/dist/cli/index.js",
        "watch",
        "--mcp",
        "--project-root",
        "/absolute/path/to/workspace-root"
      ],
      "type": "stdio",
      "timeout": 60
    }
  }
}
```

### Key Points

- Use **absolute paths** for both the `dist/cli/index.js` entry point and the
  `--project-root` argument. Cursor does not interpolate variables like
  `${workspaceFolder}` in MCP configs.
- The `--project-root` argument tells the MCP server which directory to serve
  the graph for. It should point at the workspace root (where `workspace.yaml`
  lives).
- A **workspace-level** `.cursor/mcp.json` takes precedence over the global
  `~/.cursor/mcp.json` for that workspace. This allows different workspaces
  to point at different graphs.
- On Windows, use escaped backslashes in JSON paths:
  `"C:\\Users\\name\\projects\\ste-runtime\\dist\\cli\\index.js"`

### Windows Example

```json
{
  "mcpServers": {
    "ste-runtime": {
      "command": "node",
      "args": [
        "C:\\Users\\name\\projects\\ste-runtime\\dist\\cli\\index.js",
        "watch",
        "--mcp",
        "--project-root",
        "C:\\Users\\name\\projects\\my-workspace"
      ],
      "type": "stdio",
      "timeout": 60
    }
  }
}
```

---

## 3. Run `recon:workspace`

From the ste-runtime directory, run the workspace extraction:

```bash
cd /path/to/ste-runtime
node dist/cli/recon-cli.js --workspace=/path/to/workspace-root
```

Or if ste-runtime is inside the workspace:

```bash
cd /path/to/ste-runtime
npm run recon:workspace
```

The `npm run recon:workspace` script uses `--workspace` with auto-discovery
(walks upward from cwd to find `workspace.yaml`). When ste-runtime lives
outside the workspace, use the explicit path form.

### Expected Output

```
============================================================
RECON - Workspace Mode (workspace.yaml)
============================================================

[RECON] Processing repo (1/3): api-service...
[RECON] Processing repo (2/3): web-ui...
[RECON] Processing repo (3/3): processor...

[RECON] ✓ api-service: 1200ms
[RECON] ✓ web-ui: 2500ms
[RECON] ✓ processor: 800ms

[workspace-recon] Orchestration: 3200ms (3 repos, 0.9 repos/sec)

  [api-service] OK  nodes=12 edges=4 slice=slices/api-service.yaml
  [web-ui]      OK  nodes=85 edges=20 slice=slices/web-ui.yaml
  [processor]   OK  nodes=8 edges=2 slice=slices/processor.yaml
```

### Handling Failures

Workspace recon is **resilient by default**: if one repo fails, the others
still process. The summary reports per-repo status:

```
  [api-service] OK      nodes=12 edges=4
  [web-ui]      FAILED  stage=recon  <error message>
  [processor]   OK      nodes=8 edges=2
```

A failed repo can be investigated independently. Common causes:

- Unsupported code patterns in the extractor (file a bug)
- Missing source files at the declared path
- Language mismatch between `workspace.yaml` `lang` and actual project content

Use `--fail-on-any-error` if you want strict mode (fail the entire run if
any repo fails).

### Output Structure

Workspace recon writes to the `output_dir` declared in `workspace.yaml`:

```
workspace-root/
├── workspace.yaml
└── .workspace-graph/
    ├── workspace-index.yaml
    ├── slices/
    │   ├── api-service.yaml
    │   ├── web-ui.yaml
    │   └── processor.yaml
    └── state/
        ├── api-service/
        │   ├── graph/
        │   ├── api/
        │   ├── infrastructure/
        │   └── validation/
        ├── web-ui/
        │   ├── graph/
        │   ├── frontend/
        │   └── validation/
        └── processor/
            ├── graph/
            └── validation/
```

---

## 4. Verify

### Reload Cursor

After creating `.cursor/mcp.json`, reload the Cursor window (or fully restart
Cursor) so it picks up the new MCP server configuration.

### Confirm MCP Tools

In Cursor, check that the ste-runtime MCP server is listed and its 8 tools
are available: `overview`, `find`, `show`, `usages`, `impact`, `similar`,
`diagnose`, `refresh`.

You can verify in the Cursor Output panel by selecting the MCP server from
the dropdown.

### Test the Graph

Ask the AI assistant to run an overview query:

```
Call overview with scope "project"
```

This should return the workspace structure including all repos declared in
`workspace.yaml`. If the response is empty or shows unexpected content, run
`diagnose` with `mode: "health"` to check graph status.

---

## CLI Reference

Full `recon --workspace` options:

```
--workspace=<path>       Path to workspace directory or workspace.yaml
--workspace              Auto-discover workspace.yaml upward from cwd
--workspace=auto         Same as bare --workspace
--fail-on-any-error      Strict mode: fail if any repo fails
--skip-unchanged         Skip repos unchanged since last successful run
--timeout-per-repo=<ms>  Per-repo time ceiling (0 to disable)
```

---

## See Also

- [MCP Setup Guide](./mcp-setup.md) -- MCP server configuration details
- [RECON README](../../instructions/RECON-README.md) -- Single-repo RECON usage
- [Configuration Reference](./configuration-reference.md) -- `ste.config.json` options
