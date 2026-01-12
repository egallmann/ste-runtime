/**
 * RECON Phase 3: Inference
 * 
 * Extract relationships between semantic elements to build the graph edges
 * required for RSS traversal (dependencies, dependents, by_tag).
 * 
 * Per STE-Architecture Section 4.6 (RSS Operations):
 * - dependencies(item, depth) — Forward traversal
 * - dependents(item, depth) — Backward traversal
 * - by_tag(tag) — Cross-domain queries
 * 
 * Per SYS-13: Graph Completeness — bidirectional relationships required
 */

import type { RawAssertion, NormalizedAssertion } from './index.js';
import type { SupportedLanguage } from '../../config/index.js';
import { generateModuleId } from '../../utils/paths.js';

/**
 * Reference edge for AI-DOC graph traversal
 */
export interface SliceReference {
  domain: string;
  type: string;
  id: string;
}

/**
 * Extended slice with relationship support
 */
export interface SliceWithRelationships {
  id: string;
  domain: string;
  type: string;
  source_files: string[];
  references: SliceReference[];
  referenced_by: SliceReference[];
  tags: string[];
}

/**
 * Infer relationships between normalized assertions.
 * 
 * Relationship types inferred:
 * 1. Module → Function/Class (contains)
 * 2. Import → Module (references)
 * 3. API Endpoint → Function (handler)
 * 4. CFN Resource → CFN Resource (DependsOn)
 * 5. CFN GSI → CFN Resource (parent table)
 * 6. CFN Output → CFN Resource (value reference)
 * 
 * Returns assertions with populated _slice.references and _slice.tags
 */
