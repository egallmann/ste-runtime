/**
 * Zod schemas for workspace graph slice validation.
 *
 * Closed vocabularies are ported from the legacy workspace-graph schema to ensure parity.
 * Cross-repo verbs (calls, triggers, publishes_to) from workspace-edges.yaml
 * are included alongside the 9 existing slice verbs.
 *
 * Start in WARN mode: log unknown types/verbs but accept the slice.
 */
import { z } from 'zod';

import { enforces_invariant, implements_adr } from '../architecture/intent-decorators.js';

export const NODE_TYPES = [
  'Service',
  'Lambda',
  'StateMachine',
  'Queue',
  'Topic',
  'Bucket',
  'Database',
  'Schema',
  'Endpoint',
  'ExternalSystem',
  'Stack',
  'Distribution',
  'WebACL',
  'Certificate',
  'DNSRecord',
  'APIGateway',
  'SecurityGroup',
  'Secret',
  'DBCluster',
  'DBProxy',
  'LogGroup',
  'Alarm',
  'DeliveryStream',
  'EventRule',
  'Role',
  'InfraResource',
] as const;

export const EDGE_VERBS = [
  'invokes',
  'publishes',
  'consumes',
  'reads',
  'writes',
  'validates_against',
  'implements',
  'deploys_to',
  'has_contract',
  'calls',
  'triggers',
  'publishes_to',
  'contains',
] as const;

export type SliceNodeType = (typeof NODE_TYPES)[number];
export type SliceEdgeVerb = (typeof EDGE_VERBS)[number];

const ProvenanceSchema = z.object({
  source_path: z.string(),
  source_ref: z.string(),
  repo: z.string().optional(),
}).passthrough();

export const NodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  attributes: z.record(z.unknown()).optional(),
  provenance: ProvenanceSchema,
}).passthrough();

export const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  verb: z.string(),
  confidence: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
  provenance: ProvenanceSchema,
}).passthrough();

export const SliceSchema = z.object({
  schema_version: z.string(),
  repo: z.string(),
  generated_by: z.string(),
  generated_at: z.string(),
  source_commit: z.string().nullable().optional(),
  nodes: z.array(NodeSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  diagnostics: z.array(z.record(z.unknown())).optional(),
}).passthrough();

export interface SliceValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

const nodeTypeSet = new Set<string>(NODE_TYPES);
const edgeVerbSet = new Set<string>(EDGE_VERBS);

/**
 * Validate a parsed slice document. In warn mode (default), unknown types/verbs
 * produce warnings but the slice is accepted. In reject mode, they produce errors.
 */
export const validateSlice: (
  doc: unknown,
  mode?: 'warn' | 'reject',
) => SliceValidationResult = implements_adr(
  'ADR-L-0016',
)(enforces_invariant('INV-0017', 'INV-0018')(function validateSlice(
  doc: unknown,
  mode: 'warn' | 'reject' = 'warn',
): SliceValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const parseResult = SliceSchema.safeParse(doc);
  if (!parseResult.success) {
    return {
      valid: false,
      warnings,
      errors: parseResult.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    };
  }

  const slice = parseResult.data;

  for (const node of slice.nodes) {
    if (!nodeTypeSet.has(node.type)) {
      const msg = `Unknown node type '${node.type}' on node '${node.id}'`;
      if (mode === 'reject') {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  for (const edge of slice.edges) {
    if (!edgeVerbSet.has(edge.verb)) {
      const msg = `Unknown edge verb '${edge.verb}' on edge '${edge.from}' -> '${edge.to}'`;
      if (mode === 'reject') {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}));
