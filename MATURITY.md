# ste-runtime Project Maturity & Production Readiness

**Current Status:** PRODUCTION WORKSPACE TOOLING (with known architectural gaps)

**Version:** 0.10.0

**Last Updated:** 2026-05-28

---

## Critical Status Summary

ste-runtime is a **component implementation** of the [STE Specification](https://github.com/egallmann/ste-spec), in active production use as workspace tooling within the ste-system and functional in non-STE contexts.

### What This Is

- ✅ Production workspace tooling for semantic extraction (RECON) and graph traversal (RSS)
- ✅ General-purpose code-to-graph extraction designed for STE Architecture IR
- ✅ Functional MCP server for Cursor IDE integration
- ✅ Validated at workspace scale (15 repos, ~952K LOC, ~23s extraction, 70MB state)
- ✅ Foundation for experimentation and custom implementations

### Current Limitations

- ❌ **NOT autonomous** — requires human-in-loop oversight (CEM substrate exists, invariant validation not operationalized)
- ❌ **NOT security-hardened** — no authentication, authorization, or access controls beyond boundary validation
- ⚠️ **Error handling not hardened** — no graceful degradation on partial extractor failures or crash recovery

---

## Autonomy Status: HUMAN-IN-LOOP REQUIRED

**ste-runtime does NOT support autonomous agent execution.**

### Why No Autonomy?

The MVC/CEM substrate exists, but invariant-based validation over CEM outputs is not yet operationalized.

**What exists:**
- ✅ **Bounded context assembly** — RSS assembles task-scoped context from entry points using bounded bidirectional traversal (maxDepth, maxNodes, visited-set convergence)
- ✅ **Convergent subgraph expansion** — `assembleContext` expands from multiple entry points via `blastRadius`, deduplicating across entries
- ✅ **Architecture intent traversal** — ADRs, invariants, decisions, capabilities, and components are traversable together within the architecture domain (23 typed relationship types, provenance classification)
- ⚠️ **Code-to-ADR cross-domain linking** — `implementation_intent` data stored on code slices; edge inference not yet in mainline RSS graph. Active prototyping via implementation-attribution-evidence artifacts.

**What is missing:**
- ❌ **Formal CEM domain invariant catalog** — definitions of valid software engineering semantics
- ❌ **RSS reasoning envelope** — output contract consistently emitting subgraph + source provenance + bounding invariants as a first-class reasoning envelope
- ❌ **Invariant validation engine** — checking assembled context against domain invariants
- ❌ **Failure classification** — when context violates, lacks, or ambiguously satisfies an invariant

**Assessment:** The MVC/CEM substrate exists. The remaining gap is not the existence of CEM, but the operationalization of invariant-based validation over CEM outputs.

**Note:** Orchestration, trust, and attestation are handled by Gateway/ADF services (not ste-runtime concerns).

### Current Oversight Model

All operations require human oversight:

| Operation | Human Role | Required? |
|-----------|-----------|-----------|
| RECON execution | Review and approve extracted state | YES |
| RSS queries | Validate query results and context | YES |
| MCP tool calls | Monitor and supervise agent actions | YES |
| File watching | Supervise incremental updates | YES |
| Code generation | Review all generated code | YES |

**Until invariant validation is operationalized over CEM outputs and RSS emits bounding invariants, autonomous execution is prohibited.**

---

## Maturity Assessment

### Overall: IN PRODUCTION USE (known gaps remain)

**Context:** ste-runtime is **workspace tooling** that extracts code into a semantic graph and feeds structured context to Cursor agents via MCP. It is in active production use within the ste-system. It is not an infrastructure service -- concerns like monitoring, HA, and distributed state are handled by Gateway/ADF services.

**Full maturity means:** Governed autonomy (operationalized invariant validation over CEM outputs), robust error handling, and security hardening.

Known gaps for full maturity:

#### 1. Domain Invariant Integration (CEM)

**Status:** PARTIALLY IMPLEMENTED / VALIDATION NOT YET OPERATIONALIZED

CEM substrate exists (see [Autonomy Status](#autonomy-status-human-in-loop-required) for full breakdown). Remaining gap: formal invariant catalog, RSS reasoning envelope, invariant validation engine, and failure classification.

**Reference:** [E-ADR-003](documentation/e-adr-archived/E-ADR-003-CEM-Deferral.md)

#### 2. Robustness and Performance

**Status:** GOOD (validated at workspace scale)

**Demonstrated capability:**
- ✅ **Workspace-scale extraction** — 15 repos, ~952K LOC (Python, TypeScript, .NET, CloudFormation, JSON), ~23 seconds, 70MB state, 297 nodes / 444 edges merged graph
- ✅ **Single-project performance** — 107K LOC in 10 seconds, 2.1MB graph
- ✅ **Population throughput** — 653-846 slices/sec
- ⚠️ **Error recovery** — Should recover gracefully from crashes, not corrupt state
- ❌ **Graceful degradation** — Should handle partial failures (some extractors fail)

**Current state:** Performs well at workspace scale across 15 production repos. Needs robustness work (error recovery, partial failures). Codebases beyond ~1M LOC are untested.

#### 3. Security (Local Tool Context)

**Status:** PARTIAL (boundary validation implemented)

**Architecture:** MCP server runs locally via stdio (never networked), inherits user permissions, single-user only.

Security concerns for local-only tool:
- ✅ **Boundary validation** — Prevents scanning outside project (implemented)
- ⚠️ **Input validation** — Basic validation exists, needs hardening against path traversal
- ❌ **File system safety** — No safeguards against destructive operations
- ❌ **Secrets exposure** — No protection if project contains secrets in files

**Not applicable** (local-only architecture):
- ~~Network authentication/authorization~~ (inherits OS user permissions)
- ~~Rate limiting~~ (single-user, local process)
- ~~Multi-user access controls~~ (single-user only)
- ~~Network security~~ (stdio-based, never networked)

**Current state:** Local development tool with basic boundary enforcement. Adequate for supervised use.

#### 4. Testing and Validation

**Status:** PARTIAL (60.45% overall statement coverage, 915 tests)

- ✅ **Workspace-scale validation** — 15 repos, ~952K LOC extracted successfully
- ✅ **915 tests across 76 files** — recon, mcp, watch, rss, extractors, workspace, architecture, cli, task, discovery
- ⚠️ **1 failing test** — `projection-families.test.ts` (governance-projection compression overrides)
- ⚠️ **Coverage uneven** — RECON core at 91%, but phases at 50%, CLI at 23%, discovery at 31%
- ❌ Integration test suite (end-to-end scenarios)
- ❌ Failure mode testing (corrupt files, disk full, etc.)
- ❌ Performance regression testing

**Current state:** Unit tests cover core functionality. Coverage dropped from ~67% to ~60% as new modules (architecture, workspace, discovery) were added without proportional test coverage.

#### 5. Operational Concerns (Service-Level)

**Status:** NOT APPLICABLE (local tool, not service)

These are concerns for Gateway/ADF services, not local developer tools:
- ~~Monitoring/observability~~ (you see it running)
- ~~Alerting/incident response~~ (just restart it)
- ~~Disaster recovery~~ (re-run RECON)
- ~~High availability~~ (single-user, local process)
- ~~Distributed state~~ (local files only)
- ~~Orchestration~~ (Gateway/ADF concern)
- ~~Trust/attestation~~ (Gateway/ADF concern)

---

## Component Maturity Matrix

### Core Components

**Coverage measured 2026-05-28** (915 tests, 76 files, overall 60.45% statements).

| Component | Status | Stmt Coverage | Gaps |
|-----------|--------|---------------|------|
| **RECON Core** | Stable | 91.65% | Error recovery on crash, graceful degradation |
| **RECON Phases** | Functional | 50.45% | Inference (28%), normalization (35%) need coverage |
| **RECON Validation** | Stable | 89.24% | Minor gaps in graph/coverage validators |
| **RSS Graph Traversal** | Stable | 64.56% | Conversational query (20%), graph-traversal (65%) |
| **MCP Server** | Functional | 67.84% | mcp-server.ts core (20%), operational tools (44%) |
| **File Watching** | Functional | 70.50% | file-watcher (13%), regression-detector (17%) |
| **CLI Tools** | Functional | 22.69% | recon-cli (0%), rss-cli (0%); setup/evidence tested |
| **Architecture** | Functional | 53.69% | context-rationale (0%), dec-gravity (0%), governance-projection (0%) |
| **Workspace** | Functional | 64.85% | workspace-recon (0%), slice-emitter (21%) |
| **Discovery** | Experimental | 30.64% | project-discovery (10%) |
| **Task** | Stable | 100% | -- |

### Language Extractors

| Extractor | Status | Stmt Coverage | Known Limitations |
|-----------|--------|---------------|-------------------|
| **ADR YAML** | Stable | 100% | -- |
| **TypeScript** | Functional | 65.58% | Missing JSDoc extraction, incomplete type inference |
| **Python** | Functional | 64.51% | Limited validation, basic import resolution |
| **C#/.NET** | Experimental | 0% | Regex-based shallow extraction; no tests; used on dotnet repos |
| **CloudFormation** | Functional | 84.40% | Some resource types incomplete, no cross-stack refs |
| **JSON** | Stable | 94.59% | Basic schema inference, no validation |
| **Angular** | Experimental | 46.05% | Incomplete template parsing, basic component detection |
| **CSS/SCSS** | Stable | 95.79% | Basic token extraction, limited semantic analysis |

### Maturity Levels Defined

| Level | Definition | Test Coverage | Production Use |
|-------|------------|---------------|----------------|
| **Experimental** | Basic functionality, incomplete coverage | <60% | With oversight only |
| **Functional** | Core features work, some gaps remain | 60-80% | Yes, with known limitations |
| **Stable** | Well-tested, comprehensive coverage | 80-95% | Yes |
| **Hardened** | Battle-tested, robust error handling, security hardened | >95% | Yes, fully autonomous |

**No component is currently at "Hardened" level.** Stable and Functional components are in active production use with human oversight.

---

## Use Case Guidance

### Supported Use Cases

✅ **Production workspace tooling** -- semantic extraction and graph-based context for development workflows  
✅ **STE system integration** -- Architecture IR provider within the ste-system  
✅ **Non-STE workspace tooling** -- general-purpose code-to-graph extraction in any codebase  
✅ **MCP-based IDE integration** -- structured context delivery to Cursor agents  
✅ **Forking for custom implementations** (encouraged)  
✅ **Contributing to STE specification** development  

### Not Supported

❌ **Autonomous agent execution** without human oversight (CEM invariant validation not operationalized)  
❌ **Multi-user or concurrent access** scenarios (single-process, stdio architecture)  
❌ **Codebases >1M LOC** without performance validation (validated up to ~952K LOC across 15 repos)  

---

## Path to Full Maturity

**Note:** ste-runtime is already in production use as workspace tooling. "Full maturity" means governed autonomy (operationalized invariant validation over CEM outputs), robust error handling, and security hardening. Service-level concerns (monitoring, HA, orchestration) are handled by Gateway/ADF components.

Remaining gaps:

### 1. Operationalizing CEM Invariant Validation

**CEM substrate exists. Validation over outputs is the remaining gap.**

- [x] MVC/CEM substrate (bounded context assembly, convergent subgraph expansion)
- [x] RSS task-scoped context assembly (bounded bidirectional traversal)
- [x] ADR integration (intent, invariants, decisions, capabilities traversable together)
- [ ] Formal CEM domain invariant catalog (valid software engineering semantics)
- [ ] RSS reasoning envelope (subgraph + source provenance + bounding invariants as output contract)
- [ ] Invariant validation engine (check assembled context against domain invariants)
- [ ] Failure classification (violation, absence, ambiguous satisfaction of invariants)

**Why critical:** RSS assembles bounded, task-scoped context. Without invariant validation over that output, the LLM has no formal constraints on its reasoning. Operationalizing validation is what enables governed autonomy.

### 2. Robustness and Error Handling

- [ ] Graceful degradation (handle partial extractor failures)
- [ ] Error recovery (don't corrupt state on crash)
- [ ] Progress reporting (long-running RECON feedback)

**Note:** Performance is good -- validated at workspace scale (~952K LOC across 15 repos in ~23s).

### 3. Security (Local Tool Context)

**ste-runtime MCP is local-only (never networked).**

Required for local tool:
- [ ] Input validation hardening (path traversal, injection attacks)
- [ ] File system operation safeguards (prevent destructive operations)
- [ ] Secrets management (prevent secrets in extracted state)

**Not applicable** (MCP never network-exposed):
- ~~Network authentication/authorization~~
- ~~Rate limiting~~
- ~~Multi-tenant isolation~~
- ~~TLS/encryption~~

### 4. Extractor Maturity

- [x] Production validation (extractors running on 15 production repos, ~952K LOC across Python, TypeScript, .NET, CloudFormation, JSON)
- [ ] Completeness guarantees (document coverage expectations per extractor)
- [ ] Error handling hardening (don't crash on malformed code)
- [ ] Performance tuning per extractor

### 5. Testing and Quality

- [ ] 90%+ test coverage across all components
- [ ] Integration test suite (end-to-end scenarios)
- [x] Workspace-scale validation (~952K LOC across 15 repos)
- [ ] Failure mode testing (corrupt files, disk full, etc.)
- [ ] Performance regression testing

**Note:** Service-level concerns (monitoring, HA, distributed state, orchestration, trust/attestation) are handled by Gateway/ADF services, not ste-runtime.

---

## Why This Status Document Exists

This document exists to set clear expectations about what ste-runtime can and cannot do today, and what architectural gaps remain for full maturity.

### Common Misinterpretations to Avoid

1. **"It works in production, so it supports autonomous agents"**  
   → NO. The CEM substrate exists, but invariant validation over CEM outputs is not operationalized. RSS assembles bounded context but does not yet emit bounding invariants as part of its output contract. Without that, no governed autonomy.

2. **"File watching and auto-RECON means it can run autonomously"**  
   → NO. Human oversight required. Invariant validation not operationalized (can't formally bound LLM cognition without it).

3. **"Self-validating architecture means fully hardened"**  
   → NO. Validation catches schema issues, not domain invariant violations (invariant validation engine not built). Error recovery and graceful degradation still need work.

4. **"General-purpose extraction means it handles any scale"**  
   → MOSTLY. Validated up to ~952K LOC across 15 repos (~23s). Codebases beyond ~1M LOC are untested.

---

## Questions and Clarifications

### Q: Can I use this as workspace tooling?

**A:** Yes. ste-runtime is in active production use as workspace tooling. It extracts code into a semantic graph and delivers structured context to Cursor agents via MCP. Human oversight is required for all operations.

### Q: Can I use this in a CI/CD pipeline?

**A:** Not without additional work. ste-runtime is designed for interactive workspace use (stdio-based MCP). CI/CD integration would need error recovery, headless operation mode, and performance validation at your scale.

### Q: Does this support autonomous agent execution?

**A:** No. The CEM substrate exists (bounded context assembly, ADR integration), but invariant validation over CEM outputs is not operationalized. Until RSS emits bounding invariants and a validation engine checks context against them, all operations require human-in-loop oversight. See the Autonomy Status section.

### Q: Can I use this outside the ste-system?

**A:** Yes. The semantic graph is general-purpose code-to-graph extraction. It is designed for STE Architecture IR but works in non-STE contexts.

### Q: Can I fork this?

**A:** Yes, forking is encouraged. You assume responsibility for any additional hardening, security, and operational support beyond what's provided.

---

## Version History

- **2026-05-28** — Revised to reflect production use and current data
  - Updated status from EXPERIMENTAL to PRODUCTION WORKSPACE TOOLING
  - Reframed document from "not production-ready" to "in production with known gaps"
  - Clarified semantic graph as general-purpose extraction (STE Architecture IR, works in non-STE contexts)
  - Updated performance benchmarks: 15-repo workspace, ~952K LOC, ~23s extraction, 70MB state
  - Flagged coverage numbers as stale (January 2026); need regeneration via `npm run test:coverage`
  - Corrected CEM status from "NOT IMPLEMENTED" to "PARTIALLY IMPLEMENTED" (substrate exists, invariant validation not operationalized)
  - Removed inapplicable compliance concerns (workspace tooling does not process regulated data)
  - Consolidated Prohibited/Appropriate use cases into Use Case Guidance
  - Reframed Path to Production as Path to Full Maturity
  - Updated Q&A to reflect current usage patterns
- **2026-01-12** — Initial maturity assessment document
  - Documented experimental status and autonomy boundaries
  - Defined component maturity matrix
  - Clarified ste-runtime as local developer tool (not infrastructure service)
  - Identified CEM invariants as critical missing piece for governed AI assistance

---

## Related Documentation

- [E-ADR-003: CEM Implementation Deferral](documentation/e-adr-archived/E-ADR-003-CEM-Deferral.md) — Original deferral context (substrate now exists; validation not operationalized)
- [CONTRIBUTING.md](CONTRIBUTING.md) — Development status and future contribution process
- [Architecture Documentation](documentation/architecture.md) — Technical architecture (current implementation)
- [STE Specification](https://github.com/egallmann/ste-spec) — Complete STE Runtime architecture

---

**This document establishes the maturity boundary for ste-runtime.**

All claims about capabilities, maturity, and known gaps should reference this document.

