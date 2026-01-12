# RECON Pure Derived Artifacts - Compliance Correction

**Date:** 2026-01-07  
**Authority:** STE System Specification (Normative)  
**Status:** E-ADR compliance correction - E-ADRs updated to match spec

---

## Governance Context

**STE System Specification is normative.** E-ADRs are implementation decisions that **must comply** with the spec.

### What Happened

During E-ADR-006 implementation review, we discovered:

```
STE-spec (NORMATIVE - Correct)
├─ Defines: Slices are derived artifacts
├─ Defines: Self-healing semantic maintenance
├─ Defines: Project vs. organization authority
└─ Status: Unchanged (was already correct)

E-ADRs (NON-COMPLIANT - Incorrect)
├─ Implemented: "Exploratory vs. Authoritative" modes
├─ Implemented: Conflict detection for all changes
├─ Missing: Project-level authority boundaries
└─ Status: Contradicted normative spec

Gap Identified → E-ADRs corrected to match spec
```

**Critical principle:** When E-ADRs contradict the spec, **fix the E-ADRs, not the spec.**

---

## Problem Statement

After first correction, user insight revealed an even deeper truth:

> "Even for manual slice edits... incremental recon is intended to detect that change AND self-heal back to authoritative state. The only way to change the semantic orientation (slice or graph) is by actual code changes in the project (or runtime - if runtime is changing)."

**Root cause:** We still had "conflicts" in the model. The TRUE model has **no conflicts at all**.

---

## The TRUE Model: Pure Derived Artifacts

### Slices Are Like `dist/` or `node_modules/`

```
Source Code (Truth)
    ↓
RECON (Compiler/Generator)
    ↓
Slices (100% Derived)
```

**You NEVER manually edit:**
-  `dist/app.js` (compiler overwrites)
-  `node_modules/` (npm overwrites)
-  `.ste/state/**/*.yaml` (RECON overwrites)

### Manual Slice Edit = Corruption, Not Conflict

```
Developer manually edits slice.yaml (corruption)
  ↓
Incremental RECON runs
  ↓
Checks: provenance.source_checksum vs. actual source checksum
  ↓
Match? Source unchanged, but slice differs
  ↓
Self-heals: Regenerates slice from source (overwrites manual edit)
  ↓
Slice restored to authoritative state
```

**This is corruption recovery, not conflict resolution.**

---

## The ONLY Way to Change Semantic State

```yaml
Valid ways to change semantic state:
  1.  Modify source code
     - Developer edits app.component.ts
     - RECON extracts fresh semantics
     - Slices update to reflect source
  
  2.  Modify ste-runtime extractors
     - Improve extraction logic
     - RECON re-extracts all files
     - Slices update with better semantics

INVALID ways (will be overwritten):
   Manually edit slice files
   Manually edit graph files
   Ask AI to "update semantics" without modifying source
   Directly modify .ste/state/ contents
```

**Principle**: If you want different semantics, **change the source code**.

---

## There Are NO Conflicts

### Previous Model (Still Wrong):

```
Conflicts surfaced for:
- Manual slice edits + source changes
- Ambiguous extractions (confidence < 0.95)
- Ambiguous ownership
```

### TRUE Model:

```
There are NO conflicts. Only:
1. Authoritative updates (source changed)
2. Self-healing (slice corrupted, source unchanged)
3. Validation errors (extractor bugs, filesystem issues)
```

---

## Self-Healing Behavior Table

| Scenario | Source Checksum | Slice State | RECON Action |
|----------|----------------|-------------|--------------|
| Source modified | Changed | Different |  Extract fresh, update slice |
| Manual slice edit | Unchanged | Different |  Self-heal: regenerate from source |
| Source deleted | N/A | Exists |  Delete orphaned slice |
| New extractor added | Unchanged | Missing data |  Re-extract with richer semantics |
| Extractor improved | Unchanged | Outdated |  Re-extract with better logic |

**In ALL cases**: RECON regenerates authoritatively. No human review. No conflicts.

---

## Validation Errors (NOT Conflicts)

RECON may encounter **operational errors**:

| Error Class | Example | Resolution |
|-------------|---------|------------|
| `extractor_failure` | TypeScript parser crashes | Fix extractor bug |
| `source_corruption` | Invalid syntax in source file | Fix source file |
| `filesystem_error` | Cannot write slice file | Check permissions |

These are **bugs or system issues**, not semantic conflicts requiring human judgment.

---

## Phase 6 Renamed

**Old name:** "Divergence Detection"  
**New name:** "State Validation & Self-Healing"

**Purpose:**
1.  Validate slices match source checksums
2.  Self-heal corrupted/manually-edited slices
3.  Remove orphaned slices (source deleted)
4.  Log validation errors (extractor failures)

**NOT for:** Surfacing conflicts (there are none)

---

## Real-World Scenario: Manual Slice Edit

```bash
# Developer accidentally edits slice
vim .ste/state/frontend/component/abc123.yaml
# Changes selector: 'app-root' → 'app-main'

# Run incremental RECON
npm run recon

# RECON self-heals:
[Phase 6] Validating app.component.ts
[Phase 6] Source checksum matches provenance
[Phase 6] But slice content differs
[Phase 6] Self-healing: Regenerating slice from source
[Phase 6]  Restored selector: 'app-root'

# Manual edit is GONE (overwritten)
# This is CORRECT behavior
```

**Why correct?**
- Source hasn't changed
- Slice should match source
- Manual edit was corruption
- Self-healing restored truth

---

## Impact on E-ADR-006 (Angular Extraction)

### What We Observed:
```
[RECON Phase 6] Detected 306 conflicts
```

