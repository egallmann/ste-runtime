/**
 * CloudFormation Resource Specification Loader
 * 
 * Loads the official AWS CloudFormation Resource Specification which defines
 * ALL resource types, their properties, and attributes.
 * 
 * This enables touch-free extraction - new AWS services are automatically
 * supported without code changes.
 * 
 * Spec URL: https://d1uauaxba7bl26.cloudfront.net/latest/gzip/CloudFormationResourceSpecification.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// CFN Spec URL for us-east-1 (comprehensive)
const CFN_SPEC_URL = 'https://d1uauaxba7bl26.cloudfront.net/latest/gzip/CloudFormationResourceSpecification.json';

// Cache duration: 7 days (spec doesn't change frequently)
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Property definition from CFN spec
 */
export interface CfnPropertySpec {
  Documentation?: string;
  Required?: boolean;
  Type?: string;           // "String", "List", custom type name
  PrimitiveType?: string;  // "String", "Integer", "Boolean", etc.
  ItemType?: string;       // For List types
  UpdateType?: string;     // "Mutable", "Immutable", "Conditional"
}

/**
 * Attribute definition from CFN spec
 */
export interface CfnAttributeSpec {
  PrimitiveType?: string;
  Type?: string;
}

/**
 * Resource type definition from CFN spec
 */
export interface CfnResourceSpec {
  Documentation?: string;
  Properties?: Record<string, CfnPropertySpec>;
  Attributes?: Record<string, CfnAttributeSpec>;
  AdditionalProperties?: boolean;
}

/**
 * Property type definition (nested types like AWS::Lambda::Function.Environment)
 */
export interface CfnPropertyTypeSpec {
  Documentation?: string;
  Properties?: Record<string, CfnPropertySpec>;
}

/**
 * Full CFN specification structure
 */
export interface CloudFormationSpec {
  ResourceSpecificationVersion: string;
  ResourceTypes: Record<string, CfnResourceSpec>;
  PropertyTypes: Record<string, CfnPropertyTypeSpec>;
}

/**
 * Cached spec with metadata
 */
interface CachedSpec {
  loadedAt: string;
  version: string;
  spec: CloudFormationSpec;
}

// In-memory cache
let memoryCache: CachedSpec | null = null;

/**
 * Get the cache file path
 */
function getCachePath(runtimeDir: string): string {
  return path.join(runtimeDir, '.ste', 'cache', 'cfn-spec.json');
}

/**
 * Load CFN spec from cache if valid
 */
async function loadFromCache(runtimeDir: string): Promise<CachedSpec | null> {
  try {
    const cachePath = getCachePath(runtimeDir);
    const content = await fs.readFile(cachePath, 'utf-8');
    const cached = JSON.parse(content) as CachedSpec;
    
    // Check if cache is still valid
    const loadedAt = new Date(cached.loadedAt).getTime();
    const now = Date.now();
    
    if (now - loadedAt < CACHE_DURATION_MS) {
      return cached;
    }
    
    console.log('[CFN Spec] Cache expired, will refresh');
    return null;
  } catch {
    // Cache doesn't exist or is invalid
    return null;
  }
}

/**
 * Save spec to cache
 */
async function saveToCache(runtimeDir: string, spec: CloudFormationSpec): Promise<void> {
  try {
    const cachePath = getCachePath(runtimeDir);
    const cacheDir = path.dirname(cachePath);
    
    await fs.mkdir(cacheDir, { recursive: true });
    
    const cached: CachedSpec = {
      loadedAt: new Date().toISOString(),
      version: spec.ResourceSpecificationVersion,
      spec,
    };
    
    await fs.writeFile(cachePath, JSON.stringify(cached, null, 2));
    console.log(`[CFN Spec] Cached version ${spec.ResourceSpecificationVersion}`);
  } catch (error) {
    console.warn('[CFN Spec] Failed to save cache:', error);
  }
}

/**
 * Fetch CFN spec from AWS
 */
