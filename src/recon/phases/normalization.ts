/**
 * RECON Phase 4: Normalization
 * 
 * Map raw assertions to AI-DOC schema structure.
 * 
 * This maps source elements to the 13-domain AI-DOC structure
 * defined in the STE System Specification.
 * 
 * Supports multiple languages: TypeScript, Python
 * 
 * Per E-ADR-001: Provisional mapping, not canonical
 */

import path from 'node:path';
import type { RawAssertion, NormalizedAssertion } from './index.js';
import type { SupportedLanguage } from '../../config/index.js';
import { generateModuleId, toPosixPath } from '../../utils/paths.js';

/**
 * Get extractor name for a language
 */
function getExtractorName(language: SupportedLanguage): string {
  switch (language) {
    case 'typescript':
      return 'recon-typescript-extractor-v1';
    case 'python':
      return 'recon-python-extractor-v1';
    case 'cloudformation':
      return 'recon-cloudformation-extractor-v1';
    case 'json':
      return 'recon-json-extractor-v1';  // E-ADR-005
    case 'angular':
      return 'recon-angular-extractor-v1';  // E-ADR-006
    case 'css':
      return 'recon-css-extractor-v1';  // E-ADR-006
    default:
      return 'recon-unknown-extractor-v1';
  }
}

/**
 * Get file extension for a language
 */
function getFileExtension(language: SupportedLanguage): string {
  switch (language) {
    case 'typescript':
      return '.ts';
    case 'python':
      return '.py';
    case 'cloudformation':
      return '.yaml'; // or .yml, .json - doesn't matter for ID generation
    case 'json':
      return '.json';  // E-ADR-005
    case 'angular':
      return '.ts';  // E-ADR-006: Angular files are TypeScript
    case 'css':
      return '.scss';  // E-ADR-006: Default to SCSS
    default:
      return '';
  }
}

/**
 * Normalize raw assertions into AI-DOC schema format.
 * 
 * Maps source elements to appropriate AI-DOC domains:
 * - Functions -> graph:function
 * - Classes -> graph:class
 * - Imports -> graph:module relationships
 * - API Endpoints -> api:endpoint
 * - Data Models -> data:entity
 */
export async function normalizeAssertions(
  rawAssertions: RawAssertion[],
  projectRoot: string
): Promise<NormalizedAssertion[]> {
  const normalized: NormalizedAssertion[] = [];
  const timestamp = new Date().toISOString();
  
  // Group assertions by file to create module-level docs
  const byFile = new Map<string, RawAssertion[]>();
  
  for (const assertion of rawAssertions) {
    if (!byFile.has(assertion.file)) {
      byFile.set(assertion.file, []);
    }
    byFile.get(assertion.file)!.push(assertion);
  }
  
  // Create normalized assertions for each file
  for (const [file, assertions] of byFile.entries()) {
    // Determine language from first assertion (all assertions in file have same language)
    const language = assertions[0]?.language ?? 'typescript';
    
    const moduleNormalized = normalizeModule(file, assertions, timestamp, language);
    if (moduleNormalized) {
      normalized.push(moduleNormalized);
    }
    
    // Also normalize individual elements
    for (const assertion of assertions) {
      const elementNormalized = normalizeElement(assertion, timestamp);
      if (elementNormalized) {
        normalized.push(elementNormalized);
      }
    }
  }
  
  return normalized;
}

