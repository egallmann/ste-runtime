# Configuration Reference

Complete reference for `ste.config.json` configuration options.

## Overview

ste-runtime is designed to work **zero-configuration** by default. The `ste.config.json` file is automatically generated on initialization with sensible defaults. You can modify it afterwards to customize behavior.

## Configuration File Location

**Default:** `ste.config.json` in project root (where `package.json`, `pyproject.toml`, or `.git` is located)

**For ste-runtime self-analysis:** `ste-runtime/ste.config.json` (config lives inside ste-runtime for self-containment)

## Quick Start

**Auto-generation:**
- `ste.config.json` is automatically created on initialization
- You can modify it afterwards to customize behavior

**Manual generation (if needed):**

```bash
ste recon --init
# or
npm run recon:init
```

This creates `ste.config.json` with sensible defaults for your project.

---

## Configuration Schema

### Top-Level Options

```json
{
  "languages": ["typescript", "python"],
  "sourceDirs": ["src", "lib"],
  "ignorePatterns": ["**/generated/**"],
  "stateDir": ".ste/state",
  "runtimeDir": "ste-runtime",
  "jsonPatterns": { ... },
  "angularPatterns": { ... },
  "cssPatterns": { ... },
  "watchdog": { ... },
  "mcp": { ... },
  "rss": { ... }
}
```

---

## Core Configuration

### `languages`

**Type:** `string[]`  
**Default:** Auto-detected based on file presence  
**Options:** `"typescript"`, `"python"`, `"cloudformation"`, `"json"`, `"angular"`, `"css"`

Specifies which languages to extract. If omitted, ste-runtime auto-detects based on files in your project.

**Example:**
```json
{
  "languages": ["typescript", "python", "cloudformation"]
}
```

**Note:** Auto-detection works for most projects. Only specify if you want to exclude certain languages.

---

### `sourceDirs`

**Type:** `string[]`  
**Default:** Entire project (excluding common ignore patterns)

Source directories to scan, relative to project root. If omitted, ste-runtime scans the entire project.

**Example:**
```json
{
  "sourceDirs": ["src", "lib", "app"]
}
```

**Built-in ignores:** `node_modules`, `dist`, `build`, `.git`, `.ste`, `venv`, `__pycache__`, `ste-runtime` are always ignored.

---

### `ignorePatterns`

**Type:** `string[]`  
**Default:** `[]`

Additional glob patterns to ignore during file discovery. Added to built-in ignore patterns.

**Example:**
```json
{
  "ignorePatterns": [
    "**/generated/**",
    "**/migrations/**",
    "**/test-fixtures/**"
  ]
}
```

**Pattern format:** Uses glob patterns (e.g., `**/*.test.ts`, `**/vendor/**`)

---

### `stateDir`

**Type:** `string`  
**Default:** `".ste/state"`

Directory where AI-DOC state is written, relative to project root.

**Example:**
```json
{
  "stateDir": ".ste/state"
}
```

**Note:** This directory contains generated YAML files. Should be added to `.gitignore`.

---

### `runtimeDir`

**Type:** `string`  
**Default:** Auto-detected

Path to ste-runtime directory, relative to project root. Usually auto-detected, but can be specified if needed.

**Example:**
```json
{
  "runtimeDir": "ste-runtime"
}
```

---

## Language-Specific Patterns

### `jsonPatterns`

**Type:** `object`  
**Default:** `{}`  
**Authority:** E-ADR-005

Configures which JSON files to extract as semantic entities.

**Options:**
- `controls` - Pattern for control/rule catalogs (e.g., `"**/controls/*.json"`)
- `schemas` - Pattern for data schemas (e.g., `"**/schemas/*.json"`)
- `parameters` - Pattern for deployment parameters (e.g., `"**/parameters/*.json"`)

**Example:**
```json
{
  "jsonPatterns": {
    "controls": "**/controls/**/*.json",
    "schemas": "**/schemas/**/*.json",
    "parameters": "**/parameters/**/*.json"
  }
}
```

**Note:** If patterns are not specified, JSON extraction is disabled.

---

### `angularPatterns`

**Type:** `object`  
**Default:** `{}`  
**Authority:** E-ADR-006

Configures Angular component, service, and template discovery.

**Options:**
- `components` - Pattern for component files (default: `"**/*.component.ts"`)
- `services` - Pattern for service files (default: `"**/*.service.ts"`)
- `templates` - Pattern for template files (default: `"**/*.component.html"`)

