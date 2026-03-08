# E-ADR-008: Extractor Development Guide

**Status:** Accepted  
**Implementation:** N/A (Documentation Guide)  
**Date:** 2026-01-07  
**Author:** Erik Gallmann  
**Authority:** Exploratory ADR (Living Document)

> **Next Step:** Keep updated as extractor patterns evolve. No spec validation needed (guide, not implementation).

---

## Purpose

Enable developers to create custom semantic extractors for languages, frameworks, and file types not included in the ste-runtime distribution. This guide provides patterns, interfaces, and examples to lower the barrier to entry for extractor development.

**Target Audience:**
- Users extending ste-runtime for their tech stack
- Contributors adding new extractors to ste-runtime
- Teams building domain-specific extractors (internal tooling, DSLs)

---

## Philosophy: What to Extract

### Core Principle

**Extract semantics, not syntax.**

AI-DOC slices should capture **what the code does and how it relates to other code**, not how it's implemented.

### Good Extraction (Semantic)

```typescript
// Extract this:
{
  type: 'function',
  name: 'getUserById',
  signature: 'function getUserById(id: string): Promise<User>',
  calls: ['database.query', 'logger.info'],
  http_endpoint: '/api/users/:id'
}

// NOT this:
{
  type: 'function',
  implementation: 'const getUserById = async (id) => { const result = await database.query(...); ... }'
}
```

### Extraction Decision Matrix

| Pattern | Extract? | Rationale |
|---------|----------|-----------|
| Function signatures |  Yes | Public API surface |
| Class names and methods |  Yes | Component structure |
| Import/export relationships |  Yes | Dependency graph |
| HTTP endpoints (routes) |  Yes | API contracts |
| Database queries (SQL, ORM) |  Yes | Data access patterns |
| Configuration (env vars, settings) |  Yes | Runtime dependencies |
| Function bodies |  No | Implementation detail |
| Variable assignments |  No | Implementation detail |
| Loop constructs |  No | Implementation detail |
| Comments (usually) |  Selective | Extract semantic annotations only |

### Examples by Language

**TypeScript/JavaScript:**
-  Extract: Functions, classes, exports, imports, decorators
-  Skip: Variable declarations, loops, conditionals

**Python:**
-  Extract: Functions, classes, decorators (`@app.route`), imports
-  Skip: Variable assignments, comprehensions, loops

**CloudFormation:**
-  Extract: Resources, parameters, outputs, conditions
-  Skip: Intrinsic function internals, metadata

**Angular:**
-  Extract: Components, services, routes, decorators, selectors
-  Skip: Template implementation, lifecycle method bodies

**CSS/SCSS:**
-  Extract: Design tokens (variables), breakpoints, animations, class names
-  Skip: Property values, vendor prefixes

---

## Extractor Architecture

### Extractor Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    RECON Execution Flow                       │
└─────────────────────────────────────────────────────────────┘

Phase 1: DISCOVERY
  ├─ User config specifies languages: ["typescript", "python", "myextractor"]
  ├─ Discovery phase maps file extensions to languages
  └─ Returns: Map<string, string[]> (language → filepaths)

Phase 2: EXTRACTION (Your Extractor Runs Here)
  ├─ For each file in your language:
  │   ├─ extract(filepath, content) → Assertion[]
  │   ├─ Each assertion captures ONE semantic element
  │   └─ Assertions include provenance (file, line, language)
  └─ Returns: Assertion[]

Phase 3: NORMALIZATION
  ├─ Converts Assertion[] to NormalizedAssertion[]
  ├─ Adds IDs, domains, types
  └─ Returns: NormalizedAssertion[]

Phase 4: INFERENCE
  ├─ Analyzes references between assertions
  ├─ Adds forward/reverse references
  └─ Returns: NormalizedAssertion[] (with references)

Phase 5: POPULATION
  ├─ Writes slices to .ste/state/graph/
  └─ Your extracted semantics are now in AI-DOC
```

---

## Required Interface

### Minimal Extractor

Every extractor must export a function matching this signature:

```typescript
export async function extract(
  filepath: string,
  content: string,
  projectRoot: string
): Promise<Assertion[]> {
  // 1. Parse the file (AST, regex, line-by-line)
  // 2. Identify semantic elements
  // 3. Return assertions
  return assertions;
}
```

### Assertion Schema

```typescript
interface Assertion {
  // Core identification
  domain: string;           // "backend", "frontend", "infrastructure", "data"
  type: string;            // "function", "class", "component", "route", "resource"
  
