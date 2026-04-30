import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { buildResourceResolverFromState, extractLambdaRefsFromAsl } from './resource-resolver.js';
import type { ParsedStateFile } from './slice-emitter.js';
import type { StackTopology } from './cfn-stack-resolver.js';

vi.mock('node:fs/promises');

function makeStateFile(overrides: {
  domain: string;
  type: string;
  logicalId: string;
  cfnType: string;
  srcFile: string;
  element?: Record<string, unknown>;
}): ParsedStateFile {
  return {
    filePath: `/state/${overrides.srcFile}`,
    relativePath: overrides.srcFile,
    doc: {},
    slice: { domain: overrides.domain, type: overrides.type },
    element: {
      logicalId: overrides.logicalId,
      type: overrides.cfnType,
      ...(overrides.element ?? {}),
    },
    provenance: { file: overrides.srcFile },
  } as unknown as ParsedStateFile;
}

describe('resource-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
  });

  describe('buildResourceResolverFromState', () => {
    it('should resolve direct Ref to in-template resource (regression)', async () => {
      const stateFiles: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MyFunction', cfnType: 'AWS::Serverless::Function',
          srcFile: 'template.yaml',
          element: {
            logicalId: 'MyFunction',
            type: 'AWS::Serverless::Function',
            functionName: 'my-function',
            properties: {
              Environment: {
                Variables: {
                  TABLE_NAME: { Ref: 'MyTable' },
                },
              },
            },
          },
        }),
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MyTable', cfnType: 'AWS::DynamoDB::Table',
          srcFile: 'template.yaml',
          element: {
            logicalId: 'MyTable',
            type: 'AWS::DynamoDB::Table',
            tableName: 'my-table',
          },
        }),
      ];

      const result = await buildResourceResolverFromState(stateFiles, '/repo/.ste-runtime');

      expect(result.logicalIdToGraphId.get('MyTable')).toBe('Database:my-table');
      expect(result.logicalIdToGraphId.get('MyFunction')).toBe('Lambda:my-function');
      expect(result.lambdaEnvVars).toHaveLength(1);
      expect(result.lambdaEnvVars[0].refTarget).toBe('MyTable');
    });

    it('should recognize AWS::Serverless::StateMachine alongside CFN StateMachine', async () => {
      const stateFiles: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MySfn', cfnType: 'AWS::StepFunctions::StateMachine',
          srcFile: 'template.yaml',
          element: {
            logicalId: 'MySfn',
            type: 'AWS::StepFunctions::StateMachine',
            stateMachineName: 'my-sfn',
            definitionBody: {
              StartAt: 'Hello',
              States: {
                Hello: { Type: 'Task', Resource: 'arn:aws:states:::lambda:invoke', Parameters: { FunctionName: 'arn:aws:lambda:us-east-1:123:function:HelloFunc' }, End: true },
              },
            },
          },
        }),
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MySamSfn', cfnType: 'AWS::Serverless::StateMachine',
          srcFile: 'template.yaml',
          element: {
            logicalId: 'MySamSfn',
            type: 'AWS::Serverless::StateMachine',
            stateMachineName: 'my-sam-sfn',
          },
        }),
      ];

      const result = await buildResourceResolverFromState(stateFiles, '/repo/.ste-runtime');

      expect(result.logicalIdToGraphId.get('MySfn')).toBe('StateMachine:my-sfn');
      expect(result.logicalIdToGraphId.get('MySamSfn')).toBe('StateMachine:my-sam-sfn');
    });

    it('should produce consistent output regardless of state file order (R5)', async () => {
      const files: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'FuncA', cfnType: 'AWS::Lambda::Function',
          srcFile: 'a.yaml',
          element: { logicalId: 'FuncA', type: 'AWS::Lambda::Function', functionName: 'func-a' },
        }),
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'TableA', cfnType: 'AWS::DynamoDB::Table',
          srcFile: 'a.yaml',
          element: { logicalId: 'TableA', type: 'AWS::DynamoDB::Table', tableName: 'table-a' },
        }),
      ];

      const result1 = await buildResourceResolverFromState(files, '/repo/.ste-runtime');
      const result2 = await buildResourceResolverFromState([...files].reverse(), '/repo/.ste-runtime');

      expect([...result1.logicalIdToGraphId.entries()].sort())
        .toEqual([...result2.logicalIdToGraphId.entries()].sort());
    });
  });

  describe('extractLambdaRefsFromAsl', () => {
    it('should extract Lambda refs from inline ASL DefinitionBody', () => {
      const asl = {
        StartAt: 'Step1',
        States: {
          Step1: {
            Type: 'Task',
            Resource: 'arn:aws:states:::lambda:invoke',
            Parameters: {
              FunctionName: 'arn:aws:lambda:us-east-1:123:function:ProcessFunc',
            },
            Next: 'Step2',
          },
          Step2: {
            Type: 'Task',
            Resource: { Ref: 'ValidateFunction' },
            End: true,
          },
        },
      };

      const refs = extractLambdaRefsFromAsl(asl);
      expect(refs).toContain('ProcessFunc');
      expect(refs).toContain('ValidateFunction');
    });
  });

  describe('single-stack compatibility (NS-7)', () => {
    it('should produce results without cross-stack resolution when topology is absent', async () => {
      const stateFiles: ParsedStateFile[] = [
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MyFunction', cfnType: 'AWS::Serverless::Function',
          srcFile: 'template.yaml',
          element: {
            logicalId: 'MyFunction',
            type: 'AWS::Serverless::Function',
            functionName: 'my-function',
            properties: {
              Environment: {
                Variables: {
                  TABLE_NAME: { Ref: 'MyTable' },
                },
              },
            },
          },
        }),
        makeStateFile({
          domain: 'infrastructure', type: 'resource',
          logicalId: 'MyTable', cfnType: 'AWS::DynamoDB::Table',
          srcFile: 'template.yaml',
          element: {
            logicalId: 'MyTable',
            type: 'AWS::DynamoDB::Table',
            tableName: 'my-table',
          },
        }),
      ];

      const result = await buildResourceResolverFromState(stateFiles, '/repo/.ste-runtime');

      expect(result.logicalIdToGraphId.get('MyTable')).toBe('Database:my-table');
      expect(result.paramResolutionTable).toHaveLength(0);
      expect(result.unresolvedResolutions).toHaveLength(0);
      expect(result.topology).toBeNull();
    });
  });
});
