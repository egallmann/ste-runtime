/**
 * Cross-Repo Edge Resolution (Bilateral)
 *
 * Post-processing phase that runs after all per-repo slices are emitted.
 * Resolves cross-repository edges by matching outbound httpCalls (from TS extractors)
 * against inbound api_endpoint contracts (from C# extractors).
 *
 * Confidence model:
 * - HIGH: bilateral match (caller's httpCall matches callee's endpoint)
 * - MEDIUM: unilateral claim (caller has httpCall, no matching endpoint found,
 *           but manifest 'kind' indicates target is a service/backend)
 *
 * Edge types produced:
 * - Service -> Endpoint (via bilateral HTTP call / endpoint matching)
 * - Service -> Service (via shared SNS/SQS event channels, CFN cross-stack references)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { globby } from 'globby';
import { ioLimiter } from '../utils/concurrency.js';
import { log, warn } from '../utils/logger.js';

export interface CrossRepoEdge {
  from: string;
  to: string;
  verb: string;
  confidence: 'high' | 'medium';
  provenance: { source_repo: string; target_repo: string; evidence: string };
  attributes?: { protocol?: string; call_count?: number; url_patterns?: string[] };
}

export interface ManifestRepoEntry {
  name: string;
  kind: string;
  lang?: string;
}

interface HttpCallClaim {
  method: string;
  urlPattern: string;
  functionName: string;
  sourceFile: string;
  repo: string;
}

interface EndpointContract {
  method: string;
  path: string;
  controller: string;
  action: string;
  sliceId: string;
  sourceFile: string;
  repo: string;
}

interface SliceDoc {
  repo: string;
  nodes: Array<{ id: string; type: string; name: string; attributes?: Record<string, unknown> }>;
  edges: Array<{ from: string; to: string; verb: string }>;
}

/**
 * Compute cross-repository edges by bilateral resolution of httpCalls vs api_endpoint contracts.
 */
export async function computeCrossRepoEdges(
  slicesDir: string,
  stateDir: string,
  manifestRepos?: ManifestRepoEntry[],
): Promise<CrossRepoEdge[]> {
  const edges: CrossRepoEdge[] = [];

  const repoDirs = await listRepoDirs(stateDir);
  if (repoDirs.length < 2) {
    log('[cross-repo-edges] Fewer than 2 repos in state; skipping cross-repo analysis');
    return edges;
  }

  // Phase 1: Collect outbound claims (httpCalls from behavior/call_graph slices)
  const outboundClaims = await collectOutboundClaims(stateDir, repoDirs);
  log(`[cross-repo-edges] Collected ${outboundClaims.length} outbound HTTP call claims`);

  // Phase 2: Collect inbound contracts (api_endpoint slices)
  const inboundContracts = await collectInboundContracts(stateDir, repoDirs);
  log(`[cross-repo-edges] Collected ${inboundContracts.length} inbound API endpoint contracts`);

  // Phase 3: Bilateral resolution
  const bilateralEdges = resolveBilateral(outboundClaims, inboundContracts, manifestRepos);
  edges.push(...bilateralEdges);

  // Phase 4: Existing infrastructure edges (Lambda invocations, event channels)
  const slices = await loadAllSlices(slicesDir);
  const lambdaEdges = matchCrossRepoLambdaInvocations(slices, stateDir);
  edges.push(...lambdaEdges);

  const eventEdges = await matchSharedEventChannels(stateDir, slices);
  edges.push(...eventEdges);

  log(`[cross-repo-edges] Produced ${edges.length} cross-repo edges total`);
  return edges;
}

async function listRepoDirs(stateDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(stateDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }
}

