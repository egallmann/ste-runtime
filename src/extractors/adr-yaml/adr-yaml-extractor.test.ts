/**
 * Tests for ADR YAML Semantic Extractor
 * Per ADR-PC-0011: ADR YAML Semantic Extraction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractFromAdrYaml } from './index.js';
import type { DiscoveredFile } from '../../recon/phases/index.js';
import * as fs from 'node:fs/promises';
import * as logger from '../../utils/logger.js';

vi.mock('node:fs/promises');
vi.mock('../../utils/logger.js', () => ({
  warn: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
}));

function adrFile(relativePath: string): DiscoveredFile {
  return {
    path: `/test/${relativePath}`,
    relativePath,
    language: 'adr-yaml',
    changeType: 'unchanged',
  };
}

describe('extractFromAdrYaml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Logical ADR with invariants and decisions', () => {
    it('should extract ADR document plus child invariants and decisions', async () => {
      const file = adrFile('adrs/logical/ADR-L-0001-test.yaml');
      const content = `
schema_version: '1.0'
adr_type: logical
id: ADR-L-0001
title: Test Logical ADR
status: accepted
created_date: '2026-01-01'
authors:
  - test.author
domains:
  - recon
  - architecture
tags:
  - recon
  - test
related_adrs:
  - ADR-L-0002
supersedes: []
context: Some context here
invariants:
  - id: INV-0001
    statement: 'Single repository only'
    scope: global
    enforcement_level: must
    enforcement_mechanism: design
    verification_method: manual
    rationale: Test rationale
    compliance_frameworks: []
    exceptions: []
  - id: INV-0002
    statement: 'Incremental reconciliation'
    scope: global
    enforcement_level: must
    enforcement_mechanism: design
    verification_method: manual
    rationale: Test rationale 2
    compliance_frameworks: []
    exceptions: []
decisions:
  - id: DEC-0001
    statement: 'Use provisional mode'
    rationale: 'Allows iteration'
    enables_capabilities: []
    related_invariants:
      - INV-0001
capabilities: []
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      // 1 ADR document + 2 invariants + 1 decision = 4
      expect(assertions).toHaveLength(4);

      // ADR document
      const adr = assertions.find(a => a.elementType === 'adr_document');
      expect(adr).toBeDefined();
      expect(adr!.elementId).toBe('adr:ADR-L-0001');
      expect(adr!.metadata.title).toBe('Test Logical ADR');
      expect(adr!.metadata.adr_type).toBe('logical');
      expect(adr!.metadata.status).toBe('accepted');
      expect(adr!.metadata.domains).toEqual(['recon', 'architecture']);
      expect(adr!.metadata.related_adrs).toEqual(['ADR-L-0002']);
      expect(adr!.metadata.invariant_count).toBe(2);
      expect(adr!.metadata.decision_count).toBe(1);
      expect(adr!.language).toBe('adr-yaml');

      // Invariants
      const inv1 = assertions.find(a => a.elementId === 'invariant:INV-0001');
      expect(inv1).toBeDefined();
      expect(inv1!.elementType).toBe('adr_invariant');
      expect(inv1!.metadata.statement).toBe('Single repository only');
      expect(inv1!.metadata.enforcement_level).toBe('must');
      expect(inv1!.metadata.parent_adr).toBe('ADR-L-0001');

      const inv2 = assertions.find(a => a.elementId === 'invariant:INV-0002');
      expect(inv2).toBeDefined();

      // Decision
      const dec = assertions.find(a => a.elementId === 'decision:DEC-0001');
      expect(dec).toBeDefined();
      expect(dec!.elementType).toBe('adr_decision');
      expect(dec!.metadata.statement).toBe('Use provisional mode');
      expect(dec!.metadata.related_invariants).toEqual(['INV-0001']);
      expect(dec!.metadata.parent_adr).toBe('ADR-L-0001');
    });
  });

  describe('Physical-system ADR with system boundary', () => {
    it('should extract ADR document and system boundary', async () => {
      const file = adrFile('adrs/physical-system/ADR-PS-0002-test.yaml');
      const content = `
schema_version: '1.0'
adr_type: physical-system
id: ADR-PS-0002
title: Test Physical System ADR
status: proposed
created_date: '2026-03-15'
authors:
  - test.author
domains:
  - extraction
implements_logical:
  - ADR-L-0001
references_components:
  - ADR-PC-0005
technologies:
  - typescript
  - node.js
context: System context
system_boundaries:
  - id: SYSBOUND-0002
    name: Test Boundary
    description: Test boundary description
    external_dependencies:
      - Source files
    exposed_interfaces:
      - extractor modules
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      // 1 ADR document + 1 system boundary = 2
      expect(assertions).toHaveLength(2);

      const adr = assertions.find(a => a.elementType === 'adr_document');
      expect(adr!.elementId).toBe('adr:ADR-PS-0002');
      expect(adr!.metadata.adr_type).toBe('physical-system');
      expect(adr!.metadata.implements_logical).toEqual(['ADR-L-0001']);
      expect(adr!.metadata.system_boundary_count).toBe(1);

      const sys = assertions.find(a => a.elementType === 'adr_system');
      expect(sys).toBeDefined();
      expect(sys!.elementId).toBe('system:SYSBOUND-0002');
      expect(sys!.metadata.name).toBe('Test Boundary');
      expect(sys!.metadata.parent_adr).toBe('ADR-PS-0002');
    });
  });

  describe('Physical-component ADR with component specs', () => {
    it('should extract ADR document and component specifications', async () => {
      const file = adrFile('adrs/physical-component/ADR-PC-0005-test.yaml');
      const content = `
schema_version: '1.0'
adr_type: physical-component
id: ADR-PC-0005
title: Test Component ADR
status: proposed
created_date: '2026-03-15'
authors:
  - test.author
domains:
  - extraction
  - json
implements_system:
  - ADR-PS-0002
implements_logical:
  - ADR-L-0001
technologies:
  - typescript
context: Component context
component_specifications:
  - id: COMP-0005
    name: JSON Semantic Extractor
    type: library
    responsibilities: Extract JSON semantics
    implementation_identifiers:
      module_path: src/extractors/json/json-extractor.ts
      test_path: src/extractors/json/json-extractor.test.ts
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      // 1 ADR document + 1 component = 2
      expect(assertions).toHaveLength(2);

      const adr = assertions.find(a => a.elementType === 'adr_document');
      expect(adr!.elementId).toBe('adr:ADR-PC-0005');
      expect(adr!.metadata.adr_type).toBe('physical-component');
      expect(adr!.metadata.implements_system).toEqual(['ADR-PS-0002']);
      expect(adr!.metadata.component_count).toBe(1);

      const comp = assertions.find(a => a.elementType === 'adr_component');
      expect(comp).toBeDefined();
      expect(comp!.elementId).toBe('component:COMP-0005');
      expect(comp!.metadata.name).toBe('JSON Semantic Extractor');
      expect(comp!.metadata.module_path).toBe('src/extractors/json/json-extractor.ts');
      expect(comp!.metadata.parent_adr).toBe('ADR-PC-0005');
    });
  });

  describe('Related ADRs edges', () => {
    it('should include related_adrs in document metadata', async () => {
      const file = adrFile('adrs/logical/ADR-L-0003-test.yaml');
      const content = `
schema_version: '1.0'
adr_type: logical
id: ADR-L-0003
title: Test with relations
status: accepted
domains: [recon]
related_adrs:
  - ADR-L-0001
  - ADR-L-0002
supersedes:
  - ADR-L-0099
context: Some context
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      expect(assertions).toHaveLength(1);
      expect(assertions[0].metadata.related_adrs).toEqual(['ADR-L-0001', 'ADR-L-0002']);
      expect(assertions[0].metadata.supersedes).toEqual(['ADR-L-0099']);
    });
  });

  describe('Empty capabilities', () => {
    it('should handle ADR with empty capabilities array', async () => {
      const file = adrFile('adrs/logical/ADR-L-0010-test.yaml');
      const content = `
schema_version: '1.0'
adr_type: logical
id: ADR-L-0010
title: ADR with empty caps
status: proposed
domains: [recon]
capabilities: []
invariants: []
decisions: []
context: Empty test
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      expect(assertions).toHaveLength(1);
      expect(assertions[0].elementType).toBe('adr_document');
      expect(assertions[0].metadata.capability_count).toBe(0);
      expect(assertions[0].metadata.invariant_count).toBe(0);
      expect(assertions[0].metadata.decision_count).toBe(0);
    });
  });

  describe('Malformed YAML (missing adr_type)', () => {
    it('should emit zero assertions and log a warning', async () => {
      const file = adrFile('adrs/logical/bad-file.yaml');
      const content = `
schema_version: '1.0'
id: ADR-L-0999
title: Missing adr_type
status: proposed
domains: [recon]
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      expect(assertions).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Missing adr_type'),
      );
    });
  });

  describe('Invalid YAML syntax', () => {
    it('should emit zero assertions and log a warning', async () => {
      const file = adrFile('adrs/logical/invalid.yaml');
      const content = `
this is not: valid: yaml: [[[
  broken: {
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      expect(assertions).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Malformed YAML'),
      );
    });
  });

  describe('Unknown adr_type value', () => {
    it('should skip with zero assertions and log a warning', async () => {
      const file = adrFile('adrs/logical/experimental.yaml');
      const content = `
schema_version: '1.0'
adr_type: experimental
id: ADR-X-0001
title: Experimental ADR
status: proposed
domains: [recon]
context: test
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      expect(assertions).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Unknown adr_type 'experimental'"),
      );
    });
  });

  describe('Legacy physical ADR', () => {
    it('should extract a physical type ADR as a document', async () => {
      const file = adrFile('adrs/physical/ADR-P-0001-test.yaml');
      const content = `
schema_version: '1.0'
adr_type: physical
id: ADR-P-0001
title: Legacy Physical ADR
status: proposed
domains: [extraction]
context: Legacy test
technologies:
  - typescript
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      expect(assertions).toHaveLength(1);
      expect(assertions[0].elementType).toBe('adr_document');
      expect(assertions[0].elementId).toBe('adr:ADR-P-0001');
      expect(assertions[0].metadata.adr_type).toBe('physical');
    });
  });

  describe('Source provenance', () => {
    it('should include source YAML in each assertion', async () => {
      const file = adrFile('adrs/logical/ADR-L-0050-test.yaml');
      const content = `
schema_version: '1.0'
adr_type: logical
id: ADR-L-0050
title: Source test
status: accepted
domains: [test]
context: test context
invariants:
  - id: INV-0050
    statement: Test invariant
    scope: global
    enforcement_level: must
    enforcement_mechanism: design
    verification_method: manual
    rationale: Test
    compliance_frameworks: []
    exceptions: []
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const assertions = await extractFromAdrYaml(file);

      expect(assertions).toHaveLength(2);

      // ADR document should have source (frontmatter)
      expect(assertions[0].source).toBeDefined();
      expect(assertions[0].source).toContain('ADR-L-0050');

      // Invariant should have source
      const inv = assertions.find(a => a.elementId === 'invariant:INV-0050');
      expect(inv!.source).toBeDefined();
      expect(inv!.source).toContain('INV-0050');
    });
  });
});
