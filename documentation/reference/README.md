# Reference Documentation

This directory contains supplementary reference material that provides deeper context and analysis beyond the formal E-ADR specifications.

---

## Contents

### [`content-addressable-naming.md`](./content-addressable-naming.md)
**Full context for content-addressable slice naming design decision**

- Why slice filenames are 16-character SHA-256 hashes
- Failure mode discovered (Angular component names exceeded filesystem limits)
- Performance impact (+11-23% improvement)
- Debugging workflow (RSS queries, not filenames)
- Design rationale and future considerations

**Related E-ADRs:** E-ADR-001 (Slice Storage section), E-ADR-006 (Appendix)

---

### [`performance-benchmarks.md`](./performance-benchmarks.md)
**Baseline performance metrics for RECON execution**

- Benchmark results: 9 seconds for 256 files (864 slices)
- Population throughput: 653-846 slices/second
- E-ADR-007 overhead analysis: 168ms (1.8% of total time)
- Phase-by-phase breakdown (Discovery, Extraction, Population, etc.)
- Scalability projections and optimization opportunities
- Historical comparison (pre/post content-addressable naming)

**Related E-ADRs:** E-ADR-001 (performance metrics), E-ADR-007 (overhead analysis)

---

## Purpose

**Reference documentation serves to:**
1. Provide detailed context for design decisions
2. Document performance characteristics and expectations
3. Explain "why" and "how" beyond formal E-ADR decisions
4. Offer guidance for users debugging or optimizing RECON

**Difference from E-ADRs:**
- **E-ADRs** = Formal architectural decisions ("what we decided")
- **Reference** = Background context and analysis ("why and how it works")

---

## When to Add Reference Documentation

Create reference documents when:
-  A design decision requires extensive context (failure modes, alternatives considered)
-  Performance characteristics need detailed documentation
-  Users will need this information for debugging or optimization
-  The detail would clutter the formal E-ADR specification

**Do NOT create reference docs for:**
-  Work-in-progress plans (use `/documentation/plan/` if needed)
-  Internal project notes (keep in parent project)
-  Temporary analysis (should be deleted after decision)

---

## Maintenance

-  Keep reference docs up-to-date when related E-ADRs change
-  Add cross-references between E-ADRs and reference docs
-  Update performance benchmarks after significant changes
-  Archive outdated reference docs (don't delete - historical context)

---

**Last Updated:** 2026-01-07



