import yaml from 'js-yaml';

export function renderYamlDocument(data: unknown): string {
  const body = yaml.dump(data as object, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    flowLevel: -1,
  });
  return body.endsWith('\n') ? body : `${body}\n`;
}

export function renderLegacyEntityRegistry(bodyYaml: string): string {
  const header = `<!--
artifact_kind: legacy_entity_registry
generator_id: ste-runtime-architecture-compiler
note: >
  Emitted by ste-runtime (compiler of record). Integrity hashes may differ from adr-kit;
  content is derived from the same ADR sources via the TypeScript compiler pipeline.
-->

`;
  return `${header}${bodyYaml}`;
}
