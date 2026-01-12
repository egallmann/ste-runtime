import fs from 'node:fs/promises';
import path from 'node:path';

import { PythonExtractor } from '../extractors/python/python-extractor.js';
import { buildFullManifest, writeReconManifest } from '../watch/change-detector.js';
import {
  Aidoc,
  EndpointDoc,
  EntityDoc,
  ModuleDoc,
  buildEndpointDoc,
  buildEntityDoc,
  buildModuleDoc,
  buildModuleNameLookup,
  connectDocs,
  createSliceMeta,
  finalizeBidirectionalRefs,
  yamlDump,
} from './common.js';

const STATE_ROOT = '.ste/state';
const API_DIR = 'api';
const DATA_DIR = 'data';
const GRAPH_INTERNAL_DIR = 'graph/internal';

async function resetDomainDir(projectRoot: string, relativeDir: string) {
  const absolute = path.resolve(projectRoot, '.ste', 'state', relativeDir);
  await fs.rm(absolute, { recursive: true, force: true });
  await fs.mkdir(absolute, { recursive: true });
  return absolute;
}

async function writeYaml(targetPath: string, data: unknown) {
  await fs.writeFile(targetPath, yamlDump(data), 'utf8');
}

async function writeApiDomain(projectRoot: string, endpoints: EndpointDoc[], timestamp: string) {
  const apiDir = await resetDomainDir(projectRoot, API_DIR);
  const endpointsDir = path.join(apiDir, 'endpoints');
  await fs.mkdir(endpointsDir, { recursive: true });

  const sortedEndpoints = [...endpoints].sort((a, b) => a._slice.id.localeCompare(b._slice.id));

  for (const endpoint of sortedEndpoints) {
    const filePath = path.join(endpointsDir, `${endpoint._slice.id}.yaml`);
    await writeYaml(filePath, endpoint);
  }

  const index = {
    _slice: createSliceMeta('api-index', 'api', 'index', [], ['api'], timestamp),
    endpoints: sortedEndpoints.map((ep) => ({
      id: ep._slice.id,
      method: ep.endpoint.method,
      path: ep.endpoint.path,
      summary: ep.endpoint.summary,
      domain_function: ep.endpoint.domain_function,
    })),
  };

  await writeYaml(path.join(apiDir, 'index.yaml'), index);
}

async function writeDataDomain(projectRoot: string, entities: EntityDoc[], timestamp: string) {
  const dataDir = await resetDomainDir(projectRoot, DATA_DIR);
  const entitiesDir = path.join(dataDir, 'entities');
  await fs.mkdir(entitiesDir, { recursive: true });

  const sortedEntities = [...entities].sort((a, b) => a._slice.id.localeCompare(b._slice.id));

  for (const entity of sortedEntities) {
    const filePath = path.join(entitiesDir, `${entity._slice.id}.yaml`);
    await writeYaml(filePath, entity);
  }

  const index = {
    _slice: createSliceMeta('data-index', 'data', 'index', [], ['data'], timestamp),
    entities: sortedEntities.map((entity) => ({
      id: entity._slice.id,
      name: entity.entity.name,
      type: 'entity',
      table: '',
    })),
    dtos: [],
    enums: [],
  };

  await writeYaml(path.join(dataDir, 'index.yaml'), index);
}

async function writeInternalGraphDomain(projectRoot: string, modules: ModuleDoc[], timestamp: string) {
  const graphDir = await resetDomainDir(projectRoot, GRAPH_INTERNAL_DIR);
  const modulesDir = path.join(graphDir, 'modules');
  await fs.mkdir(modulesDir, { recursive: true });

  const sortedModules = [...modules].sort((a, b) => a._slice.id.localeCompare(b._slice.id));

  for (const module of sortedModules) {
    const filePath = path.join(modulesDir, `${module._slice.id}.yaml`);
    await writeYaml(filePath, module);
  }

  const index = {
    _slice: createSliceMeta('internal-graph-index', 'graph', 'internal-index', [], ['graph', 'internal'], timestamp),
    modules: sortedModules.map((mod) => ({
      id: mod._slice.id,
      path: mod.module.path,
      layer: mod.module.layer,
    })),
    layers: [],
  };

  await writeYaml(path.join(graphDir, 'index.yaml'), index);
}

export async function runFullRecon(projectRoot: string): Promise<void> {
  const resolvedRoot = path.resolve(projectRoot);
  const extractor = new PythonExtractor();
  const timestamp = new Date().toISOString();

  const structures = await extractor.extractProject(resolvedRoot);
  const moduleLookup = buildModuleNameLookup(structures, resolvedRoot);

  const moduleDocs = structures.map((structure) => buildModuleDoc(structure, resolvedRoot, timestamp, moduleLookup));
  const entityDocs = structures.flatMap((structure) =>
    structure.data_models.map((model) => buildEntityDoc(structure, model, resolvedRoot, timestamp)),
  );
  const endpointDocs = structures.flatMap((structure) =>
    structure.api_endpoints.map((ep) => buildEndpointDoc(structure, ep, resolvedRoot, timestamp)),
  );

  connectDocs(moduleDocs, endpointDocs, entityDocs);
  const allDocs: Aidoc[] = [...moduleDocs, ...entityDocs, ...endpointDocs];
  finalizeBidirectionalRefs(allDocs);

  await writeApiDomain(resolvedRoot, endpointDocs, timestamp);
  await writeDataDomain(resolvedRoot, entityDocs, timestamp);
  await writeInternalGraphDomain(resolvedRoot, moduleDocs, timestamp);

  const manifest = await buildFullManifest(resolvedRoot);
  await writeReconManifest(resolvedRoot, manifest);

  console.log(
    `RECON complete. Modules: ${moduleDocs.length}, Entities: ${entityDocs.length}, Endpoints: ${endpointDocs.length}`,
  );
}


