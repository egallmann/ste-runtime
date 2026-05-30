import { describe, expect, it } from 'vitest';

import {
  buildArchitectureEvidence,
  runArchitectureEvidenceCommand,
} from '../cli/evidence-command.js';
import { resolveArchitectureEvidenceFreshness } from '../cli/architecture-evidence-freshness.js';
import { loadArchitectureBundle } from '../discovery/architecture-bundle.js';
import { initConfig } from '../config/index.js';
import { executeRecon } from '../recon/index.js';
import { runSelfValidation } from '../recon/phases/self-validation.js';
import {
  ask,
  ConversationalQueryEngine,
  formatForAgent,
  formatForHuman,
} from '../rss/conversational-query.js';
import { search } from '../rss/rss-operations.js';
import { Watchdog } from '../watch/watchdog.js';
import {
  assembleCemBundle,
  deriveMvcBundle,
  validateMvcBundle,
} from '../workspace/cem-mvc.js';
import { blastRadiusWorkspace, componentIntegration, systemDependencies } from '../workspace/canned-queries.js';
import { compress } from '../workspace/compression.js';
import { emitMultiResProjections } from '../workspace/emit-multi-res-projections.js';
import { emitProjections } from '../workspace/emit-projections.js';
import {
  buildPerRepoConfig,
  discoverWorkspaceRoot,
  parseWorkspaceManifest,
  resolveRepoPath,
} from '../workspace/manifest.js';
import {
  assertMvcDefinitionContract,
  assertMvcSnapshotCandidateOnly,
  buildMvcSnapshotCandidate,
  canonicalMvcFingerprintInput,
} from '../workspace/mvc-evolution.js';
import { registerFamily } from '../workspace/projection-families.js';
import {
  toAdjacencyMatrix,
  toMermaid,
  toMermaidAtResolution,
  toTable,
  toTableAtResolution,
} from '../workspace/projections.js';
import { emitSourceLocatorRegistry } from '../workspace/source-locator-registry.js';
import { emitWorkspaceSlice } from '../workspace/slice-emitter.js';
import { validateSlice } from '../workspace/slice-schema.js';
import { normalizePortablePath, workspaceUri } from '../workspace/source-uri.js';
import { emitWorkspaceIndex } from '../workspace/workspace-index.js';
import { loadWorkspaceGraph } from '../workspace/workspace-graph-loader.js';
import { executeWorkspaceRecon } from '../workspace/workspace-recon.js';
import {
  ADR_ID_PATTERN,
  classAdrMetadata,
  expectAdrClaims,
  expectAdrSourceExists,
  functionAdrMetadata,
} from './provenance-test-helpers.js';

