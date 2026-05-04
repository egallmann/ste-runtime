import process from 'node:process';

import {
  resolveArchitectureEvidenceFreshness,
  type ArchitectureEvidenceFreshnessStatus,
} from './architecture-evidence-freshness.js';
import { loadArchitectureBundle, type ArchitectureBundleResult } from '../discovery/architecture-bundle.js';

export type ArchitectureEvidenceVersion = '2';

export type EvidenceSubjectKind =
  | 'adr_l'
  | 'adr_ps'
  | 'adr_pc'
  | 'requirement'
  | 'invariant'
  | 'rule'
  | 'system'
  | 'component';

export type EvidenceSubjectEffect = 'validates' | 'invalidates';

export interface EvidenceSubject {
  kind: EvidenceSubjectKind;
  id: string;
  effect: EvidenceSubjectEffect;
}

export interface ArchitectureEvidence {
  version: ArchitectureEvidenceVersion;
  subjects: EvidenceSubject[];
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
  subjects: EvidenceSubject[],
  dependencies: Pick<ArchitectureEvidenceCommandDependencies, 'resolveFreshness'> = {
    resolveFreshness: resolveArchitectureEvidenceFreshness,
  },
): Promise<ArchitectureEvidence> {
  const freshness = await dependencies.resolveFreshness(projectRoot, bundle);

  return {
    version: '2',
    subjects,
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

const ADR_ID_PATTERN = /^ADR-(L|PS|PC)-\d+/;

const ADR_KIND_MAP: Record<string, EvidenceSubjectKind> = {
  L: 'adr_l',
  PS: 'adr_ps',
  PC: 'adr_pc',
};

/**
 * Derives subjects from the bundle manifest's ADR list.
 * Each recognized ADR ID becomes a "validates" subject when the bundle is
 * valid/degraded, or "invalidates" when the bundle is invalid.
 */
export function deriveSubjectsFromBundle(bundle: ArchitectureBundleResult): EvidenceSubject[] {
  const effect: EvidenceSubjectEffect = bundle.status === 'invalid' ? 'invalidates' : 'validates';
  const manifestData = bundle.requiredArtifacts.manifest.data as Record<string, unknown> | undefined;
  if (!manifestData) return [];

  const adrs = manifestData.adrs;
  if (!Array.isArray(adrs)) return [];

  const subjects: EvidenceSubject[] = [];
  for (const entry of adrs) {
    const id = typeof entry === 'object' && entry !== null && 'id' in entry
      ? String((entry as Record<string, unknown>).id)
      : typeof entry === 'string' ? entry : null;
    if (!id) continue;

    const match = ADR_ID_PATTERN.exec(id);
    if (!match) continue;

    const kind = ADR_KIND_MAP[match[1]];
    if (kind) {
      subjects.push({ kind, id, effect });
    }
  }
  return subjects;
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
    const subjects = deriveSubjectsFromBundle(bundle);
    const evidence = await buildArchitectureEvidence(projectRoot, bundle, subjects, dependencies);
    io.stdout(`${JSON.stringify(evidence, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    return 1;
  }
}
