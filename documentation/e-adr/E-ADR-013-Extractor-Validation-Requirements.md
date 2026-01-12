# E-ADR-013: Extractor Validation Requirements

**Status:** Accepted  
**Implementation:** In Progress  
**Date:** 2026-01-11  
**Author:** System  
**Authority:** Exploratory ADR (Compliance Required)

> **Context:** Bug surfaced where module import relationships weren't being converted to graph edges, crippling RSS traversal. This E-ADR defines mandatory validation requirements for all extractors to prevent regression.

---

## Problem Statement

**Symptom:** `rss-context` returned 30 nodes instead of 100+ because module imports weren't creating graph edges.

**Root Cause:** Inference phase had a bug in `resolveImportToModuleId()` that prevented relative import resolution.

**Systemic Issue:** No validation tests caught this bug, even though we worked on it yesterday. If this can happen to built-in extractors, **automated extractors will be unreliable**.

---

## Requirements

### 1. Graph Edge Creation (MANDATORY)

Every extractor that emits relationship metadata (imports, calls, uses, etc.) **MUST** ensure that the inference phase converts this metadata to graph edges.

#### Test Requirement

```typescript
it('should create graph edges from relationship metadata', async () => {
  // Given: Extractor emits imports
  const assertions = await extract(filePath, content, projectRoot);
  
  // When: Inference runs
  const result = inferRelationships(assertions, rawAssertions);
  
  // Then: Graph edges must exist
  const node = result.find(a => a._slice.id === 'target-id');
  expect(node._slice.references).toBeDefined();
  expect(node._slice.references.length).toBeGreaterThan(0);
});
```

#### Specific Tests Required

**Test 1: Module Import Edges**
```typescript
describe('Module Import Graph Edges', () => {
  it('should create module->module references from imports', () => {
    // Given: Module A imports Module B
    const moduleA = createModule('src/a.ts', {
      imports: [{ module: './b.js', names: ['foo'] }]
    });
    const moduleB = createModule('src/b.ts', {});
    
    // When: Inference runs
    const result = inferRelationships([moduleA, moduleB], rawImports);
    
    // Then: A.references should include B
    const a = result.find(n => n._slice.id === 'module-src-a');
    expect(a._slice.references).toContainEqual({
      domain: 'graph',
      type: 'module',
      id: 'module-src-b'
    });
  });
});
```

**Test 2: Bidirectional Edges**
```typescript
it('should create bidirectional edges (referenced_by)', () => {
  // Given: Module A imports Module B
  const moduleA = createModule('src/a.ts', { imports: ['./b.js'] });
  const moduleB = createModule('src/b.ts', {});
  
  // When: Inference runs
  const result = inferRelationships([moduleA, moduleB], rawImports);
  
  // Then: B.referenced_by should include A
  const b = result.find(n => n._slice.id === 'module-src-b');
  expect(b._slice.referenced_by).toContainEqual({
    domain: 'graph',
    type: 'module',
    id: 'module-src-a'
  });
});
```

**Test 3: Relative Import Resolution**
```typescript
it('should resolve relative imports correctly', () => {
  // Given: Complex relative imports
  const tests = [
    { from: 'src/mcp/mcp-server.ts', import: './tools.js', expect: 'module-src-mcp-tools' },
    { from: 'src/mcp/server.ts', import: '../rss/ops.js', expect: 'module-src-rss-ops' },
    { from: 'src/a/b/c.ts', import: '../../x/y.js', expect: 'module-src-x-y' },
  ];
  
  for (const test of tests) {
    const resolved = resolveImportToModuleId(test.import, test.from);
    expect(resolved).toBe(test.expect);
  }
});
```

---

### 2. Import Metadata Format (MANDATORY)

All extractors that process imports **MUST** emit raw assertions in this format:

```typescript
{
  elementId: 'import-{index}',
  elementType: 'import',
  file: 'relative/path/to/file.ext',
  metadata: {
    module: 'relative/or/absolute/import/path',
    names: ['namedImport1', 'namedImport2'],
    default: 'defaultImportName' // optional
  }
}
```

#### Example: TypeScript Extractor

