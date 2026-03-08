# E-ADR to ADR Kit Migration

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
- `rendered/*.md` - Human-readable markdown views (11 files)

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
