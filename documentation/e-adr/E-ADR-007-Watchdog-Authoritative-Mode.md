# E-ADR-007: ste-runtime MCP Server (Workspace Boundary Operation)

**Status:** Accepted  
**Implementation:** In Progress  
**Date:** 2026-01-11 (Updated)  
**Author:** Erik Gallmann  
**Authority:** Exploratory ADR (Reversible)

> **Updated 2026-01-11:** Clarified that ste-runtime operates in Workspace Development Boundary (STE Architecture Section 3.1), not as "Authoritative Mode". Integrated with MCP protocol for Cursor integration.

---

## Context

Per STE Architecture (Section 3.1), STE operates across two distinct governance boundaries:
1. **Workspace Development Boundary** - Provisional state, soft + hard enforcement, post-reasoning validation
2. **Runtime Execution Boundary** - Canonical state, cryptographic enforcement, pre-reasoning admission control

This E-ADR defines ste-runtime's operation within the **Workspace Development Boundary**, where developers need a **live semantic graph** that stays fresh automatically during local development.

### Workspace Development Boundary (STE Architecture Section 3.1)

```
┌─────────────────────────────────────────────────────────────────┐
│              WORKSPACE DEVELOPMENT BOUNDARY                     │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    CURSOR (Governed)                    │   │
│   │  • MCP client                                           │   │
│   │  • Context assembly via RSS (ste-runtime MCP)           │   │
│   └────────────────────┬────────────────────────────────────┘   │
│                        │ MCP Protocol (stdio)                   │
│                        ▼                                        │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              ste-runtime MCP Server                     │   │
│   │  • File Watcher → Incremental RECON                     │   │
│   │  • In-Memory RSS Context                                │   │
│   │  • MCP Tools (RSS operations)                           │   │
│   └─────────────────────────────────────────────────────────┘   │
│                        │                                        │
│                        ▼                                        │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              .ste/state/ (AI-DOC)                       │   │
│   │  • Provisional state (pre-merge)                        │   │
│   │  • Updated by incremental RECON                         │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**State Type:** Provisional, experimental (uncommitted, feature branches)  
**Authority:** Source code is truth → RECON extracts → AI-DOC (local, pre-merge)  
**Enforcement:** Soft (LLM) + Hard (validation tools + human approval)  
**Validation:** Post-reasoning (toolchain catches violations)

---

## Decision

**Updated 2026-01-11**: Implement ste-runtime as a unified MCP server operating in the Workspace Development Boundary.

### Core Architecture

**ste-runtime is a single process that combines:**
1. **File Watcher** - Monitors project files, triggers incremental RECON on changes
2. **Incremental RECON Engine** - Maintains fresh AI-DOC state (O(changed files))
3. **In-Memory RSS Context** - Fast semantic graph queries (<100ms)
4. **MCP Server** - Exposes RSS operations as tools for Cursor integration

### MCP Integration (Primary Interface)

**Decision:** Use MCP (Model Context Protocol) as the primary interface, not HTTP REST API.

**Rationale:**
- Native Cursor integration (stdio transport)
- Tool auto-discovery (Cursor sees available tools automatically)
- Schema validation (MCP enforces input/output schemas)
- Standardized protocol (works with any MCP-compatible AI assistant)

**MCP Tools Exposed:**
- `search_semantic_graph` - Entry point discovery
- `get_dependencies` - Forward traversal
- `get_dependents` - Backward traversal
- `get_blast_radius` - Full impact surface
- `assemble_context` - CEM Stage 2 (State Loading)
- `lookup`, `by_tag`, `get_graph_stats` - Additional RSS operations

### Workspace Boundary Operation

**Authority Model:**
- **Source code** is the single source of truth
- **RECON** extracts semantic state authoritatively
- **AI-DOC** is derived artifact (like compiled code)
- **ste-runtime** serves provisional state (pre-merge, local)

**NOT Canonical State:**
- ste-runtime does NOT operate in Runtime Execution Boundary
- ste-runtime does NOT provide cryptographic attestation (that's Fabric's role)
- ste-runtime does NOT enforce pre-reasoning admission control (that's Gateway's role)
- ste-runtime serves **provisional state** for local development

### CLI Commands

```bash
# Start MCP server with file watching
ste watch

# One-shot RECON (no server)
ste recon [--incremental]