async function fetchFromAWS(): Promise<CloudFormationSpec> {
  console.log('[CFN Spec] Fetching from AWS...');
  
  const response = await fetch(CFN_SPEC_URL);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch CFN spec: ${response.status} ${response.statusText}`);
  }
  
  const spec = await response.json() as CloudFormationSpec;
  
  console.log(`[CFN Spec] Loaded version ${spec.ResourceSpecificationVersion}`);
  console.log(`[CFN Spec] Resource types: ${Object.keys(spec.ResourceTypes).length}`);
  
  return spec;
}

/**
 * Load the CloudFormation Resource Specification
 * 
 * Loads from cache if valid, otherwise fetches from AWS.
 * Uses in-memory cache for repeated calls within same process.
 */
export async function loadCfnSpec(runtimeDir: string): Promise<CloudFormationSpec> {
  // Check in-memory cache first
  if (memoryCache) {
    return memoryCache.spec;
  }
  
  // Check file cache
  const cached = await loadFromCache(runtimeDir);
  if (cached) {
    console.log(`[CFN Spec] Using cached version ${cached.version}`);
    memoryCache = cached;
    return cached.spec;
  }
  
  // Fetch from AWS
  try {
    const spec = await fetchFromAWS();
    await saveToCache(runtimeDir, spec);
    
    memoryCache = {
      loadedAt: new Date().toISOString(),
      version: spec.ResourceSpecificationVersion,
      spec,
    };
    
    return spec;
  } catch (error) {
    console.error('[CFN Spec] Failed to fetch from AWS:', error);
    
    // Try to use expired cache as fallback
    try {
      const cachePath = getCachePath(runtimeDir);
      const content = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(content) as CachedSpec;
      console.log(`[CFN Spec] Using expired cache (version ${cached.version}) as fallback`);
      return cached.spec;
    } catch {
      throw new Error('CFN spec not available: fetch failed and no cache exists');
    }
  }
}

/**
 * Get spec for a specific resource type
 */
export function getResourceSpec(spec: CloudFormationSpec, resourceType: string): CfnResourceSpec | undefined {
  return spec.ResourceTypes[resourceType];
}

/**
 * Get spec for a property type (nested type like AWS::Lambda::Function.Environment)
 */
export function getPropertyTypeSpec(spec: CloudFormationSpec, propertyType: string): CfnPropertyTypeSpec | undefined {
  return spec.PropertyTypes[propertyType];
}

/**
 * Check if a resource type exists in the spec
 */
export function isKnownResourceType(spec: CloudFormationSpec, resourceType: string): boolean {
  return resourceType in spec.ResourceTypes;
}

/**
 * Get all resource types for a service (e.g., "Lambda" returns all AWS::Lambda::* types)
 */
export function getResourceTypesForService(spec: CloudFormationSpec, service: string): string[] {
  const prefix = `AWS::${service}::`;
  return Object.keys(spec.ResourceTypes).filter(type => type.startsWith(prefix));
}

/**
 * Get required properties for a resource type
 */
export function getRequiredProperties(spec: CloudFormationSpec, resourceType: string): string[] {
  const resourceSpec = getResourceSpec(spec, resourceType);
  if (!resourceSpec?.Properties) return [];
  
  return Object.entries(resourceSpec.Properties)
    .filter(([_, propSpec]) => propSpec.Required === true)
    .map(([propName]) => propName);
}

/**
 * Get properties that likely reference other resources
 * (heuristic: property type is String and name contains Arn, Id, Name, or Ref)
 */
export function getReferenceProperties(spec: CloudFormationSpec, resourceType: string): string[] {
  const resourceSpec = getResourceSpec(spec, resourceType);
  if (!resourceSpec?.Properties) return [];
  
  const refPatterns = ['Arn', 'Id', 'Name', 'Ref', 'Role', 'Key', 'Topic', 'Queue', 'Bucket', 'Table', 'Function'];
  
  return Object.entries(resourceSpec.Properties)
    .filter(([propName, propSpec]) => {
      // Must be a string-like type
      if (propSpec.PrimitiveType !== 'String' && propSpec.Type !== 'String') return false;
      // Must match a reference pattern
      return refPatterns.some(pattern => propName.includes(pattern));
    })
    .map(([propName]) => propName);
}

/**
 * Clear the in-memory cache (useful for testing or forced refresh)
 */
export function clearCache(): void {
  memoryCache = null;
}




