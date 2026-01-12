/**
 * RECON CloudFormation Extractor
 * 
 * SPEC-DRIVEN extraction for ALL AWS CloudFormation resource types.
 * Supports both YAML and JSON template formats.
 * 
 * Architecture:
 * - Layer 0: AWS CFN Resource Specification (700+ types, auto-updated)
 * - Layer 1: Generic property capture (ALL resources)
 * - Layer 2: Spec-informed enrichment (reference detection, categories)
 * - Layer 3: Optional semantic lenses (convenience fields for common types)
 * 
 * This extractor is TOUCH-FREE: new AWS services are automatically
 * supported without code changes.
 * 
 * Per E-ADR-001: Shallow extraction, no deep semantic analysis
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { DiscoveredFile, RawAssertion } from './index.js';
import { generateSliceId, toPosixPath } from '../../utils/paths.js';
import { 
  loadCfnSpec, 
  getResourceSpec, 
  isKnownResourceType,
  getRequiredProperties,
  getReferenceProperties,
  type CloudFormationSpec 
} from '../../extractors/cfn/cfn-spec-loader.js';
import { parseResourceType, getCategoryForService } from '../../extractors/cfn/cfn-types.js';

// Cached spec (loaded once per RECON run)
let cachedSpec: CloudFormationSpec | null = null;

/**
 * Custom YAML schema for CloudFormation intrinsic functions.
 * CloudFormation uses custom YAML tags like !Ref, !Sub, !GetAtt, etc.
 * We create custom types to parse these without errors.
 */
const cfnTags = [
  // Short form intrinsic functions
  // Note: 'Ref' is handled separately by refType to output { Ref: x } not { Fn::Ref: x }
  'Sub', 'GetAtt', 'GetAZs', 'ImportValue', 'Join', 'Select',
  'Split', 'FindInMap', 'Base64', 'Cidr', 'If', 'Not', 'And', 'Or',
  'Equals', 'Condition', 'Transform', 'ToJsonString', 'Length',
];

const cfnCustomTypes = cfnTags.map(tag => 
  new yaml.Type(`!${tag}`, {
    kind: 'scalar',
    construct: (data: string) => ({ [`Fn::${tag}`]: data }),
  })
).concat(
  cfnTags.map(tag =>
    new yaml.Type(`!${tag}`, {
      kind: 'sequence',
      construct: (data: unknown[]) => ({ [`Fn::${tag}`]: data }),
    })
  )
).concat(
  cfnTags.map(tag =>
    new yaml.Type(`!${tag}`, {
      kind: 'mapping',
      construct: (data: Record<string, unknown>) => ({ [`Fn::${tag}`]: data }),
    })
  )
);

// Special handling for Ref (it's just Ref, not Fn::Ref)
const refType = new yaml.Type('!Ref', {
  kind: 'scalar',
  construct: (data: string) => ({ Ref: data }),
});

const CFN_SCHEMA = yaml.DEFAULT_SCHEMA.extend([refType, ...cfnCustomTypes]);

/**
 * CloudFormation template structure
 */
interface CfnTemplate {
  AWSTemplateFormatVersion?: string;
  Description?: string;
  Parameters?: Record<string, CfnParameter>;
  Metadata?: Record<string, unknown>;
  Mappings?: Record<string, unknown>;
  Conditions?: Record<string, unknown>;
  Resources?: Record<string, CfnResource>;
  Outputs?: Record<string, CfnOutput>;
}

interface CfnParameter {
  Type: string;
  Description?: string;
  Default?: unknown;
  AllowedValues?: unknown[];
  AllowedPattern?: string;
  ConstraintDescription?: string;
  MinLength?: number;
  MaxLength?: number;
  MinValue?: number;
  MaxValue?: number;
  NoEcho?: boolean;
}

interface CfnResource {
  Type: string;
  DependsOn?: string | string[];
  Properties?: Record<string, unknown>;
  Metadata?: Record<string, unknown>;
  Condition?: string;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
}

interface CfnOutput {
  Description?: string;
  Value: unknown;
  Export?: { Name: string | unknown };
  Condition?: string;
}

/**
 * Extract assertions from a CloudFormation template file.
 * 
 * Uses the AWS CFN Resource Specification for spec-driven extraction.
 * All resource types are supported automatically.
 */
