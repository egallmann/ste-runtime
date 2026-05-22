import { describe, it, expect } from 'vitest';
import { getFamily, getAllFamilies, registerFamily, type ProjectionFamily } from './projection-families.js';

describe('projection-families registry', () => {
  it('has built-in families registered', () => {
    const all = getAllFamilies();
    expect(all.length).toBeGreaterThanOrEqual(5);

    const ids = all.map(f => f.id);
    expect(ids).toContain('architecture-overview');
    expect(ids).toContain('integration-topology');
    expect(ids).toContain('dependency-projection');
    expect(ids).toContain('governance-projection');
    expect(ids).toContain('runtime-projection');
  });

  it('getFamily returns correct family', () => {
    const arch = getFamily('architecture-overview');
    expect(arch).toBeDefined();
    expect(arch!.name).toBe('Architecture Overview');
    expect(arch!.supportedLevels).toContain('L0');
    expect(arch!.supportedLevels).toContain('L2');
    expect(arch!.sourceQuery).toBe('componentIntegration');
  });

  it('getFamily returns undefined for unknown id', () => {
    expect(getFamily('nonexistent')).toBeUndefined();
  });

  it('fileNamePattern generates correct file names', () => {
    const arch = getFamily('architecture-overview')!;
    expect(arch.fileNamePattern('L0')).toBe('architecture-overview-L0.md');
    expect(arch.fileNamePattern('L2', 'myrepo')).toBe('architecture-overview-L2-myrepo.md');

    const dep = getFamily('dependency-projection')!;
    expect(dep.fileNamePattern('L0')).toBe('dependency-projection-L0.md');
    expect(dep.fileNamePattern('L1')).toBe('dependency-projection-L1.md');
  });

  it('integration-topology supports L1-L3', () => {
    const intTopo = getFamily('integration-topology')!;
    expect(intTopo.supportedLevels).toEqual(['L1', 'L2', 'L3']);
  });

  it('governance-projection has compression overrides', () => {
    const gov = getFamily('governance-projection')!;
    expect(gov.compressionOverrides).toBeDefined();
    expect(gov.compressionOverrides!.suppressAlarmTopics).toBe(true);
  });

  it('registerFamily adds a new family', () => {
    const custom: ProjectionFamily = {
      id: 'test-custom',
      name: 'Test Custom',
      supportedLevels: ['L0'],
      sourceQuery: 'systemDependencies',
      fileNamePattern: (level) => `custom-${level}.md`,
    };
    registerFamily(custom);
    expect(getFamily('test-custom')).toBeDefined();
    expect(getFamily('test-custom')!.name).toBe('Test Custom');
  });
});
