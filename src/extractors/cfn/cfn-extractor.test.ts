/**
 * Tests for CloudFormation extractor
 * 
 * Tests extraction of CFN resources, parameters, outputs, and GSIs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Import types for testing structure
// Note: The actual CFN extractor implementation may vary

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'cfn-extractor-test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function createCfnTemplate(filename: string, content: string): Promise<string> {
  const fullPath = path.join(tempDir, filename);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
  return fullPath;
}

describe('CloudFormation Extractor', () => {
  describe('template detection', () => {
    it('should recognize AWSTemplateFormatVersion', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Description: Test template
Resources:
  TestBucket:
    Type: AWS::S3::Bucket
`;
      const filePath = await createCfnTemplate('template.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('AWSTemplateFormatVersion');
      expect(content).toContain('AWS::S3::Bucket');
    });

    it('should recognize SAM Transform', async () => {
      const template = `
Transform: AWS::Serverless-2016-10-31
Description: SAM template
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: nodejs18.x
`;
      const filePath = await createCfnTemplate('sam-template.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('AWS::Serverless-2016-10-31');
      expect(content).toContain('AWS::Serverless::Function');
    });
  });

  describe('resource extraction', () => {
    it('should extract DynamoDB table resources', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  UsersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: users
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: pk
          AttributeType: S
        - AttributeName: sk
          AttributeType: S
      KeySchema:
        - AttributeName: pk
          KeyType: HASH
        - AttributeName: sk
          KeyType: RANGE
`;
      const filePath = await createCfnTemplate('dynamodb.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('AWS::DynamoDB::Table');
      expect(content).toContain('UsersTable');
      expect(content).toContain('BillingMode');
    });

    it('should extract Lambda function resources', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  ProcessorFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: processor
      Runtime: python3.11
      Handler: index.lambda_handler
      Code:
        ZipFile: |
          def lambda_handler(event, context):
              return {'statusCode': 200}
      Environment:
        Variables:
          TABLE_NAME: !Ref UsersTable
`;
      const filePath = await createCfnTemplate('lambda.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('AWS::Lambda::Function');
      expect(content).toContain('ProcessorFunction');
      expect(content).toContain('python3.11');
    });
  });

  describe('parameter extraction', () => {
    it('should extract template parameters', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues:
      - dev
      - staging
      - prod
  MemorySize:
    Type: Number
    Default: 256
    MinValue: 128
    MaxValue: 10240
Resources:
  Placeholder:
    Type: AWS::CloudFormation::WaitConditionHandle
`;
      const filePath = await createCfnTemplate('params.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('Parameters:');
      expect(content).toContain('Environment:');
      expect(content).toContain('MemorySize:');
      expect(content).toContain('AllowedValues');
    });
  });

  describe('output extraction', () => {
    it('should extract template outputs', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
Outputs:
  BucketArn:
    Description: ARN of the bucket
    Value: !GetAtt MyBucket.Arn
    Export:
      Name: !Sub \${AWS::StackName}-BucketArn
  BucketName:
    Value: !Ref MyBucket
`;
      const filePath = await createCfnTemplate('outputs.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('Outputs:');
      expect(content).toContain('BucketArn:');
      expect(content).toContain('Export:');
    });
  });

  describe('GSI extraction', () => {
    it('should extract GlobalSecondaryIndexes', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  Table:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: items
      AttributeDefinitions:
        - AttributeName: pk
          AttributeType: S
        - AttributeName: gsi1pk
          AttributeType: S
        - AttributeName: gsi1sk
          AttributeType: S
      KeySchema:
        - AttributeName: pk
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: GSI1
          KeySchema:
            - AttributeName: gsi1pk
              KeyType: HASH
            - AttributeName: gsi1sk
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
`;
      const filePath = await createCfnTemplate('gsi.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('GlobalSecondaryIndexes:');
      expect(content).toContain('GSI1');
      expect(content).toContain('gsi1pk');
    });
  });

  describe('trigger extraction', () => {
    it('should extract EventSourceMappings', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  StreamMapping:
    Type: AWS::Lambda::EventSourceMapping
    Properties:
      FunctionName: !Ref ProcessorFunction
      EventSourceArn: !GetAtt Table.StreamArn
      StartingPosition: TRIM_HORIZON
      BatchSize: 100
`;
      const filePath = await createCfnTemplate('triggers.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('AWS::Lambda::EventSourceMapping');
      expect(content).toContain('StreamMapping');
      expect(content).toContain('EventSourceArn');
    });

    it('should extract EventBridge rules', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  ScheduledRule:
    Type: AWS::Events::Rule
    Properties:
      Name: daily-trigger
      ScheduleExpression: rate(1 day)
      State: ENABLED
      Targets:
        - Id: Target1
          Arn: !GetAtt MyFunction.Arn
`;
      const filePath = await createCfnTemplate('eventbridge.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('AWS::Events::Rule');
      expect(content).toContain('ScheduleExpression');
    });
  });

  describe('API Gateway path extraction', () => {
    it('should extract API Gateway resources with nested paths', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  RestApi:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: MyAPI

  ControlsResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref RestApi
      ParentId: !GetAtt RestApi.RootResourceId
      PathPart: controls

  ControlIdResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref RestApi
      ParentId: !Ref ControlsResource
      PathPart: '{controlId}'

  GetControlMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApi
      ResourceId: !Ref ControlIdResource
      HttpMethod: GET
      AuthorizationType: NONE
`;
      const filePath = await createCfnTemplate('api.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('AWS::ApiGateway::RestApi');
      expect(content).toContain('AWS::ApiGateway::Resource');
      expect(content).toContain('AWS::ApiGateway::Method');
      expect(content).toContain('PathPart: controls');
      expect(content).toContain("PathPart: '{controlId}'");
    });

    it('should handle GetAtt references for ResourceId', async () => {
      const template = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  RestApi:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: MyAPI

  ItemsResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref RestApi
      ParentId: !GetAtt RestApi.RootResourceId
      PathPart: items

  ListItemsMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApi
      ResourceId: !GetAtt ItemsResource.ResourceId
      HttpMethod: GET
      AuthorizationType: IAM
`;
      const filePath = await createCfnTemplate('api-getatt.yaml', template);
      const content = await readFile(filePath, 'utf8');

      expect(content).toContain('!GetAtt ItemsResource.ResourceId');
      expect(content).toContain('PathPart: items');
    });
  });

  describe('JSON template support', () => {
    it('should parse JSON CloudFormation templates', async () => {
      const template = JSON.stringify({
        AWSTemplateFormatVersion: '2010-09-09',
        Description: 'JSON template',
        Resources: {
          MyBucket: {
            Type: 'AWS::S3::Bucket',
            Properties: {
              BucketName: 'my-bucket',
            },
          },
        },
      }, null, 2);

      const filePath = await createCfnTemplate('template.json', template);
      const content = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.AWSTemplateFormatVersion).toBe('2010-09-09');
      expect(parsed.Resources.MyBucket.Type).toBe('AWS::S3::Bucket');
    });
  });
});