# Query operations (hits running server if available, else reads from disk)
ste query <command> [args]
```

---

**Key Clarifications (2026-01-11):**

1. **Workspace vs Runtime Boundaries:**
   - ste-runtime operates in **Workspace Boundary** (provisional state, local development)
   - Fabric/Gateway operate in **Runtime Boundary** (canonical state, cryptographic enforcement)
   - These are different trust models for different use cases

2. **Authority Scope:**
   - ste-runtime is authoritative for **project-level state** (pre-merge, feature branches)
   - Source code → RECON → AI-DOC (local extraction)
   - NOT authoritative for org-wide canonical state (that's ADF/Fabric)

3. **MCP as Primary Interface:**
   - Enables CEM Stage 2 (State Loading) for Cursor
   - Deterministic context assembly via RSS graph traversal
   - Replaces probabilistic semantic search with explicit state

---

## Rationale

### The Watchdog IS the Conflict Resolution Process

When a file moves:
1. Watchdog detects the move (authoritative: it observed the file system event)
2. Migration detection scores confidence (1.0 = certain same element)
3. High confidence → Watchdog resolves automatically (correct resolution)
4. Low confidence → Surfaces to human (ambiguous, needs judgment)

This is correct because:
-  Watchdog has ground truth (observed actual file system changes)
-  Migration detection is deterministic (same inputs → same decision)
-  Confidence thresholds ensure safety (humans review ambiguous cases)
-  Developer opts in (explicit choice to delegate authority)

### Slice Files Are Derived Artifacts

```
Source of Truth:
  user-panel.component.ts (source code)
  
Derived Artifact:
  .ste/state/frontend/component/component-abc123.yaml (slice)
  
Relationship:
  Source → RECON → Slice (one-way)
```

**Like:** `src/app.ts` → `dist/app.js` (compiled)

If you manually edit `dist/app.js`, the compiler overwrites it on next build.  
If you manually edit a slice file, watchdog overwrites it on next RECON (self-healing).

---

## Authority Scope

**Updated 2026-01-07**: Clarified project-level vs. organization-level authority boundaries.

### Two Levels of Semantic Authority

```
┌─────────────────────────────────────────────────┐
│ PROJECT LEVEL (Pre-Merge)                       │
│ Authority: ste-runtime RECON                    │
│ Scope: Feature branches, local development      │
│ Visibility: Developer only (not org-wide)       │
│ Purpose: Help developer understand their changes│
└─────────────────────────────────────────────────┘
                      ↓
                 [git merge]
                 [CI/CD deploy]
                      ↓
┌─────────────────────────────────────────────────┐
│ ORGANIZATION LEVEL (Post-Merge/Deploy)          │
│ Authority: ADF (Authoritative Derived Facts)    │
│ Scope: main/master branch, deployed code        │
│ Visibility: Organization-wide                   │
│ Purpose: Cross-project semantic index           │
└─────────────────────────────────────────────────┘
```

### ste-runtime RECON IS Authoritative For:

**Scope: Project-level changes (pre-merge)**

-  Current working state ("What semantics exist in my feature branch RIGHT NOW?")
-  Pre-commit, uncommitted, unmerged code changes
-  Developer's local RSS query results (live graph of their changes)
-  File-to-element mappings in current project state
-  Reference relationships within the project
-  All slice files derived from **local source code**
-  **The changes RECON is suggesting** (before merge)

**Key principle:** RECON is authoritative for project-level semantic state. It extracts from the developer's current source code (which IS the truth for that project at that moment).

### ste-runtime RECON is NOT Authoritative For:

**Scope: Organization-level, merged/deployed state**

-  Merged/deployed semantic state (ADF's responsibility)
-  Cross-project semantic index (ADF publishes after merge)
-  Organization-wide documentation (generated from ADF)
-  Compliance artifacts (sourced from ADF)
-  Other developers' feature branches

**Key principle:** Project-level changes DO NOT appear in ADF until promoted (merged/deployed). This is correct—feature branches are invisible to the organization until merged.

### ADF (Authoritative Derived Facts) IS Authoritative For:

**Scope: Organization-level, post-merge/deploy**

-  Merged semantic state (main/master branch)
-  Deployed semantic state (production, staging)
-  Cross-project semantic relationships
-  Organization-wide semantic search/discovery
-  Published documentation
-  Compliance and audit artifacts

**Triggered by:** Merge to main, deployment to production, CI/CD pipeline completion

**Visibility:** All projects can query ADF to "get oriented" to merged changes

### Authority Handoff

```
Developer working on feature/add-angular-components:
  ├─ ste-runtime RECON: Authoritative for this branch
  ├─ Extracts Angular components from local source
  ├─ Developer queries RSS: "What components exist?"
  ├─ Answer: Based on current feature branch (pre-merge)
  └─ Changes NOT visible to other projects (correct)
        ↓
    [git merge to main]
        ↓
  CI/CD triggers ADF update:
  ├─ ADF extracts from merged code
  ├─ Publishes organization-wide semantic index
  ├─ Other projects can now discover new Angular components
  └─ ADF: Now authoritative for merged state