export function inferRelationships(
  assertions: NormalizedAssertion[],
  rawAssertions: RawAssertion[]
): NormalizedAssertion[] {
  // Build lookup maps for relationship resolution
  const byId = new Map<string, NormalizedAssertion>();
  const byFile = new Map<string, NormalizedAssertion[]>();
  const moduleByFile = new Map<string, NormalizedAssertion>();
  
  // First pass: index all assertions
  for (const assertion of assertions) {
    byId.set(assertion._slice.id, assertion);
    
    const files = assertion._slice.source_files;
    if (files.length > 0) {
      const file = files[0];
      if (!byFile.has(file)) {
        byFile.set(file, []);
      }
      byFile.get(file)!.push(assertion);
      
      // Track modules by file
      if (assertion._slice.type === 'module') {
        moduleByFile.set(file, assertion);
      }
    }
  }
  
  // Build relationship map from raw assertions (imports and dependencies)
  const relationshipsByFile = buildRelationshipMap(rawAssertions);
  
  // Second pass: infer relationships
  const enriched = assertions.map(assertion => {
    const references: SliceReference[] = [];
    const tags: string[] = [];
    
    const slice = assertion._slice;
    const element = assertion.element;
    const file = slice.source_files[0];
    
    // ============================================================
    // Module relationships (TypeScript/JavaScript/Python)
    // ============================================================
    if (slice.type === 'module' && slice.domain === 'graph') {
      // Module references imported modules
      const relationships = relationshipsByFile.get(file) ?? [];
      for (const rel of relationships) {
        if (rel.type === 'import' && rel.module) {
          // Resolve imports to module IDs based on language
          const language = element.language as string | undefined;
          const targetModuleId = resolveModuleReference(rel.module, file, language);
          
          if (targetModuleId && byId.has(targetModuleId)) {
            references.push({
              domain: 'graph',
              type: 'module',
              id: targetModuleId,
            });
          }
        }
      }
      
      // Tag by layer
      const layer = element.layer as string | undefined;
      if (layer) {
        tags.push(`layer:${layer}`);
      }
      
      // Tag by language
      const language = element.language as string | undefined;
      if (language) {
        tags.push(`lang:${language}`);
      }
    }
    
    // ============================================================
    // Function relationships
    // ============================================================
    if (slice.type === 'function' && slice.domain === 'graph') {
      // Function references its containing module
      const module = moduleByFile.get(file);
      if (module) {
        references.push({
          domain: 'graph',
          type: 'module',
          id: module._slice.id,
        });
      }
      
      // Tag async functions
      if (element.is_async) {
        tags.push('async');
      }
      
      // Tag exported functions
      if (element.is_exported) {
        tags.push('exported');
      }
      
      // Tag by name patterns
      const name = element.name as string;
      if (name) {
        if (name.startsWith('lambda_handler') || name === 'handler') {
          tags.push('handler:lambda');
        }
        if (name.startsWith('test_') || name.startsWith('Test')) {
          tags.push('test');
        }
      }
      
      // Tag decorated functions
      const decorators = element.decorators as string[] | undefined;
      if (decorators) {
        for (const dec of decorators) {
          if (dec.includes('route') || dec.includes('app.')) {
            tags.push('handler:api');
          }
          if (dec.includes('pytest') || dec.includes('test')) {
            tags.push('test');
          }
        }
      }
    }
    
    // ============================================================
    // Class relationships
    // ============================================================
    if (slice.type === 'class' && slice.domain === 'graph') {
      // Class references its containing module
      const module = moduleByFile.get(file);
      if (module) {
        references.push({
          domain: 'graph',
          type: 'module',
          id: module._slice.id,
        });
      }
      
      // Tag by base classes
      const bases = element.bases as string[] | undefined;
      if (bases) {
        for (const base of bases) {
          if (base.includes('BaseModel') || base.includes('pydantic')) {
            tags.push('data:pydantic');
          }
          if (base.includes('Exception') || base.includes('Error')) {
            tags.push('exception');
          }
        }
      }
    }
    
    // ============================================================
    // API Endpoint relationships
    // ============================================================
    if (slice.type === 'endpoint' && slice.domain === 'api') {
      // API endpoint references its handler function
      const functionName = element.function_name as string | undefined;
      if (functionName && file) {
        // Look for function in same file
        const functionsInFile = byFile.get(file)?.filter(a => 
          a._slice.type === 'function' && 
          a.element.name === functionName
        ) ?? [];
        
        for (const fn of functionsInFile) {
          references.push({
            domain: 'graph',
            type: 'function',
            id: fn._slice.id,
          });
        }
      }
      
      // Tag by HTTP method
      const method = element.method as string | undefined;
      if (method) {
        tags.push(`method:${method.toUpperCase()}`);
      }
      
      // Tag by framework
      const framework = element.framework as string | undefined;
      if (framework) {
        tags.push(`framework:${framework}`);
      }
    }
    
    // ============================================================
    // Data Model relationships
    // ============================================================
    if (slice.type === 'entity' && slice.domain === 'data') {
      // Tag by type
      const modelType = element.type as string | undefined;
      if (modelType === 'dynamodb_table') {
        tags.push('storage:dynamodb');
        
        // Tag tables with streams
        if (element.hasStream) {
          tags.push('has:stream');
        }
        
        // Tag tables with GSIs
        const gsis = element.globalSecondaryIndexes as unknown[];
        if (gsis && gsis.length > 0) {
          tags.push('has:gsi');
        }
      }
    }
    
    // ============================================================
    // CloudFormation Resource relationships
    // ============================================================
    if (slice.type === 'cfn_resource' && slice.domain === 'infrastructure') {
      // Process dependency assertions
      const relationships = relationshipsByFile.get(file) ?? [];
      for (const rel of relationships) {
        if (rel.type === 'dependency' && rel.from === element.logicalId) {
          // Resolve CFN resource reference
          const targetResourceId = resolveCloudFormationResource(rel.to as string, file);
          if (targetResourceId && byId.has(targetResourceId)) {
            references.push({
              domain: 'infrastructure',
              type: 'cfn_resource',
              id: targetResourceId,
            });
          }
        }
      }
      
      // Also handle legacy element metadata for backward compatibility
      const dependencies = element.dependencies as string[] | undefined;
      const dependsOn = element.dependsOn as string[] | undefined;
      const allDeps = [...(dependencies ?? []), ...(dependsOn ?? [])];
      
      for (const dep of allDeps) {
        // Look for the referenced resource in same file
        const resourcesInFile = byFile.get(file)?.filter(a =>
          a._slice.type === 'cfn_resource' &&
          a.element.logicalId === dep
        ) ?? [];
        
        for (const res of resourcesInFile) {
          references.push({
            domain: 'infrastructure',
            type: 'cfn_resource',
            id: res._slice.id,
          });
        }
      }
    }
    
    // Legacy support for 'resource' type
    if (slice.type === 'resource' && slice.domain === 'infrastructure') {
      // Resource references its dependencies
      const dependencies = element.dependencies as string[] | undefined;
      const dependsOn = element.dependsOn as string[] | undefined;
      const allDeps = [...(dependencies ?? []), ...(dependsOn ?? [])];
      
      for (const dep of allDeps) {
        // Look for the referenced resource in same file
        const resourcesInFile = byFile.get(file)?.filter(a =>
          a._slice.type === 'resource' &&
          a.element.logicalId === dep
        ) ?? [];
        
        for (const res of resourcesInFile) {
          references.push({
            domain: 'infrastructure',
            type: 'resource',
            id: res._slice.id,
          });
        }
      }
      
      // Tag by service
      const service = element.service as string | undefined;
      if (service) {
        tags.push(`aws:${service.toLowerCase()}`);
      }
      
      // Tag by resource kind
      const resourceKind = element.resourceKind as string | undefined;
      if (resourceKind) {
        tags.push(`kind:${resourceKind.toLowerCase()}`);
      }
      
      // ========================================================
      // Lambda → Python Function cross-language linking
      // ========================================================
      const resourceType = element.type as string | undefined;
      if (resourceType === 'AWS::Lambda::Function') {
        const handler = element.handler as string | undefined;
        if (handler) {
          // Handler format: "module_name.function_name" or "path/to/module.function_name"
          const handlerParts = handler.split('.');
          if (handlerParts.length >= 2) {
            const modulePart = handlerParts.slice(0, -1).join('.');
            const functionName = handlerParts[handlerParts.length - 1];
            const moduleFileName = modulePart.replace(/\./g, '/') + '.py';
            
            // Search for matching Python functions across all files
            for (const [pyFile, pyAssertions] of byFile.entries()) {
              // Match if file ends with the module filename
              if (pyFile.endsWith(moduleFileName) || pyFile.endsWith(`/${moduleFileName}`)) {
                // Find the lambda_handler function in this file
                const matchingFunctions = pyAssertions.filter(a =>
                  a._slice.type === 'function' &&
                  a.element.name === functionName
                );
                
                for (const fn of matchingFunctions) {
                  references.push({
                    domain: 'graph',
                    type: 'function',
                    id: fn._slice.id,
                  });
                  tags.push('handler:lambda');
                  tags.push('linked:code');
                }
                
                // Also link to the module
                const module = moduleByFile.get(pyFile);
                if (module) {
                  references.push({
                    domain: 'graph',
                    type: 'module',
                    id: module._slice.id,
                  });
                }
              }
            }
          }
        }
      }
    }
    
    // ============================================================
    // CloudFormation GSI relationships
    // ============================================================
    if (slice.type === 'gsi' && slice.domain === 'infrastructure') {
      // GSI references its parent table
      const parentTable = element.parentTable as string | undefined;
      if (parentTable && file) {
        const tablesInFile = byFile.get(file)?.filter(a =>
          a._slice.type === 'resource' &&
          a.element.logicalId === parentTable
        ) ?? [];
        
        for (const table of tablesInFile) {
          references.push({
            domain: 'infrastructure',
            type: 'resource',
            id: table._slice.id,
          });
        }
      }
      
      tags.push('index:gsi');
    }
    
    // ============================================================
    // CloudFormation Template relationships
    // ============================================================
    if (slice.type === 'template' && slice.domain === 'infrastructure') {
      // Template references all its resources
      const resourcesInFile = byFile.get(file)?.filter(a =>
        a._slice.type === 'resource'
      ) ?? [];
      
      for (const res of resourcesInFile) {
        references.push({
          domain: 'infrastructure',
          type: 'resource',
          id: res._slice.id,
        });
      }
      
      tags.push('infrastructure:template');
    }
    
    // ============================================================
    // JSON Control relationships (E-ADR-005)
    // ============================================================
    if (slice.type === 'control' && slice.domain === 'data') {
      // Control references infrastructure resources by service
      const service = element.service as string | undefined;
      if (service) {
        // Find all resources that match this service
        const serviceTag = `aws:${service.toLowerCase()}`;
        for (const otherAssertion of assertions) {
          const otherTags = (otherAssertion._slice as any).tags as string[] | undefined;
          if (otherTags?.includes(serviceTag) && 
              otherAssertion._slice.domain === 'infrastructure') {
            references.push({
              domain: 'infrastructure',
              type: otherAssertion._slice.type,
              id: otherAssertion._slice.id,
            });
          }
        }
        
        // Add service tag
        tags.push(`control:${service.toLowerCase()}`);
      }
      
      // Tag by severity
      const severity = element.severity as string | undefined;
      if (severity) {
        tags.push(`severity:${severity.toLowerCase()}`);
      }
      
      // Tag by compliance frameworks
      const frameworks = element.complianceFrameworks as string[] | undefined;
      if (frameworks) {
        for (const framework of frameworks) {
          tags.push(`compliance:${framework.toLowerCase()}`);
        }
      }
    }
    
    // ============================================================
    // JSON Schema relationships (E-ADR-005)
    // ============================================================
    if (slice.type === 'schema' && slice.domain === 'data') {
      // Schema references DynamoDB tables by table name
      const tableName = element.tableName as string | undefined;
      if (tableName) {
        // Find matching DynamoDB table resources
        for (const otherAssertion of assertions) {
          if (otherAssertion._slice.type === 'resource' &&
              otherAssertion._slice.domain === 'infrastructure' &&
              otherAssertion.element.tableName === tableName) {
            references.push({
              domain: 'infrastructure',
              type: 'resource',
              id: otherAssertion._slice.id,
            });
          }
        }
      }
      
      tags.push('schema:entity');
    }
    
    // ============================================================
    // JSON Config relationships (E-ADR-005)
    // ============================================================
    if (slice.type === 'config' && slice.domain === 'infrastructure') {
      // Config references templates in same directory
      const configDir = file.replace(/[^/]+$/, '');
      const templatesInSameDir = assertions.filter(a =>
        a._slice.type === 'template' &&
        a._slice.source_files[0]?.startsWith(configDir.replace('/parameters/', '/'))
      );
      
      for (const template of templatesInSameDir) {
        references.push({
          domain: 'infrastructure',
          type: 'template',
          id: template._slice.id,
        });
      }
      
      // Tag by environment
      const environment = element.environment as string | undefined;
      if (environment) {
        tags.push(`env:${environment}`);
      }
    }
    
    // ============================================================
    // Angular Component relationships (E-ADR-006)
    // ============================================================
    if (slice.type === 'component' && slice.domain === 'frontend') {
      // Component → Template relationship
      const templateUrl = element.templateUrl as string | undefined;
      if (templateUrl) {
        // Find matching template by filename pattern
        const templateBaseName = templateUrl.replace('./', '').replace('.html', '');
        for (const otherAssertion of assertions) {
          if (otherAssertion._slice.type === 'template' &&
              otherAssertion._slice.domain === 'frontend' &&
              otherAssertion._slice.source_files[0]?.includes(templateBaseName)) {
            references.push({
              domain: 'frontend',
              type: 'template',
              id: otherAssertion._slice.id,
            });
          }
        }
      }
      
      // Component → Styles relationship
      const styleUrls = element.styleUrls as string[] | undefined;
      if (styleUrls) {
        for (const styleUrl of styleUrls) {
          const styleBaseName = styleUrl.replace('./', '').replace(/\.(s?css)$/, '');
          for (const otherAssertion of assertions) {
            if (otherAssertion._slice.type === 'styles' &&
                otherAssertion._slice.domain === 'frontend' &&
                otherAssertion._slice.source_files[0]?.includes(styleBaseName)) {
              references.push({
                domain: 'frontend',
                type: 'styles',
                id: otherAssertion._slice.id,
              });
            }
          }
        }
      }
      
      // Component → Injected Service relationships
      const injectedServices = element.injectedServices as string[] | undefined;
      if (injectedServices) {
        // Angular built-in services to skip (no need for cross-domain references)
        const angularBuiltIns = new Set([
          'HttpClient', 'Router', 'ActivatedRoute', 'FormBuilder',
          'NgZone', 'Renderer2', 'ElementRef', 'ChangeDetectorRef',
          'ApplicationRef', 'Injector', 'Location', 'Title', 'Meta',
          'DatePipe', 'DecimalPipe', 'CurrencyPipe', 'PercentPipe',
          'ViewContainerRef', 'TemplateRef', 'ComponentFactoryResolver',
        ]);
        
        for (const serviceName of injectedServices) {
          if (angularBuiltIns.has(serviceName)) continue; // Skip Angular built-ins
          
          for (const otherAssertion of assertions) {
            if (otherAssertion._slice.type === 'service' &&
                otherAssertion._slice.domain === 'frontend' &&
                otherAssertion.element.className === serviceName) {
              references.push({
                domain: 'frontend',
                type: 'service',
                id: otherAssertion._slice.id,
              });
            }
          }
        }
      }
      
      // Tag as Angular component
      tags.push('frontend:angular');
      tags.push('frontend:component');
      
      // Add selector as tag for cross-component discovery
      const selector = element.selector as string | undefined;
      if (selector) {
        tags.push(`selector:${selector}`);
      }
    }
    
    // ============================================================
    // Angular Service relationships (E-ADR-006)
    // ============================================================
    if (slice.type === 'service' && slice.domain === 'frontend') {
      // Service → API Endpoint relationships via HTTP calls
      const httpCalls = element.httpCalls as Array<{ method: string; urlPattern: string; functionName: string }> | undefined;
      if (httpCalls) {
        for (const call of httpCalls) {
          // Find matching API endpoints
          for (const otherAssertion of assertions) {
            const endpointPath = otherAssertion.element.path as string | undefined;
            if (otherAssertion._slice.type === 'endpoint' &&
                otherAssertion._slice.domain === 'api' &&
                otherAssertion.element.method === call.method &&
                endpointPath?.includes(call.urlPattern.split('/')[1])) {
              references.push({
                domain: 'api',
                type: 'endpoint',
                id: otherAssertion._slice.id,
              });
            }
          }
          
          // Tag by HTTP method
          tags.push(`http:${call.method.toLowerCase()}`);
        }
      }
      
      // Service → Injected Dependency relationships
      const injectedDependencies = element.injectedDependencies as string[] | undefined;
      if (injectedDependencies) {
        // Angular built-in services to skip (no need for cross-domain references)
        const angularBuiltIns = new Set([
          'HttpClient', 'Router', 'ActivatedRoute', 'FormBuilder',
          'NgZone', 'Renderer2', 'ElementRef', 'ChangeDetectorRef',
          'ApplicationRef', 'Injector', 'Location', 'Title', 'Meta',
          'DatePipe', 'DecimalPipe', 'CurrencyPipe', 'PercentPipe',
          'ViewContainerRef', 'TemplateRef', 'ComponentFactoryResolver',
        ]);
        
        for (const depName of injectedDependencies) {
          if (angularBuiltIns.has(depName)) continue; // Skip Angular built-ins
          
          for (const otherAssertion of assertions) {
            if (otherAssertion._slice.type === 'service' &&
                otherAssertion._slice.domain === 'frontend' &&
                otherAssertion.element.className === depName) {
              references.push({
                domain: 'frontend',
                type: 'service',
                id: otherAssertion._slice.id,
              });
            }
          }
        }
      }
      
      tags.push('frontend:angular');
      tags.push('frontend:service');
    }
    
    // ============================================================
    // Angular Template relationships (E-ADR-006)
    // ============================================================
    if (slice.type === 'template' && slice.domain === 'frontend') {
      // Template → Child Component relationships
      const childComponents = element.childComponents as Array<{ selector: string }> | undefined;
      if (childComponents) {
        for (const child of childComponents) {
          // Find component by selector
          for (const otherAssertion of assertions) {
            if (otherAssertion._slice.type === 'component' &&
                otherAssertion._slice.domain === 'frontend' &&
                otherAssertion.element.selector === child.selector) {
              references.push({
                domain: 'frontend',
                type: 'component',
                id: otherAssertion._slice.id,
              });
            }
          }
        }
      }
      
      tags.push('frontend:angular');
      tags.push('frontend:template');
      
      // Tag by directives used
      const directives = element.directives as string[] | undefined;
      if (directives) {
        for (const directive of directives) {
          tags.push(`directive:${directive.toLowerCase()}`);
        }
      }
    }
    
    // ============================================================
    // Angular Routes relationships (E-ADR-006)
    // ============================================================
    if (slice.type === 'routes' && slice.domain === 'frontend') {
      // Routes → Component relationships
      const routes = element.routes as Array<{ component?: string; guards?: string[] }> | undefined;
      if (routes) {
        for (const route of routes) {
          if (route.component) {
            for (const otherAssertion of assertions) {
              if (otherAssertion._slice.type === 'component' &&
                  otherAssertion._slice.domain === 'frontend' &&
                  otherAssertion.element.className === route.component) {
                references.push({
                  domain: 'frontend',
                  type: 'component',
                  id: otherAssertion._slice.id,
                });
              }
            }
          }
          
          // Routes → Guard relationships
          if (route.guards) {
            for (const guardName of route.guards) {
              for (const otherAssertion of assertions) {
                if (otherAssertion._slice.type === 'guard' &&
                    otherAssertion._slice.domain === 'frontend' &&
                    otherAssertion.element.className === guardName) {
                  references.push({
                    domain: 'frontend',
                    type: 'guard',
                    id: otherAssertion._slice.id,
                  });
                }
              }
            }
          }
        }
      }
      
      tags.push('frontend:angular');
      tags.push('frontend:routes');
    }
    
    // ============================================================
    // Angular Pipe relationships (E-ADR-006)
    // ============================================================
    if (slice.type === 'pipe' && slice.domain === 'frontend') {
      tags.push('frontend:angular');
      tags.push('frontend:pipe');
      
      // Tag by pipe name for discovery
      const pipeName = element.pipeName as string | undefined;
      if (pipeName) {
        tags.push(`pipe:${pipeName}`);
      }
    }
    
    // ============================================================
    // Angular Directive relationships (E-ADR-006)
    // ============================================================
    if (slice.type === 'directive' && slice.domain === 'frontend') {
      tags.push('frontend:angular');
      tags.push('frontend:directive');
      
      // Tag by selector for discovery
      const selector = element.selector as string | undefined;
      if (selector) {
        tags.push(`directive:${selector}`);
      }
    }
    
    // ============================================================
    // Angular Guard relationships (E-ADR-006)
    // ============================================================
    if (slice.type === 'guard' && slice.domain === 'frontend') {
      tags.push('frontend:angular');
      tags.push('frontend:guard');
      
      // Tag by guard type
      const guardTypes = element.guardType as string[] | undefined;
      if (guardTypes) {
        for (const guardType of guardTypes) {
          tags.push(`guard:${guardType.toLowerCase()}`);
        }
      }
    }
    
    // ============================================================
    // CSS/SCSS Styles relationships (E-ADR-006)
    // Cross-cutting extractor - works with any frontend
    // ============================================================
    if (slice.type === 'styles' && slice.domain === 'frontend') {
      // Styles → Design Tokens relationships (CSS variable usage)
      const cssVariablesUsed = element.cssVariablesUsed as string[] | undefined;
      if (cssVariablesUsed && cssVariablesUsed.length > 0) {
        // Find design token files that define these variables
        for (const otherAssertion of assertions) {
          if (otherAssertion._slice.type === 'design-tokens' &&
              otherAssertion._slice.domain === 'frontend') {
            const definedVars = otherAssertion.element.cssVariables as Record<string, Record<string, string>> | undefined;
            if (definedVars) {
              // Check if any used variable is defined in this token file
              for (const varName of cssVariablesUsed) {
                for (const category of Object.values(definedVars)) {
                  if (varName in category) {
                    references.push({
                      domain: 'frontend',
                      type: 'design-tokens',
                      id: otherAssertion._slice.id,
                    });
                    break;
                  }
                }
              }
            }
          }
        }
      }
      
      tags.push('frontend:styles');
      
      // Tag if responsive
      const hasResponsive = element.hasResponsive as boolean | undefined;
      if (hasResponsive) {
        tags.push('styles:responsive');
      }
    }
    
    // ============================================================
    // CSS/SCSS Design Tokens relationships (E-ADR-006)
    // ============================================================
    if (slice.type === 'design-tokens' && slice.domain === 'frontend') {
      tags.push('frontend:design-tokens');
      
      // Tag by token types present
      const cssVariables = element.cssVariables as Record<string, Record<string, string>> | undefined;
      if (cssVariables) {
        for (const tokenType of Object.keys(cssVariables)) {
          tags.push(`token:${tokenType}`);
        }
      }
      
      // Tag if has animations
      const animations = element.animations as string[] | undefined;
      if (animations && animations.length > 0) {
        tags.push('styles:animated');
      }
    }
    
    // ============================================================
    // Angular Component/Service relationships
    // ============================================================
    if ((slice.type === 'angular-component' || slice.type === 'angular-service') && slice.domain === 'frontend') {
      // Process dependency assertions (imports, injections, template usage)
      const relationships = relationshipsByFile.get(file) ?? [];
      for (const rel of relationships) {
        if (rel.type === 'dependency' && rel.from === element.className) {
          // Resolve Angular dependency
          const targetId = resolveAngularDependency(rel.to as string, rel.dependencyType as string, file, byFile);
          if (targetId && byId.has(targetId)) {
            // Determine target type based on dependency type
            const targetAssertion = byId.get(targetId);
            if (targetAssertion) {
              references.push({
                domain: targetAssertion._slice.domain,
                type: targetAssertion._slice.type,
                id: targetId,
              });
            }
          }
        }
      }
      
      // Tag by component/service type
      if (slice.type === 'angular-component') {
        tags.push('frontend:angular-component');
        
        const selector = element.selector as string | undefined;
        if (selector) {
          tags.push(`selector:${selector}`);
        }
        
        const standalone = element.standalone as boolean | undefined;
        if (standalone) {
          tags.push('angular:standalone');
        }
      }
      
      if (slice.type === 'angular-service') {
        tags.push('frontend:angular-service');
        
        const providedIn = element.providedIn as string | undefined;
        if (providedIn === 'root') {
          tags.push('di:root');
        }
      }
    }
    
    // Return enriched assertion
    return {
      ...assertion,
      _slice: {
        ...assertion._slice,
        references: deduplicateReferences(references),
        tags: [...new Set(tags)],
      },
    };
  });
  
  // Third pass: build reverse edges (referenced_by) for SYS-13 compliance
  const withBidirectional = buildBidirectionalEdges(enriched);
  
  return withBidirectional;
}