function normalizeModule(
  file: string,
  assertions: RawAssertion[],
  timestamp: string,
  language: SupportedLanguage
): NormalizedAssertion | null {
  // Create a module-level AI-DOC entry
  const moduleId = fileToModuleId(file);
  const functions = assertions
    .filter(a => a.elementType === 'function')
    .map(a => a.metadata.name as string);
  const classes = assertions
    .filter(a => a.elementType === 'class')
    .map(a => a.metadata.name as string);
  const imports = assertions
    .filter(a => a.elementType === 'import')
    .map(a => ({
      module: a.metadata.module as string,
      names: a.metadata.names as string[],
    }));
  const apiEndpoints = assertions
    .filter(a => a.elementType === 'api_endpoint')
    .map(a => ({
      method: a.metadata.method as string,
      path: a.metadata.path as string,
      function_name: a.metadata.function_name as string,
    }));
  const dataModels = assertions
    .filter(a => a.elementType === 'data_model')
    .map(a => a.metadata.name as string);
  
  const ext = getFileExtension(language);
  const baseName = path.basename(file, ext);
  
  return {
    _slice: {
      id: moduleId,
      domain: 'graph',
      type: 'module',
      source_files: [file],
    },
    element: {
      id: moduleId,
      path: file,
      name: baseName,
      language,
      layer: inferLayer(file),
      exports: {
        classes,
        functions,
        constants: [],
        data_models: dataModels,
      },
      imports: {
        internal: imports.filter(imp => isInternalImport(imp.module)),
        external: imports.filter(imp => !isInternalImport(imp.module)),
      },
      api_endpoints: apiEndpoints,
    },
    provenance: {
      extracted_at: timestamp,
      extractor: getExtractorName(language),
      file,
      line: 1,
      language,
    },
  };
}