export async function extractFromCloudFormation(file: DiscoveredFile): Promise<RawAssertion[]> {
  const assertions: RawAssertion[] = [];
  const normalizedPath = toPosixPath(file.relativePath);
  
  try {
    // Load CFN spec (cached after first load)
    if (!cachedSpec) {
      try {
        // Determine runtime directory for spec cache
        const runtimeDir = process.cwd().includes('ste-runtime') 
          ? process.cwd() 
          : path.join(process.cwd(), 'ste-runtime');
        cachedSpec = await loadCfnSpec(runtimeDir);
      } catch (specError) {
        console.warn('[RECON CFN] Could not load CFN spec, using generic extraction only:', specError);
      }
    }
    
    let content = await fs.readFile(file.path, 'utf-8');
    
    // Remove BOM (Byte Order Mark) if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    // Parse template (YAML or JSON)
    let template: CfnTemplate;
    const ext = file.path.toLowerCase();
    
    if (ext.endsWith('.json')) {
      // JSON file - parse directly
      template = JSON.parse(content) as CfnTemplate;
    } else {
      // YAML file - use js-yaml with CloudFormation schema
      template = yaml.load(content, { schema: CFN_SCHEMA }) as CfnTemplate;
    }
    
    // Validate it's a CloudFormation template
    if (!template || (!template.Resources && !template.AWSTemplateFormatVersion)) {
      return assertions; // Not a valid CFN template
    }
    
    // Extract template-level metadata
    assertions.push({
      elementId: generateSliceId('cfn_template', normalizedPath, getTemplateName(normalizedPath)),
      elementType: 'cfn_template',
      file: normalizedPath,
      line: 1,
      language: 'cloudformation',
      metadata: {
        name: getTemplateName(normalizedPath),
        description: template.Description,
        hasParameters: !!template.Parameters && Object.keys(template.Parameters).length > 0,
        hasOutputs: !!template.Outputs && Object.keys(template.Outputs).length > 0,
        resourceCount: template.Resources ? Object.keys(template.Resources).length : 0,
        parameterCount: template.Parameters ? Object.keys(template.Parameters).length : 0,
        outputCount: template.Outputs ? Object.keys(template.Outputs).length : 0,
      },
    });
    
    // Extract parameters
    if (template.Parameters) {
      for (const [paramName, param] of Object.entries(template.Parameters)) {
        assertions.push({
          elementId: generateSliceId('cfn_parameter', normalizedPath, paramName),
          elementType: 'cfn_parameter',
          file: normalizedPath,
          line: 0, // YAML parsing doesn't give us line numbers easily
          language: 'cloudformation',
          metadata: {
            name: paramName,
            type: param.Type,
            description: param.Description,
            default: param.Default,
            allowedValues: param.AllowedValues,
            noEcho: param.NoEcho,
          },
        });
      }
    }
    
    // Extract resources
    if (template.Resources) {
      for (const [logicalId, resource] of Object.entries(template.Resources)) {
        const dependencies = extractDependencies(resource, template.Resources);
        const resourceMeta = extractResourceMetadata(logicalId, resource);
        
        // Spec-informed metadata (Layer 2)
        const specMeta = extractSpecMetadata(resource.Type, cachedSpec);
        
        assertions.push({
          elementId: generateSliceId('cfn_resource', normalizedPath, logicalId),
          elementType: 'cfn_resource',
          file: normalizedPath,
          line: 0,
          language: 'cloudformation',
          metadata: {
            logicalId,
            type: resource.Type,
            service: extractServiceFromType(resource.Type),
            resourceKind: extractResourceKind(resource.Type),
            dependsOn: resource.DependsOn,
            condition: resource.Condition,
            deletionPolicy: resource.DeletionPolicy,
            dependencies,
            // Spec-informed fields
            ...specMeta,
            // Layer 3: Semantic lens enrichment (optional, for known types)
            ...resourceMeta,
          },
        });
        
        // Extract nested resources (e.g., DynamoDB GSIs, Lambda permissions)
        const nestedAssertions = extractNestedResources(logicalId, resource, normalizedPath);
        assertions.push(...nestedAssertions);
      }
    }
    
    // Extract outputs
    if (template.Outputs) {
      for (const [outputName, output] of Object.entries(template.Outputs)) {
        const exportName = output.Export?.Name;
        
        assertions.push({
          elementId: generateSliceId('cfn_output', normalizedPath, outputName),
          elementType: 'cfn_output',
          file: normalizedPath,
          line: 0,
          language: 'cloudformation',
          metadata: {
            name: outputName,
            description: output.Description,
            exportName: typeof exportName === 'string' ? exportName : stringifyIntrinsic(exportName),
            condition: output.Condition,
            value: stringifyIntrinsic(output.Value),
          },
        });
      }
    }
    
    // Extract API endpoints from API Gateway resources
    const apiEndpoints = extractApiEndpoints(template, normalizedPath);
    assertions.push(...apiEndpoints);
    
    // Extract data models from DynamoDB tables
    const dataModels = extractDataModels(template, normalizedPath);
    assertions.push(...dataModels);
    
    // Extract trigger relationships (EventSourceMapping, EventBridge Rules)
    const triggers = extractTriggerRelationships(template, normalizedPath);
    assertions.push(...triggers);
    
  } catch (error) {
    console.warn(`[RECON CFN] Failed to parse ${file.relativePath}:`, error);
  }
  
  return assertions;
}

/**
 * Get template name from file path
 */
function getTemplateName(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? filePath;
  return fileName.replace(/\.(yaml|yml|json|template)$/i, '');
}

/**
 * Extract AWS service from resource type
 */
function extractServiceFromType(resourceType: string): string {
  // AWS::DynamoDB::Table → DynamoDB
  // AWS::Lambda::Function → Lambda
  const parts = resourceType.split('::');
  return parts.length >= 2 ? parts[1] : resourceType;
}

/**
 * Extract resource kind from resource type
 */
