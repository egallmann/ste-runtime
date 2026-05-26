# Workspace Recon Skill for AI Assistants

**Purpose:** Teach AI assistants to use ste-runtime's MCP tools for efficient codebase exploration  
**Audience:** AI assistants (Cursor, Claude Desktop, Copilot), developers configuring AI tooling  
**Version:** 1.0.0

---

## Overview

ste-runtime exposes 8 MCP tools that provide semantic graph access to the codebase. This document describes how AI assistants should use those tools to answer questions about code structure, find implementations, assess change impact, and discover patterns -- all without expensive filesystem crawling.

If you are using **Cursor** and ste-runtime is in your project tree, the skill at `.cursor/skills/workspace-recon/SKILL.md` auto-loads and provides this guidance automatically.

---

## Available Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `overview` | Workspace structure, domains, layers, entry points | First call for any recon task |
| `find` | Semantic search by meaning, name, or description | Finding specific code, definitions, concepts |
| `show` | Full implementation with dependencies | When you know what you want and need code |
| `usages` | Where something is used, with HOW snippets | Before refactoring, understanding consumers |
| `impact` | Blast radius: affected components, tests, guidance | Before making changes |
| `similar` | Pattern discovery across the codebase | Learning how the codebase does things |
| `diagnose` | Graph health, coverage, benchmarks | When results seem wrong or stale |
| `refresh` | Force re-extraction of semantic graph | When files changed or graph is stale |

---

## Recommended Workflows

### Run Recon (Graph Extraction)

When the user explicitly requests `recon:workspace` or `recon:full`, execute the extraction pipeline before querying:

1. **Determine mode**: If `workspace.yaml` exists at the workspace root, use `recon:workspace`; otherwise use `recon:full`
2. **Execute**: `cd <ste-runtime-dir> && npm run recon:workspace` (or `recon:full`)
3. **Verify**: Call `diagnose` with `{ "mode": "health" }` to confirm the graph rebuilt successfully
4. **Present**: Proceed with the Full Workspace Recon (Query) workflow below

This is the data-generation step. It crawls the filesystem and rebuilds `.ste/state/`. Expect 30-120 seconds for large workspaces.

### Full Workspace Recon (Query)

When the graph is current and the user wants workspace understanding:

1. **Call `overview`** with `{ "scope": "project" }` -- returns the full workspace structure in one call
2. **If results are sparse**, call `diagnose` with `{ "mode": "health" }` to check graph freshness
3. **If stale**, call `refresh` with `{ "scope": "full" }` (takes 30-60 seconds for large workspaces)
4. **For targeted exploration**, use `find` on specific areas of interest
5. **For deep dives**, use `show` on specific keys with `depth: 2`

### Quick Orientation

Call `overview` with `{}`. One call. Done.

### Pre-Change Impact Analysis

1. `find` the target component to get its graph key
2. `impact` on that key for blast radius
3. `usages` on that key for all consumers

### Pattern Discovery

1. `similar` with a description of the pattern you want to learn
2. `find` for related concepts
3. `show` on the best matches for full code

---

## Scope Parameter

Every tool accepts a `scope` parameter:
- `"project"` (default) -- queries the project/workspace graph
- `"self"` -- queries ste-runtime's own internal graph

Use `"project"` unless investigating ste-runtime's internals.

---

## Multi-Repo Workspaces

When a `workspace.yaml` exists at the workspace root, the semantic graph covers all declared repositories. This means `overview`, `find`, `usages`, and `impact` results may span repo boundaries. The workflows are identical -- only the breadth of results changes.

---

## When the Graph Is Unavailable

If the MCP server is not running or the graph hasn't been built:

1. Build ste-runtime: `npm install && npm run build`
2. Generate the graph: `npm run recon:full` (single-repo) or `npm run recon:workspace` (multi-repo)
3. See [RECON-README.md](./RECON-README.md) for detailed setup and configuration

---

## Anti-Patterns

- Do not recursively list directory trees when `overview` exists
- Do not grep across all files when `find` does semantic search
- Do not read dozens of files to understand structure when `overview` returns it in one call
- Do not manually trace dependencies when `impact` and `usages` exist
- Do not guess at patterns when `similar` can find real examples
- Do not assume the graph is stale without checking `diagnose` first

---

## Efficiency Comparison

| Task | Without MCP Tools | With MCP Tools |
|------|-------------------|----------------|
| Full workspace understanding | 10-20 tool calls, 2+ minutes | 1-3 MCP calls, <10 seconds |
| Find a component | Grep + Read + Grep | 1 `find` call |
| Understand impact | Manual trace across files | 1 `impact` call |
| Check all usages | Grep with regex | 1 `usages` call |
| Learn codebase patterns | Read many files | 1 `similar` call |

---

## Tool Parameter Reference

For complete parameter schemas (required/optional fields, types, defaults), see:
- Cursor users: `.cursor/skills/workspace-recon/references/tool-schemas.md`
- All users: the MCP tool descriptors served by the running ste-runtime MCP server

---

## Related Documentation

- [RECON-README.md](./RECON-README.md) -- Building the semantic graph
- [RSS-USAGE-GUIDE.md](./RSS-USAGE-GUIDE.md) -- CLI interface for human developers
- [RSS-PROGRAMMATIC-API.md](./RSS-PROGRAMMATIC-API.md) -- TypeScript API for programmatic access
