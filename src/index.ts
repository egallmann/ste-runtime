/**
 * STE Runtime - Semantic Truth Engine
 * 
 * Portable RECON and RSS implementation for AI-assisted development.
 * 
 * ## For AI Coding Assistants (Cursor, Copilot, etc.)
 * 
 * This package provides programmatic access to the semantic graph.
 * Instead of using the CLI, import and call the functions directly:
 * 
 * ```typescript
 * import { initRssContext, search, blastRadius } from 'ste-runtime';
 * 
 * const ctx = await initRssContext('.ste/state');
 * const results = search(ctx, 'user authentication');
 * const impact = blastRadius(ctx, results.nodes[0].key);
 * ```
 * 
 * See RSS-PROGRAMMATIC-API.md for full documentation.
 * 
 * @module ste-runtime
 */

// ============================================================================
// RSS - Reference State Service (Semantic Graph Traversal)
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
// CQI - Conversational Query Interface (E-ADR-010)
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
  assertMvcSnapshotCandidateOnly,
  buildMvcSnapshotCandidate,
  canonicalMvcFingerprintInput,
  type BuildMvcSnapshotInput,
  type MvcDefinition,
  type MvcNegativeSpace,
  type MvcRationale,
  type MvcRef,
  type MvcRefWithHash,
  type MvcSnapshot,
  type MvcTopologyMetrics,
} from './workspace/mvc-evolution.js';

// ============================================================================
// Architecture compiler (ADR → registries / index / manifest)
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