function extractResourceKind(resourceType: string): string {
  // AWS::DynamoDB::Table → Table
  // AWS::Lambda::Function → Function
  const parts = resourceType.split('::');
  return parts.length >= 3 ? parts[2] : resourceType;
}

/**
 * Extract spec-informed metadata for a resource type.
 * 
 * This is LAYER 2 of the extraction architecture:
 * - Uses the AWS CFN Resource Specification
 * - Works for ALL 700+ resource types
 * - No hardcoding required
 * 
 * Returns metadata that helps with:
 * - Understanding if this is a known AWS type
 * - What properties are required
 * - What properties likely reference other resources
 * - Service categorization for tagging
 */
function extractSpecMetadata(resourceType: string, spec: CloudFormationSpec | null): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  
  // Parse resource type into taxonomy
  const taxonomy = parseResourceType(resourceType);
  meta.serviceCategory = taxonomy.category;
  
  // If no spec available, return basic taxonomy
  if (!spec) {
    meta.isKnownType = 'unknown'; // Cannot verify without spec
    return meta;
  }
  
  // Check if this is a known resource type
  meta.isKnownType = isKnownResourceType(spec, resourceType);
  
  if (meta.isKnownType) {
    // Get required properties from spec
    const required = getRequiredProperties(spec, resourceType);
    if (required.length > 0) {
      meta.requiredProperties = required;
    }
    
    // Get properties that likely reference other resources
    const refProps = getReferenceProperties(spec, resourceType);
    if (refProps.length > 0) {
      meta.referenceProperties = refProps;
    }
    
    // Get resource spec for documentation link
    const resourceSpec = getResourceSpec(spec, resourceType);
    if (resourceSpec?.Documentation) {
      meta.documentationUrl = resourceSpec.Documentation;
    }
    
    // Get available attributes (what this resource outputs)
    if (resourceSpec?.Attributes) {
      meta.availableAttributes = Object.keys(resourceSpec.Attributes);
    }
  }
  
  return meta;
}

/**
 * Extract dependencies from a resource (Ref, GetAtt, DependsOn)
 */
function extractDependencies(
  resource: CfnResource,
  allResources: Record<string, CfnResource>
): string[] {
  const deps = new Set<string>();
  
  // Add explicit DependsOn
  if (resource.DependsOn) {
    const dependsOn = Array.isArray(resource.DependsOn) 
      ? resource.DependsOn 
      : [resource.DependsOn];
    dependsOn.forEach(d => deps.add(d));
  }
  
  // Extract Ref and GetAtt from properties
  if (resource.Properties) {
    extractIntrinsicRefs(resource.Properties, deps, allResources);
  }
  
  return Array.from(deps);
}

/**
 * Recursively extract Ref and GetAtt references
 */
function extractIntrinsicRefs(
  obj: unknown,
  deps: Set<string>,
  allResources: Record<string, CfnResource>
): void {
  if (!obj || typeof obj !== 'object') return;
  
  if (Array.isArray(obj)) {
    obj.forEach(item => extractIntrinsicRefs(item, deps, allResources));
    return;
  }
  
  const record = obj as Record<string, unknown>;
  
  // Check for !Ref or Ref:
  if ('Ref' in record && typeof record.Ref === 'string') {
    // Only add if it references another resource (not a parameter)
    if (record.Ref in allResources) {
      deps.add(record.Ref);
    }
  }
  
  // Check for !GetAtt or Fn::GetAtt
  if ('Fn::GetAtt' in record) {
    const getAtt = record['Fn::GetAtt'];
    let resourceName: string | undefined;
    
    if (Array.isArray(getAtt) && getAtt.length >= 1) {
      resourceName = String(getAtt[0]);
    } else if (typeof getAtt === 'string') {
      // "ResourceName.Attribute" format
      resourceName = getAtt.split('.')[0];
    }
    
    if (resourceName && resourceName in allResources) {
      deps.add(resourceName);
    }
  }
  
  // Check for !Sub or Fn::Sub (may contain ${Resource.Attr})
  if ('Fn::Sub' in record) {
    const sub = record['Fn::Sub'];
    const template = Array.isArray(sub) ? sub[0] : sub;
    if (typeof template === 'string') {
      const refPattern = /\$\{([^.}]+)/g;
      let match;
      while ((match = refPattern.exec(template)) !== null) {
        const refName = match[1];
        if (refName in allResources) {
          deps.add(refName);
        }
      }
    }
  }
  
  // Recurse into nested objects
  for (const value of Object.values(record)) {
    extractIntrinsicRefs(value, deps, allResources);
  }
}

/**
 * Sanitize properties for storage - converts intrinsic functions to strings
 * This is the GENERIC layer - captures ALL properties regardless of service
 */
function sanitizePropertiesForStorage(props: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 10) return { _truncated: true }; // Prevent infinite recursion
  
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) {
      result[key] = null;
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        typeof item === 'object' && item !== null 
          ? sanitizePropertiesForStorage(item as Record<string, unknown>, depth + 1)
          : item
      );
    } else if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      // Check if it's an intrinsic function
      if ('Ref' in obj || 'Fn::Sub' in obj || 'Fn::GetAtt' in obj || 'Fn::Join' in obj || 'Fn::If' in obj) {
        result[key] = stringifyIntrinsic(obj);
      } else {
        result[key] = sanitizePropertiesForStorage(obj, depth + 1);
      }
    } else {
      result[key] = String(value);
    }
  }
  
  return result;
}