function normalizeElement(
  assertion: RawAssertion,
  timestamp: string
): NormalizedAssertion | null {
  const extractor = getExtractorName(assertion.language);
  
  if (assertion.elementType === 'function') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'graph',
        type: 'function',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name as string,
        signature: assertion.signature,
        language: assertion.language,
        is_exported: assertion.metadata.isExported as boolean ?? true,
        is_async: assertion.metadata.isAsync ?? assertion.metadata.async ?? false,
        parameters: assertion.metadata.parameters ?? assertion.metadata.args ?? [],
        docstring: assertion.metadata.docstring,
        description: assertion.metadata.description,
        params: assertion.metadata.params,
        returns: assertion.metadata.returns,
        examples: assertion.metadata.examples,
        deprecated: assertion.metadata.deprecated,
        tags: assertion.metadata.tags,
        decorators: assertion.metadata.decorators,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'class') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'graph',
        type: 'class',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name as string,
        language: assertion.language,
        is_exported: assertion.metadata.isExported as boolean ?? true,
        methods: assertion.metadata.methods as string[],
        properties: assertion.metadata.properties as string[] ?? [],
        bases: assertion.metadata.bases,
        docstring: assertion.metadata.docstring,
        description: assertion.metadata.description,
        examples: assertion.metadata.examples,
        deprecated: assertion.metadata.deprecated,
        tags: assertion.metadata.tags,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'api_endpoint') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'api',
        type: 'endpoint',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        framework: assertion.metadata.framework,
        method: assertion.metadata.method,
        path: assertion.metadata.path,
        function_name: assertion.metadata.function_name,
        docstring: assertion.metadata.docstring,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'data_model') {
    // Handle various data model types:
    // - Python data models (fields, docstring)
    // - CloudFormation DynamoDB tables (schema info)
    // - JSON data files (E-ADR-005: controls, schemas, configs)
    
    const element: Record<string, unknown> = {
      id: assertion.elementId,
      name: assertion.metadata.name,
    };
    
    // Determine domain and type based on JSON category (E-ADR-005)
    let domain = 'data';
    let sliceType = 'entity';
    
    if (assertion.metadata.jsonCategory) {
      const category = assertion.metadata.jsonCategory as string;
      
      switch (category) {
        case 'control':
          domain = 'data';
          sliceType = 'control';
          element.controlId = assertion.metadata.controlId;
          element.title = assertion.metadata.title;
          element.severity = assertion.metadata.severity;
          element.service = assertion.metadata.service;
          element.complianceFrameworks = assertion.metadata.complianceFrameworks;
          element.description = assertion.metadata.description;
          element.remediationGuidance = assertion.metadata.remediationGuidance;
          break;
          
        case 'schema':
          domain = 'data';
          sliceType = 'schema';
          element.entity = assertion.metadata.entity;
          element.tableName = assertion.metadata.tableName;
          element.attributes = assertion.metadata.attributes;
          element.keys = assertion.metadata.keys;
          break;
          
        case 'config':
          domain = 'infrastructure';
          sliceType = 'config';
          element.environment = assertion.metadata.environment;
          element.parameters = assertion.metadata.parameters;
          element.parameterCount = assertion.metadata.parameterCount;
          break;
          
        case 'reference':
          domain = 'data';
          sliceType = 'reference';
          // Copy all metadata for reference data
          Object.assign(element, assertion.metadata);
          break;
      }
    }
    
    // Python data models have fields
    if (assertion.metadata.fields) {
      element.fields = assertion.metadata.fields;
      element.docstring = assertion.metadata.docstring;
    }
    
    // CloudFormation DynamoDB tables have schema information
    if (assertion.metadata.type === 'dynamodb_table') {
      element.type = 'dynamodb_table';
      element.tableName = assertion.metadata.tableName;
      element.attributes = assertion.metadata.attributes;
      element.keySchema = assertion.metadata.keySchema;
      element.globalSecondaryIndexes = assertion.metadata.globalSecondaryIndexes;
      element.billingMode = assertion.metadata.billingMode;
      element.hasStream = assertion.metadata.hasStream;
      element.streamViewType = assertion.metadata.streamViewType;
    }
    
    return {
      _slice: {
        id: assertion.elementId,
        domain,
        type: sliceType,
        source_files: [assertion.file],
      },
      element,
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  // ============================================================================
  // CloudFormation element types
  // ============================================================================
  
  if (assertion.elementType === 'cfn_template') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'infrastructure',
        type: 'template',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name,
        description: assertion.metadata.description,
        resourceCount: assertion.metadata.resourceCount,
        parameterCount: assertion.metadata.parameterCount,
        outputCount: assertion.metadata.outputCount,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'cfn_resource') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'infrastructure',
        type: 'resource',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        logicalId: assertion.metadata.logicalId,
        type: assertion.metadata.type,
        service: assertion.metadata.service,
        resourceKind: assertion.metadata.resourceKind,
        dependencies: assertion.metadata.dependencies,
        dependsOn: assertion.metadata.dependsOn,
        condition: assertion.metadata.condition,
        deletionPolicy: assertion.metadata.deletionPolicy,
        // Resource-specific metadata (varies by type)
        ...extractResourceSpecificMetadata(assertion.metadata),
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'cfn_parameter') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'infrastructure',
        type: 'parameter',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name,
        type: assertion.metadata.type,
        description: assertion.metadata.description,
        default: assertion.metadata.default,
        allowedValues: assertion.metadata.allowedValues,
        noEcho: assertion.metadata.noEcho,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'cfn_output') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'infrastructure',
        type: 'output',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name,
        description: assertion.metadata.description,
        exportName: assertion.metadata.exportName,
        value: assertion.metadata.value,
        condition: assertion.metadata.condition,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'cfn_gsi') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'infrastructure',
        type: 'gsi',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        indexName: assertion.metadata.indexName,
        parentTable: assertion.metadata.parentTable,
        keySchema: assertion.metadata.keySchema,
        projectionType: assertion.metadata.projectionType,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'cfn_trigger') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'infrastructure',
        type: 'trigger',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        logicalId: assertion.metadata.logicalId,
        triggerType: assertion.metadata.triggerType,
        sourceType: assertion.metadata.sourceType,
        sourceRef: assertion.metadata.sourceRef,
        sourceArn: assertion.metadata.sourceArn,
        targetRef: assertion.metadata.targetRef,
        targetFunction: assertion.metadata.targetFunction,
        targetArn: assertion.metadata.targetArn,
        // EventSourceMapping specific
        batchSize: assertion.metadata.batchSize,
        enabled: assertion.metadata.enabled,
        startingPosition: assertion.metadata.startingPosition,
        // EventBridge specific
        eventBusName: assertion.metadata.eventBusName,
        eventPattern: assertion.metadata.eventPattern,
        scheduleExpression: assertion.metadata.scheduleExpression,
        eventSources: assertion.metadata.eventSources,
        eventDetailTypes: assertion.metadata.eventDetailTypes,
        state: assertion.metadata.state,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  // ============================================================================
  // Python behavioral extraction types
  // These capture runtime behavior patterns that link code to infrastructure
  // ============================================================================
  
  if (assertion.elementType === 'aws_sdk_usage') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'behavior',
        type: 'aws_sdk_usage',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        file: assertion.file,
        // SDK clients/resources created (e.g., boto3.resource('dynamodb'))
        clients: assertion.metadata.clients,
        // SDK operations performed (e.g., table.put_item())
        operations: assertion.metadata.operations,
        // Summary fields for quick queries
        services: assertion.metadata.services,
        hasReadOperations: assertion.metadata.hasReadOperations,
        hasWriteOperations: assertion.metadata.hasWriteOperations,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'env_var_access') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'behavior',
        type: 'env_var_access',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        file: assertion.file,
        // All environment variable accesses in this file
        variables: assertion.metadata.variables,
        // Quick lookup: list of variable names
        variableNames: assertion.metadata.variableNames,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'function_calls') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'behavior',
        type: 'function_calls',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        file: assertion.file,
        // Call graph: function name -> calls made
        callGraph: assertion.metadata.callGraph,
        // Functions that call other functions
        callers: assertion.metadata.callers,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  // ============================================================================
  // Angular element types (E-ADR-006)
  // ============================================================================
  
  if (assertion.elementType === 'angular_component') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'frontend',
        type: 'component',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name,
        className: assertion.metadata.className,
        selector: assertion.metadata.selector,
        templateUrl: assertion.metadata.templateUrl,
        template: assertion.metadata.template,  // Inline template
        styleUrls: assertion.metadata.styleUrls,
        styles: assertion.metadata.styles,  // Inline styles
        standalone: assertion.metadata.standalone,
        imports: assertion.metadata.imports,
        inputs: assertion.metadata.inputs,
        outputs: assertion.metadata.outputs,
        injectedServices: assertion.metadata.injectedServices,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'angular_service') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'frontend',
        type: 'service',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name,
        className: assertion.metadata.className,
        providedIn: assertion.metadata.providedIn,
        httpCalls: assertion.metadata.httpCalls,
        injectedDependencies: assertion.metadata.injectedDependencies,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'angular_pipe') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'frontend',
        type: 'pipe',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name,
        className: assertion.metadata.className,
        pipeName: assertion.metadata.pipeName,
        standalone: assertion.metadata.standalone,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'angular_directive') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'frontend',
        type: 'directive',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name,
        className: assertion.metadata.className,
        selector: assertion.metadata.selector,
        standalone: assertion.metadata.standalone,
        inputs: assertion.metadata.inputs,
        outputs: assertion.metadata.outputs,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'angular_guard') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'frontend',
        type: 'guard',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        name: assertion.metadata.name,
        className: assertion.metadata.className,
        providedIn: assertion.metadata.providedIn,
        guardType: assertion.metadata.guardType,
        injectedDependencies: assertion.metadata.injectedDependencies,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'angular_routes') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'frontend',
        type: 'routes',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        routes: assertion.metadata.routes,
        routeCount: assertion.metadata.routeCount,
        hasLazyLoading: assertion.metadata.hasLazyLoading,
        hasGuards: assertion.metadata.hasGuards,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'angular_template') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'frontend',
        type: 'template',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        parentComponent: assertion.metadata.parentComponent,
        childComponents: assertion.metadata.childComponents,
        directives: assertion.metadata.directives,
        pipes: assertion.metadata.pipes,
        hasConditionals: assertion.metadata.hasConditionals,
        hasLoops: assertion.metadata.hasLoops,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  // ============================================================================
  // CSS/SCSS element types (E-ADR-006)
  // Standalone cross-cutting extractor - works with any frontend
  // ============================================================================
  
  if (assertion.elementType === 'styles') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'frontend',
        type: 'styles',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        classNames: assertion.metadata.classNames,
        cssVariablesUsed: assertion.metadata.cssVariablesUsed,
        scssVariablesUsed: assertion.metadata.scssVariablesUsed,
        mediaQueries: assertion.metadata.mediaQueries,
        stateModifiers: assertion.metadata.stateModifiers,
        imports: assertion.metadata.imports,
        hasResponsive: assertion.metadata.hasResponsive,
        parentComponent: assertion.metadata.parentComponent,
        parentFile: assertion.metadata.parentFile,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  if (assertion.elementType === 'design_tokens') {
    return {
      _slice: {
        id: assertion.elementId,
        domain: 'frontend',
        type: 'design-tokens',
        source_files: [assertion.file],
      },
      element: {
        id: assertion.elementId,
        cssVariables: assertion.metadata.cssVariables,
        scssVariables: assertion.metadata.scssVariables,
        animations: assertion.metadata.animations,
        tokenCount: assertion.metadata.tokenCount,
      },
      provenance: {
        extracted_at: timestamp,
        extractor,
        file: assertion.file,
        line: assertion.line,
        language: assertion.language,
      },
    };
  }
  
  return null;
}