  // Element details
  element: {
    name: string;          // Element name
    [key: string]: unknown; // Type-specific fields
  };
  
  // Provenance (required)
  provenance: {
    file: string;          // Relative path from project root
    line: number;          // Line number in source file
    language: string;      // Your extractor's language name
  };
  
  // Relationships (optional, but recommended)
  references?: {
    imports?: string[];    // Modules/files imported
    calls?: string[];      // Functions/methods called
    uses?: string[];       // General dependencies
  };
}
```

---

## Implementation Patterns

### Pattern 1: AST-Based Extraction (TypeScript, Python)

**When to use:** Language has a mature parser (tree-sitter, @babel/parser, etc.)

**Example: TypeScript Extractor**

```typescript
import ts from 'typescript';

export async function extract(
  filepath: string,
  content: string,
  projectRoot: string
): Promise<Assertion[]> {
  const assertions: Assertion[] = [];
  
  // Parse to AST
  const sourceFile = ts.createSourceFile(
    filepath,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  // Walk the AST
  function visit(node: ts.Node) {
    // Extract functions
    if (ts.isFunctionDeclaration(node) && node.name) {
      assertions.push({
        domain: 'backend',
        type: 'function',
        element: {
          name: node.name.getText(),
          signature: node.getText().split('{')[0].trim(),
          async: node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword),
        },
        provenance: {
          file: path.relative(projectRoot, filepath),
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          language: 'typescript',
        },
      });
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return assertions;
}
```

**Pros:**
-  Accurate (respects language grammar)
-  Handles complex syntax
-  Provides line numbers

**Cons:**
-  Requires parser dependency
-  Must handle parser errors

---

### Pattern 2: Subprocess Delegation (Python, Go, Ruby)

**When to use:** Language has no JavaScript parser, or you prefer native tooling

**Example: Python Extractor (Subprocess)**

```typescript
import { spawn } from 'child_process';
import path from 'path';

export async function extract(
  filepath: string,
  content: string,
  projectRoot: string
): Promise<Assertion[]> {
  // Delegate to Python script
  const pythonScript = path.join(__dirname, '../../python-scripts/extract_python.py');
  
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [pythonScript, filepath]);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);
    
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python extraction failed: ${stderr}`));
        return;
      }
      
      const assertions = JSON.parse(stdout);
      resolve(assertions);
    });
  });
}
```

**Python script (`extract_python.py`):**

```python
import ast
import json
import sys

def extract_functions(filepath):
    with open(filepath, 'r') as f:
        tree = ast.parse(f.read())
    
    assertions = []
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            assertions.append({
                'domain': 'backend',
                'type': 'function',
                'element': {
                    'name': node.name,
                    'signature': f"def {node.name}({', '.join(arg.arg for arg in node.args.args)})",
                },
                'provenance': {
                    'file': filepath,
                    'line': node.lineno,
                    'language': 'python',
                },
            })
    
    return assertions

if __name__ == '__main__':
    assertions = extract_functions(sys.argv[1])
    print(json.dumps(assertions))
```

**Pros:**
-  Uses native language tooling
-  No JavaScript parser dependency
-  Easy to maintain (language-native code)

**Cons:**
-  Subprocess overhead
-  Requires language runtime installed

---

### Pattern 3: Regex/Line-Based Extraction (Simple Formats)

**When to use:** File format is line-oriented and has simple patterns

**Example: Environment File Extractor**

```typescript
export async function extract(
  filepath: string,
  content: string,
  projectRoot: string
): Promise<Assertion[]> {
  const assertions: Assertion[] = [];
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    // Match: KEY=value
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) {
      const [, name, value] = match;
      assertions.push({
        domain: 'infrastructure',
        type: 'environment-variable',
        element: {
          name,
          has_default: value.length > 0,
        },
        provenance: {
          file: path.relative(projectRoot, filepath),
          line: index + 1,
          language: 'env',
        },
      });
    }
  });
  
  return assertions;
}
```

**Pros:**
-  Extremely fast
-  No dependencies
-  Simple to implement

**Cons:**
-  Fragile (breaks with complex syntax)
-  No semantic understanding
-  Best for very simple formats only

---

### Pattern 4: YAML/JSON Schema-Based (CloudFormation, Kubernetes)

**When to use:** Structured data with known schema

**Example: CloudFormation Extractor (Simplified)**

```typescript
import yaml from 'js-yaml';

export async function extract(
  filepath: string,
  content: string,
  projectRoot: string
): Promise<Assertion[]> {
  const assertions: Assertion[] = [];
  
  try {
    const template = yaml.load(content) as any;
    
    // Extract resources
    const resources = template.Resources || {};
    for (const [logicalId, resource] of Object.entries(resources)) {
      assertions.push({
        domain: 'infrastructure',
        type: 'cloudformation-resource',
        element: {
          name: logicalId,
          resource_type: (resource as any).Type,
          properties: Object.keys((resource as any).Properties || {}),
        },
        provenance: {
          file: path.relative(projectRoot, filepath),
          line: 1, // YAML doesn't provide line numbers easily
          language: 'cloudformation',
        },
      });
    }
  } catch (error) {
    console.warn(`Failed to parse ${filepath}:`, error);
  }
  
  return assertions;
}
```

**Pros:**
-  Leverages existing parsers
-  Structured data is easy to navigate
-  Schema validation possible

**Cons:**
-  Line numbers require extra work
-  Parser errors abort extraction

---

## Registering Your Extractor

### Step 1: Add Language Support

**File:** `src/recon/discovery.ts`

```typescript
const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  python: ['.py'],
  cloudformation: ['.yaml', '.yml', '.json'],
  myextractor: ['.myext', '.custom'], // ← Add your extensions
};

export type SupportedLanguage = 
  | 'typescript'
  | 'python'
  | 'cloudformation'
  | 'myextractor'; // ← Add your language
```

### Step 2: Create Extractor File

**File:** `src/extractors/myextractor/myextractor-extractor.ts`

```typescript
export async function extract(
  filepath: string,
  content: string,
  projectRoot: string
): Promise<Assertion[]> {
  // Your implementation here
  return [];
}
```

### Step 3: Register in Extraction Phase

**File:** `src/recon/phases/extraction.ts`

```typescript
import { extract as extractMyExtractor } from '../../extractors/myextractor/myextractor-extractor.js';

async function extractByLanguage(
  language: SupportedLanguage,
  files: string[],
  projectRoot: string
): Promise<Assertion[]> {
  switch (language) {
    case 'typescript':
      return extractTypeScript(files, projectRoot);
    case 'python':
      return extractPython(files, projectRoot);
    case 'myextractor': // ← Add your case
      return extractMyExtractor(files, projectRoot);
    default:
      return [];
  }
}
```

### Step 4: Update Configuration Schema

**File:** `src/config/types.ts`

```typescript
export type SupportedLanguage =
  | 'typescript'
  | 'python'
  | 'cloudformation'
  | 'json'
  | 'angular'
  | 'css'
  | 'myextractor'; // ← Add your language
```

---

## Testing Your Extractor

### Test File Structure

```
src/extractors/myextractor/
├── myextractor-extractor.ts       # Your extractor
├── myextractor-extractor.test.ts  # Tests
└── fixtures/                      # Test files
    ├── simple.myext
    ├── complex.myext
    └── edge-cases.myext
```

### Example Test

```typescript
import { extract } from './myextractor-extractor.js';
import fs from 'fs/promises';
import path from 'path';

describe('MyExtractor', () => {
  it('should extract simple elements', async () => {
    const filepath = path.join(__dirname, 'fixtures', 'simple.myext');
    const content = await fs.readFile(filepath, 'utf-8');
    
    const assertions = await extract(filepath, content, '/project/root');
    
    expect(assertions).toHaveLength(3);
    expect(assertions[0]).toMatchObject({
      domain: 'backend',
      type: 'function',
      element: {
        name: 'myFunction',
      },
      provenance: {
        file: expect.stringContaining('simple.myext'),
        line: 5,
        language: 'myextractor',
      },
    });
  });
  
  it('should handle parse errors gracefully', async () => {
    const content = 'INVALID SYNTAX !!!';
    const assertions = await extract('/test.myext', content, '/project/root');
    
    // Should return empty array, not throw
    expect(assertions).toEqual([]);
  });
});
```

---

## Reference Extraction

### Why References Matter

References enable the **RSS graph queries**:

```typescript
// Find all functions that call getUserById
rss.query('function', { calls: 'getUserById' });

// Find all components that import AuthService
rss.query('component', { imports: 'AuthService' });
```

### Common Reference Types

```typescript
interface References {
  imports?: string[];     // Modules/files imported
  calls?: string[];       // Functions/methods called
  uses?: string[];        // Generic dependencies
  extends?: string[];     // Class inheritance
  implements?: string[];  // Interface implementation
  http_calls?: string[];  // HTTP endpoints called
  db_queries?: string[];  // Database tables accessed
}
```

### Example: Extracting Imports

```typescript
// TypeScript: import { UserService } from './services/user-service';
references: {
  imports: ['./services/user-service', 'UserService']
}

// Python: from app.services.user import UserService
references: {
  imports: ['app.services.user', 'UserService']
}

// CloudFormation: DependsOn: [DatabaseStack, VPCStack]
references: {
  depends_on: ['DatabaseStack', 'VPCStack']
}
```

---

## Performance Considerations

### Benchmarks to Target

| Operation | Target | Good | Acceptable |
|-----------|--------|------|------------|
| Parse single file | <10ms | <50ms | <200ms |
| Extract 100 files | <1s | <5s | <30s |
| Full project (1000 files) | <10s | <60s | <5min |

### Optimization Strategies

**1. Parallel Processing**
```typescript
const assertions = await Promise.all(
  files.map(f => extractFile(f))
);
```

**2. Caching**
```typescript
const cache = new Map<string, Assertion[]>();
if (cache.has(fileHash)) {
  return cache.get(fileHash);
}
```

**3. Incremental Extraction**
```typescript
// Only extract changed files
const changedFiles = files.filter(f => isModified(f));
```

**4. Streaming for Large Files**
```typescript
// Process line-by-line for huge files
const stream = fs.createReadStream(filepath);
```

---

## Example Extractors

### Included with ste-runtime

| Extractor | Complexity | Pattern | Files |
|-----------|------------|---------|-------|
| **JSON** |  Simple | Schema-based | `src/extractors/json/` |
| **TypeScript** |  Moderate | AST-based | `src/extractors/typescript/` |
| **Python** |  Moderate | Subprocess | `src/extractors/python/` |
| **CloudFormation** |  Complex | Schema + spec | `src/extractors/cloudformation/` |
| **Angular** |  Very Complex | Decorator-based | `src/extractors/angular/` |
| **CSS/SCSS** |  Moderate | Regex + parsing | `src/extractors/css/` |

### Recommended Study Order

1. **Start with JSON extractor** - Simplest possible extractor
2. **Study TypeScript extractor** - AST pattern, good comments
3. **Review Python extractor** - Subprocess delegation
4. **Examine Angular extractor** - Complex decorators, cross-file references

---

## Common Pitfalls

###  Pitfall 1: Extracting Too Much

**Bad:**
```typescript
// Extracting every variable
{ type: 'variable', name: 'i', value: 0 }
{ type: 'variable', name: 'temp', value: 'hello' }
```

**Good:**
```typescript
// Extracting only semantic elements
{ type: 'function', name: 'processUsers', signature: '...' }
```

###  Pitfall 2: Not Handling Errors

**Bad:**
```typescript
const ast = parser.parse(content); // Throws on syntax error
```

**Good:**
```typescript
try {
  const ast = parser.parse(content);
} catch (error) {
  console.warn(`Parse error in ${filepath}:`, error);
  return []; // Return empty, don't crash RECON
}
```

###  Pitfall 3: Absolute Paths in Provenance

**Bad:**
```typescript
provenance: {
  file: '/Users/me/project/src/app.ts' //  Absolute
}
```

**Good:**
```typescript
provenance: {
  file: path.relative(projectRoot, filepath) //  'src/app.ts'
}
```

###  Pitfall 4: Missing Line Numbers

**Bad:**
```typescript
provenance: {
  file: 'src/app.ts',
  line: 0 //  Invalid
}
```

**Good:**
```typescript
provenance: {
  file: 'src/app.ts',
  line: node.getLineNumber() //  Actual line
}
```

---

## Distribution

### Bundled Extractor (Part of ste-runtime)

**Location:** `src/extractors/myextractor/`

**Requirements:**
- TypeScript source
- Test suite
- Fixtures
- Update discovery.ts, extraction.ts, types.ts

**Benefits:**
-  Official support
-  Included in releases
-  Community maintained

### Third-Party Extractor (User-provided)

**Not yet supported.** Future E-ADR will define:
- Plugin system
- npm package format
- Configuration registration

---

## Future Enhancements

### Phase 1: Plugin System
- Load extractors from npm packages
- Configuration: `extractors: ['@myorg/rust-extractor']`
- Dynamic registration

### Phase 2: Extractor Marketplace
- Registry of community extractors
- Versioning and compatibility
- Quality metrics

### Phase 3: Code Generation
- CLI: `ste generate-extractor --language rust`
- Scaffold with tests and fixtures
- Best practices template

---

## Questions and Support

### Where to Get Help

1. **Read E-ADR-001** - Understand RECON philosophy
2. **Study existing extractors** - JSON, TypeScript, Python
3. **Review test suites** - See expected behavior
4. **Open GitHub issues** - For questions and bugs

### Contributing Your Extractor

1. Implement extractor in `src/extractors/yourlang/`
2. Add comprehensive tests
3. Update this E-ADR with lessons learned
4. Submit pull request with examples

---

## Living Document Notice

**This E-ADR will be updated as we implement new extractors.**

When building E-ADR-006 (Angular + CSS), E-ADR-009 (React), or any future extractor, we will:
- Document new patterns discovered
- Add real-world examples
- Update pitfalls and best practices
- Refine interfaces as needed

**Last Updated:** 2026-01-07  
**Updates Planned:** After E-ADR-006 implementation (Angular + CSS extractors)

---

## Appendix A: Full Extractor Checklist

- [ ] Implements `extract(filepath, content, projectRoot): Promise<Assertion[]>`
- [ ] Returns assertions matching schema (domain, type, element, provenance)
- [ ] Includes relative file paths in provenance
- [ ] Provides accurate line numbers
- [ ] Handles parse errors gracefully (returns empty, doesn't throw)
- [ ] Extracts semantic elements (not implementation details)
- [ ] Includes references (imports, calls, dependencies)
- [ ] Has test suite with fixtures
- [ ] Registered in discovery.ts
- [ ] Registered in extraction.ts
- [ ] Added to SupportedLanguage type
- [ ] Performance: <200ms per file (acceptable)
- [ ] Documentation: Updated this E-ADR with learnings

---

## Appendix B: Assertion Schema Reference

```typescript
interface Assertion {
  domain: 'backend' | 'frontend' | 'infrastructure' | 'data';
  type: string; // Extractor-specific
  element: {
    name: string;
    [key: string]: unknown;
  };
  provenance: {
    file: string;        // Relative path
    line: number;        // 1-indexed
    language: string;    // Extractor name
  };
  references?: {
    imports?: string[];
    calls?: string[];
    uses?: string[];
    extends?: string[];
    implements?: string[];
    [key: string]: string[] | undefined;
  };
}
```

---

## Appendix C: Quick Start Template

```typescript
// src/extractors/myextractor/myextractor-extractor.ts

import path from 'path';
import type { Assertion } from '../../recon/phases/extraction.js';

export async function extract(
  filepath: string,
  content: string,
  projectRoot: string
): Promise<Assertion[]> {
  const assertions: Assertion[] = [];
  
  try {
    // TODO: Parse the file
    // TODO: Walk the structure
    // TODO: Extract semantic elements
    
    // Example assertion:
    assertions.push({
      domain: 'backend',
      type: 'function',
      element: {
        name: 'exampleFunction',
      },
      provenance: {
        file: path.relative(projectRoot, filepath),
        line: 1,
        language: 'myextractor',
      },
    });
  } catch (error) {
    console.warn(`[MyExtractor] Failed to extract ${filepath}:`, error);
  }
  
  return assertions;
}
```

---

**End of E-ADR-008**



