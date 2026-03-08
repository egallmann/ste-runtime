# E-ADR-010: Conversational Query Interface for Human-AI Seamless Context Discovery

**Status:** Proposed  
**Implementation:**  Complete  
**Date:** 2026-01-09  
**Author:** Erik Gallmann  
**Authority:** Exploratory ADR (Reversible)

> **Next Step:** Validate against ste-spec Section 4.6 (RSS) for ADR graduation. CQI extends RSS with conversational semantics.

---

## Context

E-ADR-004 established the RSS CLI and TypeScript API as the foundation for graph traversal and context assembly. However, a gap exists between:

1. **Raw RSS operations** (search, dependencies, blast-radius) - require knowing the API
2. **Natural language queries** ("Tell me about X") - how humans and AI agents actually communicate

The challenge: **How do we make RSS consumption as seamless as natural conversation?**

Observations from usage patterns:

| Pattern | Example Query | Current RSS Approach |
|---------|---------------|---------------------|
| Describe | "Tell me about X" | `search X` → `blast-radius` → manual assembly |
| Explain | "How does X work?" | Same as above |
| Impact | "What would change affect?" | `blast-radius X --depth=3` |
| List | "Show all Lambda handlers" | `by-tag handler:lambda` |
| Locate | "Where is X?" | `search X` |

Each pattern requires the caller to:
1. Know which RSS operation to use
2. Compose operations correctly
3. Parse unstructured output
4. Generate follow-up queries

This friction degrades both human UX and AI agent efficiency.

---

## Decision

**Implement a Conversational Query Interface (CQI) as a layer above RSS that:**

1. **Classifies intent** from natural language queries
2. **Routes to optimal RSS operations** automatically
3. **Caches results** for sub-millisecond repeated queries
4. **Returns structured responses** with summary, nodes, files, and suggested follow-ups
5. **Provides dual output formats** for humans (terminal) and agents (JSON)

---

## Specification

### §10.1 Intent Classification

CQI recognizes the following intents via pattern matching:

| Intent | Trigger Patterns | RSS Operations Used |
|--------|------------------|---------------------|
| `describe` | "Tell me about", "What is", "Describe" | findEntryPoints → blastRadius |
| `explain` | "How does X work", "Explain" | findEntryPoints → blastRadius |
| `list` | "List all", "Show all", "What are the" | byTag or search |
| `impact` | "What would be affected", "Blast radius" | blastRadius (depth=3) |
| `dependencies` | "What does X depend on" | dependencies |
| `dependents` | "What depends on X" | dependents |
| `relationship` | "How are X and Y related" | blastRadius (both) → intersection |
| `locate` | "Where is", "Find" | search |
| `unknown` | Fallback | findEntryPoints → assembleContext |

### §10.2 Response Schema

```typescript
interface ConversationalResponse {
  // Original query
  query: string;
  
  // Detected intent
  intent: QueryIntent;
  
  // Processing time in milliseconds
  timeMs: number;
  
  // Quick summary suitable for immediate display
  summary: string;
  
  // Primary node(s) found
  primaryNodes: NodeSummary[];
  
  // Related nodes (via traversal)
  relatedNodes: NodeSummary[];
  
  // File paths in scope (deterministic)
  filePaths: string[];
  
  // Suggested follow-up queries
  suggestedQueries: string[];
  
  // Performance metrics
  metrics: {
    searchTimeMs: number;
    traversalTimeMs: number;
    totalNodes: number;
    fromCache: boolean;
  };
}
```

### §10.3 Caching

CQI implements LRU caching with:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Max entries | 100 | Typical session variety |
| TTL | 5 minutes | Balance freshness vs performance |
| Cache key | Normalized lowercase query | Ignore case/whitespace variations |

Cached query response time: **<0.3ms** (vs 2-4ms uncached).

### §10.4 Output Formats

**Human format** (terminal):
```
════════════════════════════════════════════════════════════
Query: "Tell me about the user service"
Intent: describe | Time: 2.3ms
════════════════════════════════════════════════════════════

📋 UserService is a class in the graph domain. 
   It has 12 connections to other components.

Primary Results:
  • UserService (graph/class)
    └─ src/services/user-service.ts

Files in scope (4):
  📄 src/services/user-service.ts
  📄 src/models/user.ts
  ...

Suggested follow-ups:
  → What does UserService depend on?
  → What depends on UserService?
```

**Agent format** (JSON):
```json
{
  "query": "Tell me about the user service",
  "intent": "describe",
  "summary": "UserService is a class...",
  "primaryNodes": [...],
  "filePaths": ["src/services/user-service.ts", ...],
  "suggestedQueries": ["What does UserService depend on?", ...]
}
```

### §10.5 API

```typescript
// Engine-based (reuse context across queries)
const engine = new ConversationalQueryEngine('.ste/state');
await engine.initialize();
const response = await engine.query("Tell me about X");

// Convenience function (one-off queries)
import { ask, formatForHuman, formatForAgent } from 'ste-runtime';
const response = await ask("Tell me about X");
console.log(formatForHuman(response));  // Human terminal
console.log(formatForAgent(response));  // AI agent JSON
```

### §10.6 Fuzzy Matching

CQI uses tiered search with fuzzy matching as fallback for typo tolerance:

**Tier 1 - Exact Matching (fast path):**
| Match Type | Score |
|------------|-------|
| Exact ID match | 100 |
| ID contains query | 80 |
| Path contains query | 60 |
| Key contains query | 40 |

**Tier 2 - Fuzzy Matching (fallback):**
When Tier 1 returns no results, CQI falls back to Levenshtein distance-based matching:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `fuzzy` | `true` | Enable fuzzy fallback |
| `fuzzyThreshold` | `0.6` | Minimum similarity (0.0-1.0) |