/**
 * Relationship metadata extracted from raw assertions
 */
interface Relationship {
  type: 'import' | 'dependency';
  module?: string;        // For imports
  names?: string[];       // For imports
  from?: string;          // For dependencies
  to?: string;            // For dependencies
  dependencyType?: string; // For dependencies: 'DependsOn', 'Ref', 'injection', 'template', etc.
  language?: string;      // Source language
}

/**
 * Build a map of relationships (imports and dependencies) by file from raw assertions
 */
function buildRelationshipMap(rawAssertions: RawAssertion[]): Map<string, Relationship[]> {
  const result = new Map<string, Relationship[]>();
  
  for (const assertion of rawAssertions) {
    const file = assertion.file;
    if (!result.has(file)) {
      result.set(file, []);
    }
    
    // Handle imports (TypeScript, Python, etc.)
    if (assertion.elementType === 'import') {
      result.get(file)!.push({
        type: 'import',
        module: assertion.metadata.module as string,
        names: (assertion.metadata.names as string[]) ?? [],
        language: assertion.metadata.language as string | undefined,
      });
    }
    
    // Handle dependencies (CloudFormation, Angular, etc.)
    if (assertion.elementType === 'dependency') {
      result.get(file)!.push({
        type: 'dependency',
        from: assertion.metadata.from as string,
        to: assertion.metadata.to as string,
        dependencyType: assertion.metadata.type as string,
        language: assertion.metadata.language as string | undefined,
      });
    }
  }
  
  return result;
}