```

### Optional: RECON Pulling From ADF

**Use case:** Developer wants broader context while working locally

```
Developer working locally:
  ├─ ste-runtime RECON extracts from local source (authoritative)
  ├─ Optionally: RECON queries ADF for organization context
  │   └─ "What API endpoints exist in deployed backend?"
  │   └─ "What design tokens are in main branch?"
  ├─ RECON enriches local extraction with ADF context
  └─ BUT: Local source is still authority for project-level changes
```

**Key:** Even with ADF context, ste-runtime RECON remains authoritative for **the changes it's suggesting** based on local source code.

---

**Boundary Summary:**

| Aspect | ste-runtime RECON (Project) | ADF (Organization) |
|--------|----------------------------|-------------------|
| **Authority** | Local source code (feature branch) | Merged/deployed code (main) |
| **Scope** | Pre-merge, single project | Post-merge, organization-wide |
| **Visibility** | Developer only | All projects |
| **Triggered by** | Developer runs `npm run recon` | Merge to main, deployment |
| **Purpose** | Understand current changes | Cross-project semantic index |
| **Changes visible** | Uncommitted, unmerged | Merged, deployed |

---

## Specification

### §1 Confidence-Based Authority

| Confidence | Action | Authority | Example |
|------------|--------|-----------|---------|
| **1.0** (Certain) | Auto-resolve immediately | **Watchdog** | File moved, content unchanged |
| **0.95-0.99** (Very High) | Auto-resolve, log decision | **Watchdog** | Same class name, selector, 95% content match |
| **0.80-0.94** (High) | Surface as high-confidence candidate | **Human** | Similar structure, different name |
| **0.50-0.79** (Medium) | Surface as possible match | **Human** | Some overlap, unclear intent |
| **< 0.50** (Low) | Treat as unrelated changes | **Watchdog** | Different types, no similarity |

### §2 Self-Healing Property

**Watchdog monitors ALL files, including slice files.**

When slice file changes:
1. Check: Was this watchdog's own write? (ignore if yes)
2. Check: Does content match recent write? (ignore if yes)
3. External modification detected → **Heal from source**
4. Regenerate slice from source code (authoritative)
5. Overwrite manually edited slice

**Result:** Slice files always reflect current source code. Manual edits don't persist.

**Developer guidance:**
-  Edit source code (watchdog updates slices automatically)
-  Don't edit slices directly (they'll be overwritten)

### §3 Watchdog Architecture

```
┌─────────────────────────────────────────────────────────┐
│  ste-runtime (Self-Contained)                           │
│                                                          │
│  ┌────────────────┐                                     │
│  │  Watchdog      │  ← Long-running process             │
│  │  Process       │                                     │
│  └────────────────┘                                     │
│         │                                               │
│         ├──► File System Watcher (chokidar)            │
│         │    - Monitors parent project                 │
│         │    - Debounces changes (wait 500ms)          │
│         │    - Filters by language relevance           │
│         │                                               │
│         ├──► Incremental RECON Trigger                 │
│         │    - Runs extraction on changed files only   │
│         │    - Applies migrations automatically        │
│         │    - Surfaces conflicts (non-blocking)       │
│         │                                               │
│         └──► RSS Graph Reloader                        │
│              - Notifies RSS server (IPC or HTTP)       │
│              - RSS reloads slices from disk            │
│              - Graph is now fresh                      │
│                                                          │
│  ┌────────────────┐                                     │
│  │  RSS Server    │  ← HTTP API or Unix socket         │
│  │  (optional)    │                                     │
│  └────────────────┘                                     │
└─────────────────────────────────────────────────────────┘
           │
           │ Monitors (read-only)
           ▼
┌─────────────────────────────────────────────────────────┐
│  Parent Project (your-project)                          │
│  - frontend/src/**/*.ts                                 │
│  - backend/lambda/**/*.py                               │
│  - backend/cloudformation/**/*.yaml                     │
│  (Source code - never modified by ste-runtime)          │
└─────────────────────────────────────────────────────────┘
```

### §4 Resilience Mechanisms

#### §4.1 Write Tracking (Prevent Infinite Loops)

**Problem:** Watchdog writes slice → file change event → watchdog detects change → infinite loop

**Solution:** Content-hash based write tracking

```typescript
// Record write with content hash
writeTracker.recordWrite(filepath, content);

// On file change:
const currentContent = await fs.readFile(filepath);
const currentHash = hash(currentContent);

if (currentHash === recordedHash) {
  return;  // Ignore - this is our own write
}

// External modification - proceed with healing
```

**Key properties:**
-  Content-based, not timestamp-based (no race conditions)
-  Path normalization (handles relative/absolute/symlinks)
-  Longer retention window (30 seconds, tolerates event delays)

#### §4.2 Update Coordination (Prevent Cascading Loops)

**Problem:** Source change triggers RECON → updates slice A → inference updates slices B, C, D → triggers healing for B, C, D → cascading updates

**Solution:** Generation-based update tracking

```typescript
// Start update batch
const generation = updateCoordinator.startUpdate([sourceFile]);

