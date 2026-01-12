# Extractor Validation Quick Start

**Authority:** E-ADR-013 (Extractor Validation Requirements)

This guide shows how to validate that your extractor properly creates graph edges.

---

## The Problem We're Solving

**Bug:** Module imports weren't creating graph edges, breaking RSS traversal.

**Solution:** Every extractor must validate that relationship metadata (imports, calls, uses) becomes graph edges.

---

## Quick Example

```typescript
import { describe, it } from 'vitest';
import { 
  createModuleAssertion,
  createRawImportAssertion,
  assertInferenceCreatesEdges,
  assertNoOrphanedReferences,
  assertBidirectionalConsistency 
} from '../../test/extractor-test-utils.js';

describe('MyExtractor - Graph Edges', () => {
  it('should create edges from imports', () => {
    // Given: Two modules where A imports B
    const moduleA = createModuleAssertion('src/a.ext', 'module-src-a');
    const moduleB = createModuleAssertion('src/b.ext', 'module-src-b');
    
    const rawImport = createRawImportAssertion(
      'src/a.ext',
      './b',
      ['foo', 'bar']
    );

    // When: Inference runs (validates edges created)
    const result = assertInferenceCreatesEdges(
      [moduleA, moduleB],
      [rawImport],
      'module-src-a',        // from
      ['module-src-b']       // to
    );

    // Then: Validate graph integrity
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });
});
```

---

## Test Utilities

### `createModuleAssertion(filePath, moduleId)`

Creates a minimal module for testing.

```typescript
const module = createModuleAssertion('src/app.ts', 'module-src-app');
```

### `createRawImportAssertion(file, module, names)`

Creates a raw import assertion that inference will process.

```typescript
const rawImport = createRawImportAssertion(
  'src/app.ts',
  './utils.js',
  ['foo', 'bar']
);
```

### `assertInferenceCreatesEdges(normalized, rawAssertions, fromId, toIds)`

**Core validation.** Runs inference and asserts that edges are created correctly.

```typescript
const result = assertInferenceCreatesEdges(
  [moduleA, moduleB],
  [rawImport],
  'module-src-a',
  ['module-src-b']
);
```

### `assertNoOrphanedReferences(result)`

Validates that all references point to real nodes.

```typescript
assertNoOrphanedReferences(result);
```

### `assertBidirectionalConsistency(result)`

Validates that A→B implies B is referenced by A.

```typescript
assertBidirectionalConsistency(result);
```

### `expectGraphEdges(result, fromId, toIds)`

Low-level assertion for specific edges.

```typescript
expectGraphEdges(result, 'module-src-a', ['module-src-b', 'module-src-c']);
```

### `expectBidirectionalEdges(result, nodeA, nodeB)`

Low-level assertion for bidirectional edges.

```typescript
expectBidirectionalEdges(result, 'module-src-a', 'module-src-b');
```

---

## Required Tests (Checklist)

Every extractor that emits relationship metadata **MUST** have these tests:

- [ ] **Graph edges created** - `assertInferenceCreatesEdges()` passes
- [ ] **Bidirectional edges** - `assertBidirectionalConsistency()` passes
- [ ] **No orphans** - `assertNoOrphanedReferences()` passes
- [ ] **Relative imports** - Tests for `./`, `../`, `../../` paths
- [ ] **Circular dependencies** - A→B→A doesn't break
- [ ] **External imports skipped** - 'react', 'lodash', etc. don't create edges

---

## Example: Full Test Suite