/**
 * Legacy function for backward compatibility
 * Converts relationship map to old import map format
 */
function buildImportMap(rawAssertions: RawAssertion[]): Map<string, Array<{ module: string; names: string[] }>> {
  const relationshipMap = buildRelationshipMap(rawAssertions);
  const result = new Map<string, Array<{ module: string; names: string[] }>>();
  
  for (const [file, relationships] of relationshipMap.entries()) {
    const imports = relationships
      .filter((r) => r.type === 'import' && r.module)
      .map((r) => ({
        module: r.module!,
        names: r.names ?? [],
      }));
    
    if (imports.length > 0) {
      result.set(file, imports);
    }
  }
  
  return result;
}

/**
 * Resolve a module reference to a module ID based on language
 */
function resolveModuleReference(
  modulePath: string,
  fromFile: string,
  language: string | undefined
): string | null {
  // TypeScript/JavaScript: Handle relative imports
  if (language === 'typescript' || language === 'javascript' || !language) {
    return resolveImportToModuleId(modulePath, fromFile);
  }
  
  // Python: Handle module name resolution
  if (language === 'python') {
    return resolvePythonModule(modulePath, fromFile);
  }
  
  // Unknown language: skip
  return null;
}

/**
 * Resolve a Python module name to a module ID
 * 
 * Examples:
 *   'user_service' from 'backend/app.py' -> 'module-backend-user_service'
 *   'services.database' from 'backend/app.py' -> 'module-backend-services-database'
 *   '.database' from 'backend/services/auth.py' -> 'module-backend-services-database'
 */
