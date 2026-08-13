# ste-runtime Architecture Decision Records

This directory contains ste-runtime's architecture decisions in **ADR Kit format** - a machine-verifiable, STE-compliant ADR system.

## What Changed?

**Previous format:** E-ADRs (Exploratory ADRs) in Markdown with pseudo-frontmatter  
**Current format:** ADR Kit YAML+Markdown with JSON Schema validation  
**Migration date:** 2026-03-08

## Directory Structure

```
adrs/
├── logical/          # Conceptual decisions (what/why)
│   ├── ADR-L-0001.yaml
│   ├── ADR-L-0002.yaml
│   └── ...
├── physical-system/  # Runtime/system implementation boundaries
├── physical-component/ # Concrete implementation components
├── adr-projection/   # Auto-generated markdown projections
│   ├── ADR-L-0001.md
│   └── ...
├── manifest.yaml     # Auto-generated discovery index
└── README.md         # This file
```

## ADR Types

### Logical ADRs (23 total)
Conceptual architecture decisions - the "what" and "why":
- **ADR-L-0001**: RECON Provisional Execution
- **ADR-L-0002**: RECON Self-Validation Strategy
- **ADR-L-0003**: CEM Implementation Deferral
- **ADR-L-0004**: Watchdog Authoritative Mode
- **ADR-L-0005**: Self-Configuring Domain Discovery
- **ADR-L-0006**: Conversational Query Interface
- **ADR-L-0024**: Public Source Release and Production Publication Boundary

### Physical-system ADRs (2 total)
System implementation boundaries:
- **ADR-PS-0001**: Runtime Orchestration and Assistant Integration
- **ADR-PS-0002**: Semantic Extraction Subsystem

### Physical-component ADRs (13 total)
Concrete implementation components are stored under `physical-component/`.
The former `physical/` ADR type has been retired.

## Using the Manifest

The `manifest.yaml` file provides fast discovery and statistics:

```bash
# Query by domain
grep -A 5 "by_domain:" manifest.yaml

# Query by technology
grep -A 10 "by_technology:" manifest.yaml

# View statistics
grep -A 10 "statistics:" manifest.yaml
```

**Key statistics:**
- Total ADRs: 38
- Logical ADRs: 23
- Physical-system ADRs: 2
- Physical-component ADRs: 13
- Total Invariants: 38

## ADR Kit Schema

ADRs follow the [ADR Kit v1.3 schema](https://github.com/egallmann/adr-architecture-kit):

- **YAML frontmatter** for machine-readable metadata
- **Embedded Markdown** for human-readable prose
- **JSON Schema validation** for structural correctness
- **Pydantic models** for programmatic access
- **STE-compliant** (PRIME-1, PRIME-2, SYS-2, SYS-4, SYS-5, SYS-6, SYS-13, SYS-14)

## Reading ADRs

### Option 1: Read YAML directly
```bash
cat adrs/logical/ADR-L-0001-*.yaml
```

### Option 2: Read generated markdown projection
```bash
cat adrs/adr-projection/logical/ADR-L-0001-recon-provisional-execution-for-project-level-semantic-state.md
```

### Option 3: Query via RSS
```bash
npm run rss:search "RECON decisions"
```

## Updating ADRs

### Authors

`authors` records **who wrote the decision** (human accountability), not repo ownership.
For this repository, use **`erik.gallmann`**. Do not use `ste-runtime`, `system`, or package
names — ownership is already expressed in `PROJECT.yaml` and `architecture_namespace`.

After `adr scaffold` or generator commands, set `authors` before committing.

1. Edit the canonical YAML file directly
2. Validate: `adr validate --scope . --cross-references`
3. Regenerate projections: `adr generate-adr-projection --scope .`
4. Regenerate runtime-owned registries: `node dist/cli/index.js architecture compile --project-root .`

## Migration History

**Original E-ADRs:** Archived in `documentation/e-adr-archived/`  
**Migration tool:** [adr-architecture-kit](https://github.com/egallmann/adr-architecture-kit)  
**Migration date:** 2026-03-08

See [MIGRATION.md](MIGRATION.md) for detailed migration process and rationale.

## Why ADR Kit?

1. **Machine-verifiable**: JSON Schema + Pydantic validation
2. **AI-readable**: Deterministic structure for LLM consumption
3. **Graph-integrated**: RECON extracts ADRs into semantic graph
4. **STE-compliant**: Follows System of Thought Engineering principles
5. **Discoverable**: Manifest enables fast queries (SYS-14: Index Currency)

## References

- [ADR Kit Documentation](https://github.com/egallmann/adr-architecture-kit)
- [STE Architecture Specification](../spec/ste-spec/)
- [Migration Guide](MIGRATION.md)
- [Release Strategy](adr-projection/logical/ADR-L-0024-public-source-release-and-production-publication-boundary.md)
