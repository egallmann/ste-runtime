# Archived E-ADRs (Exploratory ADRs)

**Status:** DEPRECATED  
**Archived Date:** 2026-03-08  
**Reason:** Migrated to ADR Kit format

## Notice

These E-ADRs have been **migrated to ADR Kit format** and are now located in `adrs/`.

**Please use the new ADR Kit versions instead:**

| Original E-ADR | New ADR Kit ID | Type | Location |
|----------------|----------------|------|----------|
| E-ADR-001 | ADR-L-0001 | Logical | `adrs/logical/ADR-L-0001-*.yaml` |
| E-ADR-002 | ADR-L-0002 | Logical | `adrs/logical/ADR-L-0002-*.yaml` |
| E-ADR-003 | ADR-L-0003 | Logical | `adrs/logical/ADR-L-0003-*.yaml` |
| E-ADR-004 | ADR-P-0001 | Physical | `adrs/physical/ADR-P-0001-*.yaml` |
| E-ADR-005 | ADR-P-0002 | Physical | `adrs/physical/ADR-P-0002-*.yaml` |
| E-ADR-006 | ADR-P-0003 | Physical | `adrs/physical/ADR-P-0003-*.yaml` |
| E-ADR-007 | ADR-L-0004 | Logical | `adrs/logical/ADR-L-0004-*.yaml` |
| E-ADR-008 | N/A | Documentation | Kept as guide (not a decision) |
| E-ADR-009 | ADR-L-0005 | Logical | `adrs/logical/ADR-L-0005-*.yaml` |
| E-ADR-010 | ADR-L-0006 | Logical | `adrs/logical/ADR-L-0006-*.yaml` |
| E-ADR-011 | ADR-P-0004 | Physical | `adrs/physical/ADR-P-0004-*.yaml` |
| E-ADR-013 | ADR-P-0005 | Physical | `adrs/physical/ADR-P-0005-*.yaml` |

## Why Migrate?

E-ADRs were an exploratory format that served their purpose during initial development. However, they had limitations:

- **Not machine-verifiable**: No schema validation
- **Poor AI readability**: Free-form narrative requires parsing
- **No discovery mechanism**: Must scan all files
- **Not STE-compliant**: Doesn't follow STE principles

ADR Kit addresses all these limitations with:
- JSON Schema + Pydantic validation
- YAML frontmatter + embedded Markdown
- Auto-generated manifest for discovery
- Full STE compliance (PRIME-1, PRIME-2, SYS-14)

## What Changed?

### Format
- **Before**: Markdown with bold metadata (`**Status:** Accepted`)
- **After**: YAML frontmatter with strict schema

### Structure
- **Before**: Free-form sections (Context, Decision, Rationale, Specification, Consequences)
- **After**: Structured fields (context, decisions[], invariants[], component_specifications[])

### Discovery
- **Before**: Grep through markdown files
- **After**: Query manifest.yaml by domain, status, technology

### Validation
- **Before**: Manual review only
- **After**: Automated JSON Schema + Pydantic validation

## What Was Preserved?

**Everything.** All narrative content, metadata, and decisions were migrated:

- Context sections → `context` field
- Decision sections → `decisions[].summary`
- Rationale sections → `decisions[].rationale`
- Specification sections → `invariants[]` or `component_specifications[]`
- Consequences sections → `decisions[].consequences`

Original E-ADRs are preserved in this archive for historical reference.

## Migration Tooling

The migration was performed using [adr-architecture-kit](https://github.com/egallmann/adr-architecture-kit) migration tooling:

```bash
python scripts/migrate_e_adrs.py \
  --input-dir ste-runtime/documentation/e-adr \
  --output-dir ste-runtime/adrs \
  --ste-runtime-root ste-runtime
```

This tooling is reusable for other projects migrating from Markdown ADRs to ADR Kit format.

## References

- [New ADRs](../../adrs/)
- [ADR Kit Documentation](https://github.com/egallmann/adr-architecture-kit)
- [Migration Details](../../adrs/MIGRATION.md)