function resolvePythonModule(moduleName: string, fromFile: string): string | null {
  // Skip standard library and external packages
  const stdLibModules = new Set([
    'os', 'sys', 'json', 'datetime', 'time', 'math', 'random',
    'collections', 'itertools', 'functools', 're', 'pathlib',
    'typing', 'abc', 'dataclasses', 'enum', 'copy', 'pickle',
    'logging', 'argparse', 'configparser', 'io', 'tempfile',
    'shutil', 'subprocess', 'threading', 'multiprocessing',
    'asyncio', 'unittest', 'pytest', 'requests', 'boto3', 'botocore',
  ]);
  
  if (stdLibModules.has(moduleName.split('.')[0])) {
    return null;
  }
  
  // Handle relative imports (. and ..)
  if (moduleName.startsWith('.')) {
    return resolvePythonRelativeImport(moduleName, fromFile);
  }
  
  // Handle absolute imports
  // Convert 'services.database' -> 'services-database'
  const moduleId = moduleName.replace(/\./g, '-');
  
  // Get directory prefix from fromFile
  // 'backend/app.py' -> 'backend'
  const dirPrefix = fromFile.substring(0, fromFile.lastIndexOf('/'));
  
  // Check if module exists in same directory
  // 'user_service' from 'backend/app.py' -> 'module-backend-user_service'
  if (dirPrefix) {
    return `module-${dirPrefix}-${moduleId}`;
  }
  
  // Root level module
  return `module-${moduleId}`;
}

