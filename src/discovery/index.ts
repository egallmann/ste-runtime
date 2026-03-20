/**
 * Discovery Module
 * 
 * E-ADR-009: Self-Configuring Domain Discovery
 * 
 * Automatically discovers project structure and domains without requiring
 * manual configuration, enabling universal compatibility and zero-config adoption.
 */

export { 
  ProjectDiscovery,
  DomainType,
  type DiscoveredDomain,
  type ProjectStructure
} from './project-discovery.js';

export {
  loadArchitectureBundle,
  type ArchitectureBundleArtifact,
  type ArchitectureBundleIndexSummary,
  type ArchitectureBundleManifestSummary,
  type ArchitectureBundleResult,
  type ArchitectureBundleStatus,
} from './architecture-bundle.js';



