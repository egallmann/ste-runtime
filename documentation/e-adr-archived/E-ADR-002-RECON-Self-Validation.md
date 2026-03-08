# E-ADR-002: RECON Self-Validation, Non-Blocking

**Status:** Accepted  
**Implementation:**  Complete  
**Date:** 2026-01-07  
**Author:** Erik Gallmann  
**Authority:** Exploratory ADR (Reversible)

> **Next Step:** Validate against ste-spec validation requirements for ADR graduation.

---

## Context

RECON generates AI-DOC state from source code extraction. The question arose: How should RECON validate its own output to ensure consistency and quality?

Key tensions:

1. **Blocking vs. Non-Blocking:** Should validation failures halt RECON execution?
2. **Verdict vs. Evidence:** Should validation declare correctness or surface observations?
3. **Scope:** What aspects of AI-DOC state should be validated?
4. **Integration:** When does validation run in the RECON pipeline?

---

## Decision

**RECON self-validation is non-blocking, report-only, and exploratory.**

Self-validation executes as Phase 7 of the RECON pipeline and:

| Constraint | Decision |
|------------|----------|
| Execution | Never throws, never halts |
| Output | Generates evidence, not verdicts |
| Categories | ERROR / WARNING / INFO findings |
| Persistence | Reports written to `.ste/state/validation/` |

---

## Rationale

### 1. Non-Blocking Preserves Learning

If validation blocked execution on every finding, RECON would become unusable during exploratory development. Many validation findings are informational or represent known limitations in extraction algorithms.

By remaining non-blocking, validation:
- Captures all findings without losing work
- Allows developers to review findings at their discretion
- Generates historical data for pattern analysis
- Avoids false positive friction

### 2. Evidence Over Verdicts

During exploratory development, the validators themselves are evolving. A "verdict" implies confidence that is premature. Instead, validators generate:
- Observations about state structure
- Anomalies that may indicate issues
- Coverage gaps in extraction
- Repeatability concerns

Developers interpret findings; validators do not judge.

### 3. Categorization Enables Prioritization

All findings are categorized:

| Category | Meaning | Action |
|----------|---------|--------|
| ERROR | Structural issue that may indicate a bug | Investigate promptly |
| WARNING | Anomaly that may indicate a problem | Review when convenient |
| INFO | Observation for awareness | Log for future reference |

---

## Validation Categories

Self-validation covers five categories:

### 1. Schema Integrity

Validates that generated AI-DOC slices conform to expected structure:

- Required fields present (`_slice.id`, `_slice.domain`, `_slice.type`)
- Field types correct
- Provenance metadata complete
- Reference structure valid

### 2. Repeatability

Validates that re-running RECON on unchanged source produces identical output:

- Checksum comparison between runs
- Detects non-determinism in extraction
- Tracks historical checksums for trend analysis

**Note:** Repeatability checks are optional and enabled via `--repeatability-check` flag.

### 3. Graph Consistency

Validates the relationship graph for structural integrity:

- Forward references (`references`) point to existing slices
- Reverse references (`referenced_by`) are symmetric
- No orphaned references
- Import/export relationships consistent

### 4. Identity Stability

Validates that element IDs remain stable across runs:

- Same source element produces same ID
- ID format follows conventions
- No ID collisions between different elements
- Renamed elements detected as new IDs

### 5. Extraction Coverage

Validates extraction completeness:

- Source files in scope have corresponding AI-DOC entries
- No source files skipped unexpectedly
- Language-specific extractors ran successfully
- Extraction errors logged

---

## Validator Implementation

Each validator implements a common interface:

```typescript
interface ValidatorContext {
  assertions: NormalizedAssertion[];
  projectRoot: string;
  sourceRoot: string;
  stateDir: string;
  repeatabilityCheck: boolean;
}

type ValidationFinding = {
  category: 'ERROR' | 'WARNING' | 'INFO';
  validator: string;
  affected_artifacts: string[];
  description: string;
  suggested_investigation?: string;
};
```

Validators:

| Validator | File | Purpose |
|-----------|------|---------|
| Schema | `schema-validator.ts` | Structural integrity |
| Repeatability | `repeatability-validator.ts` | Determinism verification |
| Graph | `graph-validator.ts` | Reference consistency |
| Identity | `identity-validator.ts` | ID stability |
| Coverage | `coverage-validator.ts` | Extraction completeness |

---

## Report Generation

Validation reports are written to `.ste/state/validation/`:

```
.ste/state/validation/
├── latest.yaml           # Most recent validation report
└── runs/
    └── <timestamp>.yaml  # Historical validation runs
```

### Report Structure

```yaml
validation_run:
  timestamp: "2026-01-07T12:00:00.000Z"
  recon_run_id: "recon-1736251200000"
  validation_version: "1.0.0"

summary:
  total_findings: 5
  errors: 0
  warnings: 2
  info: 3

findings:
  - category: WARNING
    validator: coverage
    affected_artifacts:
      - "backend/lambda/handler.py"
    description: "Source file has no corresponding AI-DOC entries"
    suggested_investigation: "Check if file contains extractable elements"
```

### Report Verbosity

Configurable via `--validation-verbosity`:

| Level | Behavior |
|-------|----------|
| `summary` | Log summary counts only (default) |
| `detailed` | Log each finding |
| `silent` | No console output, write report only |

---

## Integration with RECON Pipeline

Self-validation executes as **Phase 7**, after divergence detection:

```
Phase 1: Discovery
Phase 2: Extraction
Phase 3: Inference
Phase 4: Normalization
Phase 5: Population
Phase 6: Divergence Detection
Phase 7: Self-Validation  ← Runs here
```

### Phase 7 Guarantees

- **Never throws exceptions:** All errors are caught and converted to findings
- **Always completes:** Even if individual validators crash
- **Always reports:** At minimum, a summary is logged
- **Never blocks:** RECON result is returned regardless of findings

---

## Consequences

### Positive

- Continuous quality visibility without workflow disruption
- Historical trend data for extraction algorithm improvement
- Early detection of regression in extractors
- Developer confidence through transparency

### Negative

- Findings may be ignored if too numerous
- No enforcement of quality gates
- Report accumulation without review

### Mitigation

- Periodic finding review as part of development process
- Track finding counts over time for trend analysis
- Prioritize ERROR findings for immediate investigation
- Use findings to guide extractor improvements

---

## Constraints

1. **Non-blocking is absolute:** Validation MUST NOT throw exceptions or halt RECON.

2. **Crash isolation:** If a validator crashes, the crash is logged as an ERROR finding and other validators continue.

3. **No side effects:** Validators MUST NOT modify AI-DOC state; they are read-only observers.

4. **Deterministic output:** Given the same input, validators MUST produce the same findings.

---

## Relationship to Other Decisions

- **E-ADR-001 (RECON Provisional Execution):** Self-validation supports provisional execution by generating evidence without blocking
- **E-ADR-003 (CEM Deferral):** CEM will eventually orchestrate validation with governance policies

---

## Review Trigger

This decision should be revisited when:

1. Validators reach maturity and false positive rate is low
2. Quality gates are needed for CI/CD integration
3. Findings consistently go unreviewed
4. Canonical state publication requires validation guarantees

---

## References

- STE Architecture Specification, Section 4.5: RECON
- E-ADR-001: Provisional Execution of RECON
- ISO/IEC/IEEE 42010:2022 Architecture Description