**Example:**
```json
{
  "angularPatterns": {
    "components": "**/*.component.ts",
    "services": "**/*.service.ts",
    "templates": "**/*.component.html"
  }
}
```

**Note:** Defaults work for standard Angular projects. Only customize if using non-standard naming.

---

### `cssPatterns`

**Type:** `object`  
**Default:** `{}`  
**Authority:** E-ADR-006

Configures CSS/SCSS style and design token extraction. This is a cross-cutting extractor that works with or without Angular.

**Options:**
- `styles` - Pattern for style files (default: `"**/*.{css,scss,sass}"`)
- `designTokens` - Pattern for design token files (default: `"**/tokens/**/*.{css,scss,sass}"`)

**Example:**
```json
{
  "cssPatterns": {
    "styles": "**/*.{css,scss,sass}",
    "designTokens": "**/tokens/**/*.{css,scss,sass}"
  }
}
```

---

## Watchdog Configuration

**Type:** `object`  
**Default:** `{ "enabled": false }`  
**Authority:** E-ADR-011

Configures file watching and automatic RECON triggering.

### `watchdog.enabled`

**Type:** `boolean`  
**Default:** `false`

Enable automatic file watching and incremental RECON on file changes.

**Example:**
```json
{
  "watchdog": {
    "enabled": true
  }
}
```

**Note:** Watchdog is **opt-in** and disabled by default. Enable only when needed.

---

### `watchdog.debounceMs`

**Type:** `number`  
**Default:** `500`

Debounce time in milliseconds for manual file edits. Waits for this duration after the last file change before triggering RECON.

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "debounceMs": 500
  }
}
```

**Recommendation:** 300-500ms for small projects, 500-1000ms for large projects.

---

### `watchdog.aiEditDebounceMs`

**Type:** `number`  
**Default:** `2000`

Debounce time in milliseconds for AI-generated edits (detected via streaming patterns). Longer than manual edits to handle Cursor's rapid save behavior.

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "aiEditDebounceMs": 2000
  }
}
```

**Recommendation:** 2000ms handles most AI edit patterns. Increase to 3000ms if experiencing too many RECON triggers.

---

### `watchdog.syntaxValidation`

**Type:** `boolean`  
**Default:** `true`

Enable syntax validation before triggering RECON. Skips RECON if files have syntax errors (prevents broken state).

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "syntaxValidation": true
  }
}
```

**Recommendation:** Keep enabled to prevent processing invalid code.

---

### `watchdog.transactionDetection`

**Type:** `boolean`  
**Default:** `true`

Enable multi-file transaction detection. Waits for transaction completion before triggering RECON (batches related file changes).

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "transactionDetection": true
  }
}
```

**Recommendation:** Keep enabled to batch refactoring operations.

---

### `watchdog.stabilityCheckMs`

**Type:** `number`  
**Default:** `100`

Time in milliseconds to wait for file writes to complete before processing.

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "stabilityCheckMs": 100
  }
}
```

**Recommendation:** 100ms works for most systems. Increase to 200ms for slow network drives.

---

### `watchdog.patterns`

**Type:** `string[]`  
**Default:** `["**/*.py", "**/*.ts", "**/*.js", "**/*.tsx", "**/*.jsx"]`

File patterns to watch for changes.

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "patterns": [
      "**/*.ts",
      "**/*.tsx",
      "**/*.py",
      "**/*.yaml",
      "**/*.json"
    ]
  }
}
```

**Note:** Only watch files that affect semantic extraction. Don't watch generated files.

---

### `watchdog.ignore`

**Type:** `string[]`  
**Default:** `[".git", "node_modules", ".venv", "__pycache__", "dist", "build"]`

Directories to ignore when watching files.

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "ignore": [
      ".git",
      "node_modules",
      ".venv",
      "__pycache__",
      "dist",
      "build",
      "coverage"
    ]
  }
}
```

---

### `watchdog.fullReconciliationInterval`

**Type:** `number`  
**Default:** `0` (disabled)

Interval in milliseconds for periodic full reconciliation. Set to `0` to disable.

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "fullReconciliationInterval": 300000
  }
}
```

**Recommendation:** 300000ms (5 minutes) for active development, 0 for production.

---

### `watchdog.fallbackPolling`

**Type:** `boolean`  
**Default:** `false`