async function collectOutboundClaims(stateDir: string, repoDirs: string[]): Promise<HttpCallClaim[]> {
  const claims: HttpCallClaim[] = [];

  for (const repo of repoDirs) {
    const callGraphDir = path.join(stateDir, repo, 'behavior', 'call_graph');
    let files: string[];
    try {
      files = await globby('*.yaml', { cwd: callGraphDir, absolute: true });
    } catch {
      continue;
    }

    await Promise.all(files.map(file => ioLimiter(async () => {
      try {
        const text = await fs.readFile(file, 'utf-8');
        const doc = yaml.load(text) as Record<string, unknown>;
        if (!doc) return;

        const element = doc.element as Record<string, unknown> | undefined;
        if (!element) return;

        const httpCalls = element.httpCalls as Array<{
          method: string; urlPattern: string; functionName: string;
        }> | undefined;
        if (!httpCalls || httpCalls.length === 0) return;

        const slice = doc._slice as Record<string, unknown> | undefined;
        const sourceFile = (slice?.source_files as string[] | undefined)?.[0] ?? '';

        for (const call of httpCalls) {
          claims.push({
            method: call.method,
            urlPattern: call.urlPattern,
            functionName: call.functionName,
            sourceFile,
            repo,
          });
        }
      } catch { /* skip unparseable */ }
    })));
  }

  return claims;
}

async function collectInboundContracts(stateDir: string, repoDirs: string[]): Promise<EndpointContract[]> {
  const contracts: EndpointContract[] = [];

  for (const repo of repoDirs) {
    const endpointsDir = path.join(stateDir, repo, 'api', 'endpoints');
    let files: string[];
    try {
      files = await globby('*.yaml', { cwd: endpointsDir, absolute: true });
    } catch {
      continue;
    }

    await Promise.all(files.map(file => ioLimiter(async () => {
      try {
        const text = await fs.readFile(file, 'utf-8');
        const doc = yaml.load(text) as Record<string, unknown>;
        if (!doc) return;

        const slice = doc._slice as Record<string, unknown> | undefined;
        const element = doc.element as Record<string, unknown> | undefined;
        if (!slice || !element) return;

        const method = String(element.method ?? '').toUpperCase();
        const ePath = String(element.path ?? '');
        if (!method || !ePath) return;

        contracts.push({
          method,
          path: ePath,
          controller: String(element.controller ?? ''),
          action: String(element.action ?? ''),
          sliceId: String(slice.id ?? ''),
          sourceFile: (slice.source_files as string[] | undefined)?.[0] ?? '',
          repo,
        });
      } catch { /* skip unparseable */ }
    })));
  }

  return contracts;
}

/**
 * Resolve outbound claims against inbound contracts using path-suffix matching.
 * Requires minimum 2 path segments for a match to avoid false positives.
 */
function resolveBilateral(
  claims: HttpCallClaim[],
  contracts: EndpointContract[],
  manifestRepos?: ManifestRepoEntry[],
): CrossRepoEdge[] {
  const edges: CrossRepoEdge[] = [];
  const matchedClaims = new Set<number>();

  // Group contracts by repo for efficient lookup
  const contractsByRepo = new Map<string, EndpointContract[]>();
  for (const contract of contracts) {
    const existing = contractsByRepo.get(contract.repo) ?? [];
    existing.push(contract);
    contractsByRepo.set(contract.repo, existing);
  }

  // Try to match each claim against all contracts in other repos, picking the most specific match
  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    let bestContract: EndpointContract | null = null;
    let bestRepo = '';
    let bestSpecificity = -1;

    for (const [targetRepo, repoContracts] of contractsByRepo) {
      if (targetRepo === claim.repo) continue;

      const matchedContract = findMatchingContract(claim, repoContracts);
      if (matchedContract) {
        const contractPathNorm = normalizePath(matchedContract.path);
        const contractSegments = contractPathNorm.split('/').filter(Boolean);
        const specificity = contractSegments.filter(
          s => !s.startsWith(':') && !s.startsWith('{') && !s.startsWith('['),
        ).length;
        if (specificity > bestSpecificity) {
          bestSpecificity = specificity;
          bestContract = matchedContract;
          bestRepo = targetRepo;
        }
      }
    }

    if (bestContract) {
      edges.push({
        from: `Service:${claim.repo}`,
        to: `Endpoint:${bestRepo}:${bestContract.method}:${bestContract.path}`,
        verb: 'calls',
        confidence: 'high',
        provenance: {
          source_repo: claim.repo,
          target_repo: bestRepo,
          evidence: `Bilateral: httpCalls ${claim.method} ${claim.urlPattern} matches endpoint ${bestContract.method} ${bestContract.path}`,
        },
        attributes: {
          protocol: 'HTTP',
          url_patterns: [claim.urlPattern],
        },
      });
      matchedClaims.add(i);
    }
  }

  // Unmatched claims: emit MEDIUM confidence if target can be inferred from manifest
  if (manifestRepos && manifestRepos.length > 0) {
    const serviceRepos = manifestRepos.filter(r => r.kind === 'service');

    for (let i = 0; i < claims.length; i++) {
      if (matchedClaims.has(i)) continue;
      const claim = claims[i];

      // Find the most likely target service (highest affinity, service kind)
      const candidates = serviceRepos
        .filter(r => r.name !== claim.repo)
        .map(r => ({ repo: r, affinity: computeRepoAffinity(claim.repo, r.name) }))
        .filter(c => c.affinity >= 10)
        .sort((a, b) => b.affinity - a.affinity);

      if (candidates.length > 0) {
        const target = candidates[0].repo;
        edges.push({
          from: `Service:${claim.repo}`,
          to: `Service:${target.name}`,
          verb: 'calls',
          confidence: 'medium',
          provenance: {
            source_repo: claim.repo,
            target_repo: target.name,
            evidence: `Unilateral: httpCalls ${claim.method} ${claim.urlPattern} (no matching endpoint found, manifest kind=service)`,
          },
          attributes: {
            protocol: 'HTTP',
            url_patterns: [claim.urlPattern],
          },
        });
        matchedClaims.add(i);
      }
    }
  }

  // Deduplicate edges (same from/to/verb)
  return deduplicateEdges(edges);
}

