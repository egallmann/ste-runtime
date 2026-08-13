# E-ADR to ADR Kit Migration

## Schema v1.3 Identity Migration (2026-08-12)

## Legacy Physical ADR Modernization (2026-08-12)

The legacy `physical` ADR type was retired after review. The canonical implementation records were resolved as follows:

- `ADR-P-0001` → new `ADR-PC-0012` (RSS CLI and Runtime Graph Traversal), preserving component alias `COMP-0001`.
- `ADR-P-0002` → retired as superseded by `ADR-PC-0005` (JSON Semantic Extraction).
- `ADR-P-0003` → retired as superseded by `ADR-PC-0006` (Frontend Semantic Extraction), consolidating `COMP-0014` and `COMP-0002` into the modern frontend component.
- `ADR-P-0004` → folded into `ADR-PS-0001`; MCP and watchdog implementation ownership remains explicit in `ADR-PC-0001` and `ADR-PC-0002`.
- `ADR-P-0005` → new `ADR-PC-0013` (Extractor Validation Framework), preserving component alias `COMP-0016` under `ADR-PS-0002`.

The legacy ADR UUIDs and component aliases remain traceable through `supersedes`, `related_adrs`, and `migration_origin` metadata. The five canonical `adrs/physical/` sources and their generated projections were removed only as a consequence of this canonical migration and projection regeneration; historical references in this document remain historical.

This meaning-preserving migration was executed on `feature/adr-v13-migration` from `BASE_SHA` `5ee21d1d8e8a23cbeefbae80decd6164d46322cb` using `adr-architecture-kit==0.4.0`.

- Canonical source truth: 40 ADR YAML files; schema distribution `1.3: 40` (previously `1.0: 40`)
- Architecture namespace: `ste-runtime`
- Identity map: `adrs/migrations/canonical-identity-v13-map.yaml`
- Sealed map fingerprint: `sha256:42d567c61381780e9d097439f4bade85d8c13175c1d3f457bbc5d300fd10bce6`
- Map baseline fingerprint: `sha256:9377a06b9f5661d75b9a9f3a0130e10afba23c2f7f031ed506abfb5efc78add1`
- Mapped occurrences: 152; UUIDv7 identities minted exactly once: 152; accepted dispositions: 152; open queues: 0
- Mapped occurrence distribution: ADR 40, boundary 2, capability 12, component 19, decision 24, implementation decision 5, interface 12, invariant 36, system 2

Before/after runtime-owned derived state was `120 entities / 310 relationships / 0 unresolved` to `126 entities / 332 relationships / 0 unresolved`. The six-entity and 22-relationship increase is source-truth recovery: the prior manifest omitted ADR-L-0023 and the prior registry collapsed eight relationships through duplicate component aliases. Parity was proven by inverse-mapping UUID endpoints to aliases, applying the recorded component remaps, and confirming the remaining relationship multiset is exact.

The seven duplicate canonical component aliases were repaired first with ADR Kit’s released `repair-canonical-ids` workflow. The complete remap remains in `adrs/migrations/canonical-id-remap.yaml`, with allocation state in `adrs/migrations/canonical-id-allocation.yaml`. No legacy identity was discarded: every migrated root and nested identity preserves its original ID as `alias_id`, and the map preserves the occurrence-level `legacy_alias_id`.

Compatibility changes were limited to migration ingestion: authored v1.3 physical-system UUIDs are consumed as canonical system IDs; legacy `SYS-*` synthesis remains only for legacy physical-system input; UUID component-to-system links resolve directly; provenance uses source context/type and artifact path rather than ID prefixes; and `implemented_by_components` UUID traceability is preserved. Public APIs and graph relationship semantics remain unchanged.

ADR Kit generated 40 projections under `adrs/adr-projection/{logical,physical,physical-system,physical-component}`. The obsolete generated `adrs/rendered/` directory was removed. Active consumers and documentation now reference the new projection path; the historical 2026-03-08 generation note below retains its former `rendered/*.md` description as historical context.