/**
 * Extract resource-specific metadata.
 * 
 * Architecture:
 * - Layer 1 (Generic): ALL resources get their Properties captured via sanitizePropertiesForStorage
 * - Layer 2 (Lens): Known services get enriched "summary" fields for quick access
 * 
 * Unknown services still have full data in `properties` - they just lack the summary.
 */
function extractResourceMetadata(
  logicalId: string,
  resource: CfnResource
): Record<string, unknown> {
  const props = resource.Properties ?? {};
  const meta: Record<string, unknown> = {};
  
  // LAYER 1: Generic - capture ALL properties for ANY resource type
  // This ensures we never lose data for unknown services
  meta.properties = sanitizePropertiesForStorage(props);
  
  // LAYER 2: Semantic Lens - enrich with summary fields for known types
  // These are convenience fields for common queries, not the only data
  switch (resource.Type) {
    case 'AWS::DynamoDB::Table':
      meta.tableName = stringifyIntrinsic(props.TableName);
      meta.billingMode = props.BillingMode;
      meta.keySchema = extractKeySchema(props.KeySchema as unknown[]);
      meta.gsiCount = Array.isArray(props.GlobalSecondaryIndexes) 
        ? props.GlobalSecondaryIndexes.length 
        : 0;
      meta.lsiCount = Array.isArray(props.LocalSecondaryIndexes)
        ? props.LocalSecondaryIndexes.length
        : 0;
      meta.hasStream = !!props.StreamSpecification;
      meta.hasEncryption = !!(props.SSESpecification as Record<string, unknown>)?.SSEEnabled;
      meta.hasPITR = !!(props.PointInTimeRecoverySpecification as Record<string, unknown>)?.PointInTimeRecoveryEnabled;
      break;
      
    case 'AWS::Lambda::Function':
      meta.functionName = stringifyIntrinsic(props.FunctionName);
      meta.runtime = props.Runtime;
      meta.handler = props.Handler;
      meta.memorySize = props.MemorySize;
      meta.timeout = props.Timeout;
      meta.architectures = props.Architectures;
      break;
      
    case 'AWS::ApiGateway::RestApi':
    case 'AWS::ApiGatewayV2::Api':
      meta.apiName = stringifyIntrinsic(props.Name);
      meta.description = props.Description;
      meta.protocol = resource.Type.includes('V2') ? (props.ProtocolType ?? 'HTTP') : 'REST';
      break;
      
    case 'AWS::S3::Bucket':
      meta.bucketName = stringifyIntrinsic(props.BucketName);
      meta.versioningEnabled = (props.VersioningConfiguration as Record<string, unknown>)?.Status === 'Enabled';
      meta.hasEncryption = !!props.BucketEncryption;
      break;
      
    case 'AWS::IAM::Role':
      meta.roleName = stringifyIntrinsic(props.RoleName);
      // Extract assume role policy principals (who can assume this role)
      if (props.AssumeRolePolicyDocument && typeof props.AssumeRolePolicyDocument === 'object') {
        const assumePolicy = props.AssumeRolePolicyDocument as Record<string, unknown>;
        if (Array.isArray(assumePolicy.Statement)) {
          meta.assumeRolePrincipals = (assumePolicy.Statement as Array<Record<string, unknown>>)
            .flatMap(stmt => {
              const principal = stmt.Principal;
              if (typeof principal === 'string') return [principal];
              if (typeof principal === 'object' && principal !== null) {
                const p = principal as Record<string, unknown>;
                return Object.values(p).flat().map(v => stringifyIntrinsic(v)).filter(Boolean);
              }
              return [];
            });
        }
      }
      meta.managedPolicies = Array.isArray(props.ManagedPolicyArns)
        ? (props.ManagedPolicyArns as unknown[]).map(arn => stringifyIntrinsic(arn))
        : [];
      break;
      
    case 'AWS::IAM::ManagedPolicy':
    case 'AWS::IAM::Policy':
      meta.policyName = stringifyIntrinsic(props.PolicyName);
      // Extract policy statements with actions and resources
      if (props.PolicyDocument && typeof props.PolicyDocument === 'object') {
        const policyDoc = props.PolicyDocument as Record<string, unknown>;
        if (Array.isArray(policyDoc.Statement)) {
          meta.statements = (policyDoc.Statement as Array<Record<string, unknown>>).map(stmt => ({
            effect: stmt.Effect ?? 'Allow',
            actions: normalizeToArray(stmt.Action),
            resources: normalizeToArray(stmt.Resource).map(r => stringifyIntrinsic(r)),
            conditions: stmt.Condition ? Object.keys(stmt.Condition as object) : undefined,
          }));
          // Flatten all actions for quick lookup
          meta.allActions = (meta.statements as Array<{ actions: string[] }>).flatMap(s => s.actions);
        }
      }
      break;
      
    case 'AWS::SNS::Topic':
      meta.topicName = stringifyIntrinsic(props.TopicName);
      meta.displayName = props.DisplayName;
      break;
      
    case 'AWS::SQS::Queue':
      meta.queueName = stringifyIntrinsic(props.QueueName);
      meta.fifo = props.FifoQueue ?? false;
      meta.visibilityTimeout = props.VisibilityTimeout;
      break;
      
    case 'AWS::KMS::Key':
      meta.description = props.Description;
      meta.keySpec = props.KeySpec ?? 'SYMMETRIC_DEFAULT';
      meta.enabled = props.Enabled ?? true;
      break;
      
    case 'AWS::Events::Rule':
      meta.ruleName = stringifyIntrinsic(props.Name);
      meta.scheduleExpression = props.ScheduleExpression;
      // Extract actual event pattern content
      if (props.EventPattern && typeof props.EventPattern === 'object') {
        const pattern = props.EventPattern as Record<string, unknown>;
        meta.eventPattern = {
          source: pattern.source ?? pattern['source'],
          detailType: pattern['detail-type'],
          detail: pattern.detail,
        };
      } else {
        meta.eventPattern = null;
      }
      // Extract targets (what Lambdas/resources receive these events)
      if (Array.isArray(props.Targets)) {
        meta.targets = (props.Targets as Array<Record<string, unknown>>).map(target => ({
          id: target.Id,
          arn: stringifyIntrinsic(target.Arn),
          input: target.Input ? stringifyIntrinsic(target.Input) : undefined,
        }));
      }
      break;
      
    case 'AWS::StepFunctions::StateMachine':
      meta.stateMachineName = stringifyIntrinsic(props.StateMachineName);
      meta.type = props.StateMachineType ?? 'STANDARD';
      break;
  }
  
  return meta;
}

