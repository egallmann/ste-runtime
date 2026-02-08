/**
 * Legacy Full RECON
 * 
 * @deprecated Use executeRecon from './index.js' instead.
 * This file is kept for backward compatibility but should not be used directly.
 * 
 * CRITICAL: This legacy implementation had hardcoded paths that caused boundary violations.
 * The new implementation uses config.stateDir to ensure state is written to the correct location.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { PythonExtractor } from '../extractors/python/python-extractor.js';
import { log, warn } from '../utils/logger.js';
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

/**
 * Reset a domain directory within the state directory.
 * 
 * @param stateDir - Resolved absolute path to state directory
 * @param relativeDir - Relative path within state directory (e.g., 'api', 'data')
 */
async function resetDomainDir(stateDir: string, relativeDir: string) {
  const absolute = path.resolve(stateDir, relativeDir);
  await fs.rm(absolute, { recursive: true, force: true });
  await fs.mkdir(absolute, { recursive: true });
  return absolute;
}

async function writeYaml(targetPath: string, data: unknown) {
  await fs.writeFile(targetPath, yamlDump(data), 'utf8');
}

async function writeApiDomain(stateDir: string, endpoints: EndpointDoc[], timestamp: string) {
  const apiDir = await resetDomainDir(stateDir, 'api');
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

async function writeDataDomain(stateDir: string, entities: EntityDoc[], timestamp: string) {
  const dataDir = await resetDomainDir(stateDir, 'data');
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

async function writeInternalGraphDomain(stateDir: string, modules: ModuleDoc[], timestamp: string) {
  const graphDir = await resetDomainDir(stateDir, 'graph/internal');
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

/**
 * Run full RECON.
 * 
 * @deprecated Use executeRecon from './index.js' instead.
 * 
 * @param projectRoot - Project root directory
 * @param stateDir - Optional resolved absolute path to state directory. 
 *                   If not provided, defaults to projectRoot/.ste/state (LEGACY BEHAVIOR - AVOID).
 */
export async function runFullRecon(projectRoot: string, stateDir?: string): Promise<void> {
  const resolvedRoot = path.resolve(projectRoot);
  
  // CRITICAL: If stateDir is not provided, use legacy behavior but warn
  // This maintains backward compatibility while encouraging migration to new API
  const resolvedStateDir = stateDir 
    ? path.resolve(stateDir) 
    : path.resolve(resolvedRoot, '.ste', 'state');
  
  if (!stateDir) {
    warn('[RECON] WARNING: runFullRecon called without stateDir parameter.');
    warn('[RECON] Using legacy path resolution which may cause boundary violations.');
    warn('[RECON] Please use executeRecon from ./index.js with proper config instead.');
  }
  
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

  // Write to resolvedStateDir, NOT projectRoot
  await writeApiDomain(resolvedStateDir, endpointDocs, timestamp);
  await writeDataDomain(resolvedStateDir, entityDocs, timestamp);
  await writeInternalGraphDomain(resolvedStateDir, moduleDocs, timestamp);

  // For legacy full recon, use 'all' to capture both Python and TypeScript
  const manifest = await buildFullManifest(resolvedRoot, 'all');
  // Write manifest to state directory
  await writeReconManifest(resolvedStateDir, manifest);

  log(
    `RECON complete. Modules: ${moduleDocs.length}, Entities: ${entityDocs.length}, Endpoints: ${endpointDocs.length}`,
  );
}
