import process from 'node:process';

import {
  resolveArchitectureEvidenceFreshness,
  type ArchitectureEvidenceFreshnessStatus,
} from './architecture-evidence-freshness.js';
import { loadArchitectureBundle, type ArchitectureBundleResult } from '../discovery/architecture-bundle.js';

export type ArchitectureEvidenceVersion = '2';

export interface ArchitectureEvidence {
  version: ArchitectureEvidenceVersion;
  subjects: Array<{
    kind: 'system';
    id: string;
    effect: 'validates';
  }>;
  bundle: {
    status: ArchitectureBundleResult['status'];
    warnings: string[];
    errors: string[];
    manifest?: {
      generatedDate?: string;
    };
    index?: {
      generatedAt?: string;
    };
  };
  freshness: {
    status: ArchitectureEvidenceFreshnessStatus;
    lastReconciled?: string;
  };
}

export type { ArchitectureEvidenceFreshnessStatus } from './architecture-evidence-freshness.js';

export interface ArchitectureEvidenceCommandIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface ArchitectureEvidenceCommandDependencies {
  loadBundle(projectRoot: string): Promise<ArchitectureBundleResult>;
  resolveFreshness(
    projectRoot: string,
    bundle: ArchitectureBundleResult,
  ): Promise<{
    status: ArchitectureEvidenceFreshnessStatus;
    lastReconciled?: string;
    warnings: string[];
    errors: string[];
  }>;
}

const defaultIo: ArchitectureEvidenceCommandIo = {
  stdout(message: string) {
    process.stdout.write(message);
  },
  stderr(message: string) {
    process.stderr.write(message);
  },
};

export async function buildArchitectureEvidence(
  projectRoot: string,
  bundle: ArchitectureBundleResult,
  dependencies: Pick<ArchitectureEvidenceCommandDependencies, 'resolveFreshness'> = {
    resolveFreshness: resolveArchitectureEvidenceFreshness,
  },
): Promise<ArchitectureEvidence> {
  const freshness = await dependencies.resolveFreshness(projectRoot, bundle);

  return {
    version: '2',
    subjects: [
      {
        kind: 'system',
        id: bundle.scopeRoot,
        effect: 'validates',
      },
    ],
    bundle: {
      status: bundle.status,
      warnings: [...bundle.warnings, ...freshness.warnings],
      errors: [...bundle.errors, ...freshness.errors],
      manifest: bundle.manifest.generatedDate
        ? { generatedDate: bundle.manifest.generatedDate }
        : undefined,
      index: bundle.index.generatedAt
        ? { generatedAt: bundle.index.generatedAt }
        : undefined,
    },
    freshness: {
      status: freshness.status,
      lastReconciled: freshness.lastReconciled,
    },
  };
}

export async function runArchitectureEvidenceCommand(
  projectRoot: string,
  io: ArchitectureEvidenceCommandIo = defaultIo,
  dependencies: ArchitectureEvidenceCommandDependencies = {
    loadBundle: loadArchitectureBundle,
    resolveFreshness: resolveArchitectureEvidenceFreshness,
  },
): Promise<number> {
  try {
    const bundle = await dependencies.loadBundle(projectRoot);
    const evidence = await buildArchitectureEvidence(projectRoot, bundle, dependencies);
    io.stdout(`${JSON.stringify(evidence, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    return 1;
  }
}
