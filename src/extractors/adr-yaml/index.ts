/**
 * ADR YAML Semantic Extractor
 *
 * Authority: ADR-PC-0011 (ADR YAML Semantic Extraction)
 *
 * Extracts ADR YAML source files into RawAssertions:
 * - ADR documents (logical, physical-system, physical-component)
 * - Invariants, decisions, capabilities
 * - Component specifications, system boundaries
 */

import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import type { DiscoveredFile, RawAssertion } from '../../recon/phases/index.js';
import { toPosixPath } from '../../utils/paths.js';
import { warn } from '../../utils/logger.js';

const KNOWN_ADR_TYPES = new Set([
  'logical',
  'physical-system',
  'physical-component',
  'physical',
]);

interface AdrYaml {
  adr_type?: string;
  id?: string;
  title?: string;
  status?: string;
  domains?: string[];
  tags?: string[];
  related_adrs?: string[];
  supersedes?: string[];
  implements_logical?: string[];
  implements_system?: string[];
  invariants?: AdrInvariant[];
  decisions?: AdrDecision[];
  capabilities?: AdrCapability[];
  component_specifications?: AdrComponentSpec[];
  system_boundaries?: AdrSystemBoundary[];
  component_topology?: { components?: AdrTopologyComponent[] };
  context?: string;
  schema_version?: string;
  created_date?: string;
  authors?: string[];
  technologies?: string[];
  references_components?: string[];
}

interface AdrInvariant {
  id?: string;
  statement?: string;
  scope?: string;
  enforcement_level?: string;
  enforcement_mechanism?: string;
  verification_method?: string;
  rationale?: string;
  compliance_frameworks?: string[];
  exceptions?: string[];
}

interface AdrDecision {
  id?: string;
  statement?: string;
  rationale?: string;
  enables_capabilities?: string[];
  related_invariants?: string[];
  enforces_invariants?: string[];
  status?: string;
}

interface AdrCapability {
  id?: string;
  name?: string;
  description?: string;
  implemented_by_components?: string[];
}

interface AdrComponentSpec {
  id?: string;
  name?: string;
  type?: string;
  responsibilities?: string;
  interfaces?: unknown[];
  implementation_identifiers?: {
    module_path?: string;
    test_path?: string;
  };
  implementation_requirements?: Record<string, unknown>;
  generation_context?: Record<string, unknown>;
}

interface AdrSystemBoundary {
  id?: string;
  name?: string;
  description?: string;
  external_dependencies?: string[];
  exposed_interfaces?: string[];
}

interface AdrTopologyComponent {
  name?: string;
  type?: string;
  purpose?: string;
  implements_adr?: string;
}

/**
 * Extract semantic assertions from an ADR YAML file.
 *
 * Pattern follows src/extractors/json/json-extractor.ts:
 * - Read file, parse YAML
 * - Check adr_type discriminator
 * - Emit one RawAssertion per document + one per child entity
 */