```typescript
// For: import { foo, bar } from './utils';
{
  elementId: 'import-0',
  elementType: 'import',
  file: 'src/app.ts',
  metadata: {
    module: './utils',
    names: ['foo', 'bar']
  }
}

// For: import Utils from '../utils';
{
  elementId: 'import-1',
  elementType: 'import',
  file: 'src/app.ts',
  metadata: {
    module: '../utils',
    default: 'Utils',
    names: []
  }
}
```

#### Validation Test

```typescript
it('should emit import metadata in correct format', async () => {
  const content = `import { foo } from './bar';`;
  const assertions = await extract('src/test.ts', content, '/project');
  
  const imports = assertions.filter(a => a.elementType === 'import');
  expect(imports[0]).toMatchObject({
    elementId: expect.stringMatching(/^import-\d+$/),
    elementType: 'import',
    file: 'src/test.ts',
    metadata: {
      module: './bar',
      names: ['foo']
    }
  });
});
```

---

### 3. Inference Phase Validation (SYSTEM)

The inference phase **MUST** validate that it correctly processes extractor output.

#### Test Suite: `src/recon/phases/inference.test.ts`

```typescript
describe('Inference Phase - Graph Edge Creation', () => {
  it('should convert import metadata to graph edges', () => {
    // Test that imports become references
  });
  
  it('should create bidirectional edges', () => {
    // Test that A->B creates B.referenced_by = [A]
  });
  
  it('should resolve relative imports correctly', () => {
    // Test ../path, ./path, ../../path
  });
  
  it('should handle circular dependencies', () => {
    // Test A->B->A doesn't infinite loop
  });
  
  it('should skip external imports', () => {
    // Test that 'react', 'lodash', etc. don't create edges
  });
});
```

---

### 4. End-to-End Validation (INTEGRATION)

After full RECON, the graph **MUST** be traversable.

#### Validation Test

```typescript
describe('Graph Traversal Post-RECON', () => {
  it('should traverse module dependencies via blast radius', async () => {
    // Given: Full RECON has run
    await runFullRecon(projectRoot);
    
    // When: Query blast radius
    const ctx = await initRssContext(stateRoot);
    const result = blastRadius(ctx, 'module-src-mcp-mcp-server', 3);
    
    // Then: Should find all dependencies
    expect(result.nodes.length).toBeGreaterThan(10);
    expect(result.nodes).toContainEqual(
      expect.objectContaining({ key: 'module-src-mcp-tools-structural' })
    );
  });
  
  it('should assemble context from natural language query', async () => {
    // Given: Full RECON has run
    await runFullRecon(projectRoot);
    
    // When: Query context
    const ctx = await initRssContext(stateRoot);
    const { entryPoints } = findEntryPoints(ctx, 'mcp server');
    const context = assembleContext(ctx, entryPoints, { maxDepth: 3 });
    
    // Then: Should find comprehensive context
    expect(context.nodes.length).toBeGreaterThan(50);
  });
});
```

---

### 5. Self-Validation (RECON Phase 7)

RECON Phase 7 **MUST** validate graph integrity after inference.

#### Checks Required

**Check 1: Orphaned References**
```typescript
// Find references to non-existent nodes
const orphans = findOrphanedReferences(graph);
if (orphans.length > 0) {
  reportError('Orphaned references detected', { orphans });
}
```

**Check 2: Bidirectional Consistency**
```typescript
// Verify A->B implies B.referenced_by includes A
const inconsistencies = findBidirectionalInconsistencies(graph);
if (inconsistencies.length > 0) {
  reportWarning('Bidirectional edge inconsistencies', { inconsistencies });
}
```

**Check 3: Import Coverage**
```typescript
// Verify all extracted imports created edges
const importsWithoutEdges = findImportsWithoutEdges(rawAssertions, graph);
if (importsWithoutEdges.length > 0) {
  reportError('Imports did not create graph edges', { importsWithoutEdges });
}
```

#### Implementation

**File:** `src/recon/phases/validation.ts`

