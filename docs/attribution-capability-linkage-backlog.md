# Attribution capability linkage backlog

**Status:** Deferred (separate track from Phase 1 class-static linkage fix)

## Decision

Do **not** populate `attributed_capabilities` from ADR YAML CAP IDs during the class-metadata extraction fix.

## Rationale

1. Phase 1 success criterion is proving **declared ADR/INV claims** reach `implementation-attribution-evidence.yaml`, including class entities via `static readonly __implements_adrs__`.
2. CAP mapping requires a separate authority rule: decorator claims ADR; CAP IDs live in ADR YAML and are not currently declared on symbols.
3. Populating CAPs without an explicit declaration mechanism would produce **inferred** linkage masquerading as **declared** evidence (`confidence: declared` would be misleading).

## Next step (when un-deferred)

Choose one:

- **Decorator extension:** optional `implements_capability('CAP-XXXX')` shim (append-only with ADR claims), or
- **ADR-derived inference:** separate `confidence: inferred` records with explicit provenance, not mixed into declared decorator rows.

Until then, `attributed_capabilities: []` remains an honest empty field.