/**
 * Resolve Python relative imports (. and ..)
 */
function resolvePythonRelativeImport(importPath: string, fromFile: string): string | null {
  // Count leading dots
  const match = importPath.match(/^(\.+)/);
  if (!match) return null;
  
  const dots = match[1].length;
  const moduleName = importPath.substring(dots);
  
  // Get directory segments
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
  const segments = fromDir.split('/');
  
  // Go up 'dots - 1' levels (. means same dir, .. means parent)
  const levelsUp = dots - 1;
  const targetSegments = segments.slice(0, segments.length - levelsUp);
  
  // Add module name if present
  if (moduleName) {
    const moduleSegments = moduleName.replace(/\./g, '-');
    targetSegments.push(moduleSegments);
  }
  
  // Generate module ID
  return `module-${targetSegments.join('-')}`;
}

/**
 * Resolve a CloudFormation resource logical ID to a slice ID
 */
function resolveCloudFormationResource(logicalId: string, fromFile: string): string | null {
  // CFN resource IDs follow pattern: cfn-resource:template.yaml:LogicalId
  // Extract template name from fromFile
  const templateName = fromFile.split('/').pop() || fromFile;
  return `cfn-resource:${templateName}:${logicalId}`;
}

/**
 * Resolve an Angular dependency to a slice ID
 */