describe('attribution retrofit contract guards', () => {
  describe('Wave A — core retro', () => {
    it('ADR-L-0001: executeRecon', () => {
      expectAdrClaims(executeRecon, 'ADR-L-0001', ['INV-0002']);
    });

    it('ADR-L-0007 / ADR-L-0011: architecture evidence command boundary', () => {
      expectAdrClaims(resolveArchitectureEvidenceFreshness, 'ADR-L-0007');
      expectAdrClaims(buildArchitectureEvidence, 'ADR-L-0007');
      expectAdrClaims(buildArchitectureEvidence, 'ADR-L-0011');
      expectAdrClaims(runArchitectureEvidenceCommand, 'ADR-L-0011');
      expect(functionAdrMetadata(runArchitectureEvidenceCommand)).not.toContain('ADR-L-0007');
    });

    it('ADR-L-0006: conversational query interface', () => {
      expect(classAdrMetadata(ConversationalQueryEngine)).toContain('ADR-L-0006');
      expectAdrClaims(ConversationalQueryEngine.prototype.query, 'ADR-L-0006');
      expectAdrClaims(ask, 'ADR-L-0006');
      expectAdrClaims(formatForHuman, 'ADR-L-0006');
      expectAdrClaims(formatForAgent, 'ADR-L-0006');
    });

    it('ADR-L-0021: MVC evolution helpers', () => {
      expectAdrClaims(assertMvcDefinitionContract, 'ADR-L-0021', ['INV-0030']);
      expectAdrClaims(assertMvcSnapshotCandidateOnly, 'ADR-L-0021', ['INV-0031']);
      expectAdrClaims(buildMvcSnapshotCandidate, 'ADR-L-0021', ['INV-0031', 'INV-0032']);
      expectAdrClaims(canonicalMvcFingerprintInput, 'ADR-L-0021');
    });
  });

  describe('Wave B — workspace-recon cluster', () => {
    it('ADR-L-0009: workspace scope entry points', () => {
      expectAdrClaims(parseWorkspaceManifest, 'ADR-L-0009', ['INV-0014']);
      expectAdrClaims(buildPerRepoConfig, 'ADR-L-0009', ['INV-0014']);
      expectAdrClaims(resolveRepoPath, 'ADR-L-0009', ['INV-0014']);
      expectAdrClaims(emitWorkspaceIndex, 'ADR-L-0009', ['INV-0014']);
    });

    it('ADR-L-0017: workspace RECON orchestration', () => {
      const adrIds = functionAdrMetadata(executeWorkspaceRecon);
      expect(adrIds).toContain('ADR-L-0017');
      expect(adrIds).toContain('ADR-L-0009');
      expectAdrClaims(executeWorkspaceRecon, 'ADR-L-0017', ['INV-0019']);
    });

    it('ADR-L-0016: slice schema contract', () => {
      expectAdrClaims(emitWorkspaceSlice, 'ADR-L-0016', ['INV-0017', 'INV-0025']);
      expectAdrClaims(validateSlice, 'ADR-L-0016', ['INV-0017', 'INV-0018']);
    });

    it('ADR-L-0018: deterministic workspace graph queries', () => {
      expectAdrClaims(loadWorkspaceGraph, 'ADR-L-0018');
      expectAdrClaims(systemDependencies, 'ADR-L-0018', ['INV-0020']);
      expectAdrClaims(componentIntegration, 'ADR-L-0018', ['INV-0020']);
      expectAdrClaims(blastRadiusWorkspace, 'ADR-L-0018', ['INV-0020']);
      expectAdrClaims(emitProjections, 'ADR-L-0018', ['INV-0024']);
      expectAdrClaims(toMermaid, 'ADR-L-0018', ['INV-0021']);
      expectAdrClaims(toTable, 'ADR-L-0018', ['INV-0021']);
      expectAdrClaims(toAdjacencyMatrix, 'ADR-L-0018', ['INV-0021']);
    });

    it('ADR-L-0019: multi-resolution projections', () => {
      expectAdrClaims(compress, 'ADR-L-0019', ['INV-0023']);
      expectAdrClaims(emitMultiResProjections, 'ADR-L-0019', ['INV-0022', 'INV-0024']);
      expectAdrClaims(toMermaidAtResolution, 'ADR-L-0019', ['INV-0021', 'INV-0022']);
      expectAdrClaims(toTableAtResolution, 'ADR-L-0019', ['INV-0021', 'INV-0022']);
      expectAdrClaims(registerFamily, 'ADR-L-0019');
    });

    it('ADR-L-0015: workspace agnosticism', () => {
      expectAdrClaims(discoverWorkspaceRoot, 'ADR-L-0015', ['INV-0015']);
    });
  });

  describe('Wave C — scale and negative space', () => {
    it('ADR-L-0020: CEM/MVC and source locators', () => {
      expectAdrClaims(assembleCemBundle, 'ADR-L-0020', ['INV-0027', 'INV-0029']);
      expectAdrClaims(deriveMvcBundle, 'ADR-L-0020', ['INV-0028', 'INV-0029']);
      expectAdrClaims(validateMvcBundle, 'ADR-L-0020', ['INV-0028']);
      expectAdrClaims(emitSourceLocatorRegistry, 'ADR-L-0020', ['INV-0027', 'INV-0029']);
    });

    it('ADR-L-0013: path portability', () => {
      expectAdrClaims(normalizePortablePath, 'ADR-L-0013');
      expectAdrClaims(workspaceUri, 'ADR-L-0013');
    });

    it('ADR-L-0010: bootstrap init', () => {
      expectAdrClaims(initConfig, 'ADR-L-0010');
    });

    it('ADR-L-0012: polyglot schema consumption', () => {
      expectAdrClaims(loadArchitectureBundle, 'ADR-L-0012');
    });

    it('ADR-L-0002: RECON self-validation', () => {
      expectAdrClaims(runSelfValidation, 'ADR-L-0002');
    });

    it('ADR-L-0004: watchdog workspace boundary', () => {
      expect(classAdrMetadata(Watchdog)).toContain('ADR-L-0004');
    });

    it('documents negative-space surfaces without ADR-L claims', () => {
      expect(functionAdrMetadata(search)).toEqual([]);
      expect(functionAdrMetadata(search).every(id => ADR_ID_PATTERN.test(id))).toBe(true);
    });
  });

  describe('ADR source anchors', () => {
    it('Wave A+B sample ADRs exist on disk', async () => {
      await expectAdrSourceExists(
        'ADR-L-0007',
        'adrs/logical/ADR-L-0007-graph-freshness-and-obligation-projection-semantics.yaml',
      );
      await expectAdrSourceExists(
        'ADR-L-0011',
        'adrs/logical/ADR-L-0011-adapter-role-conformance.yaml',
      );
      await expectAdrSourceExists(
        'ADR-L-0018',
        'adrs/logical/ADR-L-0018-deterministic-workspace-graph-queries.yaml',
      );
    });
  });
});