/**
 * Extract resource-specific metadata, excluding common fields
 */
function extractResourceSpecificMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const commonFields = ['logicalId', 'type', 'service', 'resourceKind', 'dependencies', 'dependsOn', 'condition', 'deletionPolicy'];
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(metadata)) {
    if (!commonFields.includes(key) && value !== undefined) {
      result[key] = value;
    }
  }
  
  return result;
}

function fileToModuleId(file: string): string {
  // Uses shared utility for cross-platform consistency
  return generateModuleId(file);
}

function inferLayer(file: string): string {
  // Simple layer inference based on path
  const normalized = file.toLowerCase();
  
  // API layer patterns
  if (normalized.includes('/api/') || normalized.includes('/routes/') || normalized.includes('/endpoints/')) {
    return 'api';
  }
  
  // Lambda handlers
  if (normalized.includes('/lambda/') || normalized.includes('/handlers/')) {
    return 'lambda';
  }
  
  // Service/domain layer
  if (normalized.includes('/service/') || normalized.includes('/services/') || normalized.includes('/domain/')) {
    return 'service';
  }
  
  // Data/repository layer
  if (normalized.includes('/data/') || normalized.includes('/repository/') || normalized.includes('/models/')) {
    return 'data';
  }
  
  // Frontend/components
  if (normalized.includes('/components/') || normalized.includes('/frontend/') || normalized.includes('/src/app/')) {
    return 'frontend';
  }
  
  // Infrastructure/CloudFormation
  if (normalized.includes('/cloudformation/') || normalized.includes('/infrastructure/')) {
    return 'infrastructure';
  }
  
  // RECON/RSS specific
  if (normalized.includes('/recon/') || normalized.includes('/rss/')) {
    return 'recon';
  }
  
  // Scripts
  if (normalized.includes('/scripts/')) {
    return 'scripts';
  }
  
  // Tests
  if (normalized.includes('/tests/') || normalized.includes('/test/')) {
    return 'test';
  }
  
  return 'util';
}

function isInternalImport(module: string): boolean {
  // Internal imports are relative or start with specific prefixes
  return module.startsWith('.') || module.startsWith('../') || module.startsWith('src/');
}