// Run RECON, record all affected slices
const results = await runIncrementalRECON([sourceFile]);
for (const slice of results.written) {
  updateCoordinator.recordSliceWrite(generation, slice.filepath);
}

// Complete batch
updateCoordinator.completeUpdate(generation);

// On file change:
if (updateCoordinator.isFromActiveUpdate(sliceFilepath)) {
  return;  // Ignore - part of active update batch
}
```

**Key properties:**
-  Tracks entire update batch (not just individual writes)
-  Ignores transitive updates (inference-driven slice changes)
-  Short retention window (clears after update completes)

#### §4.3 Periodic Full Reconciliation (Recover from Event Loss)

**Problem:** File system watchers have buffer limits. During high activity (git checkout, npm install), events can be lost.

**Solution:** Periodic full reconciliation (every 5 minutes)

```typescript
// Background task:
setInterval(async () => {
  // Compute source file checksums
  const sourceChecksums = await computeAllSourceChecksums();
  
  // Compare to slice provenance checksums
  const staleSlices = findStaleSlices(sourceChecksums);
  
  if (staleSlices.length > 0) {
    console.warn(`Found ${staleSlices.length} stale slices, regenerating...`);
    await runIncrementalRECON(staleSlices.map(s => s.sourceFile));
  }
}, 5 * 60 * 1000);  // 5 minutes
```

**Key properties:**
-  Detects missed file system events
-  Self-correcting (automatically heals stale state)
-  Low frequency (acceptable overhead)
-  Non-blocking (runs in background)

**Prerequisite:** Store source checksum in slice provenance:

```yaml
_slice:
  id: "component:angular:app-user-panel"
  source_files: ["frontend/.../user-panel.component.ts"]
provenance:
  extracted_at: "2026-01-07T20:00:00Z"
  source_checksum: "a7f3e9d2b8c1..."  # SHA-256 of source file
  extractor_version: "0.2.0"
```

#### §4.4 Update Queue with Version Tracking (Handle Rapid Changes)

**Problem:** Developer saves file multiple times rapidly while RECON is processing. Cursor AI may generate code with streaming edits (10+ saves during generation).

**Solution:** Multi-layer debouncing with syntax validation and transaction detection

```typescript
class EditQueueManager {
  private pendingEdits: Map<string, EditRecord> = new Map();
  private transactionDetector = new TransactionDetector();
  
  async handleFileChange(filePath: string) {
    // 1. Record the edit for transaction detection
    this.transactionDetector.recordEdit(filePath);
    
    // 2. Update or create edit record
    const existing = this.pendingEdits.get(filePath);
    if (existing) {
      existing.version++;
      existing.lastChange = Date.now();
    } else {
      this.pendingEdits.set(filePath, {
        path: filePath,
        version: 1,
        lastChange: Date.now(),
        source: 'unknown'
      });
    }
    
    // 3. Schedule processing (will be debounced)
    this.scheduleProcessing(filePath);
  }
  
  async scheduleProcessing(filePath: string) {
    const record = this.pendingEdits.get(filePath);
    if (!record) return;
    
    // 4. Detect edit source (AI vs manual)
    record.source = this.detectEditSource(filePath);
    const debounce = this.getDebounceTimeout(record.source);
    
    // 5. Wait for debounce period
    await sleep(debounce);
    
    // 6. Check if newer version exists (coalesce)
    const current = this.pendingEdits.get(filePath);
    if (!current || current.version !== record.version) {
      return; // Newer version exists, skip this one
    }
    
    // 7. Check for multi-file transaction
    if (this.transactionDetector.isPartOfTransaction()) {
      console.log('[Watchdog] Multi-file edit detected, waiting...');
      await this.transactionDetector.waitForComplete();
    }
    
    // 8. Verify file stability
    if (!await this.isFileStable(filePath)) {
      console.log('[Watchdog] File still changing, re-queuing...');
      this.scheduleProcessing(filePath); // Try again later
      return;
    }
    
    // 9. Validate syntax (skip broken code)
    if (!await this.validateSyntax(filePath)) {
      console.log('[Watchdog] Syntax error, skipping RECON');
      this.pendingEdits.delete(filePath);
      return;
    }
    
    // 10. NOW trigger RECON
    this.pendingEdits.delete(filePath);
    await runIncrementalRECON([filePath]);
  }
  
  detectEditSource(filePath: string): 'cursor' | 'manual' | 'unknown' {
    const recentChanges = this.getRecentChanges(filePath);
    
    // Cursor pattern: Multiple rapid large changes
    if (recentChanges.length > 5 && recentChanges.timespan < 3000) {
      return 'cursor';
    }
    
    return 'manual';
  }
  
