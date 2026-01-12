/**
 * Conversational Query Benchmark
 * 
 * Tests the human-AI interface with natural language queries
 * and measures response times.
 */

import {
  ConversationalQueryEngine,
  ask,
  formatForHuman,
  formatForAgent,
} from './dist/rss/conversational-query.js';

const STATE_ROOT = '.ste/state';

// Test queries representing common conversational patterns
const TEST_QUERIES = [
  // Describe intent
  "Tell me about the finding processor",
  "What is the lambda_handler?",
  
  // Explain intent
  "How does the processor work?",
  
  // List intent
  "List all Lambda handlers",
  "Show all DynamoDB tables",
  
  // Impact intent
  "What would be affected by changing lambda_handler?",
  "Blast radius of processor.py",
  
  // Dependencies intent
  "What does processor depend on?",
  
  // Dependents intent
  "What depends on cross_account_utils?",
  
  // Locate intent
  "Where is emit_metric?",
  "Find the remediation queue",
  
  // Relationship intent
  "How are processor and cross_account_utils related?",
  
  // Generic/unknown intent
  "compliance finding AWS Config",
];

async function runBenchmark() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('CONVERSATIONAL QUERY BENCHMARK');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const engine = new ConversationalQueryEngine(STATE_ROOT);
  
  // Initialize (cold start)
  console.log('▸ Initializing engine (cold start)...');
  const initStart = performance.now();
  await engine.initialize();
  const initTime = performance.now() - initStart;
  console.log(`  ✓ Initialized in ${initTime.toFixed(2)}ms\n`);

  const results = [];

  // Run each query
  for (const query of TEST_QUERIES) {
    console.log(`▸ Query: "${query}"`);
    const start = performance.now();
    const response = await engine.query(query);
    const elapsed = performance.now() - start;
    
    results.push({
      query,
      intent: response.intent,
      timeMs: elapsed,
      nodesFound: response.metrics.totalNodes,
      filesFound: response.filePaths.length,
      cached: response.metrics.fromCache,
    });
    
    console.log(`  Intent: ${response.intent}`);
    console.log(`  Time: ${elapsed.toFixed(2)}ms`);
    console.log(`  Nodes: ${response.metrics.totalNodes}, Files: ${response.filePaths.length}`);
    console.log(`  Summary: ${response.summary.slice(0, 80)}...`);
    console.log('');
  }

  // Run cache test (repeat first query)
  console.log('▸ Cache test: repeating first query...');
  const cacheStart = performance.now();
  const cachedResponse = await engine.query(TEST_QUERIES[0]);
  const cacheTime = performance.now() - cacheStart;
  console.log(`  ✓ Cached response in ${cacheTime.toFixed(2)}ms (was ${results[0].timeMs.toFixed(2)}ms uncached)\n`);

  // Summary table
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('BENCHMARK SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Query                                            | Intent       | Time (ms) | Nodes');
  console.log('─────────────────────────────────────────────────────────────────────────────────────');
  
  for (const r of results) {
    const queryTrunc = r.query.slice(0, 48).padEnd(48);
    const intent = r.intent.padEnd(12);
    const time = r.timeMs.toFixed(2).padStart(9);
    console.log(`${queryTrunc} | ${intent} | ${time} | ${r.nodesFound}`);
  }
  console.log('─────────────────────────────────────────────────────────────────────────────────────\n');

  // Statistics
  const times = results.map(r => r.timeMs);
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

  console.log('Performance Statistics:');
  console.log(`  Cold start (graph load): ${initTime.toFixed(2)}ms`);
  console.log(`  Avg query time: ${avgTime.toFixed(2)}ms`);
  console.log(`  Min query time: ${minTime.toFixed(2)}ms`);
  console.log(`  Max query time: ${maxTime.toFixed(2)}ms`);
  console.log(`  P95 query time: ${p95Time.toFixed(2)}ms`);
  console.log(`  Cached query time: ${cacheTime.toFixed(2)}ms`);
  console.log('');

  // Intent distribution
  const intentCounts = {};
  for (const r of results) {
    intentCounts[r.intent] = (intentCounts[r.intent] || 0) + 1;
  }
  
  console.log('Intent Classification:');
  for (const [intent, count] of Object.entries(intentCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${intent}: ${count}`);
  }
  console.log('');

  // Demo: Human-readable output
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SAMPLE OUTPUT: Human-Readable Format');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const demoResponse = await engine.query("Tell me about the finding processor");
  console.log(formatForHuman(demoResponse));
  console.log('');

  // Demo: Agent-readable output
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SAMPLE OUTPUT: Agent-Readable Format (JSON)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(JSON.stringify(formatForAgent(demoResponse), null, 2));
}

runBenchmark().catch(console.error);

