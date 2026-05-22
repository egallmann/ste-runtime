/**
 * Projection family registry. Each family defines which resolution levels
 * it supports, which source query it draws from, optional compression
 * overrides, and a file-name pattern for emitted artifacts.
 */

import type { ResolutionLevel, ResolutionConfig } from './compression.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProjectionFamily {
  id: string;
  name: string;
  supportedLevels: ResolutionLevel[];
  sourceQuery: 'systemDependencies' | 'componentIntegration' | 'blastRadiusWorkspace';
  compressionOverrides?: Partial<ResolutionConfig>;
  fileNamePattern: (level: ResolutionLevel, repo?: string) => string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const families = new Map<string, ProjectionFamily>();

export function registerFamily(family: ProjectionFamily): void {
  families.set(family.id, family);
}

export function getFamily(id: string): ProjectionFamily | undefined {
  return families.get(id);
}

export function getAllFamilies(): ProjectionFamily[] {
  return [...families.values()];
}

// ---------------------------------------------------------------------------
// Built-in families
// ---------------------------------------------------------------------------

const architectureOverview: ProjectionFamily = {
  id: 'architecture-overview',
  name: 'Architecture Overview',
  supportedLevels: ['L0', 'L2'],
  sourceQuery: 'componentIntegration',
  fileNamePattern: (level, repo) =>
    repo
      ? `architecture-overview-${level}-${repo}.md`
      : `architecture-overview-${level}.md`,
};

const integrationTopology: ProjectionFamily = {
  id: 'integration-topology',
  name: 'Integration Topology',
  supportedLevels: ['L1', 'L2', 'L3'],
  sourceQuery: 'componentIntegration',
  fileNamePattern: (level, repo) =>
    repo
      ? `integration-topology-${level}-${repo}.md`
      : `integration-topology-${level}.md`,
};

const dependencyProjection: ProjectionFamily = {
  id: 'dependency-projection',
  name: 'Dependency Projection',
  supportedLevels: ['L0', 'L1'],
  sourceQuery: 'systemDependencies',
  fileNamePattern: (level) => `dependency-projection-${level}.md`,
};

const governanceProjection: ProjectionFamily = {
  id: 'governance-projection',
  name: 'Governance Projection',
  supportedLevels: ['L0', 'L1'],
  sourceQuery: 'componentIntegration',
  compressionOverrides: {
    suppressAlarmTopics: true,
  },
  fileNamePattern: (level) => `governance-projection-${level}.md`,
};

const runtimeProjection: ProjectionFamily = {
  id: 'runtime-projection',
  name: 'Runtime Projection',
  supportedLevels: ['L1', 'L2'],
  sourceQuery: 'componentIntegration',
  fileNamePattern: (level, repo) =>
    repo
      ? `runtime-projection-${level}-${repo}.md`
      : `runtime-projection-${level}.md`,
};

// Register built-in families
registerFamily(architectureOverview);
registerFamily(integrationTopology);
registerFamily(dependencyProjection);
registerFamily(governanceProjection);
registerFamily(runtimeProjection);