  getDebounceTimeout(source: string): number {
    return source === 'cursor' ? 2000 : 500;
  }
  
  async isFileStable(filePath: string): Promise<boolean> {
    try {
      // Check mtime stability (file not being written)
      const mtime1 = (await fs.stat(filePath)).mtimeMs;
      await sleep(100);
      const mtime2 = (await fs.stat(filePath)).mtimeMs;
      
      return mtime1 === mtime2;
    } catch {
      return false;
    }
  }
  
  async validateSyntax(filePath: string): Promise<boolean> {
    const ext = path.extname(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    
    try {
      switch (ext) {
        case '.py':
          // Python syntax check (parse only, don't execute)
          const { exec } = await import('child_process');
          await new Promise((resolve, reject) => {
            exec(`python -m py_compile "${filePath}"`, (error) => {
              error ? reject(error) : resolve(null);
            });
          });
          return true;
        
        case '.ts':
        case '.tsx':
        case '.js':
        case '.jsx':
          // TypeScript/JavaScript syntax check
          const ts = await import('typescript');
          const result = ts.transpileModule(content, {
            compilerOptions: { noEmit: true, allowJs: true }
          });
          return !result.diagnostics || result.diagnostics.length === 0;
        
        default:
          // No validator available, assume valid
          return true;
      }
    } catch (error) {
      // Syntax error - skip this change
      return false;
    }
  }
}

class TransactionDetector {
  private recentEdits: Map<string, number> = new Map();
  
  recordEdit(filePath: string) {
    this.recentEdits.set(filePath, Date.now());
    
    // Cleanup old entries (>10 seconds)
    const cutoff = Date.now() - 10000;
    for (const [path, timestamp] of this.recentEdits.entries()) {
      if (timestamp < cutoff) {
        this.recentEdits.delete(path);
      }
    }
  }
  
  isPartOfTransaction(): boolean {
    // If 2+ files edited within 5 seconds, it's likely a transaction
    const now = Date.now();
    const recentFiles = Array.from(this.recentEdits.values())
      .filter(timestamp => now - timestamp < 5000);
    
    return recentFiles.length > 1;
  }
  
