# Troubleshooting Guide

Common issues and solutions for ste-runtime.

---

## Table of Contents

- [Installation Issues](#installation-issues)
- [RECON Issues](#recon-issues)
- [RSS Query Issues](#rss-query-issues)
- [MCP Server Issues](#mcp-server-issues)
- [Watchdog Issues](#watchdog-issues)
- [Performance Issues](#performance-issues)
- [Configuration Issues](#configuration-issues)
- [Extractor Issues](#extractor-issues)
- [State Corruption](#state-corruption)

---

## Installation Issues

### "Cannot find module" Error

**Symptom:**
```
Error: Cannot find module 'ste-runtime'
Error: Cannot find module 'C:\Users\YourName\dist\cli\index.js'
```

**Causes:**
- ste-runtime not installed
- Wrong working directory
- Build not completed

**Solutions:**

1. **Install ste-runtime:**
   ```bash
   cd ste-runtime
   npm install
   npm run build
   ```

2. **Install globally:**
   ```bash
   npm install -g .
   ```

3. **Verify installation:**
   ```bash
   ste --version
   # Should show: 1.0.0
   ```

4. **Check PATH:**
   ```bash
   # Windows
   where.exe ste
   
   # macOS/Linux
   which ste
   ```

---

### Node.js Version Issues

**Symptom:**
```
Error: The engine "node" is incompatible with this module
```

**Cause:** Node.js version < 18.0.0

**Solution:**
```bash
# Check version
node --version

# Should be >= 18.0.0
# Upgrade Node.js if needed
```

---

## RECON Issues

### No Files Discovered

**Symptom:**
```
[RECON] Discovery: 0 files
```

**Causes:**
- Files in wrong directory
- Ignore patterns too broad
- Source directories not configured

**Solutions:**

1. **Check source directories:**
   ```json
   {
     "sourceDirs": ["src", "lib"]
   }
   ```

2. **Check ignore patterns:**
   ```json
   {
     "ignorePatterns": []
   }
   ```

3. **Run with verbose output:**
   ```bash
   ste recon --verbose
   ```

4. **Verify file locations:**
   - Files should be in `sourceDirs` or project root
   - Not in ignored directories (`node_modules`, `dist`, etc.)

---

### Python Extraction Fails

**Symptom:**
```
[RECON] Python extraction failed: spawn python3 ENOENT
```

**Causes:**
- Python not installed
- Python not in PATH
- Wrong Python version

**Solutions:**

1. **Check Python installation:**
   ```bash
   python3 --version
   # Should be Python 3.x
   ```

2. **Set PYTHON_BIN environment variable:**
   ```bash
   # Windows
   set PYTHON_BIN=C:\Python39\python.exe
   
   # macOS/Linux
   export PYTHON_BIN=/usr/bin/python3
   ```

3. **Verify python-scripts directory:**
   ```bash
   ls ste-runtime/python-scripts/ast_parser.py
   # Should exist
   ```

---

### TypeScript Compilation Errors

**Symptom:**
```
[RECON] TypeScript extraction failed: Syntax error
```

**Causes:**
- Invalid TypeScript syntax
- TypeScript version mismatch
- Missing dependencies

**Solutions:**

1. **Fix TypeScript errors:**
   ```bash
   cd your-project
   npm run build
   # Fix any compilation errors
   ```

2. **Check TypeScript version:**
   ```bash
   npx tsc --version
   ```

3. **Run RECON after fixing errors:**
   ```bash
   ste recon
   ```

---

### RECON Takes Too Long

**Symptom:**
```
[RECON] Running... (takes 30+ seconds)
```

**Causes:**
- Large codebase
- Too many files
- Network latency (Python subprocess)

**Solutions:**

1. **Use incremental mode:**
   ```bash
   ste recon  # Incremental (faster)
   # Instead of
   ste recon --mode=full  # Full (slower)
   ```

2. **Reduce source directories:**
   ```json
   {
     "sourceDirs": ["src"]  // Only scan essential directories
   }
   ```

3. **Add ignore patterns:**
   ```json
   {
     "ignorePatterns": ["**/test/**", "**/spec/**"]
   }
   ```

4. **Check performance benchmarks:**
   - See [Performance Benchmarks](../reference/performance-benchmarks.md)
   - Expected: ~9 seconds for 256 files

---

### State Directory Not Created

**Symptom:**
```
[RECON] Complete, but .ste/state/ is empty
```

**Causes:**
- Permission issues
- Disk space
- Invalid configuration

**Solutions:**

1. **Check permissions:**
   ```bash
   ls -la .ste/
   # Should be writable
   ```

2. **Check disk space:**
   ```bash
   df -h .  # macOS/Linux
   ```

3. **Verify stateDir configuration:**
   ```json
   {
     "stateDir": ".ste/state"
   }
   ```

4. **Run with verbose output:**
   ```bash
   ste recon --verbose
   # Look for error messages
   ```

---

## RSS Query Issues

### No Results from Search

**Symptom:**
```bash
$ ste rss search "authentication"
# Returns: No results found
```

**Causes:**
- Graph not generated
- Query too specific
- Graph out of sync

**Solutions:**

1. **Run RECON first:**
   ```bash
   ste recon
   ```

2. **Check graph stats:**
   ```bash
   ste rss stats
   # Should show components > 0
   ```

3. **Try broader query:**
   ```bash
   ste rss search "auth"  # Instead of "authentication handler"
   ```

4. **Verify state directory:**
   ```bash
   ls .ste/state/graph/
   # Should contain YAML files
   ```

---

### Graph Out of Sync

**Symptom:**
```
Query returns old results, missing new code
```

**Causes:**
- Code changed but RECON not run
- Watchdog disabled
- Incremental RECON failed

**Solutions:**

1. **Run RECON manually:**
   ```bash
   ste recon  # Incremental update
   ```

2. **Run full RECON:**
   ```bash
   ste recon --mode=full
   ```

3. **Enable watchdog:**
   ```json
   {
     "watchdog": {
       "enabled": true
     }
   }
   ```

4. **Check RECON logs:**
   ```bash
   ste recon --verbose
   # Look for errors
   ```

---

### Blast Radius Returns Empty

**Symptom:**
```bash
$ ste rss blast-radius graph/function/myFunction
# Returns: No dependencies found
```

**Causes:**
- Component has no relationships
- Graph edges not created
- Invalid component key

**Solutions:**

1. **Verify component exists:**
   ```bash
   ste rss lookup graph/function/myFunction
   # Should return component details
   ```

2. **Check relationships:**
   ```bash
   ste rss dependencies graph/function/myFunction
   # Should show dependencies
   ```

3. **Verify extractor created edges:**
   - Review extractor tests
   - See [PROJECT metadata](../../PROJECT.yaml)

4. **Check inference phase:**
   - Ensure imports/dependencies are extracted
   - See [Inference Phase Enhancements](../implementation/inference-phase-enhancements.md)

---

## MCP Server Issues

### MCP Server Not Starting

**Symptom:**
```
Cursor shows: "MCP server ste-runtime failed to start"
```

**Causes:**
- `ste` not in PATH
- Configuration error
- Port conflict

**Solutions:**

1. **Verify ste is in PATH:**
   ```bash
   # Windows
   where.exe ste
   
   # macOS/Linux
   which ste
   ```

2. **Test manually:**
   ```bash
   cd your-project
   ste watch --mcp
   # Should start without errors
   ```

3. **Check Cursor MCP configuration:**
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

4. **Check Cursor logs:**
   - Open Output panel in Cursor
   - Select "MCP user-ste-runtime"
   - Look for error messages

**See also:** [MCP Setup Guide](./mcp-setup.md) for detailed MCP troubleshooting.

---

### Tools Not Appearing in Cursor

**Symptom:**
```
MCP server running, but tools not visible in Cursor
```

**Causes:**
- Cursor not restarted
- MCP configuration error
- Server not initialized

**Solutions:**

1. **Restart Cursor completely:**
   - Quit application (not just window)
   - On Windows: Check Task Manager for remaining processes
   - Restart Cursor

2. **Verify MCP status:**
   - Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Type "MCP"
   - Check server status

3. **Check server logs:**
   - Output panel → "MCP user-ste-runtime"
   - Look for initialization errors

4. **Verify configuration:**
   ```json
   {
     "mcpServers": {
       "ste-runtime": {
         "disabled": false  // Must be false
       }
     }
   }
   ```

---

### MCP Server Crashes

**Symptom:**
```
MCP server starts then immediately crashes
```

**Causes:**
- Invalid configuration
- Missing state directory
- Graph corruption

**Solutions:**

1. **Check configuration:**
   ```bash
   # Validate ste.config.json
   node -e "require('./ste.config.json')"
   ```

2. **Run RECON first:**
   ```bash
   ste recon
   # Ensure state exists
   ```

3. **Check state directory:**
   ```bash
   ls .ste/state/
   # Should exist and contain graph files
   ```

4. **Run with debug logging:**
   ```json
   {
     "mcp": {
       "logLevel": "debug"
     }
   }
   ```

---

## Watchdog Issues

### Watchdog Not Triggering RECON

**Symptom:**
```
Files change but RECON doesn't run
```

**Causes:**
- Watchdog disabled
- Files not watched
- Debounce too long

**Solutions:**

1. **Enable watchdog:**
   ```json
   {
     "watchdog": {
       "enabled": true
     }
   }
   ```

2. **Check watched patterns:**
   ```json
   {
     "watchdog": {
       "patterns": ["**/*.ts", "**/*.py"]
     }
   }
   ```

3. **Reduce debounce:**
   ```json
   {
     "watchdog": {
       "debounceMs": 300  // Faster response
     }
   }
   ```

4. **Check watchdog status:**
   ```bash
   # Watchdog logs show file changes
   ste watch --mcp
   # Should show: [Watchdog] File change detected
   ```

---

### Too Many RECON Triggers

**Symptom:**
```
RECON runs constantly, system overloaded
```

**Causes:**
- Debounce too short
- AI edit detection not working
- Transaction detection disabled

**Solutions:**

1. **Increase debounce:**
   ```json
   {
     "watchdog": {
       "debounceMs": 1000,
       "aiEditDebounceMs": 3000
     }
   }
   ```

2. **Enable transaction detection:**
   ```json
   {
     "watchdog": {
       "transactionDetection": true
     }
   }
   ```

3. **Narrow watch patterns:**
   ```json
   {
     "watchdog": {
       "patterns": ["**/*.ts"]  // Only TypeScript
     }
   }
   ```

4. **Disable watchdog if not needed:**
   ```json
   {
     "watchdog": {
       "enabled": false
     }
   }
   ```

---

### Watchdog Not Detecting Changes

**Symptom:**
```
Files change but watchdog doesn't detect them
```

**Causes:**
- Files in ignored directories
- Network drive (needs polling)
- File watcher limitations

**Solutions:**

1. **Check ignore patterns:**
   ```json
   {
     "watchdog": {
       "ignore": [".git", "node_modules"]  // Not your source dirs
     }
   }
   ```

2. **Enable polling for network drives:**
   ```json
   {
     "watchdog": {
       "fallbackPolling": true,
       "pollingInterval": 5000
     }
   }
   ```

3. **Verify file patterns:**
   ```json
   {
     "watchdog": {
       "patterns": ["**/*.ts", "**/*.py"]  // Match your files
     }
   }
   ```

---

## Performance Issues

### RECON Too Slow

**Symptom:**
```
RECON takes >30 seconds for small codebase
```

**Causes:**
- Too many files
- Python subprocess overhead
- Network latency

**Solutions:**

1. **Use incremental mode:**
   ```bash
   ste recon  # Only processes changed files
   ```

2. **Reduce file count:**
   ```json
   {
     "ignorePatterns": ["**/test/**", "**/spec/**"]
   }
   ```

3. **Check performance:**
   - See [Performance Benchmarks](../reference/performance-benchmarks.md)
   - Expected: ~9 seconds for 256 files

4. **Profile RECON:**
   ```bash
   ste recon --verbose
   # Look for slow phases
   ```

---

### RSS Queries Slow

**Symptom:**
```
RSS queries take >1 second
```

**Causes:**
- Large graph
- Deep traversal
- Too many results

**Solutions:**

1. **Reduce max results:**
   ```json
   {
     "rss": {
       "maxResults": 25  // Instead of 50
     }
   }
   ```

2. **Reduce traversal depth:**
   ```json
   {
     "rss": {
       "defaultDepth": 1  // Instead of 2
     }
   }
   ```

3. **Use more specific queries:**
   ```bash
   ste rss search "UserService"  # Specific
   # Instead of
   ste rss search "service"  # Too broad
   ```

4. **Check graph size:**
   ```bash
   ste rss stats
   # Large graphs (>10k nodes) may be slower
   ```

---

### High Memory Usage

**Symptom:**
```
ste-runtime uses >500MB memory
```

**Causes:**
- Large graph in memory
- Watchdog watching many files
- Multiple RECON processes

**Solutions:**

1. **Disable watchdog if not needed:**
   ```json
   {
     "watchdog": {
       "enabled": false
     }
   }
   ```

2. **Reduce watched files:**
   ```json
   {
     "watchdog": {
       "patterns": ["**/*.ts"]  // Only essential files
     }
   }
   ```

3. **Reduce graph size:**
   ```json
   {
     "ignorePatterns": ["**/test/**", "**/spec/**"]
   }
   ```

---

## Configuration Issues

### Invalid Configuration Error

**Symptom:**
```
[STE Config] Error: Invalid configuration
```

**Causes:**
- JSON syntax error
- Invalid option values
- Missing required fields

**Solutions:**

1. **Validate JSON syntax:**
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('ste.config.json'))"
   ```

2. **Check option values:**
   - `languages`: Must be from supported list
   - `watchdog.debounceMs`: Must be number
   - `mcp.logLevel`: Must be "error"|"warn"|"info"|"debug"

3. **See configuration reference:**
   - [Configuration Reference](./configuration-reference.md)

4. **Use default config:**
   ```bash
   ste recon --init
   # Generates valid default config
   ```

---

### Configuration Not Applied

**Symptom:**
```
Changes to ste.config.json not taking effect
```

**Causes:**
- Wrong file location
- JSON syntax error
- Cache issues

**Solutions:**

1. **Verify file location:**
   ```bash
   # Should be in project root
   ls ste.config.json
   ```

2. **Restart processes:**
   ```bash
   # Stop MCP server
   # Restart Cursor
   ```

3. **Check for syntax errors:**
   ```bash
   node -e "require('./ste.config.json')"
   ```

---

## Extractor Issues

### Extractor Not Running

**Symptom:**
```
[RECON] No slices created for language X
```

**Causes:**
- Language not in config
- No files of that type
- Extractor error

**Solutions:**

1. **Check language configuration:**
   ```json
   {
     "languages": ["typescript", "python"]
   }
   ```

2. **Verify files exist:**
   ```bash
   find . -name "*.py"  # Python files
   find . -name "*.ts"  # TypeScript files
   ```

3. **Check extractor logs:**
   ```bash
   ste recon --verbose
   # Look for extractor errors
   ```

---

### Missing Graph Edges

**Symptom:**
```
Components exist but no relationships/edges
```

**Causes:**
- Inference phase bug
- Extractor not emitting relationships
- Validation tests failing

**Solutions:**

1. **Run extractor validation:**
   ```bash
   npm test -- src/extractors/
   ```

2. **Check inference phase:**
   - See [Inference Phase Enhancements](../implementation/inference-phase-enhancements.md)

3. **Verify extractor emits relationships:**
   - See [Inference Phase Enhancements](../implementation/inference-phase-enhancements.md)
   - See [PROJECT metadata](../../PROJECT.yaml)

---

## State Corruption

### Corrupted State Directory

**Symptom:**
```
[RECON] Error: Failed to load graph
```

**Causes:**
- Manual edits to YAML files
- Disk corruption
- Interrupted RECON

**Solutions:**

1. **Delete and regenerate:**
   ```bash
   rm -rf .ste/state/
   ste recon --mode=full
   ```

2. **RECON self-heals:**
   - Phase 6 automatically detects and fixes corruption
   - See [Self-Healing Implementation](../reference/phase-6-self-healing-implementation.md)

3. **Check disk space:**
   ```bash
   df -h .  # macOS/Linux
   ```

---

### Orphaned Slices

**Symptom:**
```
[RECON] Orphaned slices: 50
```

**Causes:**
- Source files deleted
- Files moved/renamed
- Normal during cleanup

**Solutions:**

1. **This is normal:**
   - Orphaned slices are automatically removed
   - No action needed

2. **If persistent:**
   ```bash
   ste recon --mode=full
   # Full recon cleans up orphans
   ```

---

## Getting Help

If you encounter an issue not covered here:

1. **Check logs:**
   ```bash
   ste recon --verbose
   ste watch --mcp  # For MCP issues
   ```

2. **Review documentation:**
   - [Configuration Reference](./configuration-reference.md)
   - [MCP Setup Guide](./mcp-setup.md)
   - [RECON README](../instructions/RECON-README.md)

3. **Check ADRs:**
   - [ADR Directory](../../adrs/)
   - [Rendered ADR Docs](../../adrs/rendered/)

4. **Report issues:**
   - Include full error messages
   - Include configuration (sanitized)
   - Include ste-runtime version: `ste --version`

---

## Common Error Messages

### "CRITICAL BOUNDARY VIOLATION"

**Meaning:** RECON attempted to scan outside project root

**Solution:** See [Boundary Enforcement](../security/boundary-enforcement.md)

---

### "Failed to load current AI-DOC graph. Falling back to full recon."

**Meaning:** Incremental RECON failed, using full recon

**Solution:** This is automatic recovery. If persistent, check state directory.

---

### "Extractor failure: [language]"

**Meaning:** Language extractor encountered an error

**Solution:** Check source files for syntax errors, verify extractor is working.

---

**Last Updated:** 2026-01-11


