import path from 'node:path';

import { dump } from 'js-yaml';

import type {
  APIEndpoint,
  ClassDef,
  DataModel,
  ExtractedStructure,
  FunctionDef,
  Import,
} from '../extractors/base-extractor.js';

export type Confidence = 'high' | 'medium' | 'low';

export type Reference = {
  domain: string;
  type: string;
  id: string;
};

export type SliceMeta = {
  id: string;
  domain: string;
  type: string;
  source_files: string[];
  references: Reference[];
  referenced_by: Reference[];
  tags: string[];
  extraction: {
    method: string;
    confidence: Confidence;
    timestamp: string;
  };
};

export type EndpointDoc = {
  _slice: SliceMeta;
  endpoint: {
    id: string;
    method: string;
    path: string;
    summary: string;
    domain_function: string;
    handler: {
      file: string;
      function: string;
      class: string;
      line: number;
    };
    authentication?: {
      required: boolean;
      type: string;
      scopes: string[];
      roles: string[];
    };
    request?: {
      path_params?: Array<{ name: string; type?: string; required?: boolean; description?: string }>;
      query_params?: Array<{
        name: string;
        type?: string;
        required?: boolean;
        default?: string;
        description?: string;
      }>;
    };
    responses?: Array<{
      status: number;
      description?: string;
    }>;
  };
};

export type EntityDoc = {
  _slice: SliceMeta;
  entity: {
    id: string;
    name: string;
    description: string;
    source: {
      file: string;
      class: string;
      line: number;
    };
    persistence: {
      type: string;
      database?: string;
      table?: string;
      schema?: string;
    };
    fields: Array<{
      name: string;
      type?: string;
      default?: string;
      nullable?: boolean;
      primary_key?: boolean;
      unique?: boolean;
    }>;
    relationships: Array<{
      name: string;
      type: string;
      target_entity: string;
      foreign_key?: string;
      inverse?: string;
      cascade?: string;
    }>;
    indexes: Array<{
      name: string;
      fields: string[];
      unique?: boolean;
    }>;
    validation_rules: Array<{
      field: string;
      rule: string;
      params?: string;
      message?: string;
    }>;
  };
};

export type ModuleDoc = {
  _slice: SliceMeta;
  module: {
    id: string;
    path: string;
    name: string;
    layer: string;
    exports: {
      classes: string[];
      functions: string[];
      constants: string[];
    };
    imports: {
      internal: Array<{ module_id: string; items: string[] }>;
      external: Array<{ package: string; items: string[] }>;
    };
    metrics: {
      lines_of_code?: number;
      cyclomatic_complexity?: number;
      coupling?: number;
    };
  };
};

export type Aidoc = EndpointDoc | EntityDoc | ModuleDoc;

export const DEFAULT_CONFIDENCE: Confidence = 'high';
export const EXTRACTION_METHOD = 'static';

const toPosix = (value: string) => value.replace(/\\/g, '/');

export const yamlDump = (value: unknown) => dump(value, { noRefs: true, lineWidth: -1, sortKeys: false });

export function createSliceMeta(
  id: string,
  domain: string,
  type: string,
  sourceFiles: string[],
  tags: string[],
  timestamp: string,
): SliceMeta {
  return {
    id,
    domain,
    type,
    source_files: sourceFiles,
    references: [],
    referenced_by: [],
    tags,
    extraction: {
      method: EXTRACTION_METHOD,
      confidence: DEFAULT_CONFIDENCE,
      timestamp,
    },
  };
}

export function normalizeRelPath(projectRoot: string, filePath: string) {
  return toPosix(path.relative(projectRoot, filePath));
}

export function moduleIdFromRelPath(relPath: string) {
  const withoutExt = relPath.replace(/\.py$/, '');
  return `module-${withoutExt.replace(/\//g, '-')}`;
}

