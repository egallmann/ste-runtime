# E-ADR-001: Provisional Execution of RECON for Project-Level Semantic State Pressure

**Status:** Accepted  
**Implementation:**  Complete  
**Date:** 2026-01-07  
**Author:** Erik Gallmann  
**Authority:** Exploratory ADR (Reversible)

> **Next Step:** Validate against ste-spec Section 4.5 (RECON) for ADR graduation.

---

## Context

The STE Architecture Specification defines RECON (Reconciliation Engine) as the mechanism for extracting semantic state from source code and populating AI-DOC. The question arose: How should RECON operate during the exploratory development phase when foundational components are still being built?

Key tensions:

1. **Canonical vs. Provisional State:** Should RECON produce canonical state that is authoritative for downstream systems?
2. **Automatic Resolution vs. Conflict Surfacing:** Should RECON automatically resolve conflicts or surface them for human judgment?
3. **Blocking vs. Non-Blocking:** Should RECON block development workflows when conflicts are detected?
4. **Single Repository vs. Multi-Repository:** What is the scope of RECON's reconciliation?

---

## Decision

**RECON executes provisionally, generating semantic pressure without assuming correctness.**

RECON operates under the following constraints:

| Constraint | Decision |
|------------|----------|
| State Authority | Provisional, not canonical |
| Conflict Resolution | Surface conflicts, do not resolve |
| Workflow Blocking | Never block commits or development |
| Scope | Single repository only |
| Execution Mode | Developer-invoked, not CI/CD |

---

## Rationale

### 1. Semantic Pressure Over Semantic Truth

RECON exists to **observe how semantic truth breaks under change**, not to declare what truth is. During exploratory development, the extraction algorithms, normalization schemas, and conflict detection heuristics are all evolving. Declaring any output as "canonical" would be premature.

By generating pressure without claiming correctness, RECON:
- Forces execution of incomplete implementations
- Surfaces edge cases and extraction gaps
- Generates learning evidence for future refinement
- Avoids false confidence in evolving algorithms

### 2. Conflicts Require Human Judgment

Automatic conflict resolution assumes the system understands developer intent. During this phase, RECON cannot reliably determine:
- Was a function renamed or deleted?
- Is a signature change intentional or accidental?
- Which version of a conflicting definition is correct?

All conflicts are written to disk as YAML files in `.ste/state/conflicts/active/` for human review. RECON surfaces evidence; humans render judgment.

### 3. Development Must Not Be Blocked

RECON is a learning tool, not an enforcement mechanism. Blocking commits would:
- Create friction disproportionate to RECON's maturity
- Force developers to work around false positives
- Reduce willingness to run RECON frequently

By remaining non-blocking, RECON encourages frequent execution and generates more learning data.

---

## Specification

### §5.1 Discovery Constraints

- **Single repository only:** RECON discovers files within the current repository. Cross-repository reconciliation is out of scope.
- **Incremental reconciliation:** Only files that have changed since the last run are re-extracted (when timestamp detection is available).
- **Configurable source directories:** Specified via `ste.config.json` or auto-detected.

### §5.2 Extraction Constraints

- **Shallow extraction:** Extract structural elements (functions, classes, imports, exports) without deep semantic analysis.
- **No deep semantic analysis:** Do not attempt to understand function behavior, side effects, or complex type flows.
- **Multi-language support:** TypeScript, Python, CloudFormation, JSON (see E-ADR-005), Angular, CSS/SCSS (see E-ADR-006).
- **Portable execution:** RECON must work when dropped into any project.

### §5.3 Normalization Constraints

- **Provisional mapping:** Normalization to AI-DOC schema is best-effort, not canonical.
- **Schema evolution expected:** The AI-DOC schema is still evolving; normalization will change.
- **ID stability:** Element IDs should be stable across runs for the same source element.

### §5.4 Self-Healing Semantic Maintenance

**Updated 2026-01-07**: Corrected to comply with STE System Specification (normative).

