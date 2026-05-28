import { promises as fs } from 'node:fs';
import path from 'node:path';

import { architectureMerge, emptyReconSnapshot } from './architecture-merge.js';
import { assembleDiscoveryBundle } from './bundle.js';
import { buildManifestPayload } from './manifest.js';
import { runArchitecturePipeline } from './run-pipeline.js';
import { renderLegacyEntityRegistry, renderYamlDocument } from './yaml-render.js';

export interface CompileArchitectureOptions {
  scopeRoot: string;
  dryRun?: boolean;
  generatedAt?: Date;
}

export interface CompileArchitectureResult {
  success: boolean;
  written: string[];
  errors: string[];
}

function utcTimestamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function compileArchitecture(options: CompileArchitectureOptions): Promise<CompileArchitectureResult> {
  const scopeRoot = path.resolve(options.scopeRoot);
  const generatedAt = options.generatedAt ?? new Date();
  const written: string[] = [];
  const errors: string[] = [];

  try {
    const adrModel = await runArchitecturePipeline({ scopeRoot, generatedAt });
    const merged = architectureMerge(adrModel, emptyReconSnapshot);
    const bundle = assembleDiscoveryBundle(merged);

    const outputs: Array<[string, string]> = [
      ['adrs/index/architecture-index.yaml', renderYamlDocument(bundle.architectureIndex)],
      ['adrs/index/entity-registry.yaml', renderYamlDocument(bundle.entityRegistry)],
      ['adrs/index/relationship-registry.yaml', renderYamlDocument(bundle.relationshipRegistry)],
      ['adrs/index/unresolved-registry.yaml', renderYamlDocument(bundle.unresolvedRegistry)],
      ['adrs/index/decision-registry.yaml', renderYamlDocument(bundle.decisionRegistry)],
      ['adrs/index/capability-registry.yaml', renderYamlDocument(bundle.capabilityRegistry)],
      ['adrs/index/invariant-registry.yaml', renderYamlDocument(bundle.invariantRegistry)],
      ['adrs/index/component-registry.yaml', renderYamlDocument(bundle.componentRegistry)],
      ['adrs/index/system-registry.yaml', renderYamlDocument(bundle.systemRegistry)],
      ['adrs/index/rule-registry.yaml', renderYamlDocument(bundle.ruleRegistry)],
      [
        'adrs/entities/registry.yaml',
        renderLegacyEntityRegistry(renderYamlDocument(bundle.legacyEntityRegistry)),
      ],
      ['adrs/manifest.yaml', renderYamlDocument(buildManifestPayload(merged, utcTimestamp(generatedAt), scopeRoot))],
    ];

    if (!options.dryRun) {
      for (const [rel, content] of outputs) {
        const abs = path.join(scopeRoot, rel);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, content, 'utf8');
        written.push(rel);
      }
    }

    return { success: true, written, errors };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    errors.push(message);
    return { success: false, written, errors };
  }
}
