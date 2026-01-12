# Content-Addressable Slice Naming

**Location:** `/documentation/reference/`  
**Date:** 2026-01-07  
**Status:** Implemented  
**Related E-ADRs:** E-ADR-001 (Slice Storage section), E-ADR-006 (Appendix)

---

## Purpose

This document provides the full context and rationale for why ste-runtime uses content-addressable (hashed) filenames for AI-DOC slices instead of descriptive filenames.

**Related documentation:**
- **E-ADR-001:** Slice Storage section (formal decision)
- **E-ADR-006:** Appendix (how this was discovered)
- **Performance Benchmarks:** `/documentation/reference/performance-benchmarks.md` (measured impact)

---

## Summary

**Problem:** Angular component slice filenames exceeded filesystem limits (200+ characters)  
**Solution:** Switched to content-addressable SHA-256 hashing (16-character filenames)  
**Impact:** Breaking change requiring full state regeneration

---

## Failure Mode Discovered

During E-ADR-006 (Angular + CSS Extraction) specification, a critical failure mode was identified:

### **Long Filenames Exceeded Filesystem Limits**

**Example filename (descriptive format):**
```
component-frontend-src-app-features-reports-report-views-control-effectiveness-report-control-effectiveness-report.component.ts-ControlEffectivenessReportComponent.yaml
```

**Problems:**
- Length: 180-250 characters
- Windows path limit: 260 characters (full path + filename)
- Unix filename limit: 255 characters
- Special character sanitization complexity
- Performance degradation with long paths

**Impact:**
- Would have failed on Windows systems
- Would have caused issues on network drives
- Would have required complex sanitization logic
- Would have degraded I/O performance

---

## Design Decision

### **Switched to Content-Addressable Hashing**

**Implementation:**
```typescript
// Hash the slice ID (SHA-256, first 16 chars = 64 bits)
const hash = createHash('sha256')
  .update(sliceId)  // Full semantic ID
  .digest('hex')
  .substring(0, 16);

const filename = `${hash}.yaml`;  // "009bd442b992f055.yaml"
```

**Example:**
- **Slice ID (inside file):** `function:backend/scripts/parser.py:parse_cloudformation`
- **Filename:** `009bd442b992f055.yaml`

---

## Rationale

### 1. AI-DOC is Machine-Readable, Not Human-Edited

**Key Insight:** Humans don't manually edit slice files - they're for AI consumption.

-  Slice ID is the source of truth (stored inside file)
-  **RSS queries (graph traversal) are the primary debugging tool**
-  Grep/search on slice IDs is a secondary fallback
-  Human readability of filename is not a requirement

**Debugging workflow:**
1. **Primary:** RSS graph queries - `rss.query('component', { name: 'MyComponent' })`
2. **Secondary:** Grep on slice IDs - `grep -r "component:frontend/src/app/my-component" .ste/state/`
3. **Never:** Browse filenames (hashed for portability)

### 2. Filesystem Portability