  async waitForComplete(): Promise<void> {
    // Wait until no edits for 2 seconds
    let lastEdit = Math.max(...this.recentEdits.values());
    
    while (Date.now() - lastEdit < 2000) {
      await sleep(500);
      const mostRecent = Math.max(...this.recentEdits.values());
      if (mostRecent > lastEdit) {
        lastEdit = mostRecent;
      }
    }
  }
}
```

**Key properties:**
-  **Syntax validation** - Skips files with parse errors (mid-edit)
-  **Edit source detection** - Longer debounce for AI-generated edits (2s vs 500ms)
-  **Transaction detection** - Waits for multi-file edits to complete
-  **File stability** - Ensures file is no longer being written
-  **Version coalescing** - Only processes latest version
-  **Adaptive debouncing** - Adjusts timeout based on edit pattern

#### §4.5 Atomic Writes with Cleanup (Prevent Partial Writes)

**Problem:** Write fails mid-operation, leaving temp files or corrupted slices.

**Solution:** Atomic write with temp file cleanup

```typescript
async function atomicWrite(filepath: string, content: string): Promise<void> {
  const tempFile = `${filepath}.tmp.${Date.now()}.${randomId()}`;
  
  try {
    await fs.writeFile(tempFile, content);
    await fs.rename(tempFile, filepath);  // Atomic on POSIX, mostly atomic on Windows
  } catch (error) {
    await fs.unlink(tempFile).catch(() => {});  // Cleanup on failure
    throw error;
  }
}

// Periodic cleanup of orphaned temp files (every 1 minute)
setInterval(async () => {
  const tempFiles = await glob('**/*.tmp.*', { cwd: stateDir });
  for (const tempFile of tempFiles) {
    const age = Date.now() - (await fs.stat(tempFile)).mtimeMs;
    if (age > 60_000) {  // Older than 1 minute
      await fs.unlink(tempFile);
    }
  }
}, 60_000);
```

#### §4.6 Bounded Memory (LRU Cache)

**Problem:** Write tracker and update coordinator store data indefinitely, causing memory leaks.

**Solution:** LRU cache with TTL

```typescript
import { LRUCache } from 'lru-cache';

const writeTracker = new LRUCache({
  max: 10000,      // Maximum 10k entries
  ttl: 30_000,     // Auto-expire after 30 seconds
  updateAgeOnGet: false
});
```

**Key properties:**
-  Bounded size (max 10k entries, typical project < 1000 files)
-  Auto-expiration (old entries removed automatically)
-  LRU eviction (removes least recently used if max exceeded)

### §5 Developer Experience

#### §5.1 Starting Watchdog

```bash
cd ste-runtime
npm run recon:watch

[RECON Watchdog] Monitoring: /your-project
[RECON Watchdog] Authority mode: AUTOMATIC (confidence ≥ 0.95)
[RECON Watchdog] Self-healing enabled
[RECON Watchdog] RSS server started on http://localhost:3000
```

#### §5.2 Cursor AI Edit Example

```bash
# User asks Cursor: "Add error handling to this function"

# Cursor generates code with streaming edits:
[Watchdog] Change detected: handler.py (edit 1/12)
[Watchdog] Change detected: handler.py (edit 2/12)
[Watchdog] Change detected: handler.py (edit 3/12)
... (Cursor streaming, multiple partial saves)
[Watchdog] AI edit pattern detected, debouncing 2000ms...
[Watchdog] Change detected: handler.py (edit 12/12)
[Watchdog] File stable, checking syntax...
[Watchdog] Syntax valid, triggering incremental RECON
[Watchdog] RECON complete (87ms), 1 module updated
[Watchdog] RSS graph reloaded

# Result: Only 1 RECON run (not 12!)
```

#### §5.3 Multi-File Transaction Example

```bash
# User asks Cursor: "Refactor authentication across backend"

# Cursor edits multiple files:
[Watchdog] Change detected: auth/handler.py
[Watchdog] Change detected: auth/middleware.py
[Watchdog] Change detected: auth/utils.py
[Watchdog] Multi-file transaction detected (3 files)
[Watchdog] Waiting for transaction to complete...
[Watchdog] No edits for 2s, transaction complete
[Watchdog] Validating syntax for 3 files...
[Watchdog] All files valid, triggering incremental RECON
[Watchdog] RECON complete (142ms), 3 modules updated

# Result: Only 1 RECON run for entire transaction!
```

#### §5.4 Syntax Error Handling Example

```bash
# Cursor generates code with temporary syntax error:
[Watchdog] Change detected: handler.py
[Watchdog] AI edit pattern detected, debouncing 2000ms...
[Watchdog] File stable, checking syntax...
[Watchdog] Syntax error detected (likely mid-edit), skipping RECON

# Cursor finishes edit, fixes syntax:
[Watchdog] Change detected: handler.py
[Watchdog] File stable, checking syntax...
[Watchdog] Syntax valid, triggering incremental RECON
[Watchdog] RECON complete (91ms)

# Result: RECON only runs on syntactically valid code
```

#### §5.5 Automatic Resolution Example

```bash
# Developer moves file:
mv frontend/src/app/features/user-panel/user-panel.component.ts \
   frontend/src/app/components/shared/user-panel.component.ts

# Watchdog responds:
[RECON Watchdog] Change detected: user-panel.component.ts MOVED
[RECON Watchdog] Migration detected (confidence: 1.0)
[RECON Watchdog] AUTO-RESOLVED: Path migration
  - Slice ID unchanged: component:angular:app-user-panel
  - Updated source_files metadata
  - No references broken
[RECON Watchdog] RSS graph reloaded (120ms)
```

#### §5.6 Low-Confidence Conflict Example

```bash
# Developer renames file and changes content:
mv utils.service.ts helpers.service.ts
# ... also changes class name ...

# Watchdog responds:
[RECON Watchdog] Change detected:
  - DELETED: utils.service.ts
  - CREATED: helpers.service.ts
[RECON Watchdog] Migration candidate detected (confidence: 0.82)
[RECON Watchdog]   LOW CONFIDENCE - Requires review
  - Conflict written to: .ste/state/conflicts/2026-01-07-20-15-33.yaml
  - Action: Run `npm run recon:resolve-conflict 2026-01-07-20-15-33`
[RECON Watchdog] Continuing... (1 conflict pending review)
```

#### §5.7 Self-Healing Example

```bash
# Developer (confused) edits slice directly:
vim .ste/state/frontend/component/component-abc123.yaml
# Makes some change, saves

# Watchdog responds:
[RECON Watchdog] 🏥 External slice modification detected: component-abc123.yaml
[RECON Watchdog] 🏥 Healing from source: user-panel.component.ts
[RECON Watchdog]  Slice healed successfully (45ms)
[RECON Watchdog]  Tip: Edit source files, not slices (slices are auto-generated)

# Developer's manual edit is gone (overwritten with correct data from source)
```

### §6 Configuration

```json
{
  "watchdog": {
    "enabled": false,
    "authorityMode": "automatic",
    "confidenceThresholds": {
      "autoResolve": 0.95,
      "surface": 0.80,
      "ignore": 0.50
    },
    "debounceMs": 500,
    "aiEditDebounceMs": 2000,
    "syntaxValidation": true,
    "transactionDetection": true,
    "stabilityCheckMs": 100,
    "batchSize": 10,
    "autoReloadRSS": true,
    "fullReconciliationInterval": 300000,
    "enableSelfHealing": true,
    "fallbackPolling": false,
    "pollingInterval": 5000
  }
}
```

**New Field Descriptions:**

- `aiEditDebounceMs` - Debounce timeout for AI-generated edits (default: 2000ms). Used when multiple rapid changes detected (Cursor streaming pattern).
- `syntaxValidation` - Skip RECON for files with syntax errors (default: true). Prevents processing mid-edit files.
- `transactionDetection` - Wait for multi-file edits to complete (default: true). Detects when Cursor edits multiple files together.
- `stabilityCheckMs` - Time to wait for file mtime stability check (default: 100ms). Ensures file is no longer being written.

### §7 Safeguards

#### §7.1 Watchdog Health Monitoring

```typescript
class WatchdogHealth {
  lastEventTime: number;
  lastRECONTime: number;
  lastFullReconciliation: number;
  
