import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import {
  buildStackTopology,
  buildOutputIndex,
  buildParamResolutionTable,
  resolveNestedStacks,
  loadCfnYaml,
  type StackTopology,
} from './cfn-stack-resolver.js';
import type { ParsedStateFile } from './slice-emitter.js';

vi.mock('node:fs/promises');

function makeStateFile(overrides: Partial<ParsedStateFile> & {
  domain: string;
  type: string;
  logicalId: string;
  cfnType: string;
  srcFile: string;
  props?: Record<string, unknown>;
}): ParsedStateFile {
  return {
    filePath: `/state/${overrides.srcFile}`,
    relativePath: overrides.srcFile,
    doc: {},
    slice: { domain: overrides.domain, type: overrides.type },
    element: {
      logicalId: overrides.logicalId,
      type: overrides.cfnType,
      properties: overrides.props ?? {},
      ...overrides.element,
    },
    provenance: { file: overrides.srcFile },
  } as unknown as ParsedStateFile;
}

describe('cfn-stack-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadCfnYaml', () => {
    it('should parse CFN intrinsics (!Ref, !GetAtt, !Sub)', () => {
      const text = `
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Ref BucketParam
  MyStack:
    Type: AWS::Serverless::Application
    Properties:
      Location: ./child/template.yaml
      Parameters:
        TableName: !GetAtt PersistenceStack.Outputs.TableName
`;
      const doc = loadCfnYaml(text)!;
      expect(doc).toBeTruthy();
      const resources = doc.Resources as Record<string, Record<string, unknown>>;
      const bucketProps = resources.MyBucket.Properties as Record<string, unknown>;
      expect(bucketProps.BucketName).toEqual({ Ref: 'BucketParam' });

      const stackProps = resources.MyStack.Properties as Record<string, unknown>;
      expect(stackProps.Location).toBe('./child/template.yaml');
      const params = stackProps.Parameters as Record<string, unknown>;
      expect(params.TableName).toEqual({ 'Fn::GetAtt': ['PersistenceStack', 'Outputs.TableName'] });
    });
  });

  describe('buildStackTopology (NS-1)', () => {
    it('should detect SAM nested stacks via AWS::Serverless::Application', async () => {
      const stateFiles: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'ComputeStack', cfnType: 'AWS::Serverless::Application',
          srcFile: 'sam/template.yaml',
        }),
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'PersistenceStack', cfnType: 'AWS::Serverless::Application',
          srcFile: 'sam/template.yaml',
        }),
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MyFunction', cfnType: 'AWS::Serverless::Function',
          srcFile: 'sam/compute/template.yaml',
        }),
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MyTable', cfnType: 'AWS::DynamoDB::Table',
          srcFile: 'sam/persistence/template.yaml',
        }),
      ];

      const masterTemplate = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
  ComputeStack:
    Type: AWS::Serverless::Application
    Properties:
      Location: ./compute/template.yaml
      Parameters:
        TableName: !GetAtt PersistenceStack.Outputs.TableName
  PersistenceStack:
    Type: AWS::Serverless::Application
    Properties:
      Location: ./persistence/template.yaml
