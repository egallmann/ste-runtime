import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { computeCrossRepoEdges, enrichSlicesWithBacklinks } from './cross-repo-edges.js';

vi.mock('node:fs/promises');
vi.mock('globby', () => ({
  globby: vi.fn().mockResolvedValue([]),
}));

const { globby } = await import('globby');

describe('cross-repo-edges (bilateral resolution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeCrossRepoEdges', () => {
    it('returns empty array when fewer than 2 repos in state dir', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'solo-repo', isDirectory: () => true, isFile: () => false } as any,
      ]);

      const edges = await computeCrossRepoEdges('/slices', '/state');
      expect(edges).toEqual([]);
    });

    it('returns empty array when no httpCalls found (zero-edge case)', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'repoA', isDirectory: () => true, isFile: () => false } as any,
        { name: 'repoB', isDirectory: () => true, isFile: () => false } as any,
      ]);

      vi.mocked(globby).mockResolvedValue([]);

      const edges = await computeCrossRepoEdges('/slices', '/state');
      expect(edges).toEqual([]);
    });

    it('produces HIGH confidence edge for bilateral match (httpCall matches endpoint)', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'platformv2ui', isDirectory: () => true, isFile: () => false } as any,
        { name: 'platformv2api', isDirectory: () => true, isFile: () => false } as any,
      ]);

      vi.mocked(globby).mockImplementation(async (pattern, opts) => {
        const cwd = String((opts as { cwd?: string })?.cwd ?? '');
        if (cwd.includes('platformv2ui') && cwd.includes('call_graph')) {
          return ['/state/platformv2ui/behavior/call_graph/abc.yaml'];
        }
        if (cwd.includes('platformv2api') && cwd.includes('endpoints')) {
          return ['/state/platformv2api/api/endpoints/ep1.yaml'];
        }
        if (cwd === '/slices') {
          return [];
        }
        return [];
      });

      const callGraphSlice = yaml.dump({
        _slice: {
          id: 'function_calls:src/app/shared/shared.service.ts:module',
          domain: 'behavior',
          type: 'function_calls',
          source_files: ['src/app/shared/shared.service.ts'],
        },
        element: {
          id: 'function_calls:src/app/shared/shared.service.ts:module',
          file: 'src/app/shared/shared.service.ts',
          httpCalls: [
            { method: 'GET', urlPattern: '/customer/isUsernameTaken', functionName: 'checkUsernameAvailability' },
          ],
        },
      });

      const endpointSlice = yaml.dump({
        _slice: {
          id: 'api_endpoint:Platform.Api/Controllers/CustomerController.cs:GET:api/customer/isUsernameTaken',
          domain: 'api',
          type: 'endpoint',
          source_files: ['Platform.Api/Controllers/CustomerController.cs'],
        },
        element: {
          method: 'GET',
          path: 'api/customer/isUsernameTaken',
          controller: 'CustomerController',
          action: 'IsUsernameTaken',
        },
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('call_graph') && p.includes('abc.yaml')) return callGraphSlice;
        if (p.includes('endpoints') && p.includes('ep1.yaml')) return endpointSlice;
        throw new Error('not found');
      });

      const edges = await computeCrossRepoEdges('/slices', '/state');
      expect(edges.length).toBeGreaterThanOrEqual(1);

      const highEdge = edges.find(e => e.confidence === 'high');
      expect(highEdge).toBeDefined();
      expect(highEdge!.from).toBe('Service:platformv2ui');
      expect(highEdge!.to).toBe('Endpoint:platformv2api:GET:api/customer/isUsernameTaken');
      expect(highEdge!.verb).toBe('calls');
      expect(highEdge!.provenance.source_repo).toBe('platformv2ui');
      expect(highEdge!.provenance.target_repo).toBe('platformv2api');
      expect(highEdge!.provenance.evidence).toContain('Bilateral');
    });

    it('produces MEDIUM confidence edge for unilateral claim (httpCall, no matching endpoint)', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'platformv2ui', isDirectory: () => true, isFile: () => false } as any,
        { name: 'platformv2api', isDirectory: () => true, isFile: () => false } as any,
      ]);

      vi.mocked(globby).mockImplementation(async (pattern, opts) => {
        const cwd = String((opts as { cwd?: string })?.cwd ?? '');
        if (cwd.includes('platformv2ui') && cwd.includes('call_graph')) {
          return ['/state/platformv2ui/behavior/call_graph/abc.yaml'];
        }
        return [];
      });

      const callGraphSlice = yaml.dump({
        _slice: {
          id: 'function_calls:src/app/shared/shared.service.ts:module',
          domain: 'behavior',
          type: 'function_calls',
          source_files: ['src/app/shared/shared.service.ts'],
        },
        element: {
          id: 'function_calls:src/app/shared/shared.service.ts:module',
          file: 'src/app/shared/shared.service.ts',
          httpCalls: [
            { method: 'POST', urlPattern: '/customer/updateProfile', functionName: 'updateProfile' },
          ],
        },
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('abc.yaml')) return callGraphSlice;
        throw new Error('not found');
      });

      const manifestRepos = [
        { name: 'platformv2ui', kind: 'frontend', lang: 'typescript' },
        { name: 'platformv2api', kind: 'service', lang: 'dotnet' },
      ];

      const edges = await computeCrossRepoEdges('/slices', '/state', manifestRepos);
      expect(edges.length).toBeGreaterThanOrEqual(1);

      const mediumEdge = edges.find(e => e.confidence === 'medium' && e.verb === 'calls');
      expect(mediumEdge).toBeDefined();
      expect(mediumEdge!.from).toBe('Service:platformv2ui');
      expect(mediumEdge!.to).toBe('Service:platformv2api');
      expect(mediumEdge!.provenance.evidence).toContain('Unilateral');
    });

    it('uses path-suffix matching (claim /customer/x matches endpoint api/customer/x)', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'frontendapp', isDirectory: () => true, isFile: () => false } as any,
        { name: 'backendapi', isDirectory: () => true, isFile: () => false } as any,
      ]);

      vi.mocked(globby).mockImplementation(async (pattern, opts) => {
        const cwd = String((opts as { cwd?: string })?.cwd ?? '');
        if (cwd.includes('frontendapp') && cwd.includes('call_graph')) {
          return ['/state/frontendapp/behavior/call_graph/f1.yaml'];
        }
        if (cwd.includes('backendapi') && cwd.includes('endpoints')) {
          return ['/state/backendapi/api/endpoints/e1.yaml'];
        }
        return [];
      });

      const callGraphSlice = yaml.dump({
        _slice: {
          id: 'function_calls:src/services/api.ts:module',
          domain: 'behavior',
          type: 'function_calls',
          source_files: ['src/services/api.ts'],
        },
        element: {
          id: 'function_calls:src/services/api.ts:module',
          httpCalls: [
            { method: 'GET', urlPattern: '/account/getActiveAccounts', functionName: 'getAccounts' },
          ],
        },
      });

      const endpointSlice = yaml.dump({
        _slice: {
          id: 'api_endpoint:Controllers/AccountController.cs:GET:api/account/getActiveAccounts',
          domain: 'api',
          type: 'endpoint',
          source_files: ['Controllers/AccountController.cs'],
        },
        element: {
          method: 'GET',
          path: 'api/account/getActiveAccounts',
          controller: 'AccountController',
          action: 'GetActiveAccounts',
        },
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('f1.yaml')) return callGraphSlice;
        if (p.includes('e1.yaml')) return endpointSlice;
        throw new Error('not found');
      });

      const edges = await computeCrossRepoEdges('/slices', '/state');
      const matched = edges.find(e => e.confidence === 'high');
      expect(matched).toBeDefined();
      expect(matched!.to).toContain('backendapi');
      expect(matched!.to).toContain('getActiveAccounts');
    });

    it('does not match paths with fewer than 2 segments', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'uiapp', isDirectory: () => true, isFile: () => false } as any,
        { name: 'apiapp', isDirectory: () => true, isFile: () => false } as any,
      ]);

      vi.mocked(globby).mockImplementation(async (pattern, opts) => {
        const cwd = String((opts as { cwd?: string })?.cwd ?? '');
        if (cwd.includes('uiapp') && cwd.includes('call_graph')) {
          return ['/state/uiapp/behavior/call_graph/f1.yaml'];
        }
        if (cwd.includes('apiapp') && cwd.includes('endpoints')) {
          return ['/state/apiapp/api/endpoints/e1.yaml'];
        }
        return [];
      });

      const callGraphSlice = yaml.dump({
        _slice: {
          id: 'function_calls:src/api.ts:module',
          domain: 'behavior',
          type: 'function_calls',
          source_files: ['src/api.ts'],
        },
        element: {
          id: 'function_calls:src/api.ts:module',
          httpCalls: [
            { method: 'GET', urlPattern: '/log', functionName: 'sendLog' },
          ],
        },
      });

      const endpointSlice = yaml.dump({
        _slice: {
          id: 'api_endpoint:Controllers/LogController.cs:GET:api/logClickData',
          domain: 'api',
          type: 'endpoint',
          source_files: ['Controllers/LogController.cs'],
        },
        element: {
          method: 'GET',
          path: 'api/logClickData',
          controller: 'LogController',
          action: 'LogClickData',
        },
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('f1.yaml')) return callGraphSlice;
        if (p.includes('e1.yaml')) return endpointSlice;
        throw new Error('not found');
      });

      const edges = await computeCrossRepoEdges('/slices', '/state');
      const falsePosEdge = edges.find(e => e.confidence === 'high');
      expect(falsePosEdge).toBeUndefined();
    });

    it('produces Lambda invocation edges for repos with shared prefix', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'platformv2api', isDirectory: () => true, isFile: () => false } as any,
        { name: 'platformv2workflowlambda', isDirectory: () => true, isFile: () => false } as any,
      ]);

      vi.mocked(globby).mockImplementation(async (pattern, opts) => {
        const cwd = String((opts as { cwd?: string })?.cwd ?? '');
        if (cwd === '/slices') {
          return ['/slices/platformv2api.yaml', '/slices/platformv2workflowlambda.yaml'];
        }
        return [];
      });

      const sliceApi = yaml.dump({
        repo: 'platformv2api',
        nodes: [
          { id: 'Service:platformv2api', type: 'Service', name: 'platformv2api' },
          { id: 'ECS:task-def', type: 'ECS', name: 'TaskDef', attributes: { cfn_type: 'AWS::ECS::TaskDefinition', logical_id: 'TaskDef' } },
        ],
        edges: [],
      });
      const sliceLambda = yaml.dump({
        repo: 'platformv2workflowlambda',
        nodes: [
          { id: 'Service:platformv2workflowlambda', type: 'Service', name: 'platformv2workflowlambda' },
          { id: 'Lambda:StatementsInitiator', type: 'Lambda', name: 'Lambda:StatementsInitiator' },
        ],
        edges: [],
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        const p = String(filePath);
        if (p.includes('platformv2api.yaml')) return sliceApi;
        if (p.includes('platformv2workflowlambda.yaml')) return sliceLambda;
        throw new Error('not found');
      });

      const edges = await computeCrossRepoEdges('/slices', '/state');
      const invokesEdge = edges.find(e => e.verb === 'invokes');
      expect(invokesEdge).toBeDefined();
      expect(invokesEdge!.from).toBe('Service:platformv2api');
      expect(invokesEdge!.to).toBe('Lambda:StatementsInitiator');
      expect(invokesEdge!.confidence).toBe('medium');
      expect(invokesEdge!.provenance.source_repo).toBe('platformv2api');
      expect(invokesEdge!.provenance.target_repo).toBe('platformv2workflowlambda');
    });
  });
});