Fuzzy matches score in the 0-39 range, ensuring exact matches always rank higher.

**Examples:**
```typescript
// Typo handled gracefully
search(ctx, 'UserServce')   // → finds "UserService" (91% similar)
search(ctx, 'lamda_handler') // → finds "lambda_handler" (93% similar)

// Disable fuzzy for strict matching
search(ctx, 'UserServce', { fuzzy: false })  // → no results
```

**Performance:** Fuzzy fallback adds ~1ms when exact search returns empty. Cached queries remain <0.3ms.

---

## Rationale

### 1. Reduces Cognitive Load for Both Humans and AI

Without CQI:
```
Human: "What would be affected by changing the auth service?"
→ Human must know: use blast-radius, specify key format, parse output
→ AI must know: compose RSS calls, format results, generate follow-ups
```

With CQI:
```
Human: "What would be affected by changing the auth service?"
→ CQI: intent=impact, blastRadius(depth=3), structured response with files
```

### 2. Intent Classification Enables Optimization

Different intents have different optimal strategies:

| Intent | Optimization |
|--------|-------------|
| `list` | Use tag query if applicable (O(n) scan vs O(1) tag lookup) |
| `impact` | Increase depth, cap nodes |
| `relationship` | Traverse both, compute intersection |
| `describe` | Get context + suggested follow-ups |

### 3. Caching Amortizes Graph Load Cost

Benchmark results:

| Metric | Value |
|--------|-------|
| Graph load (cold) | ~300-400ms |
| Uncached query | ~2-4ms |
| Cached query | **~0.2-0.3ms** |

For interactive sessions, caching provides ~10x speedup on repeated patterns.

### 4. Suggested Queries Enable Exploration

CQI generates contextual follow-ups:

```
Query: "Tell me about the auth service"
Suggested:
  → What does AuthService depend on?
  → What depends on AuthService?
  → Impact of changing AuthService
```

This guides both humans and AI agents toward productive exploration.

---

## Performance Benchmark

| Query Type | Time (ms) | Nodes Found |
|------------|-----------|-------------|
| Describe | 2-4 | 10-30 |
| List (by tag) | 0.9-1.3 | 20-50 |
| Impact | 3-4 | 40-50 |
| Dependencies | 1-2 | 1-10 |
| Fuzzy fallback | 3-5 | 1-10 |
| Cached (any) | **0.2-0.3** | — |

All queries complete in **<5ms** after graph load. Fuzzy matching adds ~1ms when exact search returns empty.

---

## Implementation

### Files

| File | Purpose |
|------|---------|
| `src/rss/conversational-query.ts` | CQI engine and formatters |
| `src/rss/rss-operations.ts` | Tiered search with fuzzy matching |
| `dist/rss/conversational-query.js` | Compiled module |

### Dependencies

- `lru-cache` - LRU caching for query results
- `rss-operations.ts` - Core RSS API with fuzzy search (E-ADR-004)

### Fuzzy Matching Algorithm

Uses Levenshtein (edit) distance with O(n) space optimization:
- Calculates minimum single-character edits (insert, delete, substitute)
- Normalizes to similarity ratio: `1 - (distance / maxLength)`
- Threshold of 0.6 catches 1-2 character typos in typical identifiers

---

## Constraints

1. **Intent classification is pattern-based**: Complex or ambiguous queries may misclassify. Fallback to `unknown` triggers generic assembly.

2. **Cache invalidation is manual**: After RECON updates the graph, call `engine.invalidateCache()`. Future: Watchdog integration (E-ADR-007).

3. **English only**: Intent patterns are English. Internationalization is out of scope.

---

## Consequences

### Positive

- **Seamless UX**: Both humans and AI agents use natural language
- **Performance**: Sub-5ms queries, <0.3ms cached
- **Discoverability**: Suggested queries guide exploration
- **Dual output**: Same engine serves terminal and programmatic use
- **Foundation for MCP**: CQI becomes the MCP tool interface

### Negative

- **Pattern maintenance**: New intent patterns require code changes
- **Cache staleness**: Risk of stale results if cache not invalidated
- **Abstraction cost**: Hides RSS complexity (may hinder advanced use)

### Mitigation

- Expose raw RSS API for power users
- Document intent patterns explicitly
- Integrate with Watchdog for automatic cache invalidation

---

## Relationship to Other Decisions

| E-ADR | Relationship |
|-------|--------------|
| E-ADR-004 (RSS CLI) | CQI consumes RSS API; CLI remains for power users |
| E-ADR-007 (Watchdog) | Future: Watchdog triggers cache invalidation |
| E-ADR-003 (CEM Deferral) | CQI is integration point when CEM arrives |

### Dependency Direction

```
RECON → AI-DOC → RSS API → CQI → [ Human, AI Agent, MCP Server ]
                    ↓
               RSS CLI (power users)
```

CQI is the **preferred interface** for conversational access. RSS CLI remains for advanced/debugging use.

---

## Future Considerations

1. **Alias system**: Map nicknames to canonical entities
2. **Session context**: Remember prior queries for refinement
3. **Streaming responses**: Return summary first, details progressively
4. **MCP integration**: Expose CQI as MCP tool for AI assistants

---

## Review Trigger

This decision should be revisited when:

1. Intent classification accuracy drops below acceptable threshold
2. New query patterns emerge that don't fit existing intents
3. MCP integration requires protocol changes
4. Multi-turn conversation support is needed

---

## References

- E-ADR-004: RSS CLI Implementation for Developer-Invoked Graph Traversal
- STE Architecture Specification, Section 4.6: Runtime Components (RSS)
- Benchmark: `benchmark-conversational.js`
