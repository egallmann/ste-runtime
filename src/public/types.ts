export type WorkspaceId = string & { readonly __workspaceId: unique symbol };
export type RepositoryId = string & { readonly __repositoryId: unique symbol };
export type SnapshotId = string & { readonly __snapshotId: unique symbol };
export type DefinitionRevision = string & { readonly __definitionRevision: unique symbol };

export interface LocalRepositorySource {
  readonly kind: 'local';
  readonly path: string;
}

export interface RepositoryDisplayMetadata {
  readonly name?: string;
  readonly alias?: string;
}

export interface WorkspaceDisplayMetadata {
  readonly name?: string;
  readonly alias?: string;
}

export interface RepositoryDefinition {
  readonly repositoryId: RepositoryId;
  readonly source: LocalRepositorySource;
}

export interface WorkspaceDefinition {
  readonly repositories: readonly RepositoryDefinition[];
}

export interface RegisteredRepositoryMetadata {
  readonly repositoryId: RepositoryId;
  readonly display?: RepositoryDisplayMetadata;
}

export interface WorkspaceRegistration {
  readonly workspaceId: WorkspaceId;
  readonly definition: WorkspaceDefinition;
  readonly definitionRevision: DefinitionRevision;
  readonly display?: WorkspaceDisplayMetadata;
  readonly repositories: readonly RegisteredRepositoryMetadata[];
}

export interface CreateRepositoryInput {
  readonly source: LocalRepositorySource;
  readonly display?: RepositoryDisplayMetadata;
}

export interface CreateRegistrationInput {
  readonly repositories: readonly CreateRepositoryInput[];
  readonly display?: WorkspaceDisplayMetadata;
}

export interface RetainedRepositoryInput {
  readonly repositoryId: RepositoryId;
  readonly source: LocalRepositorySource;
  readonly display?: RepositoryDisplayMetadata;
}

export interface ReviseRegistrationInput {
  readonly retain: readonly RetainedRepositoryInput[];
  readonly add: readonly CreateRepositoryInput[];
  readonly remove: readonly RepositoryId[];
  readonly display?: WorkspaceDisplayMetadata;
}

/**
 * Opaque identity for a node in one immutable graph projection.
 * Legacy node IDs are projection keys, not durable source/entity identity.
 */
export interface GraphNodeRef {
  readonly workspaceId: WorkspaceId;
  readonly snapshotId: SnapshotId;
  readonly nodeId: string;
}

export interface SourceProvenance {
  readonly repositoryId: RepositoryId;
  readonly sourceLocator?: string;
}

export interface EntityProvenance {
  readonly snapshotId: SnapshotId;
  readonly sources: readonly SourceProvenance[];
}

export interface RelationshipProvenance {
  readonly snapshotId: SnapshotId;
  readonly sources: readonly SourceProvenance[];
  readonly evidence?: string;
}

export interface GraphNode {
  readonly ref: GraphNodeRef;
  readonly type: string;
  readonly name: string;
  readonly provenance: EntityProvenance;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface GraphRelationship {
  readonly source: GraphNodeRef;
  readonly target: GraphNodeRef;
  readonly verb: string;
  readonly provenance: RelationshipProvenance;
}

export interface TraversalOptions {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

export interface GraphProjection {
  readonly nodes: readonly GraphNode[];
  readonly relationships: readonly GraphRelationship[];
  readonly getNode: (ref: GraphNodeRef) => GraphNode | undefined;
  readonly traverse: (start: GraphNodeRef, options?: TraversalOptions) => readonly GraphNodeRef[];
}

export type RepositoryObservationStatus = 'observed' | 'orphaned' | 'unavailable';

export interface RepositoryObservation {
  readonly repositoryId: RepositoryId;
  readonly status: RepositoryObservationStatus;
  readonly sourceFingerprint?: string;
  readonly diagnostic?: string;
}

export interface RuntimeDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly repositoryIds?: readonly RepositoryId[];
}

export interface RuntimeSnapshot {
  readonly snapshotId: SnapshotId;
  readonly workspaceId: WorkspaceId;
  readonly definitionRevision: DefinitionRevision;
  readonly status: 'complete' | 'partial';
  readonly observationFingerprint: string;
  readonly observedAt: string;
  readonly runtimeContractVersion: string;
  readonly extractorVersions?: readonly string[];
  readonly repositoryObservations: readonly RepositoryObservation[];
  readonly graph: GraphProjection;
  readonly diagnostics: readonly RuntimeDiagnostic[];
}

export interface WorkspaceHandle {
  readonly registration: WorkspaceRegistration;
  refresh(): Promise<RuntimeSnapshot>;
}

export interface RuntimeCapabilityManifest {
  readonly contractVersion: string;
  readonly mechanical: true;
  readonly supportedSourceKinds: readonly ['local'];
  readonly federation: false;
}

export interface Runtime {
  createRegistration(input: CreateRegistrationInput): Promise<WorkspaceRegistration>;
  reviseRegistration(
    registration: WorkspaceRegistration,
    input: ReviseRegistrationInput,
  ): Promise<WorkspaceRegistration>;
  open(registration: WorkspaceRegistration): Promise<WorkspaceHandle>;
  capabilities(): RuntimeCapabilityManifest;
  close(): Promise<void>;
}