**Previous E-ADR (non-compliant):** Defined "exploratory mode" that surfaced all changes as conflicts.  
**STE-spec (normative):** Defines slices as derived artifacts with self-healing maintenance.  
**This E-ADR (now compliant):** Aligns with spec's derived artifacts model.

#### Slices Are Like `dist/` - 100% Regenerated From Source

```
Source Code (Truth)
    ↓
RECON (Deterministic)
    ↓
Slices (Derived Artifacts)
```

**Principle**: Slices are to source code what `dist/app.js` is to `src/app.ts`.

#### Self-Healing Behavior

| Scenario | RECON Action | Rationale |
|----------|--------------|-----------|
| Source file modified | Extract fresh, update slice | Source changed → semantics changed |
| Source file unchanged, slice differs | Regenerate from source | Slice corrupted/manually edited → self-heal |
| Source file deleted | Delete corresponding slice | Source gone → semantics gone |
| New extractor added (E-ADR-006) | Extract with new extractor | Richer semantics available |
| Extractor logic improved | Re-extract all files | Better semantics available |

**In ALL cases**: RECON authoritatively regenerates slices from source. No conflicts. No human review.

#### The ONLY Way to Change Semantic State

```yaml
To change semantic state:
  1. Modify source code → RECON extracts → Slices update
  2. Modify ste-runtime extractors → RECON extracts → Slices update
  
You CANNOT change semantic state by:
   Manually editing slices (will be overwritten on next RECON)
   Manually editing graph files (will be regenerated)
   Requesting AI to "update semantics" (AI must modify SOURCE CODE)
```

#### Validation Errors (NOT Conflicts)

RECON may surface **validation errors** (not conflicts):

| Error Class | Trigger | Action |
|-------------|---------|--------|
| `extractor_failure` | Extractor crashed | Log error, skip file, continue |
| `source_corruption` | Unparseable source file | Log error, skip file, continue |
| `filesystem_error` | Cannot read/write file | Log error, retry, escalate if persistent |

These are **operational errors**, not semantic conflicts. They require fixing the source file or extractor, not human semantic judgment.

#### Phase 6 Renamed: "State Validation & Self-Healing"

Phase 6 is NOT "conflict detection" - it is:
1. **Validation**: Verify slices match source checksums
2. **Self-Healing**: Regenerate any slices that don't match
3. **Cleanup**: Remove orphaned slices (source deleted)

**No conflicts exist in this model.**

### §5.5 Population Constraints

- **State is authoritative, not historical:** Each run produces the current truth, not a delta.
- **Create/Update/Delete semantics:** New slices are created, changed slices are updated, orphaned slices are deleted.
- **Orphan detection:** Slices from processed source files that no longer exist in code are removed.

---

## Execution Model

### Manual, Developer-Invoked

RECON is designed for manual execution by developers:

```bash
cd ste-runtime
npm run recon           # Incremental reconciliation
npm run recon:full      # Full reconciliation
npm run recon:self      # Self-documentation mode
```

### NOT for Continuous Execution

At this stage, RECON is **not designed for CI/CD or automatic execution**. Reasons:

1. Extraction algorithms are evolving
2. False positive rate is unknown
3. Performance characteristics not established
4. Human oversight required for conflict resolution

---

## Slice Storage: Content-Addressable Filenames

**Decision Date:** 2026-01-07  
**Failure Mode Discovered:** Angular component filenames exceeded filesystem limits (200+ characters)

### Problem Statement

Initial implementation used descriptive filenames based on slice IDs:
```
component-frontend-src-app-features-reports-report-views-control-effectiveness-report-control-effectiveness-report.component.ts-ControlEffectivenessReportComponent.yaml
```

**Failures observed:**
- Windows path limit: 260 characters (exceeded)
- Unix filename limit: 255 characters (exceeded)
- Special character sanitization complexity
- Performance degradation with long paths

### Design Decision

