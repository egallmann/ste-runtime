# Glossary

Definitions of terms and concepts used in ste-runtime, a component implementation of the [System of Thought Engineering (STE) Specification](https://github.com/egallmann/ste-spec).

**Note:** This glossary is aligned with the [STE Specification Glossary](../../spec/ste-spec/glossary.md). For authoritative definitions, refer to the specification.

**Important:** ste-runtime implements a subset of STE Runtime components (RECON and RSS). The complete STE Runtime architecture includes additional services (AI-DOC Fabric, STE Gateway, Trust Registry) not implemented in this repository.

---

## A

### AI-DOC

**AI-Documentation** - The semantic graph format used by ste-runtime and the complete STE Runtime system. AI-DOC represents code as structured semantic entities (functions, classes, modules, etc.) stored as YAML files.

**See:** [E-ADR-001](../e-adr/E-ADR-001-RECON-Provisional-Execution.md)

---

### Assertion

A semantic claim about source code. Assertions are extracted from source files and represent elements like functions, classes, imports, etc.

**Types:**
- **Raw Assertion** - Initial extraction from source
- **Normalized Assertion** - Processed into AI-DOC format

---

## B

### Blast Radius

The complete impact surface of changing a component. Includes all dependencies, dependents, and transitive relationships.

**Usage:**
```bash
ste rss blast-radius graph/function/myFunction
```

**See:** [RSS Usage Guide](../../instructions/RSS-USAGE-GUIDE.md)

---

### Boundary Enforcement

Security mechanism that prevents RECON from scanning outside the allowed project scope. Ensures RECON never accesses parent directories, home directories, or system directories.

**See:** [Boundary Enforcement](../security/boundary-enforcement.md)

---

## C

### CEM (Cognitive Execution Model)

**Cognitive Execution Model** - The 9-stage execution lifecycle defined in the STE Specification that orchestrates governed AI cognition. Stages: Initialization → State Loading → Pre-Task Validation → Divergence Detection → Divergence Communication → Correction and Reconvergence → Reasoning Execution → Post-Task Validation → Final Convergence.

**Status in ste-runtime:** Not implemented (deferred per [E-ADR-003](../e-adr/E-ADR-003-CEM-Deferral.md)). Human-in-loop provides implicit CEM governance during development.

**See:** [STE Cognitive Execution Model](../../spec/ste-spec/execution/STE-Cognitive-Execution-Model.md) in the STE Specification

---

### Context Assembly

The process of bundling relevant semantic entities and source code for a specific task. Layer 2 operation that combines graph metadata with actual source files.

**Usage:**
```bash
ste rss context "add rate limiting to auth endpoints"
```

**See:** [Two-Layer Context Assembly](../innovations/Two-Layer-Context-Assembly.md)

---

### MVC (Minimally Viable Context)

**Minimally Viable Context** - The bounded, task-relevant context assembled by RSS for LLM reasoning. MVC prevents context window overflow by including only the semantic entities and source code necessary for a specific task.

**Implementation:** Implemented in ste-runtime via the `assembleContext` function in RSS operations. Takes entry points and traverses the graph to assemble minimal viable context with configurable depth and node limits.

**See:** [RSS Operations](../../src/rss/rss-operations.ts), [STE Architecture Specification](../../spec/ste-spec/architecture/STE-Architecture.md) Section 4.6

---

### Content-Addressable Naming

Naming scheme where slice filenames are SHA-256 hashes of their content. Provides deterministic, collision-free naming.

**Benefits:**
- Deterministic (same content → same filename)
- No filesystem limits
- Performance improvement (11-23%)

**See:** [Content-Addressable Naming](../reference/content-addressable-naming.md)

---

## D

### Dependency

A relationship where one component depends on another. Examples: imports, function calls, resource references.

**Types:**
- **Import** - Module-to-module dependency
- **Dependency** - Generic dependency (DependsOn, injection, etc.)

**See:** [Inference Phase Enhancements](../implementation/inference-phase-enhancements.md)

---

### Domain

A category of semantic entities. Examples: `graph` (code structure), `api` (endpoints), `data` (entities), `infrastructure` (resources).

**13-Domain Model:**
- `graph` - Code structure (modules, functions, classes)
- `api` - API endpoints
- `data` - Data entities
- `infrastructure` - Cloud resources
- `frontend` - UI components
- `backend` - Server-side code
- And 7 more...

---

## E

### E-ADR

**Exploratory Architectural Decision Record** - Documents architectural decisions made during development. E-ADRs are exploratory (reversible) and may graduate to formal ADRs.

**See:** [E-ADR Directory](../e-adr/)

---

### Extractor

A language-specific module that extracts semantic assertions from source code. Each supported language has an extractor.

**Examples:**
- TypeScript Extractor - AST-based extraction
- Python Extractor - Subprocess-based extraction
- CloudFormation Extractor - Template parsing

**See:** [Extractor Development Guide](../e-adr/E-ADR-008-Extractor-Development-Guide.md)

---

## G

### Graph Edge

A relationship between two semantic entities in the graph. Edges represent dependencies, imports, calls, etc.

**Creation:**
- Extracted from source code (imports, dependencies)
- Inferred by inference phase
- Stored in slice `references` field

**See:** [Extractor Validation Status](../implementation/extractor-validation-status.md)

---

### Graph Metrics

Analysis of graph topology (structure, depth, patterns). Used to optimize query parameters like traversal depth.

**Metrics:**
- Component count
- Average depth
- Graph pattern (flat, hierarchical, etc.)
- Recommended depth

**See:** [Graph Topology Analyzer](../../src/mcp/graph-topology-analyzer.ts)

---

## I

### Incremental RECON

RECON mode that processes only changed files. Faster than full RECON, used for regular updates.

**Usage:**
```bash
ste recon  # Incremental (default)
```

**See:** [RECON README](../../instructions/RECON-README.md)

---

### Inference Phase

RECON Phase 3 that infers relationships from raw assertions. Converts import/dependency metadata into graph edges.

**Process:**
1. Collects relationship assertions
2. Resolves module/dependency references
3. Creates graph edges
4. Establishes bidirectional relationships

**See:** [Inference Phase Enhancements](../implementation/inference-phase-enhancements.md)

---

## M

### MCP

**Model Context Protocol** - Standardized protocol for AI assistants to discover and use tools. ste-runtime implements MCP to expose RSS operations to Cursor IDE.

**See:** [MCP Setup Guide](./mcp-setup.md)

---

### Module

A source file represented in the semantic graph. Contains metadata about exports, imports, and file-level information.

**ID Format:** `module-src-path-to-file`

---

## N

### Normalization

RECON Phase 4 that converts raw assertions into normalized AI-DOC slices. Ensures consistent structure and content-addressable naming.

**Process:**
1. Validates assertions
2. Generates slice IDs
3. Creates content-addressable filenames
4. Writes YAML files

---

## O

### Orphaned Slice

A slice whose source file has been deleted. Detected by RECON Phase 6 and automatically removed.

**Behavior:**
- Informational message (not an error)
- Automatically cleaned up
- No action needed

---

## R

### RECON

**Reconciliation Engine** - The semantic extraction pipeline that generates AI-DOC state from source code.

**Phases:**
1. Discovery - Find source files
2. Extraction - Extract semantic assertions
3. Inference - Infer relationships
4. Normalization - Create slices
5. Population - Write to disk
6. Validation - Self-healing
7. Self-Validation - Generate reports

**See:** [RECON README](../../instructions/RECON-README.md)

---

### RSS

**Runtime State Slicing** - Graph traversal protocol for deterministic context assembly. Starts at entry points, traverses explicit references with depth bounds, assembles Minimally Viable Context. Includes convergence validation for multi-entry traversals. Deterministic: same entry points → same traversal → same context.

**Operations:**
- `search` - Find components
- `dependencies` - Forward traversal
- `dependents` - Backward traversal
- `blast-radius` - Impact analysis
- `context` - Context assembly

**Authority:** [STE Specification Glossary (ste-spec)](../../spec/ste-spec/glossary.md)

**See:** [RSS Usage Guide](../../instructions/RSS-USAGE-GUIDE.md)

---

## S

### Self-Healing

RECON Phase 6 mechanism that automatically fixes corrupted or manually-edited slices. Regenerates slices from source when they don't match.

**Behavior:**
- Detects slice-source mismatches
- Regenerates from source
- No conflicts (slices are derived artifacts)

**See:** [Self-Healing Implementation](../reference/phase-6-self-healing-implementation.md)

---

### Slice

A single semantic entity in AI-DOC format. Stored as a YAML file with content-addressable naming.

**Structure:**
- `_slice` - Metadata (ID, domain, type)
- `element` - Semantic element data
- `provenance` - Source information

**Properties:**
- Derived artifact (always regenerated from source)
- Content-addressable filename
- Self-healing (corruption automatically fixed)

**See:** [E-ADR-001](../e-adr/E-ADR-001-RECON-Provisional-Execution.md)

---

### Source of Truth

**Source code is the only source of truth.** AI-DOC slices are derived artifacts that always reflect source code. Manual edits to slices are considered corruption and are automatically overwritten.

**See:** [Authoritative Semantics Correction](../reference/authoritative-semantics-correction.md)

---

## T

### Transaction Detection

Watchdog feature that detects multi-file edits and batches them into a single RECON run. Prevents excessive RECON triggers during refactoring.

**Window:** 3 seconds (default)

**See:** [E-ADR-007](../e-adr/E-ADR-007-Watchdog-Authoritative-Mode.md)

---

### Two-Layer Architecture

Design pattern that separates fast structural queries (Layer 1) from rich context assembly (Layer 2).

**Layer 1:** Metadata only, <100ms
**Layer 2:** Metadata + source code, 100-500ms

**See:** [Two-Layer Context Assembly](../innovations/Two-Layer-Context-Assembly.md)

---

## V

### Validation

RECON Phase 7 that generates validation reports. Non-blocking, report-only validation that surfaces observations without halting execution.

**Categories:**
- ERROR - Critical issues
- WARNING - Potential issues
- INFO - Informational findings

**See:** [E-ADR-002](../e-adr/E-ADR-002-RECON-Self-Validation.md)

---

## W

### Watchdog

File watching system that monitors project files and automatically triggers incremental RECON on changes.

**Features:**
- Debouncing (500ms manual, 2s AI edits)
- Transaction detection
- Syntax validation
- Opt-in (disabled by default)

**See:** [E-ADR-007](../e-adr/E-ADR-007-Watchdog-Authoritative-Mode.md)

---

## Related Documentation

- [Configuration Reference](./configuration-reference.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [FAQ](./faq.md)
- [E-ADRs](../e-adr/)

---

**Last Updated:** 2026-01-11

