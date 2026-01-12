/**
 * CloudFormation Dynamic Extractor
 * 
 * Spec-driven extraction for ALL CloudFormation resource types.
 * Uses the official AWS CloudFormation Resource Specification for
 * touch-free support of new services.
 */

export { loadCfnSpec, getResourceSpec, isKnownResourceType } from './cfn-spec-loader.js';
export { parseResourceType, getCategoryForService } from './cfn-types.js';
export type { CloudFormationSpec, CfnResourceSpec, CfnPropertySpec } from './cfn-spec-loader.js';
export type { ExtractedResource, ServiceTaxonomy, ServiceCategory } from './cfn-types.js';

// Note: The main extraction logic remains in extraction-cloudformation.ts
// This module provides the spec-loading infrastructure that enables
// the generic extraction layer to work without hardcoded resource types.




