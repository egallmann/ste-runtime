export {
  WorkspaceManifestSchema,
  RepoEntrySchema,
  parseWorkspaceManifest,
  resolveRepoPath,
  mapRepoLang,
  buildPerRepoConfig,
  type WorkspaceManifest,
  type RepoEntry,
  type ParsedWorkspaceLocation,
} from './manifest.js';

export {
  executeWorkspaceRecon,
  type WorkspaceReconOptions,
  type WorkspaceReconResult,
  type RepoResult,
} from './workspace-recon.js';

export { emitWorkspaceSlice, type SliceEmitResult } from './slice-emitter.js';

export { emitWorkspaceIndex, type RepoIndexEntry, type RepoIndexError } from './workspace-index.js';

export {
  loadWorkspaceGraph,
  type WorkspaceNode,
  type WorkspaceEdge,
  type WorkspaceGraph,
} from './workspace-graph-loader.js';

export {
  systemDependencies,
  componentIntegration,
  blastRadiusWorkspace,
  type RepoDependency,
  type SystemDependencyResult,
  type IntegrationGroup,
  type ComponentIntegrationResult,
  type BlastTier,
  type WorkspaceBlastRadiusResult,
  type CannedQueryResult,
} from './canned-queries.js';

export {
  toMermaid,
  toTable,
  toAdjacencyMatrix,
  toMermaidAtResolution,
  toTableAtResolution,
  navigationBar,
  type AdjacencyMatrixResult,
} from './projections.js';

export {
  emitProjections,
  type ProjectionEmitResult,
} from './emit-projections.js';

export {
  compress,
  defaultResolutionConfig,
  extractCapabilityDomain,
  type ResolutionLevel,
  type ResolutionConfig,
  type CompressedProjection,
  type CompressedNode,
  type CompressedEdge,
  type NodeGroup,
  type ProjectionMetadata,
} from './compression.js';

export {
  emitMultiResProjections,
  type MultiResEmitResult,
} from './emit-multi-res-projections.js';

export {
  registerFamily,
  getFamily,
  getAllFamilies,
  type ProjectionFamily,
} from './projection-families.js';