```typescript
export interface GraphHealthCheck {
  name: string;
  severity: 'error' | 'warning' | 'info';
  passed: boolean;
  message: string;
  details?: unknown;
}

export function validateGraphEdges(
  graph: Map<string, AidocNode>,
  rawAssertions: RawAssertion[]
): GraphHealthCheck[] {
  const checks: GraphHealthCheck[] = [];
  
  // Check 1: Orphaned References
  const orphans = findOrphanedReferences(graph);
  checks.push({
    name: 'orphaned-references',
    severity: 'error',
    passed: orphans.length === 0,
    message: `Found ${orphans.length} orphaned references`,
    details: { orphans },
  });
  
  // Check 2: Bidirectional Consistency
  const inconsistencies = findBidirectionalInconsistencies(graph);
  checks.push({
    name: 'bidirectional-edges',
    severity: 'warning',
    passed: inconsistencies.length === 0,
    message: `Found ${inconsistencies.length} bidirectional inconsistencies`,
    details: { inconsistencies },
  });
  
  // Check 3: Import Coverage
  const importsWithoutEdges = findImportsWithoutEdges(rawAssertions, graph);
  checks.push({
    name: 'import-edge-coverage',
    severity: 'error',
    passed: importsWithoutEdges.length === 0,
    message: `${importsWithoutEdges.length} imports did not create edges`,
    details: { importsWithoutEdges },
  });
  
  return checks;
}
```

---

### 6. Continuous Validation (CI/CD)

All extractor tests **MUST** run in CI before merge.

#### GitHub Actions Workflow

```yaml
name: Extractor Validation

on: [push, pull_request]

jobs:
  validate-extractors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test -- src/extractors/
      - run: npm test -- src/recon/phases/inference.test.ts
      - run: npm run build
      - run: npm run test:integration -- graph-edges
```

---

## Extractor Checklist (Updated from E-ADR-008)

All extractors **MUST** pass these checks:

