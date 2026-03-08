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
├── physical/         # Implementation specs (how)
│   ├── ADR-P-0001.yaml
│   ├── ADR-P-0002.yaml
│   └── ...
├── rendered/         # Auto-generated markdown views
│   ├── ADR-L-0001.md
│   └── ...
├── manifest.yaml     # Auto-generated discovery index
└── README.md         # This file
```

## ADR Types

### Logical ADRs (6 total)
Conceptual architecture decisions - the "what" and "why":
- **ADR-L-0001**: RECON Provisional Execution
- **ADR-L-0002**: RECON Self-Validation Strategy
- **ADR-L-0003**: CEM Implementation Deferral
- **ADR-L-0004**: Watchdog Authoritative Mode
- **ADR-L-0005**: Self-Configuring Domain Discovery
- **ADR-L-0006**: Conversational Query Interface

### Physical ADRs (5 total)
Implementation specifications - the "how":
- **ADR-P-0001**: RSS CLI Implementation
- **ADR-P-0002**: JSON Data Extraction
- **ADR-P-0003**: Angular/CSS Semantic Extraction
- **ADR-P-0004**: ste-runtime MCP Server
- **ADR-P-0005**: Extractor Validation Requirements

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
- Total ADRs: 11
- Logical ADRs: 6
- Physical ADRs: 5
- Total Invariants: 13

## ADR Kit Schema

ADRs follow the [ADR Kit v1.0 schema](https://github.com/egallmann/adr-architecture-kit):

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

### Option 2: Read rendered markdown
```bash
cat adrs/rendered/ADR-L-0001.md
```

### Option 3: Query via RSS
```bash
npm run rss:search "RECON decisions"
```

## Updating ADRs

1. Edit YAML file directly
2. Validate: `python -m adr_kit.validator adrs/logical/ADR-L-0001.yaml`
3. Regenerate manifest: `python -m adr_kit.generators.manifest_generator adrs/`
4. Regenerate views: `python -m adr_kit.generators.views.markdown adrs/`

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
