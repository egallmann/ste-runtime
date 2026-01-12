import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { assembleRssBundle } from './graph-traversal.js';

async function writeYaml(dir: string, relativePath: string, content: string) {
  const fullPath = path.join(dir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

describe('assembleRssBundle', () => {
  it('produces deterministic order with depth limit', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'rss-'));
    await writeYaml(
      tmp,
      'api/endpoints/get-user.yaml',
      `
_slice:
  id: get-user
  domain: api
  type: endpoint
  source_files:
    - src/api/get-user.ts
  references:
    - domain: data
      type: entity
      id: user
  referenced_by: []
`,
    );

    await writeYaml(
      tmp,
      'data/entities/user.yaml',
      `
_slice:
  id: user
  domain: data
  type: entity
  source_files:
    - src/models/user.ts
  references: []
  referenced_by:
    - domain: api
      type: endpoint
      id: get-user
`,
    );

    const bundle = await assembleRssBundle('test task', {
      stateRoot: tmp,
      depthLimit: 1,
      entryPoints: [
        {
          domain: 'api',
          type: 'endpoint',
          id: 'get-user',
          role: 'primary',
          confidence: 'high',
        },
      ],
    });

    expect(bundle.nodes.map((n) => n.nodeId)).toEqual(['api/endpoint/get-user', 'data/entity/user']);
    expect(bundle.nodes[0].depth).toBe(0);
    expect(bundle.nodes[1].depth).toBe(1);
    expect(bundle.nodes[1].edgeFrom).toBe('api/endpoint/get-user');
    expect(bundle.entryPoints).toHaveLength(1);
  });
});



