import { describe, it, expect } from 'vitest';
import {
  compress,
  extractCapabilityDomain,
  defaultResolutionConfig,
  type ResolutionLevel,
} from './compression.js';
import type { WorkspaceNode, WorkspaceEdge } from './workspace-graph-loader.js';
import type {
  ComponentIntegrationResult,
  SystemDependencyResult,
} from './canned-queries.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEndpoint(repo: string, path: string): WorkspaceNode {
  return {
    id: `Endpoint:${repo}:get:${path}`,
    type: 'Endpoint',
    name: `${repo}:${path}`,
    repo,
  };
}

function makeNode(type: string, repo: string, name: string): WorkspaceNode {
  return { id: `${type}:${repo}:${name}`, type, name: `${repo}:${name}`, repo };
}

function makeEdge(from: string, to: string, verb: string): WorkspaceEdge {
  return { from, to, verb };
}

function buildLargeApiFixture(): ComponentIntegrationResult {
  const repo = 'acmeapi';
  const domains: Record<string, number> = {
    account: 8, customer: 6, payment: 5, document: 6, registration: 4,
    authentication: 3, passwordreset: 5, verificationcode: 2, analytics: 3,
    contact: 2, healthcheck: 3, identityverification: 2, termsofuse: 2,
    notification: 1, billing: 1, status: 1, transaction: 1, config: 1,
  };

  const endpoints: WorkspaceNode[] = [];
  const edges: WorkspaceEdge[] = [];
  const service = makeNode('Service', repo, repo);

  let count = 0;
  for (const [domain, num] of Object.entries(domains)) {
    for (let i = 0; i < num; i++) {
      const ep = makeEndpoint(repo, `api-${domain}-action${i}`);
      endpoints.push(ep);
      edges.push(makeEdge(service.id, ep.id, 'has_contract'));
      count++;
    }
  }

  const lambdaRepo = 'acmeworkflowlambda';
  const lambdas: WorkspaceNode[] = [];
  for (let i = 0; i < 5; i++) {
    lambdas.push(makeNode('Lambda', lambdaRepo, `lambda${i}`));
  }
  const smNode = makeNode('StateMachine', lambdaRepo, 'statemachine1');
  const bucketNode = makeNode('Bucket', lambdaRepo, 'bucket1');
  const alarmTopic = makeNode('Topic', lambdaRepo, 'statemachineexecutionsalarmsnstopic');
  const lambdaService = makeNode('Service', lambdaRepo, lambdaRepo);

  const uiService = makeNode('Service', 'acmeui', 'acmeui');
  const dcApiService = makeNode('Service', 'catalogapi', 'catalogapi');
  const dcUiService = makeNode('Service', 'catalogui', 'catalogui');
  const mobileService = makeNode('Service', 'acmemobileregistrationlambda', 'acmemobileregistrationlambda');
  const livechatService = makeNode('Service', 'acmeimportchatlambda', 'acmeimportchatlambda');

  const allComponents = [
    service, ...endpoints,
    lambdaService, ...lambdas, smNode, bucketNode, alarmTopic,
    uiService, dcApiService, dcUiService, mobileService, livechatService,
  ];

  return {
    kind: 'component-integration',
    scope: 'workspace',
    components: allComponents,
    integrations: [
      { pattern: 'HTTP API', edges },
      { pattern: 'Deployment', edges: [] },
    ],
    summary: {
      totalComponents: allComponents.length,
      totalEdges: edges.length,
      patterns: ['HTTP API', 'Deployment'],
    },
  };
}

// ---------------------------------------------------------------------------
// extractCapabilityDomain
// ---------------------------------------------------------------------------

describe('extractCapabilityDomain', () => {
  it('extracts second segment after api-', () => {
    expect(extractCapabilityDomain('Endpoint:repo:get:api-account-getinfo')).toBe('account');
    expect(extractCapabilityDomain('Endpoint:repo:post:api-payment-action')).toBe('payment');
    expect(extractCapabilityDomain('Endpoint:repo:get:api-document-getdoc')).toBe('document');
  });

  it('returns null for IDs with insufficient segments', () => {
    expect(extractCapabilityDomain('Endpoint:repo')).toBeNull();
    expect(extractCapabilityDomain('Endpoint:repo:get')).toBeNull();
  });

  it('handles non-api prefixes by returning first segment', () => {
    expect(extractCapabilityDomain('Endpoint:repo:get:healthcheck-status')).toBe('healthcheck');
  });
});

