import process from 'node:process';

import { loadArchitectureBundle, type ArchitectureBundleResult } from '../discovery/architecture-bundle.js';

export type ArchitectureEvidenceVersion = '1';
export type ArchitectureEvidenceFreshnessStatus = 'current' | 'stale-unknown' | 'stale-confirmed';

export interface ArchitectureEvidence {
  version: ArchitectureEvidenceVersion;
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

export interface ArchitectureEvidenceCommandIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface ArchitectureEvidenceCommandDependencies {
  loadBundle(projectRoot: string): Promise<ArchitectureBundleResult>;
}

const defaultIo: ArchitectureEvidenceCommandIo = {
  stdout(message: string) {
    process.stdout.write(message);
  },
  stderr(message: string) {
    process.stderr.write(message);
  },
};

export function buildArchitectureEvidence(bundle: ArchitectureBundleResult): ArchitectureEvidence {
  const lastReconciled = bundle.index.generatedAt ?? bundle.manifest.generatedDate;

  return {
    version: '1',
    bundle: {
      status: bundle.status,
      warnings: [...bundle.warnings],
      errors: [...bundle.errors],
      manifest: bundle.manifest.generatedDate
        ? { generatedDate: bundle.manifest.generatedDate }
        : undefined,
      index: bundle.index.generatedAt
        ? { generatedAt: bundle.index.generatedAt }
        : undefined,
    },
    freshness: {
      status: 'stale-unknown',
      lastReconciled,
    },
  };
}

export async function runArchitectureEvidenceCommand(
  projectRoot: string,
  io: ArchitectureEvidenceCommandIo = defaultIo,
  dependencies: ArchitectureEvidenceCommandDependencies = {
    loadBundle: loadArchitectureBundle,
  },
): Promise<number> {
  try {
    const bundle = await dependencies.loadBundle(projectRoot);
    const evidence = buildArchitectureEvidence(bundle);
    io.stdout(`${JSON.stringify(evidence, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    return 1;
  }
}