-  Works on all platforms (Windows, Unix, macOS, network drives)
-  No length limit issues (16 chars vs 200+ chars)
-  No special character issues (hex is universally safe)
-  No path separator issues (`/` vs `\`)

### 3. Performance

**Measured improvement:**
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Throughput | 687 slices/sec | 766 slices/sec | +11% |
| Population time | 1,256ms | 1,127ms | -129ms |
| Filename length | 180-250 chars | 16 chars | -93% |

### 4. Content-Addressable Design

-  Same slice ID → same filename (deterministic)
-  Collision probability: <0.000000002% (64-bit hash space)
-  Aligns with Git internals and other CAD systems
-  Filename IS the content address

---

## Impact Assessment

### Breaking Changes

**All existing slices must be regenerated.**

**Migration steps:**
1. Delete all existing slices: `.ste/state/*` and `.ste-self/state/*`
2. Run full RECON: `npm run recon -- --mode=full`
3. Verify new hashed filenames

**Completed:** 2026-01-07
-  Cleaned both state directories
-  Regenerated 864 slices with new naming scheme
-  Verified slice IDs preserved
-  Performance verified (722 slices/sec)

### What Changed

**Before (descriptive):**
```
frontend/component/
├── component-frontend-src-app-features-reports-report-views-control-effectiveness-report-control-effectiveness-report.component.ts-ControlEffectivenessReportComponent.yaml
└── ... (180-250 char filenames)
```

**After (content-addressable):**
```
frontend/component/
├── 09486e6eb99822fe.yaml  (16 chars)
├── 0d34f8a2c91b5e73.yaml  (16 chars)
└── 1a7b9e4f2c8d3a56.yaml  (16 chars)
```

### What Stayed the Same

**Slice content remains identical:**
```yaml
_slice:
  id: component:frontend/src/...UserReportComponent  ← Source of truth
  domain: frontend
  type: component
  source_files:
    - frontend/src/app/features/...component.ts
  references:
    - domain: frontend
      type: template
      id: template:frontend/src/...component.html
```

**RSS queries unchanged:**
```typescript
// Still works exactly the same
rss.query('component', { 
  id: 'component:frontend/src/...UserReportComponent' 
});
```

---

## Documentation Updates

### E-ADR Documents

**E-ADR-001 (Updated):**
- Added new section: "Slice Storage: Content-Addressable Filenames"
- Documents failure mode, design decision, rationale
- Includes collision probability analysis
- Explains debugging workflow

**E-ADR-006 (Updated):**
- Added "Related E-ADRs" reference to E-ADR-001
- Added Appendix: "Discovery of Content-Addressable Naming"
- Documents how E-ADR-006 surfaced this failure mode
- Validates exploratory ADR approach

### CHANGELOG

**Entry (Breaking Change):**
```markdown
### Changed
- **Content-Addressable Slice Filenames (E-ADR-001 Update)**: 
  Critical design decision after discovering filesystem limit failure
  - Failure Mode: Angular component filenames exceeded 200+ characters
  - Design Decision: Switched to content-addressable hashed filenames
  - Breaking change: All existing slices must be regenerated
```

---

## Verification

### Full RECON Run

**Results:**
-  864 slices created
-  All filenames are 16-character hashes
-  All slice IDs preserved correctly
-  Performance: 722 slices/sec
-  No filesystem errors
-  No length limit issues

**Sample filenames:**
```
graph/functions/009bd442b992f055.yaml
frontend/component/09486e6eb99822fe.yaml
behavior/call_graph/07580021377cdf3d.yaml
```

**Sample slice content:**
```yaml
_slice:
  id: function:backend/scripts/enrich-batch-TEMPLATE.py:save_catalog
  domain: graph
  type: function
```

### Collision Analysis

**Hash space:** 64 bits (2^64 = 18.4 quintillion)  
**Current usage:** 864 slices  
**Collision probability:** ~0.000000002%

**Even at scale:**
- 1 million slices: Still negligible collision probability
- 10 million slices: Birthday paradox applies, but still <0.001%

**Mitigation:** Deterministic hashing ensures same ID always produces same hash, so collisions are reproducible and debuggable.

---

## Lessons Learned

### Exploratory ADR Process Validated

This failure mode validates the exploratory ADR approach:

1. **Specification work surfaces real problems** - Writing E-ADR-006 revealed filename length issues
2. **Early detection prevents production failures** - Found before Angular extraction was implemented
3. **Design improvements emerge from use cases** - Better solution than original design
4. **Documentation captures rationale** - Future developers understand WHY this decision was made

### Design Principles Reinforced

1. **AI-DOC is machine-first** - Not optimized for human consumption
2. **Portability matters** - Must work on all platforms
3. **Content-addressable is superior** - When identity is separate from storage
4. **Measure performance** - Data-driven design decisions

---

## Future Considerations

### When to Revisit

This decision should be revisited if:

1. **Collision detected** - Unlikely but would require hash length increase
2. **Performance regression** - If hashing becomes bottleneck
3. **Tooling requirements** - If external tools need descriptive names
4. **Debugging workflow changes** - If developers need filename hints

### Potential Enhancements

1. **Metadata index** - Map hash → slice ID for faster lookup
2. **Longer hashes** - If collision concerns arise (extend to 20-24 chars)
3. **Hierarchical hashing** - Use first 2 chars for subdirectories (e.g., `09/486e6eb99822fe.yaml`)
4. **Hash algorithm upgrade** - If SHA-256 becomes deprecated

---

## References

- E-ADR-001: Provisional Execution of RECON (Slice Storage section)
- E-ADR-006: Angular and CSS/SCSS Semantic Extraction (Appendix)
- CHANGELOG.md: Breaking change entry
- Git internals: Content-addressable object storage
- [Birthday Paradox](https://en.wikipedia.org/wiki/Birthday_problem) - Collision probability analysis

---

## Conclusion

**The switch to content-addressable slice naming was a critical design decision that:**

1.  Prevented filesystem limit failures on Windows and network drives
2.  Improved performance by 11% (shorter paths)
3.  Simplified implementation (no sanitization needed)
4.  Aligned with AI-DOC machine-first philosophy
5.  Validated the exploratory ADR process

**This is the correct design for ste-runtime.**

---

**Status:**  Implemented and Verified  
**Last Updated:** 2026-01-07

