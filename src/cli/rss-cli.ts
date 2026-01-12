#!/usr/bin/env node
/**
 * RSS CLI - Reference State Service Command Line Interface
 * 
 * Authority: E-ADR-004 (RSS CLI Implementation for Developer-Invoked Graph Traversal)
 * 
 * Per STE-Architecture Section 4.6: RSS provides graph traversal operations
 * for context assembly and semantic navigation.
 * 
 * Usage:
 *   rss stats                              # Show graph statistics
 *   rss search <query>                     # Entry point discovery
 *   rss lookup <domain> <id>               # Direct item retrieval
 *   rss dependencies <key> [--depth N]     # Forward traversal
 *   rss dependents <key> [--depth N]       # Backward traversal  
 *   rss blast-radius <key> [--depth N]     # Bidirectional traversal
 *   rss by-tag <tag>                       # Cross-domain query
 *   rss context <query>                    # Full context assembly from NL query
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initRssContext,
  lookup,
  lookupByKey,
  dependencies,
  dependents,
  blastRadius,
  byTag,
  search,
  findEntryPoints,
  assembleContext,
  getGraphStats,
  type RssContext,
  type RssQueryResult,
} from '../rss/rss-operations.js';
import type { AidocNode } from '../rss/graph-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function c(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

interface ParsedArgs {
  command: string;
  args: string[];
  depth: number;
  maxResults: number;
  format: 'table' | 'json' | 'compact';
  stateDir: string;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let depth = 2;
  let maxResults = 50;
  let format: 'table' | 'json' | 'compact' = 'table';
  let stateDir = '.ste/state';
  let help = false;
  
  const positionalArgs: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg.startsWith('--depth=')) {
      depth = parseInt(arg.split('=')[1], 10) || 2;
    } else if (arg === '--depth' && args[i + 1]) {
      depth = parseInt(args[++i], 10) || 2;
    } else if (arg.startsWith('--max=')) {
      maxResults = parseInt(arg.split('=')[1], 10) || 50;
    } else if (arg === '--max' && args[i + 1]) {
      maxResults = parseInt(args[++i], 10) || 50;
    } else if (arg.startsWith('--format=')) {
      format = arg.split('=')[1] as 'table' | 'json' | 'compact';
    } else if (arg.startsWith('--state-dir=')) {
      stateDir = arg.split('=')[1];
    } else if (arg === '--json') {
      format = 'json';
    } else if (arg === '--compact') {
      format = 'compact';
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }
  
  return {
    command: positionalArgs[0] ?? 'help',
    args: positionalArgs.slice(1),
    depth,
    maxResults,
    format,
    stateDir,
    help,
  };
}

function printHelp() {
  console.log(`
${c('RSS - Reference State Service CLI', 'bold')}
${c('Per STE-Architecture Section 4.6', 'dim')}

${c('Usage:', 'bold')}
  rss <command> [arguments] [options]

${c('Commands:', 'bold')}
  ${c('stats', 'cyan')}                              Show graph statistics
  ${c('search', 'cyan')} <query>                     Entry point discovery (natural language)
  ${c('lookup', 'cyan')} <domain> <id>               Direct item retrieval
  ${c('lookup', 'cyan')} <key>                       Direct item retrieval by full key
  ${c('dependencies', 'cyan')} <key> [--depth N]     Forward traversal (what does this depend on?)
  ${c('dependents', 'cyan')} <key> [--depth N]       Backward traversal (what depends on this?)
  ${c('blast-radius', 'cyan')} <key> [--depth N]     Bidirectional traversal (full impact surface)
  ${c('by-tag', 'cyan')} <tag>                       Cross-domain query by tag
  ${c('context', 'cyan')} <query>                    Full context assembly from NL query

${c('Options:', 'bold')}
  --depth=N          Traversal depth (default: 2)
  --max=N            Maximum results (default: 50)
  --format=FORMAT    Output format: table, json, compact (default: table)
  --json             Shorthand for --format=json
  --compact          Shorthand for --format=compact
  --state-dir=PATH   AI-DOC state directory (default: .ste/state)
  --help, -h         Show this help message

${c('Key Format:', 'bold')}
  Keys follow the format: domain/type/id
  Examples:
    graph/function/backend-lambda-handler.py-lambda_handler
    infrastructure/resource/template-AccountsTable
    data/entity/DataTable

${c('Tag Format:', 'bold')}
  Tags follow the format: category:value
  Examples:
    handler:lambda     - Lambda handler functions
    aws:dynamodb       - DynamoDB resources
    lang:python        - Python modules
    layer:api          - API layer components
    storage:dynamodb   - DynamoDB data models

${c('Examples:', 'bold')}
  rss stats
  rss search "data processor"
  rss lookup graph function lambda_handler
  rss dependencies graph/function/lambda_handler --depth 3
  rss dependents infrastructure/resource/DataTable
  rss blast-radius graph/module/handler.py --depth 2
  rss by-tag handler:lambda
  rss context "What reads from the data table?"
  rss search dynamodb --json
`);
}

function formatNode(node: AidocNode, format: 'table' | 'json' | 'compact'): string {
  if (format === 'json') {
    return JSON.stringify(node, null, 2);
  }
  
  if (format === 'compact') {
    return `${node.key} (${node.path ?? 'no path'})`;
  }
  
  // Table format
  const lines: string[] = [];
  lines.push(`  ${c('Key:', 'bold')} ${c(node.key, 'cyan')}`);
  lines.push(`  ${c('Domain:', 'dim')} ${node.domain}  ${c('Type:', 'dim')} ${node.type}`);
  if (node.path) {
    lines.push(`  ${c('Path:', 'dim')} ${node.path}`);
  }
  if (node.references.length > 0) {
    lines.push(`  ${c('References:', 'dim')} ${node.references.length} outgoing`);
  }
  if (node.referencedBy.length > 0) {
    lines.push(`  ${c('Referenced By:', 'dim')} ${node.referencedBy.length} incoming`);
  }
  return lines.join('\n');
}

function formatNodes(nodes: AidocNode[], format: 'table' | 'json' | 'compact', truncated: boolean): void {
  if (format === 'json') {
    console.log(JSON.stringify(nodes, null, 2));
    return;
  }
  
  if (nodes.length === 0) {
    console.log(c('No results found.', 'yellow'));
    return;
  }
  
  console.log(c(`Found ${nodes.length} result(s)${truncated ? ' (truncated)' : ''}:`, 'green'));
  console.log('');
  
  for (const node of nodes) {
    console.log(formatNode(node, format));
    if (format === 'table') console.log('');
  }
}

function formatQueryResult(result: RssQueryResult, format: 'table' | 'json' | 'compact'): void {
  formatNodes(result.nodes, format, result.truncated);
}

async function handleStats(ctx: RssContext, format: 'table' | 'json' | 'compact'): Promise<void> {
  const stats = getGraphStats(ctx);
  
  if (format === 'json') {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }
  
  console.log(c('Graph Statistics', 'bold'));
  console.log('');
  console.log(`  ${c('Total Nodes:', 'cyan')} ${stats.totalNodes}`);
  console.log(`  ${c('Total Edges:', 'cyan')} ${stats.totalEdges}`);
  console.log(`  ${c('Graph Version:', 'cyan')} ${ctx.graphVersion}`);
  console.log('');
  
  console.log(c('By Domain:', 'bold'));
  for (const [domain, count] of Object.entries(stats.byDomain).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c(domain, 'magenta')}: ${count}`);
  }
  console.log('');
  
  console.log(c('By Type:', 'bold'));
  for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c(type, 'blue')}: ${count}`);
  }
}

async function handleSearch(ctx: RssContext, query: string, options: ParsedArgs): Promise<void> {
  const result = search(ctx, query, { maxResults: options.maxResults });
  
  console.log(c(`Search: "${query}"`, 'bold'));
  console.log('');
  formatQueryResult(result, options.format);
}

async function handleLookup(ctx: RssContext, args: string[], format: 'table' | 'json' | 'compact'): Promise<void> {
  let node: AidocNode | null = null;
  
  if (args.length === 1 && args[0].includes('/')) {
    // Full key provided
    node = lookupByKey(ctx, args[0]);
  } else if (args.length >= 2) {
    // domain and id provided
    const domain = args[0];
    const id = args.slice(1).join(' ');
    node = lookup(ctx, domain, id);
  } else {
    console.log(c('Usage: rss lookup <domain> <id> OR rss lookup <domain/type/id>', 'red'));
    return;
  }
  
  if (!node) {
    console.log(c('Not found.', 'yellow'));
    return;
  }
  
  if (format === 'json') {
    console.log(JSON.stringify(node, null, 2));
  } else {
    console.log(c('Found:', 'green'));
    console.log('');
    console.log(formatNode(node, 'table'));
    
    // Show detailed edges
    if (node.references.length > 0) {
      console.log('');
      console.log(c('Outgoing References:', 'bold'));
      for (const ref of node.references) {
        console.log(`  → ${ref.domain}/${ref.type}/${ref.id}`);
      }
    }
    
    if (node.referencedBy.length > 0) {
      console.log('');
      console.log(c('Incoming References (Referenced By):', 'bold'));
      for (const ref of node.referencedBy) {
        console.log(`  ← ${ref.domain}/${ref.type}/${ref.id}`);
      }
    }
  }
}

async function handleDependencies(ctx: RssContext, key: string, options: ParsedArgs): Promise<void> {
  const result = dependencies(ctx, key, options.depth, options.maxResults);
  
  console.log(c(`Dependencies of: ${key}`, 'bold'));
  console.log(c(`(What does this depend on? Depth: ${options.depth})`, 'dim'));
  console.log('');
  formatQueryResult(result, options.format);
}

async function handleDependents(ctx: RssContext, key: string, options: ParsedArgs): Promise<void> {
  const result = dependents(ctx, key, options.depth, options.maxResults);
  
  console.log(c(`Dependents of: ${key}`, 'bold'));
  console.log(c(`(What depends on this? Depth: ${options.depth})`, 'dim'));
  console.log('');
  formatQueryResult(result, options.format);
}

async function handleBlastRadius(ctx: RssContext, key: string, options: ParsedArgs): Promise<void> {
  const result = blastRadius(ctx, key, options.depth, options.maxResults);
  
  console.log(c(`Blast Radius of: ${key}`, 'bold'));
  console.log(c(`(Full impact surface. Depth: ${options.depth})`, 'dim'));
  console.log('');
  formatQueryResult(result, options.format);
}

async function handleByTag(ctx: RssContext, tag: string, options: ParsedArgs): Promise<void> {
  const result = byTag(ctx, tag, options.maxResults);
  
  console.log(c(`By Tag: ${tag}`, 'bold'));
  console.log('');
  formatQueryResult(result, options.format);
}

async function handleContext(ctx: RssContext, query: string, options: ParsedArgs): Promise<void> {
  // Phase 1: Find entry points
  console.log(c(`Context Assembly for: "${query}"`, 'bold'));
  console.log('');
  
  const { entryPoints, searchTerms } = findEntryPoints(ctx, query);
  
  console.log(c('Search Terms Extracted:', 'dim'));
  console.log(`  ${searchTerms.join(', ')}`);
  console.log('');
  
  console.log(c(`Entry Points Found: ${entryPoints.length}`, 'cyan'));
  if (options.format !== 'json') {
    for (const ep of entryPoints.slice(0, 5)) {
      console.log(`  • ${ep.key}`);
    }
    if (entryPoints.length > 5) {
      console.log(`  ... and ${entryPoints.length - 5} more`);
    }
    console.log('');
  }
  
  // Phase 2: Assemble context
  const context = assembleContext(ctx, entryPoints, {
    maxDepth: options.depth,
    maxNodes: options.maxResults,
  });
  
  if (options.format === 'json') {
    console.log(JSON.stringify({
      query,
      searchTerms,
      entryPoints: entryPoints.map(n => n.key),
      context: context.nodes,
      summary: context.summary,
    }, null, 2));
    return;
  }
  
  console.log(c('Context Summary:', 'bold'));
  console.log(`  ${c('Entry Points:', 'dim')} ${context.summary.entryPointCount}`);
  console.log(`  ${c('Total Nodes:', 'dim')} ${context.summary.totalNodes}`);
  console.log(`  ${c('Traversal Depth:', 'dim')} ${context.summary.traversalDepth}`);
  console.log('');
  
  console.log(c('By Domain:', 'dim'));
  for (const [domain, count] of Object.entries(context.summary.byDomain)) {
    console.log(`  ${c(domain, 'magenta')}: ${count}`);
  }
  console.log('');
  
  console.log(c('Assembled Context:', 'bold'));
  for (const node of context.nodes) {
    console.log(formatNode(node, 'compact'));
  }
}

async function main() {
  const options = parseArgs(process.argv);
  
  if (options.help || options.command === 'help') {
    printHelp();
    process.exit(0);
  }
  
  // Determine state directory
  const runtimeDir = path.resolve(__dirname, '..', '..');
  const stateDir = path.resolve(runtimeDir, options.stateDir);
  
  console.log(c('═'.repeat(60), 'dim'));
  console.log(c('RSS - Reference State Service', 'bold'));
  console.log(c('Per STE-Architecture Section 4.6', 'dim'));
  console.log(c('═'.repeat(60), 'dim'));
  console.log('');
  console.log(c(`State Dir: ${stateDir}`, 'dim'));
  console.log('');
  
  // Initialize RSS context
  let ctx: RssContext;
  try {
    ctx = await initRssContext(stateDir);
    console.log(c(`Graph Loaded: ${ctx.graph.size} nodes`, 'green'));
    console.log('');
  } catch (error) {
    console.error(c('Failed to load AI-DOC graph.', 'red'));
    console.error(c('Run RECON first to generate state: npm run recon', 'yellow'));
    console.error('');
    if (error instanceof Error) {
      console.error(c(error.message, 'dim'));
    }
    process.exit(1);
  }
  
  // Route to command handler
  try {
    switch (options.command) {
      case 'stats':
        await handleStats(ctx, options.format);
        break;
        
      case 'search':
        if (options.args.length === 0) {
          console.log(c('Usage: rss search <query>', 'red'));
          process.exit(1);
        }
        await handleSearch(ctx, options.args.join(' '), options);
        break;
        
      case 'lookup':
        if (options.args.length === 0) {
          console.log(c('Usage: rss lookup <domain> <id> OR rss lookup <domain/type/id>', 'red'));
          process.exit(1);
        }
        await handleLookup(ctx, options.args, options.format);
        break;
        
      case 'dependencies':
      case 'deps':
        if (options.args.length === 0) {
          console.log(c('Usage: rss dependencies <key> [--depth N]', 'red'));
          process.exit(1);
        }
        await handleDependencies(ctx, options.args[0], options);
        break;
        
      case 'dependents':
      case 'rdeps':
        if (options.args.length === 0) {
          console.log(c('Usage: rss dependents <key> [--depth N]', 'red'));
          process.exit(1);
        }
        await handleDependents(ctx, options.args[0], options);
        break;
        
      case 'blast-radius':
      case 'blast':
      case 'impact':
        if (options.args.length === 0) {
          console.log(c('Usage: rss blast-radius <key> [--depth N]', 'red'));
          process.exit(1);
        }
        await handleBlastRadius(ctx, options.args[0], options);
        break;
        
      case 'by-tag':
      case 'tag':
        if (options.args.length === 0) {
          console.log(c('Usage: rss by-tag <tag>', 'red'));
          process.exit(1);
        }
        await handleByTag(ctx, options.args[0], options);
        break;
        
      case 'context':
      case 'assemble':
        if (options.args.length === 0) {
          console.log(c('Usage: rss context <natural language query>', 'red'));
          process.exit(1);
        }
        await handleContext(ctx, options.args.join(' '), options);
        break;
        
      default:
        console.log(c(`Unknown command: ${options.command}`, 'red'));
        console.log('');
        console.log('Run rss --help for usage information.');
        process.exit(1);
    }
  } catch (error) {
    console.error(c('Command failed:', 'red'));
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
  
  console.log('');
}

main().catch(error => {
  console.error('RSS CLI failed:', error);
  process.exit(1);
});

