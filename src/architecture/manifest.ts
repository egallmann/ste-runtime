import path from 'node:path';

import { asString, asStringArray, scopeRelativePath } from './support.js';
import type { ArchModelState } from './types.js';

function manifestTypeForClassification(kind: string): string {
  if (kind === 'physical-system') return 'physical-system';
  if (kind === 'physical-component') return 'physical-component';
  if (kind === 'physical') return 'physical';
  return 'logical';
}

export function buildManifestPayload(
  model: ArchModelState,
  generatedDate: string,
  scopeRoot: string,
): Record<string, unknown> {
  const adrs: Record<string, unknown>[] = [];
  const root = path.resolve(scopeRoot);

  for (const { adr, path: filePath } of model.logicalAdrs) {
    const id = asString(adr.id, 'adr.id');
    const decisions = Array.isArray(adr.decisions) ? adr.decisions.length : 0;
    const invs = Array.isArray(adr.invariants) ? adr.invariants.length : 0;
    const gaps = Array.isArray(adr.gaps) ? adr.gaps : [];
    let blocking = 0;
    for (const g of gaps) {
      if (g && typeof g === 'object' && (g as { blocking?: boolean }).blocking) blocking += 1;
    }
    const gov = (adr.governance as Record<string, unknown> | undefined) ?? {};
    adrs.push({
      id,
      type: 'logical',
      title: asString(adr.title, 'adr.title'),
      status: asString(adr.status, 'adr.status'),
      file_path: scopeRelativePath(root, filePath),
      domains: asStringArray(adr.domains),
      tags: asStringArray(adr.tags),
      implements_logical: [],
      technologies: [],
      decision_count: decisions,
      invariant_count: invs,
      gap_count: gaps.length,
      blocking_gaps: blocking,
      component_count: 0,
      implementation_authority: gov.implementation_authority,
      related_reviews: asStringArray(gov.related_reviews),
      related_overrides: asStringArray(gov.related_overrides),
      related_ledgers: [],
    });
  }

  for (const { adr, path: filePath, kind } of model.physicalAdrs) {
    const id = asString(adr.id, 'adr.id');
    const specs = Array.isArray(adr.component_specifications) ? adr.component_specifications.length : 0;
    const gov = (adr.governance as Record<string, unknown> | undefined) ?? {};
    adrs.push({
      id,
      type: manifestTypeForClassification(kind),
      title: asString(adr.title, 'adr.title'),
      status: asString(adr.status, 'adr.status'),
      file_path: scopeRelativePath(root, filePath),
      domains: asStringArray(adr.domains),
      tags: asStringArray(adr.tags),
      implements_logical: asStringArray(adr.implements_logical),
      technologies: asStringArray(adr.technologies),
      decision_count: 0,
      invariant_count: 0,
      gap_count: Array.isArray(adr.gaps) ? adr.gaps.length : 0,
      blocking_gaps: 0,
      component_count: kind === 'physical-component' ? specs : 0,
      implementation_authority: gov.implementation_authority,
      related_reviews: asStringArray(gov.related_reviews),
      related_overrides: asStringArray(gov.related_overrides),
      related_ledgers: [],
    });
  }

  adrs.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const totalGaps = adrs.reduce((n, a) => n + Number(a.gap_count ?? 0), 0);
  const blockingGaps = adrs.reduce((n, a) => n + Number(a.blocking_gaps ?? 0), 0);

  return {
    schema_version: '1.0',
    type: 'manifest',
    generated_date: generatedDate,
    generated_from: 'adrs/**/*.yaml',
    adrs,
    by_domain: {},
    by_status: {},
    by_technology: {},
    logical_to_physical_map: {},
    system_to_components_map: {},
    invariants: [],
    entities: [],
    requirements_snapshots: [],
    decision_ledgers: [],
    objection_overrides: [],
    steelman_reviews: [],
    gaps_summary: {
      total: totalGaps,
      blocking: blockingGaps,
      by_adr: {},
    },
    statistics: {
      total_adrs: adrs.length,
      logical_adrs: model.logicalAdrs.length,
      physical_adrs: model.physicalAdrs.filter((p) => p.kind === 'physical').length,
      physical_system_adrs: model.physicalAdrs.filter((p) => p.kind === 'physical-system').length,
      physical_component_adrs: model.physicalAdrs.filter((p) => p.kind === 'physical-component').length,
      decision_adrs: 0,
      total_decisions: model.logicalAdrs.reduce(
        (n, { adr }) => n + (Array.isArray(adr.decisions) ? adr.decisions.length : 0),
        0,
      ),
      total_invariants:
        model.logicalAdrs.reduce((n, { adr }) => n + (Array.isArray(adr.invariants) ? adr.invariants.length : 0), 0) +
        model.standaloneInvariants.length,
      total_components: model.physicalAdrs.reduce((n, { adr }) => {
        const specs = Array.isArray(adr.component_specifications) ? adr.component_specifications.length : 0;
        return n + specs;
      }, 0),
      total_gaps: totalGaps,
      blocking_gaps: blockingGaps,
      total_entities: 0,
      total_requirements_snapshots: 0,
      total_decision_ledgers: 0,
      total_objection_overrides: 0,
      total_steelman_reviews: 0,
    },
  };
}
