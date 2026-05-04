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
