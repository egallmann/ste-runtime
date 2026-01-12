# Boundary Enforcement

## Overview

STE Runtime enforces strict boundaries to ensure RECON never scans outside the allowed project scope. This prevents:
- Scanning parent directories (e.g., `C:\Users\YourName\Documents\Projects\`)
- Scanning home directories (e.g., `C:\Users\YourName\`)
- Scanning system directories
- Triggering security alerts from excessive file system access

## Allowed Project Scope

For ste-runtime self-analysis:
- **Allowed**: `C:\Users\YourName\Documents\Projects\ste-runtime` (or wherever ste-runtime is located)
- **Forbidden**: Any directory outside this path, including:
  - `C:\Users\YourName\Documents\Projects\` (parent)
  - `C:\Users\YourName\Documents\` (grandparent)
  - `C:\Users\YourName\` (home directory)
  - `C:\Users\` or higher

## Boundary Enforcement Layers

### 1. Configuration Loading (`src/config/index.ts`)

**`validateProjectScope()`** - Validates project root is within allowed bounds:
- For self-analysis: Project root MUST equal runtime directory
- For external projects: Project root must NOT be the parent of runtime directory
- Rejects any project root that is too high up the directory tree

**`validateProjectRootBounds()`** - Additional validation:
- Rejects system/home directories
- Limits traversal depth (max 3 levels up from runtime)

**`enforceProjectBoundary()`** - Final enforcement:
- Hard boundary check for self-analysis (must be exact match)
- Validates bounds for external projects

### 2. File Discovery (`src/recon/phases/discovery.ts`)

**Boundary check in `discoverFiles()`**:
```typescript
const relativePath = path.relative(projectRoot, absolutePath);
if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
  throw new Error('CRITICAL BOUNDARY VIOLATION: File outside project root');
}
```

This ensures no file outside the project root is ever processed.

### 3. Directory Scanning (`src/discovery/project-discovery.ts`)

**Boundary check in `scanDirectories()`**:
```typescript
const relativePath = path.relative(this.rootDir, fullPath);
if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
  throw new Error('CRITICAL BOUNDARY VIOLATION: Directory outside project root');
}
```

This prevents directory traversal outside the project scope.

## Testing

The boundary enforcement is tested in `src/config/boundary-validation.test.ts`:

- ✅ Rejects project root that is parent of runtime directory
- ✅ Rejects project root that is higher than parent directory
- ✅ Accepts project root that equals runtime directory (self-analysis)
- ✅ Rejects files outside project root
- ✅ Accepts files within project root
- ✅ Rejects directories outside project root
- ✅ Validates allowed scope is exactly ste-runtime directory
- ✅ Rejects any project root outside allowed scope

**These tests use logic validation only** - they don't actually scan the file system, so they're safe to run and won't trigger security alerts.

## How to Verify Boundary Enforcement

### 1. Run the Test Suite

```bash
npm test -- src/config/boundary-validation.test.ts
```

This validates the boundary logic without scanning the file system.

### 2. Check Configuration Loading

When `loadConfig()` is called, it will:
1. Detect self-analysis mode
2. Validate project root boundaries
3. Throw errors if boundaries are violated

### 3. Monitor RECON Execution

During RECON, boundary checks occur at:
- **Config loading**: Validates project root
- **File discovery**: Validates each file is within project root
- **Directory scanning**: Validates each directory is within project root

Any boundary violation will throw a `CRITICAL BOUNDARY VIOLATION` error with details about what was attempted.

## Error Messages

When a boundary violation is detected, you'll see:

```
CRITICAL BOUNDARY VIOLATION: [description]
  Project root: [path]
  Runtime dir:  [path]
  This would scan outside the allowed project scope, which is FORBIDDEN.
```

These errors are designed to be clear and actionable, preventing accidental scope violations.

## Summary

The boundary enforcement system ensures:
1. ✅ Self-analysis only scans `ste-runtime` directory
2. ✅ External projects are validated before scanning
3. ✅ Files outside project root are rejected
4. ✅ Directories outside project root are rejected
5. ✅ Parent directories are explicitly rejected
6. ✅ System/home directories are rejected

All boundary checks throw errors immediately, preventing any scanning outside the allowed scope.

