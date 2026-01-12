# Incremental RECON

This implementation follows the STE Incremental RECON Protocol to keep AI-DOC updates proportional to the changed files while preserving equivalence to full RECON.

## Overview

Incremental RECON achieves **O(changed files)** behavior by:
- Tracking file fingerprints (mtime/size/hash) in a manifest
- Re-extracting only changed/affected source files
- Merging new slices with existing untouched slices
- Regenerating indexes and references for the complete graph

This ensures that incremental updates are semantically equivalent to full RECON while being significantly faster for small changes.

## Change Detection

### File Fingerprinting
- **Source scope**: Python files (`**/*.py`), excluding `.git`, `.ste`, `venv`, `node_modules`
- **Quick check**: `mtime` + `size` for fast detection of potential changes
- **Content verification**: SHA-256 hash to confirm actual content changes (avoids false positives from touch/metadata updates)
- **Manifest location**: `.ste/state/manifest/recon-manifest.json`

### Manifest Schema
```json
{
  "version": 1,
  "generatedAt": "ISO-8601 timestamp",
  "files": {
    "relative/path/to/file.py": {
      "path": "relative/path/to/file.py",
      "mtimeMs": 1234567890123.456,
      "size": 1024,
      "hash": "sha256-hex-digest"
    }
  }
}
```

### Change Detection Strategy
1. Glob workspace for all Python files
2. For each file, compare `mtime` and `size` with manifest entry
3. If different (or missing), compute SHA-256 hash
4. Classify as:
   - **Added**: File exists but not in manifest
   - **Modified**: File exists, in manifest, but hash differs
   - **Deleted**: File in manifest but not on disk
   - **Unchanged**: File exists, in manifest, mtime/size/hash match

## Incremental Pipeline

### 1. Initialization & Validation
- Load existing manifest from `.ste/state/manifest/recon-manifest.json`
- If manifest missing → **fallback to full recon** and generate manifest
- Detect file changes using strategy above
- If no changes detected → skip recon, update manifest timestamp, exit

### 2. Load Existing AI-DOC Graph
- Parse existing YAML slices from `.ste/state/`
- Build source-file → slice-ID mapping
- Extract reference graph for dependency tracking
- If graph load fails → **fallback to full recon**

### 3. Identify Affected Slices
- Map changed files to directly affected slice IDs
- Include one-hop dependents (slices that reference affected slices via `referenced_by`)
- This ensures that changes propagate to consumers

### 4. Selective Extraction
- Re-run Python extractor **only** on:
  - Added files
  - Modified files
  - Files belonging to affected slices (to capture transitive impacts)
- Skip extraction for unchanged files

### 5. Rebuild & Merge
- Generate new AI-DOC slices for extracted structures (modules, entities, endpoints)
- Build module lookup combining existing + new modules (for import resolution)
- Wire references between new slices
- **Merge**: Combine existing untouched slices with new/updated slices
  - Remove slices for deleted files
  - Replace slices for modified/affected files
  - Preserve slices for unchanged files

### 6. Finalize References
- Compute bidirectional references across the merged graph
- Sort references for deterministic output

### 7. Write Output
- Write all merged slices to `.ste/state/{domain}/{type}/{id}.yaml`
- Remove stale slice files (for deleted sources)
- Regenerate domain indexes (`api/index.yaml`, `data/index.yaml`, `graph/internal/index.yaml`)
- Persist updated manifest with new fingerprints

## CLI Usage

### Full RECON (default)
```bash
ste recon <projectRoot>
```
- Extracts all source files
- Generates complete AI-DOC graph
- Writes manifest for future incremental runs

### Incremental RECON
```bash
ste recon <projectRoot> --incremental
```
- Loads manifest and detects changes
- Re-extracts only changed/affected files
- Merges with existing slices
- Updates manifest
- **Fallback**: Automatically runs full recon if manifest/state missing or invalid

### npm Scripts
```bash
npm run recon          # Full recon on current project (unchanged)
```

## Validation & Testing

### Test Coverage (`src/recon/incremental-recon.test.ts`)
- **Setup**: Run full recon on fixture, generate manifest
- **Modify**: Edit one source file (add comment)
- **Incremental**: Run incremental recon
- **Verify**: Run full recon again, compare outputs (ignoring timestamps)
- **Assertion**: Incremental output ≡ Full output (semantic equivalence)

### Fallback Behavior
- **Missing manifest**: Triggers full recon, generates manifest
- **Corrupt state**: Catches errors, falls back to full recon
- **No changes**: Skips extraction, updates manifest timestamp only

## Protocol Alignment (STE Incremental RECON)

### INCREMENTAL-1: Equivalence Invariant
 **Implemented**: Incremental recon produces semantically equivalent output to full recon
- Test validates equivalence (modulo timestamps)
- Merge logic preserves all untouched slices
- Reference computation is identical to full recon

### INCREMENTAL-2: Performance Invariant
 **Implemented**: Complexity is O(changed files + affected slices)
- Change detection: O(all files) for mtime check, O(changed files) for hash
- Extraction: O(changed files + affected files)
- Merge: O(total slices) but only I/O for changed slices
- Index regeneration: O(total slices) but unavoidable for correctness

### INCREMENTAL-3: Correctness Invariant
 **Implemented**: Transitive dependencies are updated
- One-hop reference tracking via `referenced_by`
- Module lookup includes both existing + new modules for import resolution
- Bidirectional reference finalization ensures graph consistency

## Implementation Notes

### Complexity Analysis
- **Change detection**: O(N) where N = total source files (glob + mtime check)
- **Hash computation**: O(M × file_size) where M = changed files
- **Extraction**: O(M × parse_cost) where M = changed + affected files
- **Merge**: O(S) where S = total slices (in-memory merge)
- **Write**: O(M') where M' = changed slices (only write updated files)
- **Index generation**: O(S) (must scan all slices for index)

### Path Normalization
- Windows path separator handling: normalize backslashes to forward slashes for cross-platform consistency
- Ensures `removeMissingDocs` correctly matches paths from `globby` (forward slashes) with `path.resolve` (platform-specific)

### Future Enhancements
- **Git-aware detection**: Use `git status` / `git diff` to get candidate change set (faster than glob)
- **Parallel extraction**: Process changed files in parallel (currently sequential)
- **Incremental indexes**: Avoid full index regeneration by tracking index-relevant changes
- **Subgraph validation**: Add INCREMENTAL-3 validators for specific reference patterns (e.g., API → handler → entity chains)

## Troubleshooting

### "No manifest found. Running full recon."
- First incremental run after full recon without manifest
- Solution: Full recon now automatically generates manifest

### "Failed to load current AI-DOC graph. Falling back to full recon."
- State directory missing or corrupt
- Solution: Full recon regenerates state from scratch

### Incremental output differs from full recon
- Check test: `npm test -- incremental-recon.test.ts`
- Verify timestamps are normalized in comparison
- Inspect specific slice diffs for semantic differences

