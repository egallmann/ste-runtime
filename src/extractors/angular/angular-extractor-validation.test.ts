/**
 * Angular Extractor - Graph Edge Validation Tests (E-ADR-013)
 * 
 * These tests validate that Angular component dependencies (imports, injected services)
 * create proper graph edges for RSS traversal and context assembly.
 */

import { describe, it, expect } from 'vitest';
import { inferRelationships } from '../../recon/phases/inference.js';
import type { NormalizedAssertion, RawAssertion } from '../../recon/phases/index.js';
import {
  assertNoOrphanedReferences,
  assertBidirectionalConsistency,
  expectGraphEdges,
} from '../../test/extractor-test-utils.js';

// Helper to create Angular component assertion
function createAngularComponentAssertion(
  className: string,
  filePath: string,
  selector?: string,
  imports?: string[]
): NormalizedAssertion {
  return {
    _slice: {
      domain: 'frontend',
      type: 'angular-component',
      id: `component:${filePath}:${className}`,
      source_files: [filePath],
    },
    element: {
      className,
      selector,
      imports: imports || [],
      standalone: imports && imports.length > 0,
    },
  };
}

// Helper to create Angular service assertion
function createAngularServiceAssertion(
  className: string,
  filePath: string,
  injectedDependencies?: string[]
): NormalizedAssertion {
  return {
    _slice: {
      domain: 'frontend',
      type: 'angular-service',
      id: `service:${filePath}:${className}`,
      source_files: [filePath],
    },
    element: {
      className,
      providedIn: 'root',
      injectedDependencies: injectedDependencies || [],
    },
  };
}

// Helper to create Angular component dependency (template usage)
function createAngularDependencyAssertion(
  fromComponent: string,
  toComponent: string,
  filePath: string,
  type: 'import' | 'template' | 'injection'
): RawAssertion {
  return {
    elementId: `dep-${fromComponent}-${toComponent}`,
    elementType: 'dependency',
    file: filePath,
    metadata: {
      from: fromComponent,
      to: toComponent,
      type,
    },
  };
}

