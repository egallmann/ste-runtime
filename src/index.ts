/**
 * ste-runtime
 *
 * Portable RECON, RSS, workspace-graph, and runtime-evidence implementation
 * for supervised AI-assisted development workflows.
 * 
 * ## For AI Coding Assistants (Cursor, Copilot, etc.)
 * 
 * A built source checkout provides programmatic access to the semantic graph.
 * Instead of using the CLI, local consumers can import and call the functions
 * directly:
 * 
 * ```typescript
 * import { initRssContext, search, blastRadius } from './dist/index.js';
 * 
 * const ctx = await initRssContext('.ste/state');
 * const results = search(ctx, 'user authentication');
 * const impact = blastRadius(ctx, results.nodes[0].key);
 * ```
 * 
 * See instructions/RSS-PROGRAMMATIC-API.md for current documentation. These
 * exports are documented for source-checkout use and do not create an npm
 * compatibility commitment while the package remains private and unpublished.
 * 
 * @module ste-runtime
 */

// ============================================================================
// RSS - Runtime State Slicing (semantic graph traversal)
// ============================================================================

export {
  // Core initialization
  initRssContext,
  
  // Direct retrieval
  lookup,
  lookupByKey,
  
  // Graph traversal
  dependencies,
  dependents,
  blastRadius,
  
  // Discovery
  search,
  byTag,
  findEntryPoints,
  
  // Context assembly
  assembleContext,
  
  // Statistics
  getGraphStats,
  
  // Hybrid workflow helpers (RSS + Grep)
  extractFilePaths,
  getRelevantFiles,
  
  // Graph validation and health
  validateBidirectionalEdges,
  findOrphanedNodes,
  findAllBrokenEdges,
  validateGraphHealth,
  
  // Types
  type RssContext,
  type RssQueryResult,
  type BrokenEdge,
  type BidirectionalInconsistency,
} from './rss/rss-operations.js';

export {
  // Graph data types
  type AidocNode,
  type AidocGraph,
  type AidocEdge,
  loadAidocGraph,
} from './rss/graph-loader.js';

// ============================================================================
// RECON - Semantic Extraction (optional - typically run via CLI)
// ============================================================================

// Note: RECON is primarily invoked via CLI (npm run recon:full)
// but the engine can be imported for programmatic use if needed.

export { executeRecon, type ReconOptions, type ReconResult } from './recon/index.js';

// ============================================================================
// CQI - Conversational Query Interface
// ============================================================================

export {
  // Engine for session-based queries (caches context)
  ConversationalQueryEngine,
  
  // Convenience function for one-off queries
  ask,
  
  // Output formatters
  formatForHuman,
  formatForAgent,
  
  // Types
  type ConversationalResponse,
  type QueryIntent,
  type NodeSummary,
} from './rss/conversational-query.js';

// ============================================================================
// Architecture Bundle Discovery
// ============================================================================

export {
  loadArchitectureBundle,
  type ArchitectureBundleArtifact,
  type ArchitectureBundleIndexSummary,
  type ArchitectureBundleManifestSummary,
  type ArchitectureBundleResult,
  type ArchitectureBundleStatus,
} from './discovery/architecture-bundle.js';

export {
  buildArchitectureEvidence,
  runArchitectureEvidenceCommand,
  deriveSubjectsFromBundle,
  type ArchitectureEvidence,
  type ArchitectureEvidenceFreshnessStatus,
  type ArchitectureEvidenceVersion,
  type EvidenceSubject,
  type EvidenceSubjectKind,
  type EvidenceSubjectEffect,
} from './cli/evidence-command.js';

// ============================================================================
// Workspace Graph Queries (non-LLM canned traversals)
// ============================================================================

export {
  loadWorkspaceGraph,
  systemDependencies,
  componentIntegration,
  blastRadiusWorkspace,
  toMermaid,
  toTable,
  toAdjacencyMatrix,
  type WorkspaceGraph,
  type WorkspaceNode,
  type WorkspaceEdge,
  type SystemDependencyResult,
  type RepoDependency,
  type ComponentIntegrationResult,
  type IntegrationGroup,
  type WorkspaceBlastRadiusResult,
  type BlastTier,
  type CannedQueryResult,
  type AdjacencyMatrixResult,
} from './workspace/index.js';

export {
  assertMvcDefinitionContract,
  assertMvcFederatedIdentity,
  assertMvcSnapshotCandidateOnly,
  buildMvcSnapshotCandidate,
  canonicalMvcFingerprintInput,
  recommendMvcDepthFromTopology,
  traverseMvcSFromLinkageSurface,
  traverseMvcSCandidates,
  type BuildMvcSnapshotInput,
  type MvcLinkageSurface,
  type MvcLinkageSurfaceRelationshipRecord,
  type MvcDepthRecommendation,
  type MvcDepthRecommendationInput,
  type MvcDefinition,
  type MvcNegativeSpace,
  type MvcRationale,
  type MvcRef,
  type MvcRefWithHash,
  type MvcSnapshot,
  type MvcTopologyMetrics,
  type MvcTraversalRelationshipRecord,
  type TraverseMvcSFromLinkageSurfaceInput,
  type TraverseMvcSCandidatesInput,
} from './workspace/mvc-evolution.js';

// ============================================================================
// Architecture compilation and runtime-owned evidence artifacts
// ============================================================================

export {
  compileArchitecture,
  runArchitecturePipeline,
  architectureMerge,
  emptyReconSnapshot,
  buildAdrGraph,
  assembleDiscoveryBundle,
  type CompileArchitectureOptions,
  type CompileArchitectureResult,
  type PipelineRunOptions,
  type ArchModelState,
  type AdrGraph,
  type ReconArchitectureSnapshot,
  type CompileDiagnostic,
  type DiscoveryBundle,
} from './architecture/index.js';