/**
 * Extract key schema from DynamoDB table
 */
function extractKeySchema(keySchema: unknown[]): { hash?: string; range?: string } | undefined {
  if (!Array.isArray(keySchema)) return undefined;
  
  const result: { hash?: string; range?: string } = {};
  
  for (const key of keySchema) {
    const k = key as Record<string, unknown>;
    if (k.KeyType === 'HASH') {
      result.hash = String(k.AttributeName);
    } else if (k.KeyType === 'RANGE') {
      result.range = String(k.AttributeName);
    }
  }
  
  return result;
}

/**
 * Extract nested resources (GSIs, Lambda layers, etc.)
 */
function extractNestedResources(
  parentLogicalId: string,
  resource: CfnResource,
  filePath: string
): RawAssertion[] {
  const assertions: RawAssertion[] = [];
  const props = resource.Properties ?? {};
  
  // Extract DynamoDB GSIs
  if (resource.Type === 'AWS::DynamoDB::Table' && Array.isArray(props.GlobalSecondaryIndexes)) {
    for (const gsi of props.GlobalSecondaryIndexes) {
      const gsiRecord = gsi as Record<string, unknown>;
      const gsiName = String(gsiRecord.IndexName);
      
      assertions.push({
        elementId: `cfn_gsi:${filePath}:${parentLogicalId}:${gsiName}`,
        elementType: 'cfn_gsi',
        file: filePath,
        line: 0,
        language: 'cloudformation',
        metadata: {
          indexName: gsiName,
          parentTable: parentLogicalId,
          keySchema: extractKeySchema(gsiRecord.KeySchema as unknown[]),
          projectionType: (gsiRecord.Projection as Record<string, unknown>)?.ProjectionType,
        },
      });
    }
  }
  
  return assertions;
}

/**
 * Extract API endpoints from CloudFormation template.
 * Builds path hierarchy from Resources and Methods.
 */