### Code Requirements
- [ ] Implements `extract(filepath, content, projectRoot): Promise<Assertion[]>`
- [ ] Emits import metadata as raw assertions (if applicable)
- [ ] Import metadata follows required format
- [ ] Handles parse errors gracefully (returns empty, doesn't throw)
- [ ] Relative file paths in provenance
- [ ] Accurate line numbers (1-indexed)

### Test Requirements
- [ ] Unit tests for extraction logic
- [ ] Test: Graph edges created from imports
- [ ] Test: Bidirectional edges exist
- [ ] Test: Relative import resolution
- [ ] Test: Handles circular dependencies
- [ ] Test: Skips external imports
- [ ] Integration test: Blast radius works
- [ ] Integration test: Context assembly works

### Validation Requirements
- [ ] Passes RECON Phase 7 validation
- [ ] No orphaned references
- [ ] Bidirectional edges consistent
- [ ] All imports create edges (or explicitly skip)
- [ ] CI tests pass

### Documentation
- [ ] Added to E-ADR-008 (Extractor Development Guide)
- [ ] Test fixtures included
- [ ] Known limitations documented

---

## Enforcement

### For Built-in Extractors

**Immediate:** All existing extractors must be retrofitted with these tests by 2026-01-15.

**Status:**
- ✅ TypeScript: Fixed (2026-01-11)
- ⏳ Python: Pending
- ⏳ CloudFormation: Pending
- ⏳ JSON: N/A (no imports)
- ⏳ Angular: Pending
- ⏳ CSS: N/A (no imports)

### For Future Extractors

**Blocker:** Cannot merge without:
1. All tests passing
2. CI validation passing
3. RECON Phase 7 reporting 0 errors

### For Third-Party Extractors

**Plugin System:** When E-ADR-014 (Extractor Plugin System) is implemented:
- Plugins must declare conformance level: "validated" or "experimental"
- Non-validated plugins show warning during RECON
- Validated plugins must pass test suite

---

## Rationale

### Why This Matters

**Without validation:**
- Graph traversal is unreliable
- Context assembly returns incomplete results
- RSS queries miss relevant code
- AI assistants get insufficient context
- Bugs recur even after fixes

**With validation:**
- Extractors are self-documenting (tests show expected behavior)
- Bugs caught before merge
- Regression impossible (tests prevent it)
- Confidence in automated extraction
- Plugin ecosystem becomes viable

---

## Impact

### On Existing Code

**Low Impact:** Most extractors already emit correct metadata. This E-ADR:
- Formalizes existing implicit requirements
- Adds test coverage for edge cases
- Provides validation hooks

### On New Extractors

**Medium Impact:** Developers must write 5-10 additional tests per extractor. However:
- Template tests can be copy-pasted
- Test utilities reduce boilerplate
- Confidence in correctness is worth effort

### On Performance

**Negligible:** Validation runs only in Phase 7 (after population), doesn't block writes.

---

## Future Work

### Phase 1: Test Utilities (Immediate)

Create helper functions to reduce test boilerplate:

```typescript
// src/test/extractor-test-utils.ts

export function expectGraphEdges(
  result: NormalizedAssertion[],
  from: string,
  to: string[]
) {
  const node = result.find(a => a._slice.id === from);
  expect(node).toBeDefined();
  
  for (const target of to) {
    expect(node!._slice.references).toContainEqual(
      expect.objectContaining({ id: target })
    );
  }
}

export function expectBidirectionalEdges(
  result: NormalizedAssertion[],
  nodeA: string,
  nodeB: string
) {
  expectGraphEdges(result, nodeA, [nodeB]);
  expectGraphEdges(result, nodeB, [nodeA]); // via referenced_by
}
```

### Phase 2: Visual Validation (Future)

Graph visualization tool to inspect edges:

```bash
ste validate-graph --visualize
# Opens browser with interactive graph explorer
```

### Phase 3: Fuzzing (Future)

Automated generation of edge-case test files:

```bash
ste fuzz-extractor --language typescript --iterations 1000
```

---

## Appendix A: Bug Postmortem (2026-01-11)

### What Went Wrong

1. **Inference bug:** `resolveImportToModuleId()` used `generateModuleId(importPath)` directly instead of resolving relative paths first
2. **Result:** Import `./tools.js` from `src/mcp/server.ts` generated ID `module-.-tools` instead of `module-src-mcp-tools`
3. **Impact:** Graph lookups failed, no edges created, traversal crippled

### Why Tests Didn't Catch It

**Root cause:** No tests validated that imports create graph edges.

**Tests that existed:**
- Extractor emits correct metadata ✅
- Inference runs without error ✅

**Tests that were missing:**
- Graph edges actually created ❌
- Relative imports resolved correctly ❌
- Blast radius traverses imported modules ❌

### Fix Applied

1. **Fixed `resolveImportToModuleId()`** to resolve relative paths before generating module ID
2. **Added comprehensive tests** in `src/recon/phases/inference.test.ts`
3. **Verified with integration test:** `ste rss-context` now returns 98 nodes (was 30)

### Lessons Learned

**Insight:** Extractor validation must test **end-to-end behavior** (graph traversal), not just intermediate outputs.

**Principle:** If a feature is critical to the system, it must have a test that would fail if that feature breaks.

---

## Appendix B: Test Template

```typescript
// src/extractors/YOURLANG/YOURLANG-extractor.test.ts

import { describe, it, expect } from 'vitest';
import { extract } from './YOURLANG-extractor.js';
import { inferRelationships } from '../../recon/phases/inference.js';

describe('YOURLANG Extractor - Graph Edges', () => {
  it('should create graph edges from imports', async () => {
    // Given: File with imports
    const content = `/* your language syntax */`;
    const assertions = await extract('test.ext', content, '/project');
    
    // When: Inference runs
    const rawAssertions = buildRawImportAssertions(assertions);
    const result = inferRelationships(assertions, rawAssertions);
    
    // Then: Graph edges exist
    const node = result.find(a => a._slice.id === 'expected-id');
    expect(node._slice.references).toContainEqual({
      domain: 'graph',
      type: 'module',
      id: 'expected-import-id',
    });
  });
  
  it('should create bidirectional edges', async () => {
    // Test that A->B creates B.referenced_by = [A]
  });
  
  it('should resolve relative imports', async () => {
    // Test that ../path and ./path work correctly
  });
});

describe('YOURLANG Extractor - Integration', () => {
  it('should enable blast radius traversal', async () => {
    // Full RECON + blast radius query
  });
});
```

---

**Status Summary:**
- ✅ Requirements defined
- ✅ TypeScript extractor validated
- ⏳ Test utilities needed
- ⏳ Other extractors need retrofitting
- ⏳ CI enforcement pending

**Next Steps:**
1. Create test utilities (2026-01-11)
2. Retrofit Python extractor (2026-01-12)
3. Add CI validation (2026-01-13)
4. Document in E-ADR-008 (2026-01-14)

---

**End of E-ADR-013**