`;

      vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
        const filePath = typeof p === 'string' ? p : p.toString();
        if (filePath.replace(/\\/g, '/').endsWith('sam/template.yaml')) {
          return masterTemplate;
        }
        throw new Error(`File not found: ${filePath}`);
      });

      const stateDir = '/repo/.ste-runtime';
      const { topology } = await buildStackTopology(stateFiles, stateDir);

      expect(topology.roots).toContain('sam/template.yaml');
      expect(Object.keys(topology.children)).toHaveLength(2);
      expect(topology.children['sam/template.yaml#ComputeStack']).toBeDefined();
      expect(topology.children['sam/template.yaml#ComputeStack'].templatePath).toBe('sam/compute/template.yaml');
      expect(topology.children['sam/template.yaml#PersistenceStack']).toBeDefined();
      expect(topology.children['sam/template.yaml#PersistenceStack'].templatePath).toBe('sam/persistence/template.yaml');
    });

    it('should detect CFN nested stacks via AWS::CloudFormation::Stack', async () => {
      const stateFiles: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'ChildStack', cfnType: 'AWS::CloudFormation::Stack',
          srcFile: 'cfn_templates/master-stack.yaml',
        }),
      ];

      const masterTemplate = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  ChildStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./child-stack.yaml
      Parameters:
        Env: prod
`;

      vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
        const filePath = typeof p === 'string' ? p : p.toString();
        if (filePath.replace(/\\/g, '/').endsWith('cfn_templates/master-stack.yaml')) {
          return masterTemplate;
        }
        throw new Error(`File not found: ${filePath}`);
      });

      const stateDir = '/repo/.ste-runtime';
      const { topology } = await buildStackTopology(stateFiles, stateDir);

      expect(topology.roots).toContain('cfn_templates/master-stack.yaml');
      expect(topology.children['cfn_templates/master-stack.yaml#ChildStack']).toBeDefined();
      expect(topology.children['cfn_templates/master-stack.yaml#ChildStack'].templatePath)
        .toBe('cfn_templates/child-stack.yaml');
    });

    it('should return empty topology for standalone templates', async () => {
      const stateFiles: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MyFunction', cfnType: 'AWS::Lambda::Function',
          srcFile: 'template.yaml',
        }),
      ];

      const stateDir = '/repo/.ste-runtime';
      const { topology } = await buildStackTopology(stateFiles, stateDir);

      expect(topology.roots).toHaveLength(0);
      expect(Object.keys(topology.children)).toHaveLength(0);
    });

    it('should produce topology that is frozen (immutable, R7)', async () => {
      const stateFiles: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'ChildStack', cfnType: 'AWS::Serverless::Application',
          srcFile: 'sam/template.yaml',
        }),
      ];

      const masterTemplate = `
Resources:
  ChildStack:
    Type: AWS::Serverless::Application
    Properties:
      Location: ./child/template.yaml
`;

      vi.mocked(fs.readFile).mockImplementation(async () => masterTemplate);

      const stateDir = '/repo/.ste-runtime';
      const { topology } = await buildStackTopology(stateFiles, stateDir);

      expect(Object.isFrozen(topology)).toBe(true);
      expect(Object.isFrozen(topology.roots)).toBe(true);
      expect(Object.isFrozen(topology.children)).toBe(true);
    });

    it('should emit diagnostic for S3 URI in TemplateURL', async () => {
      const stateFiles: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'ChildStack', cfnType: 'AWS::CloudFormation::Stack',
          srcFile: 'master.yaml',
        }),
      ];

      const masterTemplate = `
Resources:
  ChildStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/bucket/child.yaml
`;

      vi.mocked(fs.readFile).mockImplementation(async () => masterTemplate);

      const stateDir = '/repo/.ste-runtime';
      const { unresolvedResolutions } = await buildStackTopology(stateFiles, stateDir);

      expect(unresolvedResolutions).toHaveLength(1);
      expect(unresolvedResolutions[0].reason).toBe('UNRESOLVABLE_S3_URI');
    });
  });

  describe('buildOutputIndex (NS-2)', () => {
    it('should extract outputs with intrinsic structure preserved', async () => {
      const topology: StackTopology = Object.freeze({
        roots: ['sam/template.yaml'],
        children: Object.freeze({
          'sam/template.yaml#PersistenceStack': {
            stackId: 'sam/template.yaml#PersistenceStack',
            logicalId: 'PersistenceStack',
            templatePath: 'sam/persistence/template.yaml',
            paramValues: {},
          },
        }),
        templateToStackIds: Object.freeze({
          'sam/persistence/template.yaml': ['sam/template.yaml#PersistenceStack'],
        }),
        standalones: Object.freeze([]),
      });

      const childTemplate = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  MyTable:
    Type: AWS::DynamoDB::Table
Outputs:
  TableName:
    Value: !Ref MyTable
  TableArn:
    Value: !GetAtt MyTable.Arn
`;

      vi.mocked(fs.readFile).mockImplementation(async () => childTemplate);

      const stateDir = '/repo/.ste-runtime';
      const unresolved: any[] = [];
      const index = await buildOutputIndex(topology, stateDir, unresolved);

      const outputs = index['sam/template.yaml#PersistenceStack'];
      expect(outputs).toBeDefined();
      expect(outputs.TableName).toEqual({ Ref: 'MyTable' });
      expect(outputs.TableArn).toEqual({ 'Fn::GetAtt': ['MyTable', 'Arn'] });
      expect(unresolved).toHaveLength(0);
    });

    it('should emit diagnostic for unsupported intrinsics in outputs', async () => {
      const topology: StackTopology = Object.freeze({
        roots: ['master.yaml'],
        children: Object.freeze({
          'master.yaml#Child': {
            stackId: 'master.yaml#Child',
            logicalId: 'Child',
            templatePath: 'child.yaml',
            paramValues: {},
          },
        }),
        templateToStackIds: Object.freeze({ 'child.yaml': ['master.yaml#Child'] }),
        standalones: Object.freeze([]),
      });

      const childTemplate = `
Resources:
  MyRes:
    Type: AWS::S3::Bucket
Outputs:
  BucketName:
    Value: !FindInMap [RegionMap, !Ref 'AWS::Region', BucketName]
`;

      vi.mocked(fs.readFile).mockImplementation(async () => childTemplate);

      const unresolved: any[] = [];
      await buildOutputIndex(topology, '/repo/.ste-runtime', unresolved);

      expect(unresolved.length).toBeGreaterThanOrEqual(1);
      expect(unresolved[0].reason).toBe('UNSUPPORTED_INTRINSIC');
    });
  });

  describe('buildParamResolutionTable (NS-3)', () => {
    it('should resolve GetAtt -> Output -> Ref chain to resource', () => {
      const topology: StackTopology = Object.freeze({
        roots: ['sam/template.yaml'],
        children: Object.freeze({
          'sam/template.yaml#ComputeStack': {
            stackId: 'sam/template.yaml#ComputeStack',
            logicalId: 'ComputeStack',
            templatePath: 'sam/compute/template.yaml',
            paramValues: {
              TableName: { 'Fn::GetAtt': ['PersistenceStack', 'Outputs.TableName'] },
            },
          },
          'sam/template.yaml#PersistenceStack': {
            stackId: 'sam/template.yaml#PersistenceStack',
            logicalId: 'PersistenceStack',
            templatePath: 'sam/persistence/template.yaml',
            paramValues: {},
          },
        }),
        templateToStackIds: Object.freeze({
          'sam/compute/template.yaml': ['sam/template.yaml#ComputeStack'],
          'sam/persistence/template.yaml': ['sam/template.yaml#PersistenceStack'],
        }),
        standalones: Object.freeze([]),
      });

      const outputIndex = Object.freeze({
        'sam/template.yaml#PersistenceStack': { TableName: { Ref: 'MyTable' } },
      });

      const resourceTypes = new Map([
        ['MyTable', 'AWS::DynamoDB::Table'],
      ]);

      const { resolutions, unresolved } = buildParamResolutionTable(
        topology, outputIndex, resourceTypes,
      );

      expect(resolutions).toHaveLength(1);
      expect(resolutions[0].paramName).toBe('TableName');
      expect(resolutions[0].resolvedLogicalId).toBe('MyTable');
      expect(resolutions[0].resolvedCfnType).toBe('AWS::DynamoDB::Table');
      expect(resolutions[0].confidence).toBe('high');
      expect(resolutions[0].resolutionPath.length).toBeGreaterThan(0);
      expect(unresolved).toHaveLength(0);
    });

    it('should handle multi-hop resolution chains (R4)', () => {
      const topology: StackTopology = Object.freeze({
        roots: ['master.yaml'],
        children: Object.freeze({
          'master.yaml#StackA': {
            stackId: 'master.yaml#StackA',
            logicalId: 'StackA',
            templatePath: 'a/template.yaml',
            paramValues: {
              QueueArn: { 'Fn::GetAtt': ['StackB', 'Outputs.QueueArn'] },
            },
          },
          'master.yaml#StackB': {
            stackId: 'master.yaml#StackB',
            logicalId: 'StackB',
            templatePath: 'b/template.yaml',
            paramValues: {},
          },
        }),
        templateToStackIds: Object.freeze({
          'a/template.yaml': ['master.yaml#StackA'],
          'b/template.yaml': ['master.yaml#StackB'],
        }),
        standalones: Object.freeze([]),
      });

      const outputIndex = Object.freeze({
        'master.yaml#StackB': {
          QueueArn: { 'Fn::GetAtt': ['MyQueue', 'Arn'] },
        },
      });

      const resourceTypes = new Map([
        ['MyQueue', 'AWS::SQS::Queue'],
      ]);

      const { resolutions } = buildParamResolutionTable(topology, outputIndex, resourceTypes);

      expect(resolutions).toHaveLength(1);
      expect(resolutions[0].resolvedLogicalId).toBe('MyQueue');
      expect(resolutions[0].resolvedCfnType).toBe('AWS::SQS::Queue');
      expect(resolutions[0].resolutionPath.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect cycles (R4) and emit diagnostic', () => {
      // This is an artificial test -- real CFN wouldn't have this
      const topology: StackTopology = Object.freeze({
        roots: ['master.yaml'],
        children: Object.freeze({
          'master.yaml#StackA': {
            stackId: 'master.yaml#StackA',
            logicalId: 'StackA',
            templatePath: 'a.yaml',
            paramValues: {
              Param1: { 'Fn::GetAtt': ['StackB', 'Outputs.Out1'] },
            },
          },
          'master.yaml#StackB': {
            stackId: 'master.yaml#StackB',
            logicalId: 'StackB',
            templatePath: 'b.yaml',
            paramValues: {},
          },
        }),
        templateToStackIds: Object.freeze({
          'a.yaml': ['master.yaml#StackA'],
          'b.yaml': ['master.yaml#StackB'],
        }),
        standalones: Object.freeze([]),
      });

      // Output references itself via a Ref to its own param
      const outputIndex = Object.freeze({
        'master.yaml#StackB': {
          Out1: { Ref: 'Param1' },
        },
      });

      const resourceTypes = new Map<string, string>();
      const { unresolved } = buildParamResolutionTable(topology, outputIndex, resourceTypes);

      expect(unresolved.length).toBeGreaterThan(0);
    });

    it('should handle unsupported intrinsics with diagnostics (R3, R6)', () => {
      const topology: StackTopology = Object.freeze({
        roots: ['master.yaml'],
        children: Object.freeze({
          'master.yaml#StackA': {
            stackId: 'master.yaml#StackA',
            logicalId: 'StackA',
            templatePath: 'a.yaml',
            paramValues: {
              BucketName: { 'Fn::FindInMap': ['RegionMap', { Ref: 'AWS::Region' }, 'bucket'] },
            },
          },
        }),
        templateToStackIds: Object.freeze({ 'a.yaml': ['master.yaml#StackA'] }),
        standalones: Object.freeze([]),
      });

      const outputIndex = Object.freeze({});
      const resourceTypes = new Map<string, string>();

      const { unresolved } = buildParamResolutionTable(topology, outputIndex, resourceTypes);

      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].reason).toBe('UNSUPPORTED_INTRINSIC');
      expect(unresolved[0].stackId).toBe('master.yaml#StackA');
      expect(unresolved[0].paramName).toBe('BucketName');
    });

    it('should produce empty results for empty topology (NS-7)', () => {
      const topology: StackTopology = Object.freeze({
        roots: Object.freeze([]),
        children: Object.freeze({}),
        templateToStackIds: Object.freeze({}),
        standalones: Object.freeze([]),
      });

      const outputIndex = Object.freeze({});
      const resourceTypes = new Map<string, string>();

      const { resolutions, unresolved } = buildParamResolutionTable(
        topology, outputIndex, resourceTypes,
      );

      expect(resolutions).toHaveLength(0);
      expect(unresolved).toHaveLength(0);
    });
  });

  describe('resolveNestedStacks (full pipeline)', () => {
    it('should return empty results for single-stack repos (NS-7)', async () => {
      const stateFiles: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MyFunction', cfnType: 'AWS::Lambda::Function',
          srcFile: 'template.yaml',
        }),
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MyTable', cfnType: 'AWS::DynamoDB::Table',
          srcFile: 'template.yaml',
        }),
      ];

      const result = await resolveNestedStacks(stateFiles, '/repo/.ste-runtime');

      expect(result.topology.roots).toHaveLength(0);
      expect(Object.keys(result.topology.children)).toHaveLength(0);
      expect(result.paramResolutionTable).toHaveLength(0);
      expect(result.unresolvedResolutions).toHaveLength(0);
      expect(Object.isFrozen(result.topology)).toBe(true);
    });
  });
});