function findMatchingContract(claim: HttpCallClaim, contracts: EndpointContract[]): EndpointContract | null {
  const claimPathNorm = normalizePath(claim.urlPattern);
  const claimMethod = claim.method.toUpperCase();
  const claimSegments = claimPathNorm.split('/').filter(Boolean);

  // Require minimum 2 path segments to avoid short-path false positives
  if (claimSegments.length < 2) return null;

  let bestMatch: EndpointContract | null = null;
  let bestSpecificity = -1;

  for (const contract of contracts) {
    if (contract.method !== claimMethod) continue;

    const contractPathNorm = normalizePath(contract.path);
    const contractSegments = contractPathNorm.split('/').filter(Boolean);

    // Exact match always wins
    if (contractPathNorm === claimPathNorm) return contract;

    let matched = false;
    if (isSuffixMatch(claimSegments, contractSegments)) matched = true;
    if (isSuffixMatch(contractSegments, claimSegments)) matched = true;

    if (matched) {
      // Prefer contracts with more literal (non-param) segments
      const specificity = contractSegments.filter(
        s => !s.startsWith(':') && !s.startsWith('{') && !s.startsWith('['),
      ).length;
      if (specificity > bestSpecificity) {
        bestSpecificity = specificity;
        bestMatch = contract;
      }
    }
  }

  return bestMatch;
}

/**
 * Check if 'needle' segments are a suffix of 'haystack' segments.
 * Requires at least 2 matching segments.
 */
function isSuffixMatch(needle: string[], haystack: string[]): boolean {
  if (needle.length < 2 || haystack.length < 2) return false;
  if (needle.length > haystack.length) return false;

  const offset = haystack.length - needle.length;
  for (let i = 0; i < needle.length; i++) {
    const n = needle[i];
    const h = haystack[offset + i];
    // Parameterized segments match anything
    if (n.startsWith(':') || h.startsWith(':')) continue;
    if (n.startsWith('{') || h.startsWith('{')) continue;
    if (n.startsWith('[') || h.startsWith('[')) continue;
    if (n !== h) return false;
  }
  return true;
}

function normalizePath(p: string): string {
  return p
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\{[^}]+\}/g, ':param')
    .replace(/\[[^\]]+\]/g, ':param')
    .replace(/\/+/g, '/');
}