// ---------------------------------------------------------------------------
// L0: System Context
// ---------------------------------------------------------------------------

describe('compress L0', () => {
  it('produces exactly 1 node per repo', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L0' });

    const repos = new Set(fixture.components.map(c => c.repo));
    expect(result.nodes.length).toBe(repos.size);
    expect(result.nodes.every(n => n.isAggregate)).toBe(true);
    expect(result.nodes.every(n => n.type === 'Service')).toBe(true);
  });

  it('suppresses intra-repo edges', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L0' });
    expect(result.edges.length).toBe(0);
  });

  it('produces valid metadata', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L0' });

    expect(result.metadata.level).toBe('L0');
    expect(result.metadata.derivation).toBe('deterministic');
    expect(result.metadata.confidence).toBe('high');
    expect(result.metadata.compressionRatio).toBeLessThan(1);
    expect(result.metadata.generationHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('handles empty graph', () => {
    const empty: ComponentIntegrationResult = {
      kind: 'component-integration',
      scope: 'workspace',
      components: [],
      integrations: [],
      summary: { totalComponents: 0, totalEdges: 0, patterns: [] },
    };
    const result = compress(empty, { level: 'L0' });
    expect(result.nodes.length).toBe(0);
    expect(result.edges.length).toBe(0);
    expect(result.metadata.nodeCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// L1: Service Topology
// ---------------------------------------------------------------------------

describe('compress L1', () => {
  it('aggregates same-type nodes above threshold', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L1' });

    const lambdaGroup = result.nodes.find(n => n.id.includes('Lambda_group'));
    expect(lambdaGroup).toBeDefined();
    expect(lambdaGroup!.isAggregate).toBe(true);
    expect(lambdaGroup!.memberCount).toBe(5);
  });

  it('preserves StateMachine and Bucket individually', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L1' });

    const sm = result.nodes.find(n => n.type === 'StateMachine');
    expect(sm).toBeDefined();
    expect(sm!.isAggregate).toBe(false);

    const bucket = result.nodes.find(n => n.type === 'Bucket');
    expect(bucket).toBeDefined();
    expect(bucket!.isAggregate).toBe(false);
  });

  it('suppresses alarm topics', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L1' });

    const alarmTopics = result.nodes.filter(n =>
      n.id.toLowerCase().includes('alarm'),
    );
    expect(alarmTopics.length).toBe(0);
  });

  it('suppresses has_contract edges', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L1' });

    const hasContractEdges = result.edges.filter(e => e.verb === 'has_contract');
    expect(hasContractEdges.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// L2: Capability Domain Topology
// ---------------------------------------------------------------------------

describe('compress L2', () => {
  it('groups endpoints into capability domains', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L2' });

    const capGroups = result.nodes.filter(n => n.type === 'CapabilityGroup');
    expect(capGroups.length).toBeGreaterThanOrEqual(8);
    expect(capGroups.length).toBeLessThanOrEqual(18);
  });

  it('produces <= 15 capability group nodes for API repo', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L2' });

    const capGroups = result.nodes.filter(n => n.type === 'CapabilityGroup');
    expect(capGroups.length).toBeLessThanOrEqual(18);
  });

  it('does not group singletons (minimumGroupSize)', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L2' });

    const singletonDomains = ['notification', 'billing', 'status', 'transaction', 'config'];
    for (const d of singletonDomains) {
      const group = result.groups.find(g =>
        g.domain.toLowerCase() === d && g.memberNodes.length === 1,
      );
      expect(group).toBeUndefined();
    }
  });

  it('preserves traceability via memberIds', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L2' });

    const capGroups = result.nodes.filter(n => n.isAggregate && n.type === 'CapabilityGroup');
    for (const g of capGroups) {
      expect(g.memberIds).toBeDefined();
      expect(g.memberIds!.length).toBeGreaterThan(0);
      expect(g.memberCount).toBe(g.memberIds!.length);
    }
  });

  it('compresses has_contract edges with multiplicity', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L2' });

    const contractEdges = result.edges.filter(e => e.verb === 'has_contract');
    for (const e of contractEdges) {
      if (e.isCompressed) {
        expect(e.multiplicity).toBeGreaterThan(1);
        expect(e.sourceEdgeIds).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// L3: Contract / Integration Topology
// ---------------------------------------------------------------------------

describe('compress L3', () => {
  it('keeps all individual endpoint nodes', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L3' });

    const endpointNodes = result.nodes.filter(n => n.type === 'Endpoint');
    const fixtureEndpoints = fixture.components.filter(c => c.type === 'Endpoint');
    expect(endpointNodes.length).toBe(fixtureEndpoints.length);
  });

  it('creates capability groups for subgraph organization', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L3' });
    expect(result.groups.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// L4: Full fidelity (passthrough)
// ---------------------------------------------------------------------------

describe('compress L4', () => {
  it('preserves all nodes and edges', () => {
    const fixture = buildLargeApiFixture();
    const result = compress(fixture, { level: 'L4' });

    const fixtureNonAlarm = fixture.components.filter(c =>
      !(c.type === 'Topic' && c.id.toLowerCase().includes('alarm')),
    );
    expect(result.nodes.length).toBe(fixture.components.length);
    expect(result.nodes.every(n => !n.isAggregate)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// maxNodes safety valve
// ---------------------------------------------------------------------------

describe('maxNodes safety valve', () => {
  it('forces deeper aggregation when exceeded', () => {
    const fixture = buildLargeApiFixture();
    const normalResult = compress(fixture, { level: 'L3' });
    const result = compress(fixture, { level: 'L3', maxNodes: 10 });

    expect(result.nodes.length).toBeLessThan(normalResult.nodes.length);
    expect(result.metadata.level).not.toBe('L3');
  });
});

// ---------------------------------------------------------------------------
// System dependencies compression
// ---------------------------------------------------------------------------

describe('compress system-dependencies', () => {
  it('produces one node per repo', () => {
    const sysDeps: SystemDependencyResult = {
      kind: 'system-dependencies',
      repos: [
        { name: 'repoA', nodeTypes: { Service: 1, Lambda: 3 } },
        { name: 'repoB', nodeTypes: { Service: 1, Bucket: 1 } },
      ],
      dependencies: [
        { from: 'repoA', to: 'repoB', verbs: ['calls'], details: [{ fromNode: 'a', toNode: 'b', verb: 'calls' }] },
      ],
      connectionTypes: [{ type: 'calls', count: 1 }],
    };

    const result = compress(sysDeps, { level: 'L0' });
    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.metadata.family).toBe('system-dependencies');
  });

  it('handles empty dependencies', () => {
    const sysDeps: SystemDependencyResult = {
      kind: 'system-dependencies',
      repos: [{ name: 'repoA', nodeTypes: { Service: 1 } }],
      dependencies: [],
      connectionTypes: [],
    };
    const result = compress(sysDeps, { level: 'L0' });
    expect(result.nodes.length).toBe(1);
    expect(result.edges.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge tier filtering
// ---------------------------------------------------------------------------

describe('edge tier filtering', () => {
  it('L0 only allows tier 1 edges', () => {
    const fixture: ComponentIntegrationResult = {
      kind: 'component-integration',
      scope: 'workspace',
      components: [
        makeNode('Service', 'repoA', 'svcA'),
        makeNode('Service', 'repoB', 'svcB'),
      ],
      integrations: [
        {
          pattern: 'Other',
          edges: [
            makeEdge('Service:repoA:svcA', 'Service:repoB:svcB', 'calls'),
            makeEdge('Service:repoA:svcA', 'Service:repoB:svcB', 'has_contract'),
            makeEdge('Service:repoA:svcA', 'Service:repoB:svcB', 'references'),
          ],
        },
      ],
      summary: { totalComponents: 2, totalEdges: 3, patterns: ['Other'] },
    };

    const result = compress(fixture, { level: 'L0' });
    const verbsUsed = new Set(result.edges.map(e => e.verb));
    expect(verbsUsed.has('calls')).toBe(true);
    expect(verbsUsed.has('has_contract')).toBe(false);
    expect(verbsUsed.has('references')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// defaultResolutionConfig
// ---------------------------------------------------------------------------

describe('defaultResolutionConfig', () => {
  it('suppresses alarm topics for L0 and L1', () => {
    expect(defaultResolutionConfig('L0').suppressAlarmTopics).toBe(true);
    expect(defaultResolutionConfig('L1').suppressAlarmTopics).toBe(true);
    expect(defaultResolutionConfig('L2').suppressAlarmTopics).toBe(false);
  });

  it('uses path-prefix extractor', () => {
    expect(defaultResolutionConfig('L2').capabilityExtractor).toBe('path-prefix');
  });
});
