/**
 * CloudFormation Extractor Types
 * 
 * Type definitions for the dynamic CFN extractor.
 */

/**
 * Extracted property with spec-informed metadata
 */
export interface ExtractedProperty {
  name: string;
  value: unknown;
  rawValue: unknown;         // Original value before intrinsic resolution
  isRequired: boolean;       // From CFN spec
  isReference: boolean;      // Likely references another resource
  specType?: string;         // Type from CFN spec
  documentation?: string;    // From CFN spec
}

/**
 * Extracted resource with full context
 */
export interface ExtractedResource {
  logicalId: string;
  resourceType: string;
  service: string;           // e.g., "Lambda", "DynamoDB"
  resourceKind: string;      // e.g., "Function", "Table"
  
  // Spec metadata
  isKnownType: boolean;      // Whether type exists in CFN spec
  requiredProperties: string[];
  
  // Properties (generic capture)
  properties: Record<string, unknown>;
  
  // Relationships
  dependencies: string[];    // Logical IDs this resource depends on
  attributes: string[];      // Available attributes (Arn, Id, etc.)
  
  // Tags for search
  tags: string[];
}

/**
 * Service taxonomy derived from resource type
 */
export interface ServiceTaxonomy {
  service: string;       // e.g., "Lambda"
  resourceKind: string;  // e.g., "Function"
  fullType: string;      // e.g., "AWS::Lambda::Function"
  category: ServiceCategory;
}

/**
 * High-level service categories for tagging
 */
export type ServiceCategory =
  | 'compute'      // Lambda, EC2, ECS, etc.
  | 'storage'      // S3, DynamoDB, RDS, etc.
  | 'networking'   // VPC, Route53, CloudFront, etc.
  | 'security'     // IAM, KMS, WAF, etc.
  | 'integration'  // SQS, SNS, EventBridge, StepFunctions, etc.
  | 'monitoring'   // CloudWatch, X-Ray, etc.
  | 'analytics'    // Athena, Glue, QuickSight, etc.
  | 'ai'           // Bedrock, SageMaker, Comprehend, etc.
  | 'other';

/**
 * Map services to categories (extensible)
 */
export const SERVICE_CATEGORIES: Record<string, ServiceCategory> = {
  // Compute
  Lambda: 'compute',
  EC2: 'compute',
  ECS: 'compute',
  EKS: 'compute',
  Batch: 'compute',
  AppRunner: 'compute',
  
  // Storage
  S3: 'storage',
  DynamoDB: 'storage',
  RDS: 'storage',
  ElastiCache: 'storage',
  EFS: 'storage',
  FSx: 'storage',
  DocumentDB: 'storage',
  Neptune: 'storage',
  
  // Networking (EC2 also for VPC resources - category determined by resource kind)
  Route53: 'networking',
  CloudFront: 'networking',
  ElasticLoadBalancingV2: 'networking',
  ApiGateway: 'networking',
  ApiGatewayV2: 'networking',
  
  // Security
  IAM: 'security',
  KMS: 'security',
  WAFv2: 'security',
  SecretsManager: 'security',
  ACM: 'security',
  Cognito: 'security',
  
  // Integration
  SQS: 'integration',
  SNS: 'integration',
  Events: 'integration',
  StepFunctions: 'integration',
  EventSchemas: 'integration',
  AppSync: 'integration',
  
  // Monitoring
  CloudWatch: 'monitoring',
  Logs: 'monitoring',
  XRay: 'monitoring',
  ApplicationInsights: 'monitoring',
  
  // Analytics
  Athena: 'analytics',
  Glue: 'analytics',
  QuickSight: 'analytics',
  Kinesis: 'analytics',
  KinesisFirehose: 'analytics',
  OpenSearchService: 'analytics',
  
  // AI/ML
  Bedrock: 'ai',
  SageMaker: 'ai',
  Comprehend: 'ai',
  Rekognition: 'ai',
  Textract: 'ai',
  Translate: 'ai',
  Lex: 'ai',
  Polly: 'ai',
  Q: 'ai',
};

/**
 * Get category for a service
 */
export function getCategoryForService(service: string): ServiceCategory {
  return SERVICE_CATEGORIES[service] ?? 'other';
}

/**
 * Parse resource type into taxonomy
 */
export function parseResourceType(resourceType: string): ServiceTaxonomy {
  const parts = resourceType.split('::');
  
  const service = parts.length >= 2 ? parts[1] : 'Unknown';
  const resourceKind = parts.length >= 3 ? parts[2] : 'Unknown';
  const category = getCategoryForService(service);
  
  return {
    service,
    resourceKind,
    fullType: resourceType,
    category,
  };
}

