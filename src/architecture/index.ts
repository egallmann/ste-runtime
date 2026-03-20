export { compileArchitecture, type CompileArchitectureOptions, type CompileArchitectureResult } from './compile-architecture.js';
export { runArchitecturePipeline, type PipelineRunOptions } from './run-pipeline.js';
export { architectureMerge, emptyReconSnapshot } from './architecture-merge.js';
export { buildAdrGraph } from './adr-graph.js';
export { assembleDiscoveryBundle, type DiscoveryBundle } from './bundle.js';
export type {
  ArchModelState,
  AdrGraph,
  ReconArchitectureSnapshot,
  CompileDiagnostic,
} from './types.js';