  checkHealth(): HealthStatus {
    const now = Date.now();
    
    if (now - this.lastEventTime > 10 * 60 * 1000) {
      return { healthy: false, reason: 'No file system events received' };
    }
    
    if (now - this.lastFullReconciliation > 10 * 60 * 1000) {
      return { healthy: false, reason: 'Full reconciliation overdue' };
    }
    
    return { healthy: true };
  }
}
```

#### §7.2 Graceful Degradation

```typescript
let consecutiveFailures = 0;

try {
  await processUpdate(file);
  consecutiveFailures = 0;
} catch (error) {
  consecutiveFailures++;
  
  if (consecutiveFailures > 10) {
    console.error(`[RECON Watchdog] Too many failures, disabling automatic mode.`);
    console.error(`Please run manual RECON to recover: npm run recon:full`);
    watchdog.disable();
  }
}
```

#### §7.3 Network/Cloud File System Detection

```typescript
const fsType = await detectFileSystemType(projectRoot);

if (fsType !== 'local') {
  console.warn(`
  WARNING: Non-Local File System Detected (${fsType})

Watchdog may experience:
- Delayed or duplicate file system events
- Event loss during high activity
- Conflicts with sync software

Recommendation:
- Use local file system for active development
- Fallback to manual RECON if issues occur
  `);
  
  // Enable fallback polling mode
  config.watchdog.fallbackPolling = true;
  config.watchdog.fullReconciliationInterval = 60_000;  // 1 minute
}
```

#### §7.4 Audit Log

All automatic decisions are logged:

```yaml
# .ste/state/watchdog/2026-01-07-session.yaml
session_start: "2026-01-07T19:00:00Z"
session_end: "2026-01-07T22:30:00Z"
migrations:
  - type: PATH_CHANGE
    sliceId: "component:angular:app-user-panel"
    oldPath: "frontend/.../features/user-panel/..."
    newPath: "frontend/.../components/shared/..."
    confidence: 1.0
    applied: true
    timestamp: "2026-01-07T19:15:00Z"
  - type: IDENTITY_UPGRADE
    oldId: "service:frontend/.../data.service.ts:DataService"
    newId: "service:angular:app.features.data.DataService"
    confidence: 0.95
    applied: true
    referencesUpdated: 12
    timestamp: "2026-01-07T20:00:00Z"
conflicts:
  - type: LOW_CONFIDENCE_MIGRATION
    candidateOldId: "service:...utils.service.ts:UtilsService"
    candidateNewId: "service:...helpers.service.ts:HelpersService"
    confidence: 0.82
    surfaced: true
    resolved: false
    timestamp: "2026-01-07T21:30:00Z"
stats:
  filesChanged: 47
  slicesUpdated: 52
  migrationsApplied: 2
  conflictsSurfaced: 1
  selfHealingEvents: 0
  fullReconciliations: 3
```

---

## Prerequisites

Before implementing watchdog, these foundational pieces must be stable:

1. **Incremental RECON** - Must be fast (<100ms for 1-5 file changes)
2. **Migration detection** - Must be accurate (>95% correct classifications)
3. **Stable semantic IDs** - Must survive file moves (path-independent IDs)
4. **RSS hot reloading** - Must reload graph without full restart
5. **Resource efficiency** - File watching with acceptable CPU/memory usage

---

## Non-Goals

-  Not a replacement for manual RECON (both modes coexist)
-  Not automatic publication to canonical state (ADF's responsibility)
-  Not cross-project synchronization
-  Not CI/CD integration (watchdog is for local development only)
-  Not automatic conflict resolution for low-confidence cases

---

## Implementation Phases

### Phase 1: Critical Safeguards (Must Have)
1. Content-hash based write tracking
2. Update coordinator (prevent cascading loops)
3. Periodic full reconciliation
4. Source checksum in slice provenance

### Phase 2: Important Features (Should Have)
5. Update queue with version tracking
6. LRU cache for trackers
7. Atomic write with cleanup
8. Self-healing on slice edits

### Phase 3: Nice-to-Have (Could Have)
9. File system type detection
10. Health monitoring
11. State consistency verification
12. RSS integration (hot reload notification)

---

## Success Criteria

### Functional Requirements

-  Watchdog detects file changes within 500ms
-  Incremental RECON completes in <100ms for 1-5 files
-  High-confidence migrations (≥0.95) auto-resolve correctly
-  Low-confidence migrations (<0.95) surface to human
-  Self-healing restores correct state from manual slice edits
-  No infinite loops under any scenario
-  Periodic reconciliation catches missed events
-  RSS graph stays fresh (reloads after updates)

### Non-Functional Requirements

-  Memory usage: <100MB while idle, <500MB under load
-  CPU usage: <1% while idle, <10% during updates
-  Disk I/O: <10 writes/second average
-  Event buffer: Handles 1000+ file changes without event loss
-  Reliability: <1 failure per 1000 updates
-  Developer experience: "Just works" without configuration

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| File system event loss | Stale state | Periodic full reconciliation (every 5 min) |
| Infinite loops | System unusable | Content-hash tracking + update coordinator |
| False positive migrations | Broken references | Confidence thresholds, human review for <0.95 |
| Memory leaks | Watchdog crashes | LRU cache with TTL, bounded data structures |
| Network file systems | Unreliable events | Detect and warn, fallback to polling |
| Partial writes | Corrupted slices | Atomic writes with temp file cleanup |
| Too many failures | Developer frustration | Graceful degradation, auto-disable after 10 failures |

---

## Future Work

### RSS Integration

When RSS is implemented, watchdog will notify RSS to reload graph:

```typescript
// After RECON completes:
await notifyRSS('graph-updated', {
  slicesUpdated: results.updated.length,
  slicesCreated: results.created.length,
  generation: currentGeneration
});

// RSS responds:
rss.reloadGraph();  // Reload from disk
console.log('[RSS] Graph reloaded, queries now reflect latest state');
```

### Language Server Protocol (LSP)

Future integration with VS Code, IntelliJ:
- Real-time semantic hints
- Jump-to-definition across languages
- Inline dependency visualization
- Conflict notifications in IDE

### Real-Time Query API

WebSocket or SSE for live updates:
```typescript
const ws = new WebSocket('ws://localhost:3000/rss/live');

ws.on('message', (event) => {
  if (event.type === 'slice-updated') {
    // UI refreshes automatically
  }
});
```

---

## Learning Log

### Open Questions

1. **Migration confidence calibration:** What is the empirical accuracy of 0.95 threshold?
2. **RSS reload performance:** How fast can RSS reload 10,000+ slices?
3. **Windows performance:** Is file watching reliable on Windows network drives?
4. **False positive rate:** How often do high-confidence migrations incorrectly resolve?

### Hypotheses to Test

1. **H1:** Content-hash tracking prevents 99%+ of infinite loops
2. **H2:** Periodic reconciliation catches all missed events within 5 minutes
3. **H3:** Self-healing reduces manual slice edits by 100% (developers learn quickly)
4. **H4:** Watchdog reduces RECON invocations by 90% (automatic maintenance)
5. **H5:** Syntax validation reduces unnecessary RECON runs by 80% during AI editing
6. **H6:** Transaction detection prevents 95% of redundant multi-file RECON runs
7. **H7:** AI edit detection with longer debounce reduces RECON runs by 90% during Cursor generation

### Metrics to Collect

- Watchdog uptime vs. crashes
- Migrations auto-resolved vs. surfaced
- False positives (incorrect auto-resolutions)
- Event loss rate (detected by periodic reconciliation)
- Memory/CPU usage over 8-hour development session
- Developer satisfaction (survey)
- **Edit pattern metrics:**
  - File changes detected vs. RECON runs triggered (should be 10:1 or better)
  - Syntax validation skips (files with errors)
  - Transaction coalescing rate (multi-file edits → single RECON)
  - AI edit detection accuracy (true positives vs false positives)
  - Debounce effectiveness (rapid changes → single RECON)

---

## References

- **E-ADR-001:** Provisional Execution (Manual RECON mode)
- **E-ADR-002:** RECON Self-Validation
- **E-ADR-006:** Angular and CSS/SCSS Semantic Extraction
- **Git rename detection:** `git log --follow` (heuristic similarity scoring)
- **LRU Cache:** npm package `lru-cache`
- **File watching:** npm package `chokidar`

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-07 | 0.1 | Initial proposal |

---

**Remember:** Watchdog exists to maintain live project state automatically, not to replace human judgment on ambiguous cases. When in doubt, surface to human.