**Switched to content-addressable hashing for slice filenames.**

**Rationale:**
1. **AI-DOC philosophy**: Slices are machine-readable, not human-edited
2. **Filesystem portability**: Works on all platforms (Windows, Unix, network drives)
3. **Performance**: Shorter paths improve I/O operations
4. **Determinism**: Same slice ID always produces same filename
5. **Source of truth**: Slice ID inside file is authoritative, not filename

### Implementation

```typescript
// Hash the slice ID (SHA-256, first 16 chars = 64 bits)
const hash = createHash('sha256')
  .update(sliceId)
  .digest('hex')
  .substring(0, 16);

const filename = `${hash}.yaml`;  // "009bd442b992f055.yaml"
```

**Collision probability:** Effectively zero (<0.000000002% for 864 slices)

### Example

**Slice ID (inside file):**
```yaml
_slice:
  id: function:backend/scripts/parser.py:parse_cloudformation
  domain: graph
  type: function
```

**Filename:** `009bd442b992f055.yaml`

### Impact

| Aspect | Before | After |
|--------|--------|-------|
| Max filename length | 250+ chars | 16 chars |
| Filesystem compatibility | Windows issues | Universal |
| Population throughput | 687 slices/sec | 766 slices/sec |
| Human readability | High (not needed) | Low (not needed) |

**Debugging workflow:**
1. **Primary:** RSS graph traversal - `rss.query('component', { name: 'MyComponent' })`
2. **Secondary:** Grep on slice IDs - `grep -r "component:frontend" .ste/state/`
3. **Never:** Browse filenames (content-addressable hashes)

---

## Consequences

### Positive

- RECON can execute immediately, generating learning pressure
- Conflicts surface early, before they become entrenched
- Developers maintain full control over semantic state acceptance
- Extraction algorithms can evolve without breaking workflows

### Negative

- No automated enforcement of semantic consistency
- Conflicts may accumulate if not reviewed
- Provisional state cannot be used for authoritative downstream systems

### Mitigation

- Document all conflicts for periodic human review
- Track conflict patterns to improve extraction algorithms
- Plan transition to canonical execution once algorithms stabilize

---

## Constraints on Downstream Systems

1. **No canonical consumption:** Downstream systems MUST NOT treat RECON output as canonical. Use ADF-published state for canonical consumption.

2. **Conflict awareness required:** Any system reading RECON state MUST check for active conflicts.

3. **Idempotency expected:** Running RECON multiple times on unchanged source SHOULD produce identical output.

---

## Seven-Phase Execution Pipeline

RECON executes seven phases per run:

| Phase | Name | Purpose |
|-------|------|---------|
| 1 | Discovery | Identify files to process |
| 2 | Extraction | Extract semantic assertions |
| 3 | Inference | Infer relationships (DEFERRED) |
| 4 | Normalization | Map to AI-DOC schema |
| 5 | Population | Update AI-DOC state |
| 6 | Divergence | Detect and record conflicts |
| 7 | Self-Validation | Validate state (non-blocking, see E-ADR-002) |

---

## Relationship to Other Decisions

- **E-ADR-002 (RECON Self-Validation):** Validation is non-blocking and exploratory
- **E-ADR-003 (CEM Deferral):** CEM will orchestrate RECON in the future

---

## Review Trigger

This decision should be revisited when:

1. Extraction algorithms reach stability
2. Conflict detection false positive rate is measured
3. CI/CD integration is required
4. Canonical state publication is needed
5. Human review of conflicts becomes prohibitive

---

## Learning Log

This section tracks observations from RECON execution to inform future refinement.

| Date | Observation | Implication |
|------|-------------|-------------|
| 2026-01-07 | E-ADR created from code references | Documented implicit decisions explicitly |

---

## References

- STE Architecture Specification, Section 4.5: RECON
- STE Architecture Specification, Section 4.6: RSS Operations
- ISO/IEC/IEEE 42010:2022 Architecture Description