function extractApiEndpoints(
  template: CfnTemplate,
  filePath: string
): RawAssertion[] {
  const assertions: RawAssertion[] = [];
  const resources = template.Resources ?? {};
  
  // Build a map of Resource logical IDs to their path parts
  const resourcePaths = new Map<string, { path: string; parentRef: string | null }>();
  
  // First pass: collect all API Gateway Resources and their path parts
  for (const [logicalId, resource] of Object.entries(resources)) {
    if (resource.Type === 'AWS::ApiGateway::Resource') {
      const props = resource.Properties ?? {};
      const pathPart = String(props.PathPart ?? '');
      const parentIdRef = props.ParentId;
      
      // Determine parent reference - handles !Ref, !GetAtt, and GetAtt
      let parentRef: string | null = null;
      if (parentIdRef && typeof parentIdRef === 'object') {
        const parentObj = parentIdRef as Record<string, unknown>;
        if ('Ref' in parentObj) {
          // !Ref ParentResourceLogicalId - parent is another AWS::ApiGateway::Resource
          parentRef = String(parentObj.Ref);
        } else if ('Fn::GetAtt' in parentObj) {
          // !GetAtt RestApi.RootResourceId - this is the root
          const getAtt = parentObj['Fn::GetAtt'];
          const attrName = Array.isArray(getAtt) ? String(getAtt[1] ?? '') : '';
          if (attrName === 'RootResourceId' || attrName.includes('Root')) {
            parentRef = '__ROOT__';
          } else {
            // !GetAtt SomeResource.ResourceId - parent is another resource
            if (Array.isArray(getAtt) && getAtt.length > 0) {
              parentRef = String(getAtt[0]);
            } else if (typeof getAtt === 'string') {
              parentRef = getAtt.split('.')[0];
            }
          }
        } else if ('GetAtt' in parentObj) {
          // Short form GetAtt
          const getAtt = parentObj.GetAtt;
          if (Array.isArray(getAtt) && getAtt.length > 0) {
            const attrName = String(getAtt[1] ?? '');
            if (attrName === 'RootResourceId' || attrName.includes('Root')) {
              parentRef = '__ROOT__';
            } else {
              parentRef = String(getAtt[0]);
            }
          }
        }
      }
      
      resourcePaths.set(logicalId, { path: pathPart, parentRef });
    }
  }
  
  // Function to build full path by traversing parent references
  function buildFullPath(resourceLogicalId: string): string {
    const parts: string[] = [];
    let current = resourceLogicalId;
    const visited = new Set<string>();
    
    while (current && !visited.has(current)) {
      visited.add(current);
      const info = resourcePaths.get(current);
      if (!info) break;
      
      if (info.path) {
        parts.unshift(info.path);
      }
      
      if (info.parentRef === '__ROOT__' || !info.parentRef) {
        break;
      }
      current = info.parentRef;
    }
    
    return '/' + parts.join('/');
  }
  
  // Second pass: extract Methods and create API endpoint assertions
  for (const [logicalId, resource] of Object.entries(resources)) {
    // REST API Methods (API Gateway v1)
    if (resource.Type === 'AWS::ApiGateway::Method') {
      const props = resource.Properties ?? {};
      const httpMethod = String(props.HttpMethod ?? 'GET');
      
      // Skip OPTIONS methods (CORS preflight)
      if (httpMethod === 'OPTIONS') continue;
      
      // Get the resource ID reference - handles both !Ref and !GetAtt
      let resourceLogicalId: string | null = null;
      const resourceIdRef = props.ResourceId;
      if (resourceIdRef && typeof resourceIdRef === 'object') {
        const refObj = resourceIdRef as Record<string, unknown>;
        if ('Ref' in refObj) {
          resourceLogicalId = String(refObj.Ref);
        } else if ('Fn::GetAtt' in refObj) {
          // !GetAtt ControlsResource.ResourceId → ControlsResource
          const getAtt = refObj['Fn::GetAtt'];
          if (Array.isArray(getAtt) && getAtt.length > 0) {
            resourceLogicalId = String(getAtt[0]);
          } else if (typeof getAtt === 'string') {
            resourceLogicalId = getAtt.split('.')[0];
          }
        } else if ('GetAtt' in refObj) {
          // Short form !GetAtt (parsed as GetAtt key)
          const getAtt = refObj.GetAtt;
          if (Array.isArray(getAtt) && getAtt.length > 0) {
            resourceLogicalId = String(getAtt[0]);
          }
        }
      }
      
      // Build the full path
      const fullPath = resourceLogicalId ? buildFullPath(resourceLogicalId) : '/';
      
      // Extract Lambda integration info
      let lambdaFunction: string | undefined;
      const integration = props.Integration as Record<string, unknown> | undefined;
      if (integration) {
        const uri = integration.Uri;
        if (uri && typeof uri === 'object') {
          // Try to extract Lambda function reference from the integration URI
          const uriStr = stringifyIntrinsic(uri);
          if (uriStr) {
            // Look for Lambda function references in the URI
            const lambdaMatch = uriStr.match(/\$\{(\w+)\.Arn\}/) || uriStr.match(/Ref\s+(\w+)/);
            if (lambdaMatch) {
              lambdaFunction = lambdaMatch[1];
            }
          }
        }
      }
      
      assertions.push({
        elementId: `api_endpoint:${filePath}:${httpMethod}:${fullPath}`,
        elementType: 'api_endpoint',
        file: filePath,
        line: 0,
        language: 'cloudformation',
        metadata: {
          framework: 'cloudformation-apigateway',
          method: httpMethod,
          path: fullPath,
          function_name: lambdaFunction,
          sourceResource: logicalId,
          authorizationType: props.AuthorizationType,
        },
      });
    }
    
    // WebSocket/HTTP API Routes (API Gateway v2)
    if (resource.Type === 'AWS::ApiGatewayV2::Route') {
      const props = resource.Properties ?? {};
      const routeKey = String(props.RouteKey ?? '');
      
      // Parse route key (e.g., "GET /items", "$connect", "$disconnect")
      let method = 'ANY';
      let path = routeKey;
      
      if (routeKey.includes(' ')) {
        const parts = routeKey.split(' ');
        method = parts[0];
        path = parts.slice(1).join(' ');
      } else if (routeKey.startsWith('$')) {
        // WebSocket routes like $connect, $disconnect, $default
        method = 'WEBSOCKET';
        path = routeKey;
      }
      
      assertions.push({
        elementId: `api_endpoint:${filePath}:${method}:${path}`,
        elementType: 'api_endpoint',
        file: filePath,
        line: 0,
        language: 'cloudformation',
        metadata: {
          framework: 'cloudformation-apigatewayv2',
          method,
          path,
          sourceResource: logicalId,
          routeKey,
        },
      });
    }
  }
  
  return assertions;
}

