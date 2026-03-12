# ste-runtime vs Alternatives: Technical Comparison

**Purpose:** Compare ste-runtime to existing semantic code analysis tools and explain architectural choices.

**Last Updated:** 2026-03-08

---

## Executive Summary

ste-runtime occupies a unique position in the semantic code analysis landscape:

| Tool | Purpose | Scope | AI Integration |
|------|---------|-------|----------------|
| **tree-sitter** | Incremental parsing, syntax highlighting | Syntax trees | No (general-purpose parser) |
| **LSP** | Editor integration, code intelligence | IDE features | No (editor protocol) |
| **Kythe** | Cross-language code navigation | Enterprise code search | No (indexing system) |
| **Sourcegraph** | Code search, navigation | Enterprise platform | Limited (search-focused) |
| **ste-runtime** | AI context assembly | AI-assisted development | Yes (MCP integration, designed for AI) |

**Key Distinction:** ste-runtime is purpose-built for **AI context assembly**, not human code navigation or editor features.

---

## Detailed Comparison

### 1. tree-sitter

**What it is:**
- Parser generator and incremental parsing library
- Generates concrete syntax trees (CSTs) preserving all syntactic information
- Fast (parses on every keystroke), robust (handles errors), language-agnostic

**Strengths:**
- ✅ Extremely fast incremental parsing
- ✅ Robust error recovery
- ✅ Rich ecosystem (50+ language grammars)
- ✅ Query language for pattern matching
- ✅ Pure C implementation (no dependencies)

**Limitations:**
- ❌ **Syntax-only** — No semantic analysis (no symbol tables, no type inference)
- ❌ **No cross-file relationships** — Each file parsed independently
- ❌ **No dependency graphs** — Doesn't track imports/exports
- ❌ **Not AI-optimized** — CSTs are verbose, not designed for LLM consumption

**Why ste-runtime doesn't use tree-sitter:**
- ste-runtime needs **semantic relationships** (imports, dependencies, call graphs)
- tree-sitter provides syntax trees, not semantic graphs
- ste-runtime uses language-specific tools (TypeScript Compiler API, Python AST) that provide semantic information

**Potential integration:**
- Could use tree-sitter for **languages without semantic parsers** (Rust, Go, Java)
- Would need custom semantic analysis layer on top of tree-sitter CSTs
- **Future consideration** for expanding language support

---

### 2. Language Server Protocol (LSP)

**What it is:**
- Protocol for editor-language server communication
- Provides code intelligence features (autocomplete, go-to-definition, diagnostics)
- Semantic tokens for advanced syntax highlighting

**Strengths:**
- ✅ Industry standard (VS Code, Vim, Emacs, etc.)
- ✅ Real-time semantic analysis
- ✅ Rich semantic information (types, symbols, references)
- ✅ Incremental updates

**Limitations:**
- ❌ **Editor-focused** — Designed for human navigation, not AI context
- ❌ **Session-based** — Stateful, requires active language server
- ❌ **No persistent graph** — Information exists only in server memory
- ❌ **Request-response model** — Not optimized for bulk context assembly
- ❌ **No cross-project analysis** — Typically scoped to single workspace

**Why ste-runtime doesn't use LSP:**
- LSP is **request-response** (get definition, get references) — ste-runtime needs **bulk subgraph assembly**
- LSP servers are **stateful and session-based** — ste-runtime needs **persistent, queryable state**
- LSP is optimized for **human interaction latency** — ste-runtime optimizes for **AI token efficiency**

**Complementary, not competitive:**
- LSP provides real-time semantic info for editors
- ste-runtime provides persistent semantic graphs for AI
- Could potentially **consume LSP data** as an alternative to custom extractors

---

### 3. Kythe

**What it is:**
- Language-agnostic ecosystem for cross-language code navigation
- Indexers build semantic graphs (nodes, edges, facts)
- Hub-and-spoke model: O(L+C+B) vs O(L×C×B) integration complexity