function resolveAngularDependency(
  targetName: string,
  dependencyType: string,
  fromFile: string,
  byFile: Map<string, NormalizedAssertion[]>
): string | null {
  // Search for the target component or service across all files
  for (const [file, assertions] of byFile.entries()) {
    for (const assertion of assertions) {
      const element = assertion.element;
      
      // Match by className
      if (element.className === targetName) {
        return assertion._slice.id;
      }
      
      // Match by selector for components
      if (assertion._slice.type === 'angular-component' && element.selector === targetName) {
        return assertion._slice.id;
      }
    }
  }
  
  return null;
}

/**
 * Resolve an import path to a module ID (TypeScript/JavaScript)
 */
function resolveImportToModuleId(importPath: string, fromFile: string): string | null {
  // Only resolve relative imports
  if (!importPath.startsWith('.')) {
    return null;
  }
  
  // Resolve the relative import to an absolute path
  // Examples:
  //   from: 'src/mcp/mcp-server.ts', import: './tools-structural.js'
  //   => 'src/mcp/tools-structural.js'
  //
  //   from: 'src/mcp/mcp-server.ts', import: '../rss/rss-operations.js'
  //   => 'src/rss/rss-operations.js'
  
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
  const importWithoutExt = importPath.replace(/\.(ts|tsx|js|jsx)$/, '');
  
  // Split import path into segments
  const importSegments = importWithoutExt.split('/');
  const fromSegments = fromDir.split('/');
  
  // Process each segment
  for (const segment of importSegments) {
    if (segment === '.') {
      // Current directory, skip
      continue;
    } else if (segment === '..') {
      // Parent directory, pop from path
      fromSegments.pop();
    } else {
      // Regular segment, add to path
      fromSegments.push(segment);
    }
  }
  
  // Reconstruct the resolved path
  const resolvedPath = fromSegments.join('/');
  
  // Generate module ID from resolved path
  return generateModuleId(resolvedPath);
}