/**
 * Normalize a value to an array (IAM policies can have single value or array)
 */
function normalizeToArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(v => String(v));
  return [String(value)];
}

/**
 * Convert intrinsic functions to string representation for storage
 */
function stringifyIntrinsic(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    
    // Handle common intrinsic functions
    if ('Ref' in obj) return `!Ref ${obj.Ref}`;
    if ('Fn::Sub' in obj) return `!Sub ${JSON.stringify(obj['Fn::Sub'])}`;
    if ('Fn::GetAtt' in obj) {
      const getAtt = obj['Fn::GetAtt'];
      if (Array.isArray(getAtt)) return `!GetAtt ${getAtt.join('.')}`;
      return `!GetAtt ${getAtt}`;
    }
    if ('Fn::Join' in obj) return `!Join ${JSON.stringify(obj['Fn::Join'])}`;
    if ('Fn::If' in obj) return `!If ${JSON.stringify(obj['Fn::If'])}`;
    
    return JSON.stringify(obj);
  }
  
  return String(value);
}

/**
 * Extract data models from DynamoDB tables in CloudFormation.
 * DynamoDB tables define data schemas and belong in both infrastructure and data domains.
 */
function extractDataModels(
  template: CfnTemplate,
  filePath: string
): RawAssertion[] {
  const assertions: RawAssertion[] = [];
  const resources = template.Resources ?? {};
  
  for (const [logicalId, resource] of Object.entries(resources)) {
    // Extract DynamoDB tables as data models
    if (resource.Type === 'AWS::DynamoDB::Table') {
      const props = resource.Properties ?? {};
      
      // Extract table name
      const tableName = stringifyIntrinsic(props.TableName) ?? logicalId;
      
      // Extract attribute definitions (the schema)
      const attributes = extractAttributeDefinitions(props.AttributeDefinitions as unknown[]);
      
      // Extract key schema
      const keySchema = extractKeySchema(props.KeySchema as unknown[]);
      
      // Extract GSI schemas
      const gsiSchemas = extractGsiSchemas(props.GlobalSecondaryIndexes as unknown[]);
      
      // Create data model assertion
      assertions.push({
        elementId: `data_model:${filePath}:${logicalId}`,
        elementType: 'data_model',
        file: filePath,
        line: 0,
        language: 'cloudformation',
        metadata: {
          name: logicalId,
          tableName,
          type: 'dynamodb_table',
          attributes,
          keySchema,
          globalSecondaryIndexes: gsiSchemas,
          billingMode: props.BillingMode,
          hasStream: !!props.StreamSpecification,
          streamViewType: (props.StreamSpecification as Record<string, unknown>)?.StreamViewType,
        },
      });
    }
  }
  
  return assertions;
}

/**
 * Extract attribute definitions from DynamoDB table
 */
function extractAttributeDefinitions(attrDefs: unknown[]): Array<{ name: string; type: string }> {
  if (!Array.isArray(attrDefs)) return [];
  
  return attrDefs.map(attr => {
    const a = attr as Record<string, unknown>;
    return {
      name: String(a.AttributeName ?? ''),
      type: String(a.AttributeType ?? 'S'), // S, N, B
    };
  });
}

/**
 * Extract GSI schemas with their key structures
 */
function extractGsiSchemas(gsis: unknown[]): Array<{
  name: string;
  keySchema: { hash?: string; range?: string };
  projectionType?: string;
}> {
  if (!Array.isArray(gsis)) return [];
  
  return gsis.map(gsi => {
    const g = gsi as Record<string, unknown>;
    return {
      name: String(g.IndexName ?? ''),
      keySchema: extractKeySchema(g.KeySchema as unknown[]) ?? {},
      projectionType: (g.Projection as Record<string, unknown>)?.ProjectionType as string,
    };
  });
}

/**
 * Extract trigger relationships from Lambda EventSourceMappings and EventBridge Rules.
 * 
 * This captures:
 * 1. AWS::Lambda::EventSourceMapping - SQS, DynamoDB Streams, Kinesis, etc. → Lambda
 * 2. AWS::Events::Rule - EventBridge → Lambda (via Targets)
 * 
 * These relationships are critical for answering "what triggers Lambda X?"
 */
