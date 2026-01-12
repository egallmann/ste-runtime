import { z } from 'zod';

export const sliceSchema = z
  .object({
    start: z.number().int().nonnegative().optional(),
    end: z.number().int().nonnegative().optional(),
  })
  .partial();

export const entryPointSchema = z.object({
    domain: z.string(),
    type: z.string(),
    id: z.string(),
    role: z.string().optional(),
    confidence: z.string().optional(),
  });

export const bundleNodeSchema = z.object({
    nodeId: z.string(),
    domain: z.string(),
    type: z.string(),
    id: z.string(),
    order: z.number().int().nonnegative(),
    depth: z.number().int().nonnegative(),
    path: z.string().optional(),
    slice: sliceSchema.nullable().optional(),
    tier: z.union([z.string(), z.number()]),
    confidence: z.number().min(0).max(1).nullable().optional(),
    edgeFrom: z.string().nullable().optional(),
    edgeType: z.string().nullable().optional(),
  });

export const rssBundleSchema = z.object({
    task: z.string(),
    graphVersion: z.string().optional(),
    entryPoints: z.array(entryPointSchema),
    depthLimit: z.number().int().nonnegative(),
    nodes: z.array(bundleNodeSchema),
  });

export type Slice = z.infer<typeof sliceSchema>;
export type EntryPoint = z.infer<typeof entryPointSchema>;
export type BundleNode = z.infer<typeof bundleNodeSchema>;
export type RssBundle = z.infer<typeof rssBundleSchema>;

export const DEFAULT_DEPTH_LIMIT = 2;
export const DEFAULT_GRAPH_VERSION = 'unknown';