function computeRepoAffinity(repoA: string, repoB: string): number {
  const a = repoA.toLowerCase();
  const b = repoB.toLowerCase();
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function deduplicateEdges(edges: CrossRepoEdge[]): CrossRepoEdge[] {
  const seen = new Map<string, CrossRepoEdge>();
  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}|${edge.verb}`;
    const existing = seen.get(key);
    // Keep the highest confidence version
    if (!existing || (edge.confidence === 'high' && existing.confidence === 'medium')) {
      // Merge url_patterns
      if (existing && existing.attributes?.url_patterns && edge.attributes?.url_patterns) {
        const merged = [...new Set([...existing.attributes.url_patterns, ...edge.attributes.url_patterns])];
        edge.attributes.url_patterns = merged;
        edge.attributes.call_count = merged.length;
      }
      seen.set(key, edge);
    } else if (existing.attributes?.url_patterns && edge.attributes?.url_patterns) {
      // Same confidence - merge patterns
      const merged = [...new Set([...existing.attributes.url_patterns, ...edge.attributes.url_patterns])];
      existing.attributes.url_patterns = merged;
      existing.attributes.call_count = merged.length;
    }
  }
  return [...seen.values()];
}

// ============================================================
// Legacy infrastructure edges (kept for non-HTTP cross-repo edges)
// ============================================================

async function loadAllSlices(slicesDir: string): Promise<SliceDoc[]> {
  let files: string[];
  try {
    files = await globby('*.yaml', { cwd: slicesDir, absolute: true });
  } catch {
    return [];
  }
  const results: SliceDoc[] = [];

  for (const file of files) {
    try {
      const text = await fs.readFile(file, 'utf-8');
      const doc = yaml.load(text) as Record<string, unknown>;
      if (!doc || !doc.repo || !Array.isArray(doc.nodes)) continue;
      results.push({
        repo: doc.repo as string,
        nodes: doc.nodes as SliceDoc['nodes'],
        edges: (doc.edges as SliceDoc['edges']) ?? [],
      });
    } catch { /* skip */ }
  }

  return results;
}

function matchCrossRepoLambdaInvocations(
  slices: SliceDoc[],
  _stateDir: string,
): CrossRepoEdge[] {
  const edges: CrossRepoEdge[] = [];

  const lambdaNodes: Array<{ node: SliceDoc['nodes'][0]; repo: string }> = [];
  for (const slice of slices) {
    for (const node of slice.nodes) {
      if (node.type === 'Lambda') {
        lambdaNodes.push({ node, repo: slice.repo });
      }
    }
  }

  for (const slice of slices) {
    const hasLambdas = slice.nodes.some(n => n.type === 'Lambda');
    if (hasLambdas) continue;

    const serviceNode = slice.nodes.find(n => n.type === 'Service');
    if (!serviceNode) continue;

    for (const { node: lambdaNode, repo: lambdaRepo } of lambdaNodes) {
      if (lambdaRepo === slice.repo) continue;

      const commonPrefix = findCommonPrefix(slice.repo, lambdaRepo);
      if (commonPrefix.length >= 10) {
        const lambdaName = lambdaNode.name.split(':').pop() ?? '';
        const paramEvidence = findParameterEvidence(slice, lambdaName);

        if (paramEvidence) {
          edges.push({
            from: serviceNode.id,
            to: lambdaNode.id,
            verb: 'invokes',
            confidence: 'medium',
            provenance: {
              source_repo: slice.repo,
              target_repo: lambdaRepo,
              evidence: paramEvidence,
            },
          });
        }
      }
    }
  }

  return edges;
}

function findCommonPrefix(a: string, b: string): string {
  let i = 0;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  while (i < aLower.length && i < bLower.length && aLower[i] === bLower[i]) i++;
  return a.substring(0, i);
}

function findParameterEvidence(slice: SliceDoc, lambdaName: string): string | null {
  for (const node of slice.nodes) {
    const attrs = node.attributes ?? {};
    const cfnType = String(attrs.cfn_type ?? '');
    if (cfnType.includes('ECS') || cfnType.includes('Fargate')) {
      return `ECS service in same system as ${lambdaName} (shared prefix)`;
    }
  }
  return null;
}

async function matchSharedEventChannels(
  stateDir: string,
  slices: SliceDoc[],
): Promise<CrossRepoEdge[]> {
  const edges: CrossRepoEdge[] = [];

  const topicsByRepo = new Map<string, Array<{ node: SliceDoc['nodes'][0]; repo: string }>>();

  for (const slice of slices) {
    for (const node of slice.nodes) {
      if (node.type === 'Topic' || node.type === 'Queue') {
        const existing = topicsByRepo.get(node.type) ?? [];
        existing.push({ node, repo: slice.repo });
        topicsByRepo.set(node.type, existing);
      }
    }
  }

  for (const slice of slices) {
    const repoTriggerDir = path.join(stateDir, slice.repo, 'infrastructure', 'triggers');
    try {
      const files = await globby('*.yaml', { cwd: repoTriggerDir, absolute: true });
      for (const file of files) {
        try {
          const text = await fs.readFile(file, 'utf-8');
          const doc = yaml.load(text) as Record<string, unknown>;
          if (!doc) continue;
          const sliceData = doc._slice as Record<string, unknown> | undefined;
          const element = doc.element as Record<string, unknown> | undefined;
          if (!sliceData || !element) continue;
          if (String(sliceData.domain) !== 'infrastructure' || String(sliceData.type) !== 'trigger') continue;

          const triggerType = String(element.triggerType ?? '');
          const sourceType = String(element.sourceType ?? '').toLowerCase();

          if (triggerType === 'scheduled_event') {
            const targetRef = String(element.targetRef ?? '');
            if (!targetRef) continue;

            for (const otherSlice of slices) {
              if (otherSlice.repo === slice.repo) continue;
              const matchingNode = otherSlice.nodes.find(n =>
                n.id.toLowerCase().includes(normalizeToken(targetRef)),
              );
              if (matchingNode) {
                const sourceService = `Service:${normalizeToken(slice.repo)}`;
                edges.push({
                  from: sourceService,
                  to: matchingNode.id,
                  verb: 'triggers',
                  confidence: 'medium',
                  provenance: {
                    source_repo: slice.repo,
                    target_repo: otherSlice.repo,
                    evidence: `EventBridge scheduled event targets ${targetRef}`,
                  },
                });
              }
            }
          }

          if (sourceType.includes('sns') || sourceType.includes('sqs')) {
            const sourceRef = String(element.sourceRef ?? '');
            if (!sourceRef) continue;

            const channelType = sourceType.includes('sns') ? 'Topic' : 'Queue';
            const channels = topicsByRepo.get(channelType) ?? [];

            for (const channel of channels) {
              if (channel.repo === slice.repo) continue;
              const channelName = channel.node.name.toLowerCase();
              const sourceRefNorm = normalizeToken(sourceRef);

              if (channelName.includes(sourceRefNorm) || sourceRefNorm.includes(normalizeToken(channel.node.name.split(':').pop() ?? ''))) {
                const subscriberService = `Service:${normalizeToken(slice.repo)}`;
                edges.push({
                  from: channel.node.id,
                  to: subscriberService,
                  verb: 'publishes_to',
                  confidence: 'medium',
                  provenance: {
                    source_repo: channel.repo,
                    target_repo: slice.repo,
                    evidence: `${channelType} ${channel.node.id} -> trigger in ${slice.repo}`,
                  },
                });
              }
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* no triggers dir */ }
  }

  return edges;
}

function normalizeToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Enrich slice files with bilateral references after edge resolution.
 * Writes `referenced_by` on endpoint slices and `references` on caller slices.
 * Uses atomic write pattern to avoid corrupting existing state.
 */
export async function enrichSlicesWithBacklinks(
  edges: CrossRepoEdge[],
  stateDir: string,
): Promise<{ enriched: number }> {
  let enriched = 0;
  const highEdges = edges.filter(e => e.confidence === 'high' && e.verb === 'calls');

  for (const edge of highEdges) {
    const sourceRepo = edge.provenance.source_repo;
    const targetRepo = edge.provenance.target_repo;

    // Enrich target endpoint slices with referenced_by
    const endpointsDir = path.join(stateDir, targetRepo, 'api', 'endpoints');
    try {
      const files = await globby('*.yaml', { cwd: endpointsDir, absolute: true });
      for (const file of files) {
        try {
          const text = await fs.readFile(file, 'utf-8');
          const doc = yaml.load(text) as Record<string, unknown>;
          if (!doc) continue;

          const slice = doc._slice as Record<string, unknown> | undefined;
          const element = doc.element as Record<string, unknown> | undefined;
          if (!slice || !element) continue;

          const method = String(element.method ?? '').toUpperCase();
          const ePath = String(element.path ?? '');
          const edgeTarget = `Endpoint:${targetRepo}:${method}:${ePath}`;

          if (edge.to !== edgeTarget) continue;

          // Add referenced_by entry
          const referencedBy = (slice.referenced_by as Array<Record<string, string>>) ?? [];
          const backlink = { repo: sourceRepo, edge_type: 'calls', from: edge.from };
          const alreadyExists = referencedBy.some(
            r => r.repo === backlink.repo && r.from === backlink.from,
          );
          if (!alreadyExists) {
            referencedBy.push(backlink);
            (slice as Record<string, unknown>).referenced_by = referencedBy;
            const updatedYaml = yaml.dump(doc, { lineWidth: 120, noRefs: true });
            const tmpFile = file + '.tmp';
            await fs.writeFile(tmpFile, updatedYaml, 'utf-8');
            await fs.rename(tmpFile, file);
            enriched++;
          }
          break;
        } catch { /* skip */ }
      }
    } catch { /* no endpoints dir */ }

    // Enrich source behavior/call_graph slices with references
    const callGraphDir = path.join(stateDir, sourceRepo, 'behavior', 'call_graph');
    try {
      const files = await globby('*.yaml', { cwd: callGraphDir, absolute: true });
      for (const file of files) {
        try {
          const text = await fs.readFile(file, 'utf-8');
          const doc = yaml.load(text) as Record<string, unknown>;
          if (!doc) continue;

          const slice = doc._slice as Record<string, unknown> | undefined;
          const element = doc.element as Record<string, unknown> | undefined;
          if (!slice || !element) continue;

          const httpCallsData = element.httpCalls as Array<{
            method: string; urlPattern: string; functionName: string;
          }> | undefined;
          if (!httpCallsData) continue;

          // Check if this slice contains the httpCall that matched
          const urlPatterns = edge.attributes?.url_patterns ?? [];
          const hasMatch = httpCallsData.some(c =>
            urlPatterns.some(p => normalizePath(c.urlPattern) === normalizePath(p)),
          );
          if (!hasMatch) continue;

          const references = (slice.references as Array<Record<string, string>>) ?? [];
          const ref = { repo: targetRepo, edge_type: 'calls', to: edge.to };
          const alreadyExists = references.some(
            r => r.repo === ref.repo && r.to === ref.to,
          );
          if (!alreadyExists) {
            references.push(ref);
            (slice as Record<string, unknown>).references = references;
            const updatedYaml = yaml.dump(doc, { lineWidth: 120, noRefs: true });
            const tmpFile = file + '.tmp';
            await fs.writeFile(tmpFile, updatedYaml, 'utf-8');
            await fs.rename(tmpFile, file);
            enriched++;
          }
          break;
        } catch { /* skip */ }
      }
    } catch { /* no call_graph dir */ }
  }

  return { enriched };
}

/**
 * Write cross-repo edges to workspace output.
 */
export async function writeCrossRepoEdges(
  edges: CrossRepoEdge[],
  outputDir: string,
): Promise<void> {
  if (edges.length === 0) return;

  const outputPath = path.join(outputDir, 'workspace-edges.yaml');
  const doc = {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    cross_repo_edges: edges,
  };
  await fs.writeFile(outputPath, yaml.dump(doc, { lineWidth: 120, noRefs: true }), 'utf-8');
  log(`[cross-repo-edges] Wrote ${edges.length} edges to ${outputPath}`);
}