export async function extractFromAdrYaml(file: DiscoveredFile): Promise<RawAssertion[]> {
  const normalizedPath = toPosixPath(file.relativePath);

  let content: string;
  try {
    content = await fs.readFile(file.path, 'utf-8');
  } catch (err) {
    warn(`[ADR YAML Extractor] Failed to read ${normalizedPath}: ${err}`);
    return [];
  }

  let parsed: AdrYaml;
  try {
    parsed = yaml.load(content) as AdrYaml;
  } catch (err) {
    warn(`[ADR YAML Extractor] Malformed YAML in ${normalizedPath}: ${err}`);
    return [];
  }

  if (!parsed || typeof parsed !== 'object') {
    warn(`[ADR YAML Extractor] Empty or non-object YAML in ${normalizedPath}`);
    return [];
  }

  const adrType = parsed.adr_type;
  if (!adrType) {
    warn(`[ADR YAML Extractor] Missing adr_type in ${normalizedPath}, skipping`);
    return [];
  }

  if (!KNOWN_ADR_TYPES.has(adrType)) {
    warn(`[ADR YAML Extractor] Unknown adr_type '${adrType}' in ${normalizedPath}, skipping`);
    return [];
  }

  const adrId = parsed.id;
  if (!adrId) {
    warn(`[ADR YAML Extractor] Missing id in ${normalizedPath}, skipping`);
    return [];
  }

  const assertions: RawAssertion[] = [];

  // Emit the ADR document assertion
  const frontmatter = buildFrontmatter(parsed);
  assertions.push({
    elementId: `adr:${adrId}`,
    elementType: 'adr_document',
    file: normalizedPath,
    line: 1,
    language: 'adr-yaml',
    metadata: {
      adr_id: adrId,
      title: parsed.title ?? '',
      adr_type: adrType,
      status: parsed.status ?? 'proposed',
      domains: parsed.domains ?? [],
      tags: parsed.tags ?? [],
      related_adrs: parsed.related_adrs ?? [],
      supersedes: parsed.supersedes ?? [],
      implements_logical: parsed.implements_logical ?? [],
      implements_system: parsed.implements_system ?? [],
      references_components: parsed.references_components ?? [],
      technologies: parsed.technologies ?? [],
      authors: parsed.authors ?? [],
      created_date: parsed.created_date ?? '',
      invariant_count: parsed.invariants?.length ?? 0,
      decision_count: parsed.decisions?.length ?? 0,
      capability_count: parsed.capabilities?.length ?? 0,
      component_count: parsed.component_specifications?.length ?? 0,
      system_boundary_count: parsed.system_boundaries?.length ?? 0,
    },
    source: frontmatter,
  });

  // Extract invariants (logical ADRs)
  if (Array.isArray(parsed.invariants)) {
    for (const inv of parsed.invariants) {
      if (!inv.id) continue;
      assertions.push({
        elementId: `invariant:${inv.id}`,
        elementType: 'adr_invariant',
        file: normalizedPath,
        line: findLineNumber(content, inv.id),
        language: 'adr-yaml',
        metadata: {
          invariant_id: inv.id,
          statement: inv.statement ?? '',
          scope: inv.scope ?? 'global',
          enforcement_level: inv.enforcement_level ?? 'must',
          enforcement_mechanism: inv.enforcement_mechanism ?? '',
          verification_method: inv.verification_method ?? '',
          rationale: inv.rationale ?? '',
          compliance_frameworks: inv.compliance_frameworks ?? [],
          exceptions: inv.exceptions ?? [],
          parent_adr: adrId,
          status: parsed.status ?? 'proposed',
        },
        source: yaml.dump(inv, { noRefs: true, lineWidth: -1 }),
      });
    }
  }

  // Extract decisions
  if (Array.isArray(parsed.decisions)) {
    for (const dec of parsed.decisions) {
      if (!dec.id) continue;
      assertions.push({
        elementId: `decision:${dec.id}`,
        elementType: 'adr_decision',
        file: normalizedPath,
        line: findLineNumber(content, dec.id),
        language: 'adr-yaml',
        metadata: {
          decision_id: dec.id,
          statement: dec.statement ?? '',
          rationale: dec.rationale ?? '',
          enables_capabilities: dec.enables_capabilities ?? [],
          related_invariants: dec.related_invariants ?? [],
          enforces_invariants: dec.enforces_invariants ?? [],
          parent_adr: adrId,
          status: dec.status ?? parsed.status ?? 'proposed',
        },
        source: yaml.dump(dec, { noRefs: true, lineWidth: -1 }),
      });
    }
  }

  // Extract capabilities
  if (Array.isArray(parsed.capabilities)) {
    for (const cap of parsed.capabilities) {
      if (!cap.id) continue;
      assertions.push({
        elementId: `capability:${cap.id}`,
        elementType: 'adr_capability',
        file: normalizedPath,
        line: findLineNumber(content, cap.id),
        language: 'adr-yaml',
        metadata: {
          capability_id: cap.id,
          name: cap.name ?? '',
          description: cap.description ?? '',
          implemented_by_components: cap.implemented_by_components ?? [],
          parent_adr: adrId,
        },
        source: yaml.dump(cap, { noRefs: true, lineWidth: -1 }),
      });
    }
  }

  // Extract component specifications (physical-component ADRs)
  if (Array.isArray(parsed.component_specifications)) {
    for (const comp of parsed.component_specifications) {
      if (!comp.id) continue;
      assertions.push({
        elementId: `component:${comp.id}`,
        elementType: 'adr_component',
        file: normalizedPath,
        line: findLineNumber(content, comp.id),
        language: 'adr-yaml',
        metadata: {
          component_id: comp.id,
          name: comp.name ?? '',
          type: comp.type ?? '',
          responsibilities: comp.responsibilities ?? '',
          module_path: comp.implementation_identifiers?.module_path ?? '',
          test_path: comp.implementation_identifiers?.test_path ?? '',
          parent_adr: adrId,
          implements_system: parsed.implements_system ?? [],
          implements_logical: parsed.implements_logical ?? [],
        },
        source: yaml.dump(comp, { noRefs: true, lineWidth: -1 }),
      });
    }
  }

  // Extract system boundaries (physical-system ADRs)
  if (Array.isArray(parsed.system_boundaries)) {
    for (const sys of parsed.system_boundaries) {
      if (!sys.id) continue;
      assertions.push({
        elementId: `system:${sys.id}`,
        elementType: 'adr_system',
        file: normalizedPath,
        line: findLineNumber(content, sys.id),
        language: 'adr-yaml',
        metadata: {
          system_id: sys.id,
          name: sys.name ?? '',
          description: sys.description ?? '',
          external_dependencies: sys.external_dependencies ?? [],
          exposed_interfaces: sys.exposed_interfaces ?? [],
          parent_adr: adrId,
          implements_logical: parsed.implements_logical ?? [],
        },
        source: yaml.dump(sys, { noRefs: true, lineWidth: -1 }),
      });
    }
  }

  return assertions;
}

function buildFrontmatter(parsed: AdrYaml): string {
  const fields: Record<string, unknown> = {
    id: parsed.id,
    title: parsed.title,
    status: parsed.status,
    adr_type: parsed.adr_type,
    domains: parsed.domains,
  };
  if (parsed.tags?.length) fields.tags = parsed.tags;
  if (parsed.related_adrs?.length) fields.related_adrs = parsed.related_adrs;
  if (parsed.implements_logical?.length) fields.implements_logical = parsed.implements_logical;
  if (parsed.implements_system?.length) fields.implements_system = parsed.implements_system;
  return yaml.dump(fields, { noRefs: true, lineWidth: -1 });
}

function findLineNumber(content: string, searchId: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchId)) {
      return i + 1;
    }
  }
  return 1;
}
