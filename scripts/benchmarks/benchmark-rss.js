/**
 * RSS Benchmark Script
 * 
 * Measures RSS performance for Finding Processor Lambda discovery
 * and context assembly.
 */

import {
  initRssContext,
  search,
  lookup,
  lookupByKey,
  dependencies,
  dependents,
  blastRadius,
  byTag,
  findEntryPoints,
  assembleContext,
  getGraphStats,
  validateGraphHealth,
  extractFilePaths,
  getRelevantFiles,
} from './dist/index.js';

const STATE_ROOT = '.ste/state';

async function runBenchmark() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('RSS BENCHMARK - Finding Processor Lambda Discovery');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results = {};

  // ─────────────────────────────────────────────────────────────────
  // 1. Graph Loading
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Loading semantic graph...');
  const loadStart = performance.now();
  const ctx = await initRssContext(STATE_ROOT);
  const loadTime = performance.now() - loadStart;
  results.graphLoad = { ms: loadTime.toFixed(2), nodes: ctx.graph.size };
  console.log(`  ✓ Loaded ${ctx.graph.size} nodes in ${loadTime.toFixed(2)}ms\n`);

  // ─────────────────────────────────────────────────────────────────
  // 2. Graph Statistics
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Graph statistics...');
  const statsStart = performance.now();
  const stats = getGraphStats(ctx);
  const statsTime = performance.now() - statsStart;
  results.graphStats = { ms: statsTime.toFixed(2), ...stats };
  console.log(`  ✓ Stats computed in ${statsTime.toFixed(2)}ms`);
  console.log(`    Nodes: ${stats.totalNodes}, Edges: ${stats.totalEdges}`);
  console.log(`    Domains: ${Object.keys(stats.byDomain).join(', ')}\n`);

  // ─────────────────────────────────────────────────────────────────
  // 3. Search: "processor"
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Search: "processor"...');
  const search1Start = performance.now();
  const searchResults1 = search(ctx, 'processor');
  const search1Time = performance.now() - search1Start;
  results.searchProcessor = { ms: search1Time.toFixed(2), results: searchResults1.nodes.length };
  console.log(`  ✓ Found ${searchResults1.nodes.length} results in ${search1Time.toFixed(2)}ms\n`);

  // ─────────────────────────────────────────────────────────────────
  // 4. Search: "lambda_handler"
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Search: "lambda_handler"...');
  const search2Start = performance.now();
  const searchResults2 = search(ctx, 'lambda_handler');
  const search2Time = performance.now() - search2Start;
  results.searchLambdaHandler = { ms: search2Time.toFixed(2), results: searchResults2.nodes.length };
  console.log(`  ✓ Found ${searchResults2.nodes.length} results in ${search2Time.toFixed(2)}ms\n`);

  // ─────────────────────────────────────────────────────────────────
  // 5. Direct Lookup
  // ─────────────────────────────────────────────────────────────────
  const handlerKey = 'graph/function/function:backend/lambda/finding-processor/processor.py:lambda_handler:71';
  console.log('▸ Direct lookup: lambda_handler...');
  const lookupStart = performance.now();
  const handlerNode = lookupByKey(ctx, handlerKey);
  const lookupTime = performance.now() - lookupStart;
  results.directLookup = { ms: lookupTime.toFixed(2), found: !!handlerNode };
  console.log(`  ✓ Lookup in ${lookupTime.toFixed(2)}ms (found: ${!!handlerNode})\n`);

  // ─────────────────────────────────────────────────────────────────
  // 6. Blast Radius (Depth 2)
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Blast radius (depth=2)...');
  const blast2Start = performance.now();
  const blast2 = blastRadius(ctx, handlerKey, 2);
  const blast2Time = performance.now() - blast2Start;
  results.blastRadius2 = { ms: blast2Time.toFixed(2), nodes: blast2.nodes.length, truncated: blast2.truncated };
  console.log(`  ✓ Found ${blast2.nodes.length} nodes in ${blast2Time.toFixed(2)}ms\n`);

  // ─────────────────────────────────────────────────────────────────
  // 7. Blast Radius (Depth 3)
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Blast radius (depth=3)...');
  const blast3Start = performance.now();
  const blast3 = blastRadius(ctx, handlerKey, 3);
  const blast3Time = performance.now() - blast3Start;
  results.blastRadius3 = { ms: blast3Time.toFixed(2), nodes: blast3.nodes.length, truncated: blast3.truncated };
  console.log(`  ✓ Found ${blast3.nodes.length} nodes in ${blast3Time.toFixed(2)}ms\n`);

  // ─────────────────────────────────────────────────────────────────
  // 8. Dependencies
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Dependencies (forward traversal)...');
  const depsStart = performance.now();
  const deps = dependencies(ctx, handlerKey, 2);
  const depsTime = performance.now() - depsStart;
  results.dependencies = { ms: depsTime.toFixed(2), nodes: deps.nodes.length };
  console.log(`  ✓ Found ${deps.nodes.length} dependencies in ${depsTime.toFixed(2)}ms\n`);

  // ─────────────────────────────────────────────────────────────────
  // 9. Dependents
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Dependents (backward traversal)...');
  const deptStart = performance.now();
  const dept = dependents(ctx, handlerKey, 2);
  const deptTime = performance.now() - deptStart;
  results.dependents = { ms: deptTime.toFixed(2), nodes: dept.nodes.length };
  console.log(`  ✓ Found ${dept.nodes.length} dependents in ${deptTime.toFixed(2)}ms\n`);

  // ─────────────────────────────────────────────────────────────────
  // 10. By Tag: handler:lambda
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ By tag: "handler:lambda"...');
  const tagStart = performance.now();
  const tagResults = byTag(ctx, 'handler:lambda');
  const tagTime = performance.now() - tagStart;
  results.byTagLambda = { ms: tagTime.toFixed(2), nodes: tagResults.nodes.length };
  console.log(`  ✓ Found ${tagResults.nodes.length} Lambda handlers in ${tagTime.toFixed(2)}ms\n`);

  // ─────────────────────────────────────────────────────────────────
  // 11. Find Entry Points (Natural Language)
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Find entry points: "finding processor compliance"...');
  const epStart = performance.now();
  const ep = findEntryPoints(ctx, 'finding processor compliance');
  const epTime = performance.now() - epStart;
  results.findEntryPoints = { ms: epTime.toFixed(2), entryPoints: ep.entryPoints.length, terms: ep.searchTerms };
  console.log(`  ✓ Found ${ep.entryPoints.length} entry points in ${epTime.toFixed(2)}ms`);
  console.log(`    Search terms: ${ep.searchTerms.join(', ')}\n`);

  // ─────────────────────────────────────────────────────────────────
  // 12. Assemble Context
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Assemble context from entry points...');
  const acStart = performance.now();
  const assembled = assembleContext(ctx, ep.entryPoints, { maxDepth: 2, maxNodes: 100 });
  const acTime = performance.now() - acStart;
  results.assembleContext = { ms: acTime.toFixed(2), nodes: assembled.nodes.length, summary: assembled.summary };
  console.log(`  ✓ Assembled ${assembled.nodes.length} nodes in ${acTime.toFixed(2)}ms`);
  console.log(`    By domain: ${JSON.stringify(assembled.summary.byDomain)}\n`);

  // ─────────────────────────────────────────────────────────────────
  // 13. Extract File Paths
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Extract file paths...');
  const fpStart = performance.now();
  const filePaths = extractFilePaths(assembled.nodes);
  const fpTime = performance.now() - fpStart;
  results.extractFilePaths = { ms: fpTime.toFixed(2), files: filePaths.length };
  console.log(`  ✓ Extracted ${filePaths.length} unique files in ${fpTime.toFixed(2)}ms\n`);

  // ─────────────────────────────────────────────────────────────────
  // 14. Graph Health Validation
  // ─────────────────────────────────────────────────────────────────
  console.log('▸ Graph health validation...');
  const healthStart = performance.now();
  const health = validateGraphHealth(ctx);
  const healthTime = performance.now() - healthStart;
  results.graphHealth = {
    ms: healthTime.toFixed(2),
    brokenEdges: health.brokenEdges.length,
    inconsistencies: health.bidirectionalInconsistencies.length,
    orphans: health.orphanedNodes.length,
    isHealthy: health.summary.isHealthy
  };
  console.log(`  ✓ Validated in ${healthTime.toFixed(2)}ms`);
  console.log(`    Broken edges: ${health.brokenEdges.length}`);
  console.log(`    Inconsistencies: ${health.bidirectionalInconsistencies.length}`);
  console.log(`    Orphans: ${health.orphanedNodes.length}`);
  console.log(`    Healthy: ${health.summary.isHealthy}\n`);

  // ─────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('BENCHMARK RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Operation                     | Time (ms) | Results');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`Graph Load                    | ${results.graphLoad.ms.padStart(9)} | ${results.graphLoad.nodes} nodes`);
  console.log(`Graph Stats                   | ${results.graphStats.ms.padStart(9)} | ${stats.totalNodes} nodes, ${stats.totalEdges} edges`);
  console.log(`Search "processor"            | ${results.searchProcessor.ms.padStart(9)} | ${results.searchProcessor.results} results`);
  console.log(`Search "lambda_handler"       | ${results.searchLambdaHandler.ms.padStart(9)} | ${results.searchLambdaHandler.results} results`);
  console.log(`Direct Lookup                 | ${results.directLookup.ms.padStart(9)} | found: ${results.directLookup.found}`);
  console.log(`Blast Radius (depth=2)        | ${results.blastRadius2.ms.padStart(9)} | ${results.blastRadius2.nodes} nodes`);
  console.log(`Blast Radius (depth=3)        | ${results.blastRadius3.ms.padStart(9)} | ${results.blastRadius3.nodes} nodes`);
  console.log(`Dependencies                  | ${results.dependencies.ms.padStart(9)} | ${results.dependencies.nodes} nodes`);
  console.log(`Dependents                    | ${results.dependents.ms.padStart(9)} | ${results.dependents.nodes} nodes`);
  console.log(`By Tag (handler:lambda)       | ${results.byTagLambda.ms.padStart(9)} | ${results.byTagLambda.nodes} handlers`);
  console.log(`Find Entry Points             | ${results.findEntryPoints.ms.padStart(9)} | ${results.findEntryPoints.entryPoints} entries`);
  console.log(`Assemble Context              | ${results.assembleContext.ms.padStart(9)} | ${results.assembleContext.nodes} nodes`);
  console.log(`Extract File Paths            | ${results.extractFilePaths.ms.padStart(9)} | ${results.extractFilePaths.files} files`);
  console.log(`Graph Health Validation       | ${results.graphHealth.ms.padStart(9)} | healthy: ${results.graphHealth.isHealthy}`);
  console.log('─────────────────────────────────────────────────────────────\n');

  // Calculate total
  const totalMs = Object.values(results).reduce((sum, r) => sum + parseFloat(r.ms), 0);
  console.log(`Total benchmark time: ${totalMs.toFixed(2)}ms\n`);

  // Files discovered for processor
  console.log('Files in Processor Lambda scope:');
  filePaths.forEach(f => console.log(`  - ${f}`));
  console.log('');

  return results;
}

runBenchmark().catch(console.error);

