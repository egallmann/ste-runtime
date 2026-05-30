/**
 * Shared CFN-to-graph-type mapping module.
 *
 * Single source of truth for mapping AWS CloudFormation resource types to
 * workspace graph node types. Used by both slice-emitter.ts and
 * resource-resolver.ts to prevent mapping drift.
 */

export const CFN_TO_GRAPH: Record<string, string> = {
  // Compute
  'AWS::Lambda::Function': 'Lambda',
  'AWS::Serverless::Function': 'Lambda',

  // Orchestration
  'AWS::StepFunctions::StateMachine': 'StateMachine',
  'AWS::Serverless::StateMachine': 'StateMachine',

  // Messaging
  'AWS::SQS::Queue': 'Queue',
  'AWS::SNS::Topic': 'Topic',

  // Storage
  'AWS::S3::Bucket': 'Bucket',
  'AWS::DynamoDB::Table': 'Database',

  // CDN / Edge
  'AWS::CloudFront::Distribution': 'Distribution',

  // Security / WAF
  'AWS::WAFv2::WebACL': 'WebACL',
  'AWS::WAF::WebACL': 'WebACL',

  // Certificate
  'AWS::CertificateManager::Certificate': 'Certificate',

  // DNS
  'AWS::Route53::RecordSet': 'DNSRecord',
  'AWS::Route53::RecordSetGroup': 'DNSRecord',
  'AWS::Route53::HostedZone': 'DNSRecord',

  // API Gateway
  'AWS::ApiGateway::RestApi': 'APIGateway',
  'AWS::ApiGateway::Resource': 'APIGateway',
  'AWS::ApiGatewayV2::Api': 'APIGateway',
  'AWS::Serverless::Api': 'APIGateway',
  'AWS::Serverless::HttpApi': 'APIGateway',

  // Network Security
  'AWS::EC2::SecurityGroup': 'SecurityGroup',

  // Secrets
  'AWS::SecretsManager::Secret': 'Secret',

  // RDS
  'AWS::RDS::DBCluster': 'DBCluster',
  'AWS::RDS::DBInstance': 'DBCluster',
  'AWS::RDS::DBProxy': 'DBProxy',

  // Observability
  'AWS::Logs::LogGroup': 'LogGroup',
  'AWS::CloudWatch::Alarm': 'Alarm',

  // Streaming
  'AWS::KinesisFirehose::DeliveryStream': 'DeliveryStream',
  'AWS::Kinesis::Stream': 'DeliveryStream',

  // Events
  'AWS::Events::Rule': 'EventRule',
  'AWS::Serverless::EventBridgeRule': 'EventRule',

  // IAM
  'AWS::IAM::Role': 'Role',

  // Nested stacks
  'AWS::CloudFormation::Stack': 'Stack',
  'AWS::Serverless::Application': 'Stack',
};

/**
 * Return the graph node type for a given CFN resource type.
 * Falls back to 'InfraResource' for any unmapped AWS::* type.
 */
export function getCfnGraphType(cfnType: string): string {
  return CFN_TO_GRAPH[cfnType] ?? 'InfraResource';
}

/**
 * Maps graph node types to ordered lists of CFN property keys to try
 * when resolving a human-readable display name. The slice emitter tries
 * each key in order; the first non-intrinsic string value wins.
 * logicalId is always the last-resort fallback (handled by the caller).
 */
export const NODE_NAME_KEYS: Record<string, string[]> = {
  Lambda: ['functionName', 'FunctionName'],
  StateMachine: ['stateMachineName', 'StateMachineName'],
  Queue: ['queueName', 'QueueName'],
  Topic: ['topicName', 'TopicName'],
  Bucket: ['bucketName', 'BucketName'],
  Database: ['tableName', 'TableName'],
  Distribution: ['distributionConfig.Comment', 'Comment'],
  WebACL: ['name', 'Name'],
  Certificate: ['domainName', 'DomainName'],
  DNSRecord: ['name', 'Name'],
  APIGateway: ['name', 'Name', 'StageName'],
  SecurityGroup: ['groupDescription', 'GroupDescription', 'GroupName'],
  Secret: ['name', 'Name'],
  DBCluster: ['dbClusterIdentifier', 'DBClusterIdentifier', 'DBInstanceIdentifier'],
  DBProxy: ['dbProxyName', 'DBProxyName'],
  LogGroup: ['logGroupName', 'LogGroupName'],
  Alarm: ['alarmName', 'AlarmName'],
  DeliveryStream: ['deliveryStreamName', 'DeliveryStreamName'],
  EventRule: ['name', 'Name'],
  Role: ['roleName', 'RoleName'],
  Stack: ['name', 'Name'],
  InfraResource: ['name', 'Name'],
};

/**
 * Node types that are high-volume, low-signal at overview resolutions.
 * Projections at L0-L2 compress/suppress these; L3-L4 show full detail.
 */
export const AUXILIARY_NODE_TYPES = new Set([
  'Role',
  'SecurityGroup',
  'LogGroup',
  'Alarm',
  'Certificate',
  'DNSRecord',
]);