Evidence commands included:

```text
adr validate --scope . --cross-references
adr repair-canonical-ids --scope . --check
adr migrate-identity-v13 --scope . --identity-map adrs/migrations/canonical-identity-v13-map.yaml --check
adr generate-adr-projection --scope .
npm ci
npm run build
npm test
npm run test:integration
npm run recon:self
npm run lint
npm run test:contract-guards
node dist/cli/index.js architecture compile --project-root . --dry-run
node dist/cli/index.js architecture compile --project-root .
```

**Migration Date:** 2026-03-08  
**Migrated By:** ADR Kit migration tooling  
**Source Format:** E-ADRs (Exploratory ADRs) in Markdown  
**Target Format:** ADR Kit v1.0 YAML+Markdown

## Why Migrate?

### Problems with E-ADR Format

1. **Not machine-verifiable**: Markdown with pseudo-frontmatter (bold text, not YAML)
2. **Inconsistent structure**: Free-form sections, no schema enforcement
3. **Poor AI readability**: LLMs must parse narrative text to extract decisions
4. **No discovery index**: Must scan all files to find relevant ADRs
5. **Not STE-compliant**: Doesn't follow PRIME-1, PRIME-2, SYS-14

### Benefits of ADR Kit Format

1. **Machine-verifiable**: JSON Schema + Pydantic validation
2. **Deterministic structure**: YAML frontmatter with strict schema
3. **AI-first readability**: Structured data + embedded Markdown
4. **Discoverable**: Auto-generated manifest.yaml (SYS-14: Index Currency)
5. **STE-compliant**: Follows System of Thought Engineering principles
6. **Graph-integrated**: RECON extracts ADRs into semantic graph

## Migration Process

### Phase 1: Build Migration Tooling