describe('Angular Extractor - Graph Edge Validation', () => {
  it('should create component->component edges from standalone imports', () => {
    // Given: Standalone component imports another component
    const appComponent = createAngularComponentAssertion(
      'AppComponent',
      'src/app/app.component.ts',
      'app-root',
      ['HeaderComponent', 'FooterComponent']
    );

    const headerComponent = createAngularComponentAssertion(
      'HeaderComponent',
      'src/app/header/header.component.ts',
      'app-header'
    );

    const footerComponent = createAngularComponentAssertion(
      'FooterComponent',
      'src/app/footer/footer.component.ts',
      'app-footer'
    );

    // Raw import dependencies
    const rawImport1 = createAngularDependencyAssertion(
      'AppComponent',
      'HeaderComponent',
      'src/app/app.component.ts',
      'import'
    );

    const rawImport2 = createAngularDependencyAssertion(
      'AppComponent',
      'FooterComponent',
      'src/app/app.component.ts',
      'import'
    );

    // When: Inference runs
    const result = inferRelationships(
      [appComponent, headerComponent, footerComponent],
      [rawImport1, rawImport2]
    );

    // Then: AppComponent should reference both components
    expectGraphEdges(result, 'component:src/app/app.component.ts:AppComponent', [
      'component:src/app/header/header.component.ts:HeaderComponent',
      'component:src/app/footer/footer.component.ts:FooterComponent',
    ]);

    // And: Bidirectional edges should exist
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should create component->service edges from dependency injection', () => {
    // Given: Component injects a service
    const component = createAngularComponentAssertion(
      'UserListComponent',
      'src/app/users/user-list.component.ts',
      'app-user-list'
    );

    const service = createAngularServiceAssertion(
      'UserService',
      'src/app/services/user.service.ts'
    );

    // Raw injection dependency
    const rawInjection = createAngularDependencyAssertion(
      'UserListComponent',
      'UserService',
      'src/app/users/user-list.component.ts',
      'injection'
    );

    // When: Inference runs
    const result = inferRelationships([component, service], [rawInjection]);

    // Then: Component should reference service
    expectGraphEdges(result, 'component:src/app/users/user-list.component.ts:UserListComponent', [
      'service:src/app/services/user.service.ts:UserService',
    ]);

    // And: Bidirectional consistency
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should create service->service edges from dependency injection', () => {
    // Given: Service injects another service
    const userService = createAngularServiceAssertion(
      'UserService',
      'src/app/services/user.service.ts',
      ['HttpClient', 'AuthService']
    );

    const authService = createAngularServiceAssertion(
      'AuthService',
      'src/app/services/auth.service.ts'
    );

    // Raw injection dependencies
    const rawInjection = createAngularDependencyAssertion(
      'UserService',
      'AuthService',
      'src/app/services/user.service.ts',
      'injection'
    );

    // When: Inference runs
    const result = inferRelationships([userService, authService], [rawInjection]);

    // Then: UserService should reference AuthService
    expectGraphEdges(result, 'service:src/app/services/user.service.ts:UserService', [
      'service:src/app/services/auth.service.ts:AuthService',
    ]);

    // And: Graph integrity
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should create component->component edges from template usage', () => {
    // Given: Component uses child components in template
    const parentComponent = createAngularComponentAssertion(
      'DashboardComponent',
      'src/app/dashboard/dashboard.component.ts',
      'app-dashboard'
    );

    const chartComponent = createAngularComponentAssertion(
      'ChartComponent',
      'src/app/shared/chart/chart.component.ts',
      'app-chart'
    );

    const tableComponent = createAngularComponentAssertion(
      'TableComponent',
      'src/app/shared/table/table.component.ts',
      'app-table'
    );

    // Raw template dependencies (child components used in parent template)
    const rawTemplate1 = createAngularDependencyAssertion(
      'DashboardComponent',
      'ChartComponent',
      'src/app/dashboard/dashboard.component.ts',
      'template'
    );

    const rawTemplate2 = createAngularDependencyAssertion(
      'DashboardComponent',
      'TableComponent',
      'src/app/dashboard/dashboard.component.ts',
      'template'
    );

    // When: Inference runs
    const result = inferRelationships(
      [parentComponent, chartComponent, tableComponent],
      [rawTemplate1, rawTemplate2]
    );

    // Then: Dashboard should reference child components
    expectGraphEdges(result, 'component:src/app/dashboard/dashboard.component.ts:DashboardComponent', [
      'component:src/app/shared/chart/chart.component.ts:ChartComponent',
      'component:src/app/shared/table/table.component.ts:TableComponent',
    ]);

    // And: Graph integrity
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should handle component dependency chains', () => {
    // Given: App -> Dashboard -> Chart (nested components)
    const app = createAngularComponentAssertion(
      'AppComponent',
      'src/app/app.component.ts',
      'app-root'
    );

    const dashboard = createAngularComponentAssertion(
      'DashboardComponent',
      'src/app/dashboard/dashboard.component.ts',
      'app-dashboard'
    );

    const chart = createAngularComponentAssertion(
      'ChartComponent',
      'src/app/shared/chart/chart.component.ts',
      'app-chart'
    );

    const rawDep1 = createAngularDependencyAssertion(
      'AppComponent',
      'DashboardComponent',
      'src/app/app.component.ts',
      'template'
    );

    const rawDep2 = createAngularDependencyAssertion(
      'DashboardComponent',
      'ChartComponent',
      'src/app/dashboard/dashboard.component.ts',
      'template'
    );

    // When: Inference runs
    const result = inferRelationships([app, dashboard, chart], [rawDep1, rawDep2]);

    // Then: Chain should be traversable
    expectGraphEdges(result, 'component:src/app/app.component.ts:AppComponent', [
      'component:src/app/dashboard/dashboard.component.ts:DashboardComponent',
    ]);

    expectGraphEdges(result, 'component:src/app/dashboard/dashboard.component.ts:DashboardComponent', [
      'component:src/app/shared/chart/chart.component.ts:ChartComponent',
    ]);

    // And: Graph integrity
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should skip Angular framework imports', () => {
    // Given: Component imports from @angular/core
    const component = createAngularComponentAssertion(
      'MyComponent',
      'src/app/my.component.ts',
      'app-my',
      ['Component', 'OnInit', 'Input'] // These are from @angular/core
    );

    // Raw imports from Angular framework (should be skipped)
    const rawFrameworkImports = [
      createRawAngularImport('MyComponent', '@angular/core', ['Component']),
      createRawAngularImport('MyComponent', '@angular/common', ['CommonModule']),
    ];

    // When: Inference runs
    const result = inferRelationships([component], rawFrameworkImports);

    // Then: No edges should be created for framework imports
    const comp = result.find((n) => n._slice.id === 'component:src/app/my.component.ts:MyComponent');
    expect(comp).toBeDefined();

    const refs = comp!._slice.references || [];
    const refIds = refs.map((r) => r.id);

    // Framework imports should not create graph edges
    expect(refIds.filter((id) => id.includes('@angular'))).toHaveLength(0);
  });

  it('should handle circular component references', () => {
    // Note: Circular references are rare in Angular but can happen with dynamic templates
    const compA = createAngularComponentAssertion('ComponentA', 'src/app/a.component.ts', 'app-a');
    const compB = createAngularComponentAssertion('ComponentB', 'src/app/b.component.ts', 'app-b');

    const rawDepAB = createAngularDependencyAssertion('ComponentA', 'ComponentB', 'src/app/a.component.ts', 'template');
    const rawDepBA = createAngularDependencyAssertion('ComponentB', 'ComponentA', 'src/app/b.component.ts', 'template');

    // When: Inference runs
    const result = inferRelationships([compA, compB], [rawDepAB, rawDepBA]);

    // Then: Both edges should exist
    expectGraphEdges(result, 'component:src/app/a.component.ts:ComponentA', [
      'component:src/app/b.component.ts:ComponentB',
    ]);

    expectGraphEdges(result, 'component:src/app/b.component.ts:ComponentB', [
      'component:src/app/a.component.ts:ComponentA',
    ]);

    // And: Should not cause infinite loops
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });
});