/**
 * Deduplicate references by id
 */
function deduplicateReferences(refs: SliceReference[]): SliceReference[] {
  const seen = new Set<string>();
  const result: SliceReference[] = [];
  
  for (const ref of refs) {
    const key = `${ref.domain}/${ref.type}/${ref.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(ref);
    }
  }
  
  return result;
}

/**
 * Build bidirectional edges by computing referenced_by from references.
 * Per SYS-13: Graph Completeness — bidirectional relationships required
 */
function buildBidirectionalEdges(assertions: NormalizedAssertion[]): NormalizedAssertion[] {
  // Build reverse edge map: target -> list of sources
  const referencedByMap = new Map<string, SliceReference[]>();
  
  for (const assertion of assertions) {
    const sourceRef: SliceReference = {
      domain: assertion._slice.domain,
      type: assertion._slice.type,
      id: assertion._slice.id,
    };
    
    const references = (assertion._slice as any).references as SliceReference[] | undefined;
    if (references) {
      for (const target of references) {
        const targetKey = `${target.domain}/${target.type}/${target.id}`;
        if (!referencedByMap.has(targetKey)) {
          referencedByMap.set(targetKey, []);
        }
        referencedByMap.get(targetKey)!.push(sourceRef);
      }
    }
  }
  
  // Apply reverse edges
  return assertions.map(assertion => {
    const key = `${assertion._slice.domain}/${assertion._slice.type}/${assertion._slice.id}`;
    const referencedBy = referencedByMap.get(key) ?? [];
    
    return {
      ...assertion,
      _slice: {
        ...assertion._slice,
        referenced_by: deduplicateReferences(referencedBy),
      },
    };
  });
}