```typescript
import { describe, it } from 'vitest';
import { extract } from './myextractor.js';
import { 
  createModuleAssertion,
  createRawImportAssertion,
  assertInferenceCreatesEdges,
  assertNoOrphanedReferences,
  assertBidirectionalConsistency 
} from '../../test/extractor-test-utils.js';

describe('MyExtractor - Graph Edge Validation', () => {
  it('should create module->module edges from imports', () => {
    const moduleA = createModuleAssertion('src/a.ext', 'module-src-a');
    const moduleB = createModuleAssertion('src/b.ext', 'module-src-b');
    const rawImport = createRawImportAssertion('src/a.ext', './b', ['foo']);

    const result = assertInferenceCreatesEdges(
      [moduleA, moduleB],
      [rawImport],
      'module-src-a',
      ['module-src-b']
    );

    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should resolve relative imports correctly', () => {
    // Test ./path
    const a1 = createModuleAssertion('src/mcp/server.ts', 'module-src-mcp-server');
    const b1 = createModuleAssertion('src/mcp/tools.ts', 'module-src-mcp-tools');
    const raw1 = createRawImportAssertion('src/mcp/server.ts', './tools', []);
    
    const result1 = assertInferenceCreatesEdges(
      [a1, b1],
      [raw1],
      'module-src-mcp-server',
      ['module-src-mcp-tools']
    );

    // Test ../path
    const a2 = createModuleAssertion('src/mcp/server.ts', 'module-src-mcp-server');
    const b2 = createModuleAssertion('src/rss/ops.ts', 'module-src-rss-ops');
    const raw2 = createRawImportAssertion('src/mcp/server.ts', '../rss/ops', []);
    
    const result2 = assertInferenceCreatesEdges(
      [a2, b2],
      [raw2],
      'module-src-mcp-server',
      ['module-src-rss-ops']
    );
  });

  it('should handle circular dependencies', () => {
    const moduleA = createModuleAssertion('src/a.ext', 'module-src-a');
    const moduleB = createModuleAssertion('src/b.ext', 'module-src-b');
    
    const rawImportAB = createRawImportAssertion('src/a.ext', './b', []);
    const rawImportBA = createRawImportAssertion('src/b.ext', './a', []);

    const result = assertInferenceCreatesEdges(
      [moduleA, moduleB],
      [rawImportAB, rawImportBA],
      'module-src-a',
      ['module-src-b']
    );

    // Also check reverse edge
    expectGraphEdges(result, 'module-src-b', ['module-src-a']);
    
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should skip external imports', () => {
    const moduleA = createModuleAssertion('src/a.ext', 'module-src-a');
    
    const rawExternal = createRawImportAssertion('src/a.ext', 'react', []);

    const result = inferRelationships([moduleA], [rawExternal]);
    
    // Should not create edge to 'react'
    const a = result.find(n => n._slice.id === 'module-src-a');
    const refs = a!._slice.references || [];
    
    expect(refs.filter(r => r.id.includes('react'))).toHaveLength(0);
  });
});
```

---

## Integration Test (Recommended)

After unit tests pass, validate end-to-end:

```typescript
describe('MyExtractor - Integration', () => {
  it('should enable blast radius traversal', async () => {
    // Full RECON
    await runFullRecon(projectRoot);
    
    // Load graph
    const ctx = await initRssContext(stateRoot);
    
    // Query blast radius
    const result = blastRadius(ctx, 'module-src-entry', 3);
    
    // Should traverse import edges
    expect(result.nodes.length).toBeGreaterThan(5);
    expect(result.nodes).toContainEqual(
      expect.objectContaining({ key: 'module-src-dependency' })
    );
  });
});
```

---

## What Gets Validated

### ✅ Extractor Output
- Emits correct import metadata format
- Provenance includes relative paths
- Line numbers are accurate

### ✅ Inference Processing
- Import metadata → graph edges
- Relative paths resolved correctly
- Bidirectional edges created

### ✅ Graph Integrity
- No orphaned references
- Bidirectional consistency
- Traversal works end-to-end

---

## CI/CD Integration

Add to your CI workflow:

```yaml
- name: Validate Extractors
  run: |
    npm test -- src/extractors/
    npm test -- src/recon/phases/inference.test.ts
```

---

## References

- **E-ADR-013:** Extractor Validation Requirements (full specification)
- **E-ADR-008:** Extractor Development Guide (how to build extractors)
- **Example:** `src/recon/phases/inference.test.ts` (working tests)
- **Utilities:** `src/test/extractor-test-utils.ts` (test helpers)

---

## Getting Help

1. Study `src/recon/phases/inference.test.ts` for working examples
2. Copy-paste the test template above
3. Run tests: `npm test -- src/extractors/your-extractor.test.ts`
4. Check RECON Phase 7 validation: `ste recon --mode=full`

---

**Status:** ✅ Active requirement for all extractors (as of 2026-01-11)
