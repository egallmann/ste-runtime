/**
 * CloudFormation Extractor - Graph Edge Validation Tests (E-ADR-013)
 * 
 * These tests validate that CloudFormation resource dependencies (DependsOn, Ref, GetAtt)
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

// Helper to create CloudFormation resource assertion
function createCfnResourceAssertion(
  logicalId: string,
  resourceType: string,
  filePath: string,
  dependsOn?: string[]
): NormalizedAssertion {
  return {
    _slice: {
      domain: 'infrastructure',
      type: 'cfn_resource',
      id: `cfn-resource:${filePath}:${logicalId}`,
      source_files: [filePath],
    },
    element: {
      logicalId,
      type: resourceType,
      dependsOn: dependsOn || [],
    },
  };
}

// Helper to create raw CFN dependency assertion
function createCfnDependencyAssertion(
  fromLogicalId: string,
  toLogicalId: string,
  filePath: string
): RawAssertion {
  return {
    elementId: `dep-${fromLogicalId}-${toLogicalId}`,
    elementType: 'dependency',
    file: filePath,
    metadata: {
      from: fromLogicalId,
      to: toLogicalId,
      type: 'DependsOn',
    },
  };
}

describe('CloudFormation Extractor - Graph Edge Validation', () => {
  it('should create resource->resource edges from DependsOn', () => {
    // Given: Two CFN resources where Lambda depends on Role
    const lambdaFunction = createCfnResourceAssertion(
      'MyFunction',
      'AWS::Lambda::Function',
      'template.yaml',
      ['MyRole']
    );

    const iamRole = createCfnResourceAssertion('MyRole', 'AWS::IAM::Role', 'template.yaml');

    // Raw dependency from extraction
    const rawDep = createCfnDependencyAssertion('MyFunction', 'MyRole', 'template.yaml');

    // When: Inference runs
    const result = inferRelationships([lambdaFunction, iamRole], [rawDep]);

    // Then: Lambda should reference Role
    expectGraphEdges(result, 'cfn-resource:template.yaml:MyFunction', [
      'cfn-resource:template.yaml:MyRole',
    ]);

    // And: Bidirectional edge should exist
    const role = result.find((n) => n._slice.id === 'cfn-resource:template.yaml:MyRole');
    expect(role).toBeDefined();
    const refBy = role!._slice.referenced_by || [];
    const refByIds = refBy.map((r) => r.id);
    expect(refByIds).toContain('cfn-resource:template.yaml:MyFunction');
  });

  it('should create bidirectional edges for CFN dependencies', () => {
    // Given: Database depends on VPC
    const database = createCfnResourceAssertion(
      'MyDatabase',
      'AWS::RDS::DBInstance',
      'infra.yaml',
      ['MyVPC']
    );

    const vpc = createCfnResourceAssertion('MyVPC', 'AWS::EC2::VPC', 'infra.yaml');

    const rawDep = createCfnDependencyAssertion('MyDatabase', 'MyVPC', 'infra.yaml');

    // When: Inference runs
    const result = inferRelationships([database, vpc], [rawDep]);

    // Then: Validate bidirectional consistency
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should handle multiple DependsOn values', () => {
    // Given: Lambda depends on both Role and SecurityGroup
    const lambda = createCfnResourceAssertion(
      'MyFunction',
      'AWS::Lambda::Function',
      'template.yaml',
      ['MyRole', 'MySecurityGroup']
    );

    const role = createCfnResourceAssertion('MyRole', 'AWS::IAM::Role', 'template.yaml');

    const securityGroup = createCfnResourceAssertion(
      'MySecurityGroup',
      'AWS::EC2::SecurityGroup',
      'template.yaml'
    );

    const rawDep1 = createCfnDependencyAssertion('MyFunction', 'MyRole', 'template.yaml');
    const rawDep2 = createCfnDependencyAssertion(
      'MyFunction',
      'MySecurityGroup',
      'template.yaml'
    );

    // When: Inference runs
    const result = inferRelationships([lambda, role, securityGroup], [rawDep1, rawDep2]);

    // Then: Lambda should reference both resources
    expectGraphEdges(result, 'cfn-resource:template.yaml:MyFunction', [
      'cfn-resource:template.yaml:MyRole',
      'cfn-resource:template.yaml:MySecurityGroup',
    ]);

    // And: Graph integrity maintained
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should handle dependency chains (transitive dependencies)', () => {
    // Given: Lambda -> Role -> Policy (chain of dependencies)
    const lambda = createCfnResourceAssertion(
      'MyFunction',
      'AWS::Lambda::Function',
      'template.yaml',
      ['MyRole']
    );

    const role = createCfnResourceAssertion('MyRole', 'AWS::IAM::Role', 'template.yaml', [
      'MyPolicy',
    ]);

    const policy = createCfnResourceAssertion('MyPolicy', 'AWS::IAM::Policy', 'template.yaml');

    const rawDep1 = createCfnDependencyAssertion('MyFunction', 'MyRole', 'template.yaml');
    const rawDep2 = createCfnDependencyAssertion('MyRole', 'MyPolicy', 'template.yaml');

    // When: Inference runs
    const result = inferRelationships([lambda, role, policy], [rawDep1, rawDep2]);

    // Then: Chain should be traversable
    expectGraphEdges(result, 'cfn-resource:template.yaml:MyFunction', [
      'cfn-resource:template.yaml:MyRole',
    ]);

    expectGraphEdges(result, 'cfn-resource:template.yaml:MyRole', [
      'cfn-resource:template.yaml:MyPolicy',
    ]);

    // And: Graph integrity maintained
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should handle circular dependencies in CFN (if they exist)', () => {
    // Note: CloudFormation typically doesn't allow circular dependencies
    // But if the graph has them, inference should handle gracefully

    const resourceA = createCfnResourceAssertion('ResourceA', 'AWS::S3::Bucket', 'template.yaml', [
      'ResourceB',
    ]);

    const resourceB = createCfnResourceAssertion(
      'ResourceB',
      'AWS::SNS::Topic',
      'template.yaml',
      ['ResourceA']
    );

    const rawDepAB = createCfnDependencyAssertion('ResourceA', 'ResourceB', 'template.yaml');
    const rawDepBA = createCfnDependencyAssertion('ResourceB', 'ResourceA', 'template.yaml');

    // When: Inference runs
    const result = inferRelationships([resourceA, resourceB], [rawDepAB, rawDepBA]);

    // Then: Both edges should exist (even if circular)
    expectGraphEdges(result, 'cfn-resource:template.yaml:ResourceA', [
      'cfn-resource:template.yaml:ResourceB',
    ]);

    expectGraphEdges(result, 'cfn-resource:template.yaml:ResourceB', [
      'cfn-resource:template.yaml:ResourceA',
    ]);

    // And: Should not cause infinite loops
    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });

  it('should handle cross-stack dependencies', () => {
    // Given: Resources in different CFN templates
    const exportResource = createCfnResourceAssertion(
      'MyVPC',
      'AWS::EC2::VPC',
      'network-stack.yaml'
    );

    const importResource = createCfnResourceAssertion(
      'MyLambda',
      'AWS::Lambda::Function',
      'app-stack.yaml',
      ['MyVPC'] // References VPC from another stack
    );

    // Raw cross-stack dependency
    const rawDep = createCfnDependencyAssertion('MyLambda', 'MyVPC', 'app-stack.yaml');

    // When: Inference runs
    const result = inferRelationships([exportResource, importResource], [rawDep]);

    // Then: Cross-stack dependency should be captured
    // Note: This may require special handling for cross-stack references
    const lambda = result.find((n) => n._slice.id === 'cfn-resource:app-stack.yaml:MyLambda');
    expect(lambda).toBeDefined();

    // Document current behavior for cross-stack references
    // May need enhancement to properly resolve logical IDs across stacks
  });

  it('should handle Ref and GetAtt implicit dependencies', () => {
    // Given: Lambda uses Ref to reference Role ARN
    // This is extracted as a dependency by the CFN extractor

    const lambda = createCfnResourceAssertion(
      'MyFunction',
      'AWS::Lambda::Function',
      'template.yaml'
    );

    const role = createCfnResourceAssertion('MyRole', 'AWS::IAM::Role', 'template.yaml');

    // Ref dependency (implicit from Properties.Role: !Ref MyRole)
    const rawRefDep: RawAssertion = {
      elementId: 'ref-MyFunction-MyRole',
      elementType: 'dependency',
      file: 'template.yaml',
      metadata: {
        from: 'MyFunction',
        to: 'MyRole',
        type: 'Ref',
      },
    };

    // When: Inference runs
    const result = inferRelationships([lambda, role], [rawRefDep]);

    // Then: Ref should create graph edge
    expectGraphEdges(result, 'cfn-resource:template.yaml:MyFunction', [
      'cfn-resource:template.yaml:MyRole',
    ]);

    assertNoOrphanedReferences(result);
    assertBidirectionalConsistency(result);
  });
});

describe('CloudFormation Extractor - Integration Validation', () => {
  it('should document expected behavior for full RECON', () => {
    // This test documents what should happen during full RECON with CFN templates
    //
    // 1. CFN extractor parses YAML/JSON templates
    // 2. Extracts resources, parameters, outputs, conditions
    // 3. Identifies DependsOn, Ref, GetAtt relationships
    // 4. Extraction phase converts to raw dependency assertions
    // 5. Inference phase creates graph edges
    // 6. Blast radius traversal follows resource dependencies
    //
    // Integration test would:
    // - Create CFN templates with various dependency types
    // - Run full RECON
    // - Query blast radius for a Lambda
    // - Verify all dependent resources (Role, SecurityGroup, VPC, etc.) are found

    expect(true).toBe(true); // Placeholder for future integration test
  });

  it('should enable impact analysis for CFN resources', () => {
    // Use case: "If I change this VPC, what breaks?"
    //
    // Should return:
    // - All resources that DependsOn this VPC
    // - All resources that Ref this VPC
    // - All resources that GetAtt from this VPC
    // - All nested resources (Subnets, RouteTable, etc.)
    //
    // This is the "blast radius" query

    expect(true).toBe(true); // Placeholder for integration test
  });
});
