# ste-runtime Project Maturity & Production Readiness

**Current Status:** EXPERIMENTAL / RESEARCH PROTOTYPE

**Version:** 0.9.0-experimental

**Last Updated:** 2026-01-12

---

## Critical Status Summary

ste-runtime is a **component implementation and research prototype** of the [STE Specification](https://github.com/egallmann/ste-spec).

### What This Is

- ✅ Working implementation of RECON (semantic extraction) and RSS (graph traversal) components
- ✅ Functional MCP server for Cursor IDE integration
- ✅ Research prototype demonstrating AI-DOC architecture concepts
- ✅ Foundation for experimentation and custom implementations

### What This Is NOT

- ❌ **NOT production-ready software**
- ❌ **NOT autonomous** (requires human-in-loop oversight)
- ❌ **NOT security-hardened** (no authentication, authorization, or access controls)
- ❌ **NOT performance-optimized** for large-scale production use
- ❌ **NOT supported** for mission-critical or compliance-regulated environments

---

## Autonomy Status: HUMAN-IN-LOOP REQUIRED

**ste-runtime does NOT support autonomous agent execution.**

### Why No Autonomy?

Per [E-ADR-003: CEM Implementation Deferral](documentation/e-adr-archived/E-ADR-003-CEM-Deferral.md):

- **CEM (domain invariants) not implemented** — No definitions of valid software engineering semantics
- **RSS invariant mapping missing** — RSS outputs graph + source, but not the invariants that bound LLM reasoning
- **No governed cognition** — Without invariants, LLM has no constraints on what it can reason over

**CEM's role in ste-runtime:**
- Defines domain invariants for software engineering semantics (what's valid API, data model, etc.)
- RSS will map semantic graph to invariants that control AI reasoning
- RSS output should be: subgraph + source code + **invariants that bound the LLM**

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

**Until CEM invariants are implemented and RSS maps them to output, autonomous execution is prohibited.**

---

## Production Readiness Assessment

### Overall: NOT PRODUCTION-READY (for robust local developer tool)

**Context:** ste-runtime is a **local developer tool** (like eslint, prettier) that feeds semantic context to Cursor agents. It's not an infrastructure service - concerns like monitoring, HA, and distributed state are handled by Gateway/ADF services.

**Production readiness means:** Reliable, accurate, safe for daily development use.

ste-runtime lacks critical components for robust local tool:

#### 1. Domain Invariant Integration (CEM)

**Status:** NOT IMPLEMENTED

**What's missing:**
- ❌ **CEM domain invariants** — Definitions of valid software engineering semantics
- ❌ **RSS invariant mapping** — RSS should output subgraph + source + invariants that bound LLM reasoning
- ❌ **Invariant validation** — Extracted state should validate against domain invariants

**Impact:** RSS currently outputs semantic graph + source code, but not the invariants that constrain what the LLM can reason over. This is the critical missing piece for governed AI assistance.

**Blocker:** CEM deferred per [E-ADR-003](documentation/e-adr-archived/E-ADR-003-CEM-Deferral.md)

#### 2. Robustness and Performance

**Status:** GOOD (validated on large production systems)

**Demonstrated capability:**
- ✅ **Large codebase performance** — 107K LOC production system (Python, TypeScript, CloudFormation, HTML, CSS) in 10 seconds, 2.1MB graph
- ✅ **Memory efficiency** — Even large graphs are small (~2MB)
- ⚠️ **Error recovery** — Should recover gracefully from crashes, not corrupt state
- ❌ **Graceful degradation** — Should handle partial failures (some extractors fail)

**Current state:** Performs well on real production codebases. Needs robustness work (error recovery, partial failures).

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

**Status:** PARTIAL (67% coverage)

Missing components:
- ❌ Integration test suite (end-to-end scenarios)
- ❌ Large project testing (validate on 100K+ LOC codebases)
- ❌ Failure mode testing (corrupt files, disk full, etc.)
- ❌ Performance regression testing

**Current state:** Unit tests cover core functionality, but not production failure scenarios or performance.

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

| Component | Status | Test Coverage | Production-Ready? |
|-----------|--------|---------------|-------------------|
| **RECON Core** | Stable | 95.73% | NO - missing error recovery, no production validation |
| **RSS Graph Traversal** | Stable | 70.51% | NO - not stress tested, no distributed state |
| **MCP Server** | Functional | 29.68% | NO - no security layer, single-process only |
| **File Watching** | Experimental | 78.42% | NO - not battle-tested, no failure recovery |
| **CLI Tools** | Minimal | 0% | NO - untested, no error handling |
| **Configuration** | Stable | ~80% | NO - no validation, no schema versioning |

### Language Extractors

| Extractor | Status | Test Coverage | Production-Ready? | Known Limitations |
|-----------|--------|---------------|-------------------|-------------------|
| **TypeScript** | Functional | ~70% | NO | Missing JSDoc extraction, incomplete type inference |
| **Python** | Functional | 66.29% | NO | Limited validation, basic import resolution |
| **CloudFormation** | Functional | 91.89% | NO | Some resource types incomplete, no cross-stack refs |
| **JSON** | Stable | 96.72% | NO | Basic schema inference, no validation |
| **Angular** | Experimental | 55.53% | NO | Incomplete template parsing, basic component detection |
| **CSS/SCSS** | Stable | 97.48% | NO | Basic token extraction, limited semantic analysis |

### Maturity Levels Defined

| Level | Definition | Test Coverage | Production Use |
|-------|------------|---------------|----------------|
| **Experimental** | Basic functionality, incomplete coverage | <60% | NO - research only |
| **Functional** | Core features work, some gaps remain | 60-80% | NO - development only |
| **Stable** | Well-tested, comprehensive coverage | 80-95% | MAYBE - with caution and oversight |
| **Production** | Battle-tested, monitored, hardened | >95% | YES - with operational support |

**No component is currently at "Production" level.**

---

## Prohibited Use Cases

### DO NOT Use ste-runtime For:

❌ **Autonomous agent execution** without human oversight  
❌ **Production deployments** in business-critical systems  
❌ **Security-sensitive environments** (no authentication/authorization)  
❌ **Compliance-regulated systems** (HIPAA, SOC2, GDPR) without extensive additional work  
❌ **Multi-user or concurrent access** scenarios (single-process architecture)  
❌ **Mission-critical workflows** (no disaster recovery or rollback)  
❌ **Large-scale codebases** (>1M LOC) without performance validation  

---

## Appropriate Use Cases

### ✅ DO Use ste-runtime For:

✅ **Local development assistance** with human oversight  
✅ **Research and experimentation** with AI-DOC architecture  
✅ **Prototyping semantic extraction** approaches  
✅ **Learning about semantic graphs** and context assembly  
✅ **Forking for custom implementations** (encouraged)  
✅ **Contributing to STE specification** development  
✅ **Educational purposes** (understanding AI-assisted development)  

---

## Path to Production (Future Work Required)

**Note:** "Production" for ste-runtime means **robust local developer tool**, not infrastructure service. Service-level concerns (monitoring, HA, orchestration) are handled by Gateway/ADF components.

To make ste-runtime production-ready **as a local developer tool** would require:

### 1. Domain Invariant Integration (CEM)

**Critical Missing Piece:**

- [ ] CEM domain invariants — Define valid software engineering semantics
- [ ] RSS invariant mapping — RSS output should include subgraph + source + **invariants that bound LLM reasoning**
- [ ] Invariant validation — Validate extracted state against domain invariants
- [ ] Domain/subdomain invariant definitions (API, data, infrastructure, etc.)

**Why critical:** RSS currently outputs semantic graph + source code. Without invariants, the LLM has no constraints on what it can reason over. CEM provides the domain knowledge that bounds AI cognition.

**Blocker:** CEM deferred per [E-ADR-003](documentation/e-adr-archived/E-ADR-003-CEM-Deferral.md)

### 2. Robustness and Error Handling

- [ ] Graceful degradation (handle partial extractor failures)
- [ ] Error recovery (don't corrupt state on crash)
- [ ] Progress reporting (long-running RECON feedback)

**Note:** Performance is good - validated on 107K LOC production system (10s, 2.1MB graph).

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

- [ ] Production validation suite (test on real-world projects)
- [ ] Completeness guarantees (document coverage expectations)
- [ ] Error handling hardening (don't crash on malformed code)
- [ ] Performance tuning per extractor

### 5. Testing and Quality

- [ ] 90%+ test coverage across all components
- [ ] Integration test suite (end-to-end scenarios)
- [ ] Large project validation (tested on 107K LOC production system ✓, needs more diversity)
- [ ] Failure mode testing (corrupt files, disk full, etc.)
- [ ] Performance regression testing

**Note:** Service-level concerns (monitoring, HA, distributed state, orchestration, trust/attestation) are handled by Gateway/ADF services, not ste-runtime.

---

## Why This Status Document Exists

This document exists to prevent misinterpretation of ste-runtime's capabilities and maturity.

### Common Misinterpretations to Avoid

1. **"MCP server works, so it's production-ready for AI agents"**  
   → NO. MCP works, but **CEM invariants not implemented**. RSS outputs graph + source, but not the invariants that bound LLM reasoning. Without invariants, no governed AI assistance.

2. **"File watching and auto-RECON means it can run autonomously"**  
   → NO. Human oversight required. CEM invariants missing (can't bound LLM cognition without them).

3. **"Version 0.9.0-experimental means almost production-ready"**  
   → NO. Version reflects architectural maturity, not production readiness. CEM invariants are the blocker.

4. **"Self-validating architecture means production reliability"**  
   → NO. Validation catches schema issues, not domain invariant violations (CEM not implemented).

5. **"Portable and drop-in means safe for any codebase"**  
   → PARTIALLY. Safe for local development with supervision. Not for autonomous use (CEM missing).

---

## Questions and Clarifications

### Q: Can I use this in my company's CI/CD pipeline?

**A:** Not recommended without extensive additional work:
- Add authentication and access controls
- Implement monitoring and alerting
- Add failure recovery and rollback
- Validate performance at your scale
- Add compliance logging if required

**Better approach:** Use locally during development, human reviews outputs before committing.

### Q: Can I deploy this for my team to use?

**A:** Only if:
- Deployed in trusted, isolated environment (no external access)
- All users understand it's experimental software
- Human oversight required for all operations
- No mission-critical workflows depend on it
- You have operational support for issues

**Not recommended** for general deployment.

### Q: When will this be production-ready?

**A:** No timeline or roadmap. This is a personal research prototype and component implementation of the STE Specification.

**Current focus:** Stabilizing foundation components (RECON, RSS, extractors) and validating architectural concepts.

Production-readiness would require significant additional work (see "Path to Production" above for what's missing).

### Q: Can I fork this for production use?

**A:** Yes, forking is encouraged, but understand:
- You assume all production hardening work
- You assume all operational support
- You assume all security responsibilities (even for local-only use)
- Significant work required (see "Path to Production" checklist)

**Recommendation:** Use as reference implementation, not production starting point.

---

## Version History

- **2026-01-12** — Initial maturity assessment document
  - Documented experimental status and autonomy boundaries
  - Defined component maturity matrix
  - Clarified ste-runtime as local developer tool (not infrastructure service)
  - Identified CEM invariants as critical missing piece for governed AI assistance

---

## Related Documentation

- [E-ADR-003: CEM Implementation Deferral](documentation/e-adr-archived/E-ADR-003-CEM-Deferral.md) — Why autonomy is not supported
- [CONTRIBUTING.md](CONTRIBUTING.md) — Development status and future contribution process
- [Architecture Documentation](documentation/architecture.md) — Technical architecture (current implementation)
- [STE Specification](https://github.com/egallmann/ste-spec) — Complete STE Runtime architecture

---

**This document establishes the narrative boundary for ste-runtime.**

All claims about capabilities, maturity, and production-readiness should reference this document.



