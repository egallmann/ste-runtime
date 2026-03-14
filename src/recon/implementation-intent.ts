import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import type { NormalizedAssertion } from './phases/index.js';

export interface ImplementationIntent {
  implements_adrs: string[];
  enforced_invariants: string[];
  confidence: 'declared';
  source: 'decorator' | 'metadata';
}

interface ImplementationAttributionRecord {
  implementation_entity_id: string;
  implementation_entity_type:
    | 'function'
    | 'class'
    | 'module'
    | 'service'
    | 'workflow'
    | 'infrastructure_template'
    | 'configuration_file'
    | 'schema_definition'
    | 'pipeline'
    | 'script'
    | 'data_model';
  attributed_adrs: string[];
  enforced_invariants: string[];
  provenance: {
    source_file: string;
    extractor: string;
    commit: null;
  };
  metadata: Record<string, unknown>;
}

interface ImplementationAttributionEvidence {
  schema_version: '1.0';
  type: 'implementation_attribution_evidence';
  records: ImplementationAttributionRecord[];
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function normalizeImplementationIntent(
  value: unknown,
): ImplementationIntent | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const implementsAdrs = normalizeStringList(record.implements_adrs);
  const enforcedInvariants = normalizeStringList(record.enforced_invariants);
  const confidence = record.confidence === 'declared' ? 'declared' : undefined;
  const source =
    record.source === 'decorator' || record.source === 'metadata'
      ? record.source
      : undefined;

  if (!confidence || !source) {
    return undefined;
  }

  if (implementsAdrs.length === 0 && enforcedInvariants.length === 0) {
    return undefined;
  }

  return {
    implements_adrs: implementsAdrs,
    enforced_invariants: enforcedInvariants,
    confidence,
    source,
  };
}

function mapSliceTypeToEntityType(
  assertion: NormalizedAssertion,
): ImplementationAttributionRecord['implementation_entity_type'] | undefined {
  if (assertion._slice.domain === 'graph' && assertion._slice.type === 'function') {
    return 'function';
  }

  if (assertion._slice.domain === 'graph' && assertion._slice.type === 'class') {
    return 'class';
  }

  if (assertion._slice.domain === 'graph' && assertion._slice.type === 'module') {
    return 'module';
  }

  if (assertion._slice.domain === 'data' && assertion._slice.type === 'entity') {
    return 'data_model';
  }

  if (assertion._slice.domain === 'infrastructure' && assertion._slice.type === 'template') {
    return 'infrastructure_template';
  }

  return undefined;
}

export function collectImplementationAttributionEvidence(
  assertions: NormalizedAssertion[],
): ImplementationAttributionEvidence {
  const records: ImplementationAttributionRecord[] = [];

  for (const assertion of assertions) {
    const intent = normalizeImplementationIntent(assertion.element.implementation_intent);
    if (!intent) {
      continue;
    }

    const implementationEntityType = mapSliceTypeToEntityType(assertion);
    if (!implementationEntityType) {
      continue;
    }

    records.push({
      implementation_entity_id: String(assertion.element.id ?? assertion._slice.id),
      implementation_entity_type: implementationEntityType,
      attributed_adrs: intent.implements_adrs,
      enforced_invariants: intent.enforced_invariants,
      provenance: {
        source_file: assertion.provenance.file,
        extractor: assertion.provenance.extractor,
        commit: null,
      },
      metadata: {
        source: intent.source,
        confidence: intent.confidence,
        slice_id: assertion._slice.id,
      },
    });
  }

  records.sort((left, right) =>
    left.implementation_entity_id.localeCompare(right.implementation_entity_id),
  );

  return {
    schema_version: '1.0',
    type: 'implementation_attribution_evidence',
    records,
  };
}

export async function writeImplementationAttributionEvidence(
  stateDir: string,
  assertions: NormalizedAssertion[],
): Promise<void> {
  const evidence = collectImplementationAttributionEvidence(assertions);
  const attributionDir = path.join(stateDir, 'attribution');
  const targetPath = path.join(attributionDir, 'implementation-attribution-evidence.yaml');

  await fs.mkdir(attributionDir, { recursive: true });
  await fs.writeFile(
    targetPath,
    yaml.dump(evidence, {
      noRefs: true,
      lineWidth: -1,
      sortKeys: false,
    }),
    'utf-8',
  );
}