**Strengths:**
- ✅ Cross-language semantic analysis
- ✅ Persistent graph storage
- ✅ Rich schema (definitions, references, call graphs)
- ✅ Enterprise-scale (Google's internal code search)

**Similarities to ste-runtime:**
- Both build persistent semantic graphs
- Both use language-specific indexers
- Both support cross-references and dependency analysis

**Key Differences:**

| Aspect | Kythe | ste-runtime |
|--------|-------|-------------|
| **Primary Use Case** | Human code navigation | AI context assembly |
| **Graph Schema** | General-purpose (nodes, edges, facts) | AI-DOC (13 domains, MVC-optimized) |
| **Query Model** | Point queries (find definition, find references) | Subgraph assembly (context for task) |
| **Integration** | Build system integration | MCP protocol (AI assistants) |
| **Scale** | Enterprise (millions of files) | Project-level (thousands of files) |
| **Deployment** | Server infrastructure | Local developer tool |

**Why ste-runtime exists alongside Kythe:**
- Kythe optimizes for **human navigation** (jump-to-def, find-refs)
- ste-runtime optimizes for **AI context** (assemble relevant subgraph for task)
- Kythe requires **infrastructure** (indexer servers, graph storage)
- ste-runtime is **portable** (drop into project, no infrastructure)

**Potential integration:**
- Could use Kythe indexers as **alternative extractors**
- Kythe's graph could be **transformed into AI-DOC format**
- **Future consideration** for enterprise-scale deployments

---

### 4. Sourcegraph

**What it is:**
- Enterprise code search and navigation platform
- Code graph for semantic search across repositories
- AI features (Cody) for code assistance

**Strengths:**
- ✅ Enterprise-scale code search
- ✅ Cross-repository analysis
- ✅ Web-based interface
- ✅ AI integration (Cody assistant)

**Limitations:**
- ❌ **Platform-dependent** — Requires Sourcegraph instance
- ❌ **Search-focused** — Not optimized for context assembly
- ❌ **Proprietary** — Not open-source (core platform)

**Why ste-runtime is different:**
- Sourcegraph is a **platform** — ste-runtime is a **library**
- Sourcegraph optimizes for **search** — ste-runtime optimizes for **context assembly**
- Sourcegraph requires **infrastructure** — ste-runtime is **portable**

---

## ste-runtime's Unique Position

### What ste-runtime Does Differently

1. **AI-First Design**
   - Graph schema optimized for LLM consumption (AI-DOC format)
   - Two-layer context assembly (metadata + source code)
   - MCP protocol integration for seamless AI assistant use

2. **Context Assembly, Not Navigation**
   - Assembles **complete subgraphs** for AI tasks (not point queries)
   - Optimizes for **token efficiency** (relevant context, minimal noise)
   - Supports **natural language queries** ("add auth to endpoints")

3. **Portable and Lightweight**
   - Drop into any project (no infrastructure)
   - Local file-based storage (`.ste/state/`)
   - Single-process architecture

4. **Deterministic and Reproducible**
   - Content-addressable state
   - Same source → same graph
   - Supports validation and self-healing

### What ste-runtime Doesn't Do

- ❌ **Not a code editor** — Doesn't provide IDE features
- ❌ **Not a search engine** — Doesn't index millions of repos
- ❌ **Not real-time** — Graph updates via RECON (not on-keystroke)
- ❌ **Not production-ready** — Research prototype (see MATURITY.md)

---

## Architectural Choices: Why Not Use X?

### Why Not Use tree-sitter for All Languages?

**Considered:** Use tree-sitter as universal parser, add semantic layer on top.

**Decision:** Use language-specific semantic parsers (TypeScript Compiler API, Python AST).

**Rationale:**
- tree-sitter provides **syntax**, not **semantics**
- Building semantic layer on CSTs would duplicate work already done by language-specific tools
- TypeScript Compiler API and Python AST provide **type information, symbol resolution, import graphs**
- tree-sitter is better for **languages without semantic parsers** (future work)

**Future:** Could use tree-sitter for Rust, Go, Java where semantic parsers are complex.

---

### Why Not Consume LSP Data?

**Considered:** Connect to LSP servers, consume semantic tokens and symbol info.

**Decision:** Build custom extractors that parse source directly.

**Rationale:**
- LSP is **session-based** — requires active language server
- LSP is **request-response** — not optimized for bulk extraction
- LSP data is **ephemeral** — exists only in server memory
- Direct parsing is **deterministic** — same source always produces same graph

**Future:** Could use LSP as **alternative data source** for languages where direct parsing is difficult.

---

### Why Not Build on Kythe?

**Considered:** Use Kythe indexers, transform Kythe graph to AI-DOC format.

**Decision:** Build custom RECON pipeline with language-specific extractors.

**Rationale:**
- Kythe requires **infrastructure** (indexer servers, graph storage)
- Kythe schema is **general-purpose** — not optimized for AI context assembly
- Kythe is **enterprise-scale** — overkill for project-level analysis
- Custom extractors provide **control over semantic extraction**

**Future:** Could integrate Kythe indexers for **enterprise deployments** or **complex languages**.

---

## Potential Future Integrations

### Short-Term (v1.x)

1. **tree-sitter for Additional Languages**
   - Use tree-sitter for Rust, Go, Java
   - Build semantic analysis layer on top of CSTs
   - Faster language support expansion

2. **LSP as Alternative Data Source**
   - Consume LSP semantic tokens as fallback
   - Use for languages without custom extractors
   - Hybrid approach: custom extractors + LSP

### Long-Term (v2.x+)

3. **Kythe Integration for Enterprise**
   - Transform Kythe graph to AI-DOC format
   - Leverage Kythe's cross-language analysis
   - Scale to millions of files

4. **Sourcegraph Integration**
   - Export ste-runtime graphs to Sourcegraph
   - Use Sourcegraph for cross-repo analysis
   - Integrate with Cody AI assistant

---

## Conclusion

ste-runtime is **complementary** to existing tools, not competitive:

- **tree-sitter** provides fast syntax parsing → ste-runtime could use it for new languages
- **LSP** provides real-time editor features → ste-runtime provides persistent AI context
- **Kythe** provides enterprise code navigation → ste-runtime provides AI context assembly
- **Sourcegraph** provides platform-scale search → ste-runtime provides portable local analysis

**Unique value:** ste-runtime is the only tool **purpose-built for AI context assembly** with:
- AI-optimized graph schema (AI-DOC)
- Subgraph assembly (not point queries)
- MCP integration (seamless AI assistant use)
- Portable architecture (no infrastructure)

**Future direction:** Integrate with these tools where beneficial (tree-sitter for languages, Kythe for scale, LSP for real-time data).

---

## References

- [tree-sitter Documentation](https://tree-sitter.github.io/tree-sitter/)
- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [Kythe Overview](https://www.kythe.io/docs/kythe-overview.html)
- [Sourcegraph Code Graph](https://sourcegraph.com/docs/cody/core-concepts/code-graph)
- [STE Specification](https://github.com/egallmann/ste-spec)

---

**Related Documentation:**
- [Architecture](../architecture.md) — ste-runtime technical architecture
- [MATURITY.md](../../MATURITY.md) — Production readiness assessment
- [ADR-L-0001](../../adrs/rendered/ADR-L-0001.md) — RECON design decisions