function extractTriggerRelationships(
  template: CfnTemplate,
  filePath: string
): RawAssertion[] {
  const assertions: RawAssertion[] = [];
  
  if (!template.Resources) {
    return assertions;
  }
  
  for (const [logicalId, resource] of Object.entries(template.Resources)) {
    const props = resource.Properties ?? {};
    
    // AWS::Lambda::EventSourceMapping
    if (resource.Type === 'AWS::Lambda::EventSourceMapping') {
      const eventSourceArn = props.EventSourceArn;
      const functionName = props.FunctionName;
      
      // Extract the source reference (could be !GetAtt, !Ref, or string)
      const sourceRef = extractRefFromIntrinsic(eventSourceArn);
      const targetRef = extractRefFromIntrinsic(functionName);
      
      // Determine source type from the ARN pattern or resource reference
      let sourceType = 'unknown';
      if (sourceRef) {
        // Try to determine type from the referenced resource
        const sourceResource = template.Resources[sourceRef];
        if (sourceResource) {
          sourceType = extractServiceFromType(sourceResource.Type).toLowerCase();
        }
      }
      
      assertions.push({
        elementId: generateSliceId('cfn_trigger', filePath, logicalId),
        elementType: 'cfn_trigger',
        file: filePath,
        line: 0,
        language: 'cloudformation',
        metadata: {
          logicalId,
          triggerType: 'event_source_mapping',
          sourceType,
          sourceRef,
          sourceArn: stringifyIntrinsic(eventSourceArn),
          targetRef,
          targetFunction: stringifyIntrinsic(functionName),
          batchSize: props.BatchSize,
          enabled: props.Enabled ?? true,
          startingPosition: props.StartingPosition,
          filterCriteria: props.FilterCriteria,
          maximumBatchingWindowInSeconds: props.MaximumBatchingWindowInSeconds,
          maximumRetryAttempts: props.MaximumRetryAttempts,
          parallelizationFactor: props.ParallelizationFactor,
        },
      });
    }
    
    // AWS::Events::Rule (EventBridge)
    if (resource.Type === 'AWS::Events::Rule') {
      const targets = props.Targets as unknown[] | undefined;
      const eventPattern = props.EventPattern;
      const scheduleExpression = props.ScheduleExpression;
      
      // Extract event sources from EventPattern
      let eventSources: string[] = [];
      let eventDetailTypes: string[] = [];
      if (eventPattern && typeof eventPattern === 'object') {
        const pattern = eventPattern as Record<string, unknown>;
        if (Array.isArray(pattern.source)) {
          eventSources = pattern.source.map(s => String(s));
        }
        if (Array.isArray(pattern['detail-type'])) {
          eventDetailTypes = pattern['detail-type'].map(s => String(s));
        }
      }
      
      // Create a trigger for each Lambda target
      if (Array.isArray(targets)) {
        for (const target of targets) {
          const t = target as Record<string, unknown>;
          const targetArn = t.Arn;
          const targetId = t.Id;
          
          // Check if target is a Lambda function
          const targetRef = extractRefFromIntrinsic(targetArn);
          let isLambdaTarget = false;
          
          if (targetRef && template.Resources[targetRef]) {
            const targetResource = template.Resources[targetRef];
            isLambdaTarget = targetResource.Type === 'AWS::Lambda::Function';
          }
          
          // Also check if ARN string contains 'lambda'
          const arnStr = stringifyIntrinsic(targetArn) ?? '';
          if (arnStr.includes('lambda') || arnStr.includes('Lambda')) {
            isLambdaTarget = true;
          }
          
          if (isLambdaTarget || targetRef) {
            assertions.push({
              elementId: generateSliceId('cfn_trigger', filePath, `${logicalId}-${targetId}`),
              elementType: 'cfn_trigger',
              file: filePath,
              line: 0,
              language: 'cloudformation',
              metadata: {
                logicalId,
                triggerType: scheduleExpression ? 'scheduled_event' : 'event_pattern',
                sourceType: 'eventbridge',
                sourceRef: logicalId,
                eventBusName: stringifyIntrinsic(props.EventBusName) || 'default',
                eventPattern: eventPattern ? JSON.stringify(eventPattern) : undefined,
                scheduleExpression,
                eventSources,
                eventDetailTypes,
                targetRef,
                targetId: String(targetId),
                targetArn: arnStr,
                targetInput: t.Input,
                targetInputPath: t.InputPath,
                state: props.State ?? 'ENABLED',
              },
            });
          }
        }
      }
    }
  }
  
  return assertions;
}

/**
 * Extract a logical resource reference from an intrinsic function.
 * Handles !Ref, !GetAtt, and nested intrinsics.
 */
function extractRefFromIntrinsic(value: unknown): string | undefined {
  if (!value) return undefined;
  
  if (typeof value === 'string') {
    return value; // Might be a direct reference or ARN
  }
  
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    
    // { Ref: 'LogicalId' }
    if ('Ref' in obj && typeof obj.Ref === 'string') {
      return obj.Ref;
    }
    
    // { 'Fn::Ref': 'LogicalId' }
    if ('Fn::Ref' in obj && typeof obj['Fn::Ref'] === 'string') {
      return obj['Fn::Ref'];
    }
    
    // { 'Fn::GetAtt': ['LogicalId', 'Arn'] } or { 'Fn::GetAtt': 'LogicalId.Arn' }
    if ('Fn::GetAtt' in obj) {
      const getAtt = obj['Fn::GetAtt'];
      if (Array.isArray(getAtt) && getAtt.length > 0) {
        return String(getAtt[0]);
      }
      if (typeof getAtt === 'string') {
        return getAtt.split('.')[0];
      }
    }
    
    // { GetAtt: ['LogicalId', 'Arn'] } - short form
    if ('GetAtt' in obj) {
      const getAtt = obj.GetAtt;
      if (Array.isArray(getAtt) && getAtt.length > 0) {
        return String(getAtt[0]);
      }
    }
  }
  
  return undefined;
}

