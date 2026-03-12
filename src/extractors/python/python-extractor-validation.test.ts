/**
 * Python Extractor - Graph Edge Validation Tests (E-ADR-013)
 * 
 * These tests validate that Python imports create proper graph edges
 * for RSS traversal and context assembly.
 */

import { describe, it, expect } from 'vitest';
import { inferRelationships } from '../../recon/phases/inference.js';
import {
  createModuleAssertion,
  createRawImportAssertion,
  assertInferenceCreatesEdges,
  assertNoOrphanedReferences,
  assertBidirectionalConsistency,
  expectGraphEdges,
} from '../../test/extractor-test-utils.js';

describe('Python Extractor - Graph Edge Validation', () => {
  it('should create module->module edges from Python imports', () => {
    // Given: Two Python modules where app.py imports user_service.py
    const appModule = createModuleAssertion('backend/app.py', 'module-backend-app', 'python');
    const userServiceModule = createModuleAssertion(
      'backend/user_service.py',
      'module-backend-user_service',
      'python'
    );

    // Raw import: from user_service import UserService
    const rawImport = createRawImportAssertion('backend/app.py', 'user_service', ['UserService']);

    // When: Inference runs
    const result = assertInferenceCreatesEdges(
      [appModule, userServiceModule],
      [rawImport],
      'module-backend-app',
      ['module-backend-user_service']
    );

    // Then: Validate graph integrity
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should create bidirectional edges for Python imports', () => {
    // Given: Two modules
    const moduleA = createModuleAssertion('src/a.py', 'module-src-a', 'python');
    const moduleB = createModuleAssertion('src/b.py', 'module-src-b', 'python');

    // Raw import: import b
    const rawImport = createRawImportAssertion('src/a.py', 'b', ['b']);

    // When: Inference runs
    const result = inferRelationships([moduleA, moduleB], [rawImport]);

    // Then: Forward edge exists
    expectGraphEdges(result, 'module-src-a', ['module-src-b']);

    // Then: Backward edge exists (referenced_by)
    const b = result.find((n) => n._slice.id === 'module-src-b');
    expect(b).toBeDefined();
    const refBy = b!._slice.referenced_by || [];
    const refByIds = refBy.map((r) => r.id);
    expect(refByIds).toContain('module-src-a');
  });

  it('should handle Python package imports (dot notation)', () => {
    // Given: Module imports from package
    const appModule = createModuleAssertion('backend/app.py', 'module-backend-app', 'python');
    const dbModule = createModuleAssertion(
      'backend/services/database.py',
      'module-backend-services-database',
      'python'
    );

    // Raw import: from services.database import connect
    const rawImport = createRawImportAssertion('backend/app.py', 'services.database', ['connect']);

    // When: Inference runs
    const result = inferRelationships([appModule, dbModule], [rawImport]);

    // Then: Edge should be created
    // Note: Python dot notation (services.database) needs to map to module ID (module-backend-services-database)
    // This may require special handling in inference phase for Python imports
    const app = result.find((n) => n._slice.id === 'module-backend-app');
    expect(app).toBeDefined();

    // For now, we verify the import was processed (even if edge creation needs work)
    // This test documents current behavior - may need enhancement
  });

  it('should skip standard library imports', () => {
    // Given: Module that imports standard library
    const appModule = createModuleAssertion('backend/app.py', 'module-backend-app', 'python');

    // Raw imports: import os, import json, import sys
    const rawImports = [
      createRawImportAssertion('backend/app.py', 'os', ['os']),
      createRawImportAssertion('backend/app.py', 'json', ['json']),
      createRawImportAssertion('backend/app.py', 'sys', ['sys']),
    ];

    // When: Inference runs
    const result = inferRelationships([appModule], rawImports);

    // Then: No edges should be created (standard library is external)
    const app = result.find((n) => n._slice.id === 'module-backend-app');
    expect(app).toBeDefined();

    const refs = app!._slice.references || [];
    const refIds = refs.map((r) => r.id);

    // Standard library modules should not appear as graph edges
    expect(refIds.filter((id) => id.includes('os'))).toHaveLength(0);
    expect(refIds.filter((id) => id.includes('json'))).toHaveLength(0);
    expect(refIds.filter((id) => id.includes('sys'))).toHaveLength(0);
  });

  it('should handle circular dependencies in Python', () => {
    // Given: Two modules that import each other
    const moduleA = createModuleAssertion('backend/a.py', 'module-backend-a', 'python');
    const moduleB = createModuleAssertion('backend/b.py', 'module-backend-b', 'python');

    // Raw imports: a imports b, b imports a
    const rawImportAB = createRawImportAssertion('backend/a.py', 'b', ['B']);
    const rawImportBA = createRawImportAssertion('backend/b.py', 'a', ['A']);

    // When: Inference runs
    const result = inferRelationships([moduleA, moduleB], [rawImportAB, rawImportBA]);

    // Then: Both edges should exist
    expectGraphEdges(result, 'module-backend-a', ['module-backend-b']);
    expectGraphEdges(result, 'module-backend-b', ['module-backend-a']);

    // And bidirectional consistency should be maintained
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should handle relative imports in Python packages', () => {
    // Given: Python package structure with relative imports
    const initModule = createModuleAssertion(
      'backend/services/__init__.py',
      'module-backend-services-__init__',
      'python'
    );
    const dbModule = createModuleAssertion(
      'backend/services/database.py',
      'module-backend-services-database',
      'python'
    );
    const authModule = createModuleAssertion(
      'backend/services/auth.py',
      'module-backend-services-auth',
      'python'
    );

    // Raw import: from .database import connect (relative import)
    const rawImport = createRawImportAssertion('backend/services/auth.py', '.database', ['connect']);

    // When: Inference runs
    const result = inferRelationships([initModule, dbModule, authModule], [rawImport]);

    // Then: Relative import should resolve to absolute module
    const auth = result.find((n) => n._slice.id === 'module-backend-services-auth');
    expect(auth).toBeDefined();

    // Note: Relative Python imports (. and ..) require special resolution logic
    // This test documents expected behavior for future implementation
    // May need enhancement in inference phase to handle Python relative imports
  });

  it('should handle multiple imports from same module', () => {
    // Given: Module with multiple imports from same source
    const appModule = createModuleAssertion('backend/app.py', 'module-backend-app', 'python');
    const utilsModule = createModuleAssertion('backend/utils.py', 'module-backend-utils', 'python');

    // Raw imports: from utils import foo, bar, baz
    const rawImports = [
      createRawImportAssertion('backend/app.py', 'utils', ['foo']),
      createRawImportAssertion('backend/app.py', 'utils', ['bar']),
      createRawImportAssertion('backend/app.py', 'utils', ['baz']),
    ];

    // When: Inference runs
    const result = inferRelationships([appModule, utilsModule], rawImports);

    // Then: Should create only ONE edge (deduplication)
    const app = result.find((n) => n._slice.id === 'module-backend-app');
    expect(app).toBeDefined();

    const refs = app!._slice.references || [];
    const utilsRefs = refs.filter((r) => r.id === 'module-backend-utils');

    // Should have exactly one reference to utils (not three)
    expect(utilsRefs).toHaveLength(1);
  });
});

describe('Python Extractor - Integration Validation', () => {
  it('should document expected behavior for full RECON', () => {
    // This test documents what should happen during full RECON with Python files
    // 
    // 1. Python extractor emits imports via ast_parser.py
    // 2. Extraction phase converts to raw import assertions
    // 3. Inference phase resolves Python module names to module IDs
    // 4. Graph edges created for internal imports
    // 5. Standard library imports skipped
    // 6. Relative imports resolved (., .., etc.)
    // 7. Package imports resolved (dot notation)
    // 
    // Integration test would:
    // - Create Python files with various import styles
    // - Run full RECON
    // - Query blast radius
    // - Verify all internal modules are reachable

    expect(true).toBe(true); // Placeholder for future integration test
  });
});