export function moduleNameFromRelPath(relPath: string) {
  const withoutExt = relPath.replace(/\.py$/, '');
  return withoutExt.replace(/\//g, '.');
}

export function dataEntityId(model: DataModel) {
  return `data-${model.name}`;
}

export function normalizeEndpointPath(routePath: string) {
  const trimmed = routePath.trim();
  const noSlashes = trimmed.replace(/^\/+|\/+$/g, '');
  const cleaned = noSlashes.replace(/[{}<>]/g, '');
  const slug = cleaned
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-');
  return slug || 'root';
}

export function endpointId(endpoint: APIEndpoint) {
  const method = endpoint.method.toUpperCase();
  const normalizedPath = normalizeEndpointPath(endpoint.path);
  return `api-${method}-${normalizedPath}`;
}

export function firstLine(text?: string | null) {
  if (!text) return '';
  const [line] = text.split('\n');
  return line.trim();
}

export type ModuleNameLookup = Map<string, string>;

export function buildModuleNameLookup(structures: ExtractedStructure[], projectRoot: string): ModuleNameLookup {
  const lookup: ModuleNameLookup = new Map();
  for (const structure of structures) {
    const relPath = normalizeRelPath(projectRoot, structure.filepath);
    const moduleId = moduleIdFromRelPath(relPath);
    const dotted = moduleNameFromRelPath(relPath);
    lookup.set(dotted, moduleId);
    const base = path.posix.basename(relPath, '.py');
    lookup.set(base, moduleId);
  }
  return lookup;
}

export function resolveInternalImport(
  currentRelPath: string,
  importEntry: Import,
  lookup: ModuleNameLookup,
): string | null {
  const currentModuleName = moduleNameFromRelPath(currentRelPath);
  const currentParts = currentModuleName.split('.');

  const addCandidates = (moduleName: string | undefined, names: string[]) => {
    const candidates = new Set<string>();
    if (moduleName) candidates.add(moduleName);
    for (const name of names) {
      if (moduleName) {
        candidates.add(`${moduleName}.${name}`);
      } else {
        candidates.add(name);
      }
    }
    return Array.from(candidates);
  };

  const moduleField = importEntry.module;
  let normalizedModule = moduleField;

  if (moduleField.startsWith('.')) {
    const dotPrefixLength = moduleField.match(/^\.*/)?.[0].length ?? 0;
    const remainder = moduleField.slice(dotPrefixLength).replace(/^\./, '');
    const baseParts = currentParts.slice(0, Math.max(currentParts.length - dotPrefixLength, 0));
    normalizedModule = [...baseParts, ...remainder.split('.').filter(Boolean)].filter(Boolean).join('.');
  }

  const candidates = addCandidates(normalizedModule || undefined, importEntry.names);
  for (const candidate of candidates) {
    const targetId = lookup.get(candidate);
    if (targetId) return targetId;
  }
  return null;
}

export function collectModuleImports(
  structure: ExtractedStructure,
  projectRoot: string,
  lookup: ModuleNameLookup,
): { internal: Array<{ module_id: string; items: string[] }>; external: Array<{ package: string; items: string[] }> } {
  const relPath = normalizeRelPath(projectRoot, structure.filepath);
  const internalMap = new Map<string, Set<string>>();
  const externalMap = new Map<string, Set<string>>();

  for (const entry of structure.imports) {
    const targetId = resolveInternalImport(relPath, entry, lookup);
    if (targetId) {
      if (!internalMap.has(targetId)) internalMap.set(targetId, new Set<string>());
      const items = internalMap.get(targetId)!;
      entry.names.forEach((name) => items.add(name));
    } else {
      const pkgName = entry.module || (entry.names.length ? entry.names[0] : 'unknown');
      if (!externalMap.has(pkgName)) externalMap.set(pkgName, new Set<string>());
      const items = externalMap.get(pkgName)!;
      entry.names.forEach((name) => items.add(name));
    }
  }

  const internal = Array.from(internalMap.entries())
    .map(([module_id, items]) => ({ module_id, items: Array.from(items).sort() }))
    .sort((a, b) => a.module_id.localeCompare(b.module_id));

  const external = Array.from(externalMap.entries())
    .map(([pkg, items]) => ({ package: pkg, items: Array.from(items).sort() }))
    .sort((a, b) => a.package.localeCompare(b.package));

  return { internal, external };
}

export function buildModuleDoc(
  structure: ExtractedStructure,
  projectRoot: string,
  timestamp: string,
  lookup: ModuleNameLookup,
): ModuleDoc {
  const relPath = normalizeRelPath(projectRoot, structure.filepath);
  const id = moduleIdFromRelPath(relPath);
  const imports = collectModuleImports(structure, projectRoot, lookup);
  const classes = structure.classes.map((cls: ClassDef) => cls.name).sort();
  const functions = structure.functions.map((fn: FunctionDef) => fn.name).sort();

  return {
    _slice: createSliceMeta(id, 'graph', 'module', [relPath], ['graph', 'module', 'util'], timestamp),
    module: {
      id,
      path: relPath,
      name: path.posix.basename(relPath, '.py'),
      layer: 'util',
      exports: {
        classes,
        functions,
        constants: [],
      },
      imports,
      metrics: {},
    },
  };
}

export function buildEntityDoc(
  structure: ExtractedStructure,
  model: DataModel,
  projectRoot: string,
  timestamp: string,
): EntityDoc {
  const relPath = normalizeRelPath(projectRoot, structure.filepath);
  const id = dataEntityId(model);

  return {
    _slice: createSliceMeta(id, 'data', 'entity', [relPath], ['data', 'entity'], timestamp),
    entity: {
      id,
      name: model.name,
      description: model.docstring ? firstLine(model.docstring) : '',
      source: {
        file: relPath,
        class: model.name,
        line: model.lineno,
      },
      persistence: {
        type: 'none',
      },
      fields: model.fields
        .map((field) => ({
          name: field.name,
          type: field.type,
          default: field.default,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      relationships: [],
      indexes: [],
      validation_rules: [],
    },
  };
}

export function buildEndpointDoc(
  structure: ExtractedStructure,
  endpoint: APIEndpoint,
  projectRoot: string,
  timestamp: string,
): EndpointDoc {
  const relPath = normalizeRelPath(projectRoot, structure.filepath);
  const id = endpointId(endpoint);
  const summary = firstLine(endpoint.docstring);

  return {
    _slice: createSliceMeta(id, 'api', 'endpoint', [relPath], ['api', endpoint.framework], timestamp),
    endpoint: {
      id,
      method: endpoint.method.toUpperCase(),
      path: endpoint.path,
      summary,
      domain_function: '',
      handler: {
        file: relPath,
        function: endpoint.function_name,
        class: '',
        line: endpoint.lineno,
      },
      authentication: {
        required: false,
        type: 'none',
        scopes: [],
        roles: [],
      },
      responses: [],
    },
  };
}

function attachReference(target: Aidoc, reference: Reference) {
  const exists = target._slice.referenced_by.some(
    (ref) => ref.domain === reference.domain && ref.type === reference.type && ref.id === reference.id,
  );
  if (!exists) {
    target._slice.referenced_by.push(reference);
  }
}

function sortReferences(refs: Reference[]) {
  refs.sort((a, b) => {
    const domainCompare = a.domain.localeCompare(b.domain);
    if (domainCompare !== 0) return domainCompare;
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare !== 0) return typeCompare;
    return a.id.localeCompare(b.id);
  });
}

export function connectDocs(
  modules: ModuleDoc[],
  endpoints: EndpointDoc[],
  entities: EntityDoc[],
  moduleIdByPathOverride?: Map<string, string>,
): void {
  const moduleIdByPath = moduleIdByPathOverride ?? new Map<string, string>();

  if (!moduleIdByPathOverride) {
    for (const module of modules) {
      moduleIdByPath.set(module.module.path, module._slice.id);
    }
  }

  // Endpoint -> module references
  for (const endpoint of endpoints) {
    const moduleId = moduleIdByPath.get(endpoint.endpoint.handler.file);
    if (moduleId) {
      endpoint._slice.references.push({ domain: 'graph', type: 'module', id: moduleId });
    }
  }

  // Entity -> module references
  for (const entity of entities) {
    const moduleId = moduleIdByPath.get(entity.entity.source.file);
    if (moduleId) {
      entity._slice.references.push({ domain: 'graph', type: 'module', id: moduleId });
    }
  }

  // Propagate existing module import references already attached in module docs
  for (const module of modules) {
    module._slice.references.push(
      ...module.module.imports.internal.map((imp) => ({ domain: 'graph', type: 'module', id: imp.module_id })),
    );
  }
}

export function finalizeBidirectionalRefs(docs: Aidoc[]) {
  const docIndex = new Map<string, Aidoc>();
  for (const doc of docs) {
    const key = `${doc._slice.domain}:${doc._slice.type}:${doc._slice.id}`;
    docIndex.set(key, doc);
  }

  for (const doc of docs) {
    for (const ref of doc._slice.references) {
      const targetKey = `${ref.domain}:${ref.type}:${ref.id}`;
      const targetDoc = docIndex.get(targetKey);
      if (targetDoc) {
        attachReference(targetDoc, { domain: doc._slice.domain, type: doc._slice.type, id: doc._slice.id });
      }
    }
  }

  for (const doc of docs) {
    sortReferences(doc._slice.references);
    sortReferences(doc._slice.referenced_by);
  }
}



