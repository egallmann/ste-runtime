#!/usr/bin/env node
/**
 * Discovery CLI - Test and debug project structure discovery
 * 
 * Usage:
 *   node dist/cli/discovery-cli.js
 *   node dist/cli/discovery-cli.js /path/to/project
 */

import { ProjectDiscovery, DomainType } from '../discovery/index.js';
import path from 'path';

function formatDomainType(type: DomainType): string {
  const colors = {
    [DomainType.CLIENT]: '\x1b[36m',        // Cyan
    [DomainType.SERVER]: '\x1b[33m',        // Yellow
    [DomainType.INFRASTRUCTURE]: '\x1b[35m', // Magenta
    [DomainType.DATA]: '\x1b[32m',          // Green
    [DomainType.SHARED]: '\x1b[37m',        // White
    [DomainType.UNKNOWN]: '\x1b[90m'        // Gray
  };
  
  const reset = '\x1b[0m';
  const color = colors[type] || reset;
  
  return `${color}${type}${reset}`;
}

function formatConfidence(confidence: number): string {
  if (confidence >= 0.8) return '\x1b[32m' + confidence.toFixed(2) + '\x1b[0m'; // Green
  if (confidence >= 0.5) return '\x1b[33m' + confidence.toFixed(2) + '\x1b[0m'; // Yellow
  return '\x1b[31m' + confidence.toFixed(2) + '\x1b[0m'; // Red
}

async function main() {
  const targetDir = process.argv[2] || process.cwd();
  const absolutePath = path.resolve(targetDir);

  console.log('='.repeat(80));
  console.log('PROJECT STRUCTURE DISCOVERY');
  console.log('='.repeat(80));
  console.log();
  console.log(`Target: ${absolutePath}`);
  console.log();

  const discovery = new ProjectDiscovery(absolutePath);
  
  console.log('Discovering project structure...');
  console.log();
  
  const startTime = Date.now();
  const structure = await discovery.discover();
  const duration = Date.now() - startTime;

  console.log('='.repeat(80));
  console.log('DISCOVERY RESULTS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Architecture: ${structure.architecture}`);
  console.log(`Domains Found: ${structure.domains.length}`);
  console.log(`Discovery Time: ${duration}ms`);
  console.log();

  if (structure.domains.length === 0) {
    console.log('\x1b[33mNo domains discovered. Project may have unusual structure.\x1b[0m');
    console.log();
    return;
  }

  console.log('='.repeat(80));
  console.log('DOMAINS');
  console.log('='.repeat(80));
  console.log();

  for (const domain of structure.domains) {
    console.log(`Domain: \x1b[1m${domain.name}\x1b[0m`);
    console.log(`  Type: ${formatDomainType(domain.type)}`);
    console.log(`  Confidence: ${formatConfidence(domain.confidence)}`);
    console.log(`  Framework: ${domain.framework || 'unknown'}`);
    console.log(`  Root Paths:`);
    domain.rootPaths.forEach(p => console.log(`    - ${p}`));
    console.log(`  Indicators:`);
    domain.indicators.slice(0, 5).forEach(i => console.log(`    - ${i}`));
    if (domain.indicators.length > 5) {
      console.log(`    ... and ${domain.indicators.length - 5} more`);
    }
    console.log();
  }

  console.log('='.repeat(80));
  console.log('FILE DOMAIN MAPPING (Sample)');
  console.log('='.repeat(80));
  console.log();

  // Test file mapping with some example paths
  const testPaths = structure.domains.flatMap(d => 
    d.rootPaths.flatMap((root: string) => [
      `${root}/test.ts`,
      `${root}/components/example.ts`,
      `${root}/handlers/example.py`
    ])
  );

  for (const testPath of testPaths.slice(0, 10)) {
    const domain = discovery.getDomainForFile(testPath);
    const domainType = domain ? discovery.getDomainType(domain) : null;
    
    if (domain && domainType) {
      console.log(`${testPath}`);
      console.log(`  → Domain: ${domain} (${formatDomainType(domainType)})`);
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log('\x1b[32m✓ Discovery Complete\x1b[0m');
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('\x1b[31mError during discovery:\x1b[0m', error);
  process.exit(1);
});