Built in [adr-architecture-kit](https://github.com/egallmann/adr-architecture-kit):

- `src/adr_kit/migrators/e_adr_parser.py` - Parse E-ADR markdown
- `src/adr_kit/migrators/markdown_to_yaml.py` - Generate YAML ADRs
- `src/adr_kit/migrators/e_adr_classification.py` - Classify as Logical/Physical
- `scripts/migrate_e_adrs.py` - CLI migration tool

### Phase 2: Classification

**Logical ADRs (6)** - Conceptual decisions (what/why):
- E-ADR-001 → ADR-L-0001 (RECON Provisional Execution)
- E-ADR-002 → ADR-L-0002 (RECON Self-Validation)
- E-ADR-003 → ADR-L-0003 (CEM Deferral)
- E-ADR-007 → ADR-L-0004 (Watchdog Authoritative Mode)
- E-ADR-009 → ADR-L-0005 (Self-Configuring Domain Discovery)
- E-ADR-010 → ADR-L-0006 (Conversational Query Interface)

**Physical ADRs (5)** - Implementation specs (how):
- E-ADR-004 → ADR-P-0001 (RSS CLI)
- E-ADR-005 → ADR-P-0002 (JSON Extraction)
- E-ADR-006 → ADR-P-0003 (Angular/CSS Extraction)
- E-ADR-011 → ADR-P-0004 (MCP Server)
- E-ADR-013 → ADR-P-0005 (Extractor Validation)

**Documentation (1)** - Not migrated:
- E-ADR-008 (Extractor Development Guide) - Kept as guide, not a decision

### Phase 3: Field Mapping

**E-ADR Markdown → ADR Kit YAML:**

```yaml
# E-ADR Header (bold text)
**Status:** Accepted
**Implementation:** Complete
**Date:** 2026-01-07
**Author:** Erik Gallmann

# Maps to ADR Kit frontmatter
schema_version: "1.0"
adr_type: logical  # or physical
id: ADR-L-0001
title: "Extracted from E-ADR title"
status: accepted  # lowercase
created_date: "2026-01-07"
authors: ["erik.gallmann"]
domains: ["recon", "architecture"]
tags: ["recon", "provisional-execution"]

# E-ADR Sections → ADR Kit fields
Context section → context: |
Decision section → decisions[].summary
Rationale section → decisions[].rationale
Specification section → invariants[] or component_specifications[]
Consequences section → decisions[].consequences
```

### Phase 4: Reverse Engineering (Physical ADRs)

For Physical ADRs, implementation details were **reverse-engineered from actual source code**:

- **Technology stack**: Extracted from `package.json` and imports
- **Component specifications**: Identified from `src/` directory structure
- **Implementation identifiers**: Mapped to actual file paths, classes, functions
- **Specification details**: Combined E-ADR spec with actual implementation patterns

**Example (ADR-P-0004 MCP Server):**
```yaml
technology_stack:
  - category: library
    name: "@modelcontextprotocol/sdk"
    version: "1.25.3"  # From package.json
    rationale: "Standard MCP protocol implementation"

component_specifications:
  - id: COMP-0001
    name: "MCP Server"
    implementation_identifiers:
      module_path: "src/mcp/mcp-server.ts"  # Actual file
```

This approach recognizes that ste-runtime was built with rigor - the implementation is the source of truth for Physical ADR details.

### Phase 5: Validation

All migrated ADRs validated successfully:
- ✓ JSON Schema validation (0 errors)
- ✓ Pydantic model validation (0 errors)
- ✓ Cross-reference validation (all related_adrs exist)
- ✓ Implementation identifiers point to real files

### Phase 6: Generation

Auto-generated artifacts using ADR Kit services:
- `manifest.yaml` - Discovery index (11 ADRs, 13 invariants)
- Historical `rendered/*.md` - Human-readable markdown views (11 files; superseded by `adrs/adr-projection/` in the 2026-08-12 v1.3 migration)

### Phase 7: RECON Validation

Ran RECON on ste-runtime codebase to validate graph extraction:
- ✓ 791 slices extracted from TypeScript source
- ✓ 213 graph nodes, 312 edges
- ✓ 0 conflicts detected
- ✓ RSS queries work correctly

## What Was Preserved?

- **All narrative content**: Embedded in YAML as Markdown
- **All metadata**: Status, dates, authors, authority
- **All sections**: Context, Decision, Rationale, Specification, Consequences
- **Historical record**: Original E-ADRs archived in `documentation/e-adr-archived/`

## What Was Enhanced?

- **Structured metadata**: YAML frontmatter with strict schema
- **Explicit relationships**: `related_adrs`, `implements_logical` fields
- **Invariants extracted**: 13 invariants identified from specifications
- **Technology stack**: Reverse-engineered from package.json
- **Component specs**: Mapped to actual implementation files
- **Discovery index**: Manifest enables fast queries by domain, status, technology

## What Was Lost?

**Nothing.** Original E-ADRs are archived with full history preserved.

## Accessing Original E-ADRs

Original E-ADRs are archived in `documentation/e-adr-archived/` with a deprecation notice pointing to the new ADR Kit versions.

## Tooling

All migration tooling is available in [adr-architecture-kit](https://github.com/egallmann/adr-architecture-kit):

```bash
# Migrate other projects
python scripts/migrate_e_adrs.py \
  --input-dir path/to/e-adrs \
  --output-dir path/to/adrs \
  --ste-runtime-root path/to/project
```

## Future Migrations

The migration tooling is designed to be reusable for:
- Other Markdown ADR formats (Nygard template, ADR Tools)
- Legacy documentation to structured ADRs
- Cross-project ADR consolidation

## References

- [ADR Kit Schema](https://github.com/egallmann/adr-architecture-kit/tree/main/schema)
- [STE Architecture Specification](../spec/ste-spec/)
- [Original E-ADRs (archived)](../documentation/e-adr-archived/)
