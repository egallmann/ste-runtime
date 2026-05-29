import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { emitWorkspaceSlice, loadRepoState } from './slice-emitter.js';
import { getCfnGraphType } from './cfn-type-mapping.js';

vi.mock('node:fs/promises');
vi.mock('globby', () => ({
  globby: vi.fn().mockResolvedValue([]),
}));

function makeStateYaml(domain: string, sliceType: string, element: Record<string, unknown>, file?: string): string {
  return yaml.dump({
    _slice: { domain, type: sliceType },
    element,
    provenance: file ? { file } : undefined,
  });
}

describe('slice-emitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty repo state', () => {
    it('emits a Service node for empty state', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await emitWorkspaceSlice(
        'repo-alpha',
        '/workspace/.workspace-graph/state/repo-alpha',
        '/workspace/.workspace-graph/slices/repo-alpha.yaml',
        '/workspace/repo-alpha',
      );

      expect(result.nodeCount).toBe(1);
      expect(result.edgeCount).toBe(0);
      expect(result.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);

      const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsed = yaml.load(written) as Record<string, unknown>;
      expect(parsed.schema_version).toBe('1.0');
      expect(parsed.repo).toBe('repo-alpha');
      expect(parsed.generated_by).toMatch(/^ste-runtime@/);
      expect(parsed.generated_at).toBeDefined();
      expect(Array.isArray(parsed.nodes)).toBe(true);
      expect(Array.isArray(parsed.edges)).toBe(true);
      expect(Array.isArray(parsed.diagnostics)).toBe(true);
    });
  });

  describe('Graph Identity stability', () => {
    it('produces deterministic node IDs for the same inputs', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const r1 = await emitWorkspaceSlice(
        'repo-beta', '/state/repo-beta', '/out/repo-beta.yaml', '/ws/repo-beta');
      const hash1 = r1.contentHash;

      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      const r2 = await emitWorkspaceSlice(
        'repo-beta', '/state/repo-beta', '/out/repo-beta.yaml', '/ws/repo-beta');

      expect(r1.nodeCount).toBe(r2.nodeCount);
      expect(r1.edgeCount).toBe(r2.edgeCount);
    });

    it('uses lowercase normalized tokens in Service node ID', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await emitWorkspaceSlice(
        'Repo-Gamma', '/state/rg', '/out/rg.yaml', '/ws/rg');

      const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const parsed = yaml.load(written) as Record<string, unknown>;
      const nodes = parsed.nodes as Array<Record<string, unknown>>;
      expect(nodes[0].id).toBe('Service:repo-gamma');
    });
  });

  describe('W-1 compliance', () => {
    it('zero domain-specific vocabulary in slice output', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await emitWorkspaceSlice(
        'repo-alpha', '/state/ra', '/out/ra.yaml', '/ws/ra');

      const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      const domainTerms = /proprietaryterm|internalservice|legacyreport|internalschemas|vendorreport/i;
      expect(domainTerms.test(written)).toBe(false);
    });
  });
});

describe('cfn-type-mapping', () => {
  it('maps known CFN types to specific graph types', () => {
    expect(getCfnGraphType('AWS::Lambda::Function')).toBe('Lambda');
    expect(getCfnGraphType('AWS::CloudFront::Distribution')).toBe('Distribution');
    expect(getCfnGraphType('AWS::WAFv2::WebACL')).toBe('WebACL');
    expect(getCfnGraphType('AWS::IAM::Role')).toBe('Role');
    expect(getCfnGraphType('AWS::CloudFormation::Stack')).toBe('Stack');
    expect(getCfnGraphType('AWS::RDS::DBCluster')).toBe('DBCluster');
    expect(getCfnGraphType('AWS::Route53::RecordSet')).toBe('DNSRecord');
  });

  it('returns InfraResource for unmapped AWS types', () => {
    expect(getCfnGraphType('AWS::Cognito::UserPool')).toBe('InfraResource');
    expect(getCfnGraphType('AWS::ElasticLoadBalancingV2::LoadBalancer')).toBe('InfraResource');
    expect(getCfnGraphType('AWS::ECS::Service')).toBe('InfraResource');
  });

  it('returns InfraResource for non-AWS types', () => {
    expect(getCfnGraphType('Custom::MyResource')).toBe('InfraResource');
    expect(getCfnGraphType('')).toBe('InfraResource');
  });
});