Use polling instead of native file watching (for network drives or systems where native watching fails).

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "fallbackPolling": true,
    "pollingInterval": 5000
  }
}
```

**Note:** Polling uses more CPU. Only enable if native watching doesn't work.

---

### `watchdog.pollingInterval`

**Type:** `number`  
**Default:** `5000`

Polling interval in milliseconds when `fallbackPolling` is enabled.

**Example:**
```json
{
  "watchdog": {
    "enabled": true,
    "fallbackPolling": true,
    "pollingInterval": 5000
  }
}
```

---

## MCP Server Configuration

**Type:** `object`  
**Default:** `{ "transport": "stdio", "logLevel": "info" }`  
**Authority:** E-ADR-011

Configures Model Context Protocol server settings.

### `mcp.transport`

**Type:** `"stdio"`  
**Default:** `"stdio"`

Transport protocol for MCP communication. Currently only `stdio` is supported.

**Example:**
```json
{
  "mcp": {
    "transport": "stdio"
  }
}
```

---

### `mcp.logLevel`

**Type:** `"error" | "warn" | "info" | "debug"`  
**Default:** `"info"`

Logging verbosity for MCP server.

**Example:**
```json
{
  "mcp": {
    "logLevel": "debug"
  }
}
```

**Levels:**
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - Informational messages (default)
- `debug` - Detailed debugging output

---

## RSS Configuration

**Type:** `object`  
**Default:** `{ "stateRoot": ".ste/state", "defaultDepth": 2, "maxResults": 50 }`  
**Authority:** E-ADR-011

Configures semantic graph query defaults.

### `rss.stateRoot`

**Type:** `string`  
**Default:** `".ste/state"`

Path to AI-DOC state directory, relative to project root. Should match `stateDir` in core configuration.

**Example:**
```json
{
  "rss": {
    "stateRoot": ".ste/state"
  }
}
```

---

### `rss.defaultDepth`

**Type:** `number`  
**Default:** `2`

Default traversal depth for graph queries. The system adapts this based on your codebase structure.

**Example:**
```json
{
  "rss": {
    "defaultDepth": 2
  }
}
```

**Note:** Graph topology analysis automatically adjusts this. The configured value is a fallback.

---

### `rss.maxResults`

**Type:** `number`  
**Default:** `50`

Maximum number of results to return from queries.

**Example:**
```json
{
  "rss": {
    "maxResults": 100
  }
}
```

**Recommendation:** 50 for most projects, 100 for large codebases.

---

## Complete Example

```json
{
  "languages": ["typescript", "python", "cloudformation"],
  "sourceDirs": ["src", "lib", "infrastructure"],
  "ignorePatterns": [
    "**/generated/**",
    "**/migrations/**"
  ],
  "stateDir": ".ste/state",
  "jsonPatterns": {
    "controls": "**/controls/**/*.json",
    "schemas": "**/schemas/**/*.json"
  },
  "angularPatterns": {
    "components": "**/*.component.ts",
    "services": "**/*.service.ts"
  },
  "cssPatterns": {
    "styles": "**/*.{css,scss}",
    "designTokens": "**/tokens/**/*.scss"
  },
  "watchdog": {
    "enabled": true,
    "debounceMs": 500,
    "aiEditDebounceMs": 2000,
    "syntaxValidation": true,
    "transactionDetection": true,
    "stabilityCheckMs": 100,
    "patterns": ["**/*.ts", "**/*.tsx", "**/*.py"],
    "ignore": [".git", "node_modules", "dist", "build"],
    "fullReconciliationInterval": 300000,
    "fallbackPolling": false
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

---

## Configuration Validation

ste-runtime validates configuration on load. Invalid configuration will produce clear error messages:

```bash
[STE Config] Error: Invalid configuration
  - watchdog.debounceMs: Expected number, got string
  - languages[1]: "rust" is not a supported language
```

**Supported languages:** `typescript`, `python`, `cloudformation`, `json`, `angular`, `css`

---

## Environment Variables

Some settings can be overridden via environment variables:

- `STE_STATE_DIR` - Override `stateDir`
- `STE_RUNTIME_DIR` - Override `runtimeDir`
- `PYTHON_BIN` - Python executable path (for Python extraction)

---

## Configuration Precedence

1. **Environment variables** (highest priority)
2. **ste.config.json** (project root)
3. **Built-in defaults** (lowest priority)

---

## See Also

- [RECON README](../instructions/RECON-README.md) - RECON usage and configuration
- [MCP Setup Guide](./mcp-setup.md) - MCP server configuration
- [E-ADR-011](../e-adr/E-ADR-011-ste-runtime-MCP-Server.md) - MCP Server architecture