### What Should Have Happened:
```
[RECON Phase 6] Self-healing: 306 slices regenerated with richer semantics
[RECON Phase 6] Conflicts: 0
```

**Why?**
- Source files unchanged
- Old extraction: TypeScript (basic)
- New extraction: Angular (rich)
- This is semantic enrichment via better extractor
- Self-heal: Replace old with new
- No conflict: Source is truth, slices follow

---

## Watchdog's Role (Simplified)

Watchdog **automates** the already-authoritative RECON process:

```
Without Watchdog:
  Developer runs `npm run recon`
  → RECON regenerates slices from source

With Watchdog:
  File changes detected
  → Watchdog triggers RECON
  → RECON regenerates slices from source
```

**Watchdog doesn't change authority model.** It just automates invocation.

---

## Decision

**Complete removal of "conflict" concept from RECON:**

1.  Slices are 100% derived artifacts
2.  Manual edits are corruption, trigger self-healing
3.  Source code is ONLY way to change semantics
4.  Phase 6 is validation + self-healing, not conflict detection
5.  No human review needed for deterministic extraction

---

## Implementation Changes Required

### Phase 6 (divergence.ts) Must Be Rewritten:

**Remove:**
```typescript
if (priorState !== newState) {
  createConflictRecord();  // WRONG: No conflicts exist
}
```

**Replace with:**
```typescript
if (sourceChecksumChanged) {
  // Source changed → Extract fresh
  updateSlice(newExtraction);
} else if (sliceContentDiffers) {
  // Source unchanged but slice differs → Self-heal
  logSelfHealing(file);
  regenerateFromSource(file);
} else {
  // Everything matches → No action
  markValidated(file);
}
```

### Remove Conflict Infrastructure:

-  Delete `/state/conflicts/` directory concept
-  Remove conflict record schema
-  Remove conflict resolution workflows
-  Add self-healing logs
-  Add validation error logs

---

## Expected Output After Fix

```
[RECON Phase 1] Discovery: 256 files
[RECON Phase 2] Extraction: 864 assertions
[RECON Phase 3] Inference: 1,243 relationships
[RECON Phase 4] Normalization: 864 slices
[RECON Phase 5] Population: 89 created, 217 updated, 0 deleted
[RECON Phase 6] Validation: 306 self-healed, 0 errors
                            ^^^^^^^^^^^^^^^^^^^^^^^^
[RECON Phase 7] Self-validation: PASS
[RECON] Complete: 306 slices regenerated (semantic enrichment)
```

**No conflicts.** Only self-healing and validation.

---

## Success Criteria

1.  E-ADR-006 produces 0 conflicts (306 self-heals instead)
2.  Manual slice edits are automatically overwritten
3.  Source code is the ONLY way to change semantics
4.  Phase 6 renamed to "State Validation & Self-Healing"
5.  No conflict records, no human review workflow

---

## Authority Boundaries: Project vs. Organization

**Critical clarification (2026-01-07)**: ste-runtime RECON's authority is **project-level**, not organization-level.

### Two Levels of Authority

```
PROJECT LEVEL (Pre-Merge)
├─ Authority: ste-runtime RECON
├─ Scope: Feature branches, uncommitted changes
├─ Visibility: Developer only
└─ Purpose: Understand current changes

          ↓ [git merge / deploy]

ORGANIZATION LEVEL (Post-Merge)
├─ Authority: ADF (Authoritative Derived Facts)
├─ Scope: main/master, deployed code
├─ Visibility: Organization-wide
└─ Purpose: Cross-project semantic index
```

### ste-runtime RECON: Project-Level Authority

**RECON IS authoritative for:**
-  Pre-merge changes in feature branches
-  Local uncommitted code changes
-  "What semantics exist in my current working state?"
-  **The changes RECON is suggesting** (before they're merged)

**RECON is NOT authoritative for:**
-  Merged/deployed semantic state (ADF's responsibility)
-  Cross-project semantic relationships
-  Organization-wide documentation
-  Other developers' feature branches

### Why This Matters

```
Developer on feature/add-angular-components:
  
  RECON extracts from local source:
  ├─ "I see 5 new Angular components"
  ├─ "They reference 3 backend APIs"
  └─ "They use 12 design tokens"
  
  This is AUTHORITATIVE for this feature branch.
  Other projects DON'T see these changes (correct behavior).
  
  ↓ [git merge to main]
  
  ADF extracts from merged code:
  ├─ Publishes 5 new components to org index
  ├─ Other projects can now discover them
  └─ ADF is NOW authoritative for merged state
```

### Authority Handoff

| Stage | Authority | Scope | Visibility |
|-------|-----------|-------|------------|
| Local development | ste-runtime RECON | Project only | Developer |
| Merge to main | **Handoff occurs** | → Organization | → All projects |
| Post-merge | ADF | Organization | All projects |

### Optional: RECON Querying ADF

ste-runtime RECON can **optionally** query ADF for context:

```
RECON extracts from local source (authoritative)
  + Queries ADF: "What backend APIs exist in deployed code?"
  + Enriches local extraction with org context
  = Richer local semantic understanding

BUT: Local source remains authority for project-level changes
```

**Key**: Even with ADF context, RECON is still authoritative for **the changes it's suggesting** based on local source code.

---

## Acknowledgment

This is the **TRUE model** for RECON:

> **Slices are pure derived artifacts.  
> Manual edits are corruption.  
> Source code is the only truth.  
> Self-healing is automatic.  
> Conflicts don't exist.**

This completely reframes RECON from a "conflict detection system" to a "semantic compiler" that deterministically regenerates derived artifacts from source.

**Thank you for this profound insight.** 