describe('full infrastructure domain emission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits all CFN resource types including frontend infrastructure', async () => {
    const { globby } = await import('globby');
    const stateFiles = [
      '/state/frontend-app/infrastructure/res-cloudfront.yaml',
      '/state/frontend-app/infrastructure/res-waf.yaml',
      '/state/frontend-app/infrastructure/res-s3.yaml',
      '/state/frontend-app/infrastructure/res-route53.yaml',
      '/state/frontend-app/infrastructure/res-cert.yaml',
      '/state/frontend-app/infrastructure/res-role.yaml',
      '/state/frontend-app/infrastructure/res-custom.yaml',
    ];
    vi.mocked(globby).mockResolvedValue(stateFiles);

    const stateMap: Record<string, string> = {
      [stateFiles[0]]: makeStateYaml('infrastructure', 'resource', {
        type: 'AWS::CloudFront::Distribution',
        logicalId: 'AppDistribution',
      }, 'apps/app-a/cfn_templates/cdn.yaml'),
      [stateFiles[1]]: makeStateYaml('infrastructure', 'resource', {
        type: 'AWS::WAFv2::WebACL',
        logicalId: 'AppWebACL',
        name: 'app-a-waf',
      }, 'apps/app-a/cfn_templates/waf.yaml'),
      [stateFiles[2]]: makeStateYaml('infrastructure', 'resource', {
        type: 'AWS::S3::Bucket',
        logicalId: 'AppBucket',
        bucketName: 'app-a-static-assets',
      }, 'apps/app-a/cfn_templates/storage.yaml'),
      [stateFiles[3]]: makeStateYaml('infrastructure', 'resource', {
        type: 'AWS::Route53::RecordSet',
        logicalId: 'AppDNS',
        name: 'app-a.example.com',
      }, 'apps/app-a/cfn_templates/dns.yaml'),
      [stateFiles[4]]: makeStateYaml('infrastructure', 'resource', {
        type: 'AWS::CertificateManager::Certificate',
        logicalId: 'AppCert',
        domainName: 'app-a.example.com',
      }, 'apps/app-a/cfn_templates/cert.yaml'),
      [stateFiles[5]]: makeStateYaml('infrastructure', 'resource', {
        type: 'AWS::IAM::Role',
        logicalId: 'AppDeployRole',
        roleName: 'app-a-deploy-role',
      }, 'apps/app-a/cfn_templates/iam.yaml'),
      [stateFiles[6]]: makeStateYaml('infrastructure', 'resource', {
        type: 'AWS::Cognito::UserPool',
        logicalId: 'AppUserPool',
      }, 'apps/app-a/cfn_templates/auth.yaml'),
    };

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      const content = stateMap[String(filePath)];
      if (content) return content;
      throw new Error('not found');
    });
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await emitWorkspaceSlice(
      'frontend-app', '/state/frontend-app', '/out/frontend-app.yaml', '/ws/frontend-app');

    const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    const parsed = yaml.load(written) as Record<string, unknown>;
    const nodes = parsed.nodes as Array<Record<string, unknown>>;
    const nodeTypes = new Set(nodes.map(n => n.type));

    expect(nodeTypes).toContain('Service');
    expect(nodeTypes).toContain('Distribution');
    expect(nodeTypes).toContain('WebACL');
    expect(nodeTypes).toContain('Bucket');
    expect(nodeTypes).toContain('DNSRecord');
    expect(nodeTypes).toContain('Certificate');
    expect(nodeTypes).toContain('Role');
    expect(nodeTypes).toContain('InfraResource');

    expect(result.nodeCount).toBe(8);
  });

  it('uses logicalId as last-resort name (never drops a node)', async () => {
    const { globby } = await import('globby');
    const stateFiles = ['/state/my-service/infrastructure/res-secgroup.yaml'];
    vi.mocked(globby).mockResolvedValue(stateFiles);

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (String(filePath) === stateFiles[0]) {
        return makeStateYaml('infrastructure', 'resource', {
          type: 'AWS::EC2::SecurityGroup',
          logicalId: 'LambdaSecurityGroup',
        }, 'cfn_templates/networking.yaml');
      }
      throw new Error('not found');
    });
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await emitWorkspaceSlice(
      'my-service', '/state/my-service', '/out/my-service.yaml', '/ws/my-service');

    const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    const parsed = yaml.load(written) as Record<string, unknown>;
    const nodes = parsed.nodes as Array<Record<string, unknown>>;
    const sgNode = nodes.find(n => n.type === 'SecurityGroup');

    expect(sgNode).toBeDefined();
    expect(sgNode!.id).toContain('lambdasecuritygroup');
  });

  it('marks Role nodes as auxiliary', async () => {
    const { globby } = await import('globby');
    const stateFiles = ['/state/my-service/infrastructure/res-role.yaml'];
    vi.mocked(globby).mockResolvedValue(stateFiles);

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (String(filePath) === stateFiles[0]) {
        return makeStateYaml('infrastructure', 'resource', {
          type: 'AWS::IAM::Role',
          logicalId: 'ProcessorRole',
          roleName: 'processor-execution-role',
        }, 'cfn_templates/iam.yaml');
      }
      throw new Error('not found');
    });
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await emitWorkspaceSlice(
      'my-service', '/state/my-service', '/out/my-service.yaml', '/ws/my-service');

    const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    const parsed = yaml.load(written) as Record<string, unknown>;
    const nodes = parsed.nodes as Array<Record<string, unknown>>;
    const roleNode = nodes.find(n => n.type === 'Role');

    expect(roleNode).toBeDefined();
    const attrs = roleNode!.attributes as Record<string, unknown>;
    expect(attrs.auxiliary).toBe(true);
    expect(attrs.cfn_type).toBe('AWS::IAM::Role');
  });

  it('emits InfraResource for unknown CFN types with cfn_type preserved', async () => {
    const { globby } = await import('globby');
    const stateFiles = ['/state/my-service/infrastructure/res-unknown.yaml'];
    vi.mocked(globby).mockResolvedValue(stateFiles);

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (String(filePath) === stateFiles[0]) {
        return makeStateYaml('infrastructure', 'resource', {
          type: 'AWS::ECS::TaskDefinition',
          logicalId: 'WorkerTask',
        }, 'cfn_templates/ecs.yaml');
      }
      throw new Error('not found');
    });
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await emitWorkspaceSlice(
      'my-service', '/state/my-service', '/out/my-service.yaml', '/ws/my-service');

    const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    const parsed = yaml.load(written) as Record<string, unknown>;
    const nodes = parsed.nodes as Array<Record<string, unknown>>;
    const infraNode = nodes.find(n => n.type === 'InfraResource');

    expect(infraNode).toBeDefined();
    expect(infraNode!.id).toContain('InfraResource:');
    const attrs = infraNode!.attributes as Record<string, unknown>;
    expect(attrs.cfn_type).toBe('AWS::ECS::TaskDefinition');
  });

  it('no workspace-specific names in emitted slice', async () => {
    const { globby } = await import('globby');
    vi.mocked(globby).mockResolvedValue([]);
    vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await emitWorkspaceSlice(
      'generic-app', '/state/generic-app', '/out/generic-app.yaml', '/ws/generic-app');

    const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    const ipTerms = /aos|losprocessor|customerreport|los-ui|gallmann/i;
    expect(ipTerms.test(written)).toBe(false);
  });
});