describe('Angular Extractor - Integration Validation', () => {
  it('should document expected behavior for full RECON', () => {
    // This test documents what should happen during full RECON with Angular files
    //
    // 1. Angular extractor identifies components, services, pipes, directives
    // 2. Extracts import metadata (standalone components)
    // 3. Extracts DI metadata (injected services)
    // 4. Extracts template metadata (child component usage)
    // 5. Extraction phase converts to raw dependency assertions
    // 6. Inference phase creates graph edges
    // 7. Blast radius traversal follows component/service dependencies
    //
    // Integration test would:
    // - Create Angular components with various dependency types
    // - Run full RECON
    // - Query blast radius for a component
    // - Verify all dependencies (services, child components) are found

    expect(true).toBe(true); // Placeholder for future integration test
  });

  it('should enable Angular-specific impact analysis', () => {
    // Use case: "If I change this service, what components break?"
    //
    // Should return:
    // - All components that inject this service
    // - All other services that depend on this service
    // - All pipes that use this service
    //
    // This is the "blast radius" query for Angular

    expect(true).toBe(true); // Placeholder for integration test
  });

  it('should enable component tree visualization', () => {
    // Use case: "Show me the component tree for this feature"
    //
    // Should return:
    // - Root component
    // - All child components (template usage)
    // - All nested children (recursive traversal)
    //
    // This is a specialized traversal for Angular component trees

    expect(true).toBe(true); // Placeholder for integration test
  });
});

// Helper for Angular-specific raw import assertions
function createRawAngularImport(
  fromComponent: string,
  module: string,
  names: string[]
): RawAssertion {
  return {
    elementId: `import-${fromComponent}-${module}`,
    elementType: 'import',
    file: `src/app/${fromComponent.toLowerCase()}.component.ts`,
    metadata: {
      module,
      names,
    },
  };
}
