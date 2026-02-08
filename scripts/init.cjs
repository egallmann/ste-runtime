#!/usr/bin/env node
/**
 * STE Runtime Initialization Script
 * 
 * Zero-dependency init script that bootstraps ste-runtime.
 * This script can run before npm install since it uses only Node.js built-ins.
 * 
 * Usage:
 *   node scripts/init.js              # Full initialization
 *   node scripts/init.js --check      # Check prerequisites only
 *   node scripts/init.js --mcp        # Also configure Cursor MCP
 *   node scripts/init.js --help       # Show help
 * 
 * For AI Assistants:
 *   cd ste-runtime-private && node scripts/init.js
 */

const { execSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const MIN_NODE_VERSION = 18;
const SCRIPT_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════
// Terminal Colors
// ═══════════════════════════════════════════════════════════════

const isCI = process.env.CI === 'true';
const isTTY = process.stdout.isTTY && !isCI;

const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  red: isTTY ? '\x1b[31m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  blue: isTTY ? '\x1b[34m' : '',
};

// ═══════════════════════════════════════════════════════════════
// Logging Utilities
// ═══════════════════════════════════════════════════════════════

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function warn(msg) { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }
function fail(msg) { console.log(`${c.red}✗${c.reset} ${msg}`); }
function header(msg) { console.log(`\n${c.bold}${c.cyan}═══ ${msg} ═══${c.reset}\n`); }
function step(n, total, msg) { console.log(`${c.blue}[${n}/${total}]${c.reset} ${msg}`); }

// ═══════════════════════════════════════════════════════════════
// Argument Parsing
// ═══════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    check: args.includes('--check'),
    mcp: args.includes('--mcp'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    skipBuild: args.includes('--skip-build'),
    skipRecon: args.includes('--skip-recon'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function showHelp() {
  console.log(`
${c.bold}STE Runtime Initialization Script v${SCRIPT_VERSION}${c.reset}

${c.cyan}USAGE:${c.reset}
  node scripts/init.js [options]

${c.cyan}OPTIONS:${c.reset}
  --check       Check prerequisites only, don't install
  --mcp         Configure Cursor MCP after installation
  --verbose     Show detailed command output
  --skip-build  Skip the TypeScript build step
  --skip-recon  Skip initial RECON semantic extraction
  --help        Show this help message

${c.cyan}EXAMPLES:${c.reset}
  ${c.dim}# Full initialization${c.reset}
  node scripts/init.cjs

  ${c.dim}# Check if prerequisites are met${c.reset}
  node scripts/init.cjs --check

  ${c.dim}# Initialize and configure Cursor MCP${c.reset}
  node scripts/init.cjs --mcp

${c.cyan}WHAT THIS DOES:${c.reset}
  1. Validates prerequisites (Node.js 18+, npm)
  2. Installs dependencies (npm install)
  3. Builds the project (npm run build)
  4. Runs initial RECON to create semantic graph
  5. Validates the installation
  6. (Optional) Configures MCP for Cursor IDE

${c.cyan}FOR AI ASSISTANTS:${c.reset}
  Simply run: cd ste-runtime-private; node scripts/init.cjs
`);
}

// ═══════════════════════════════════════════════════════════════
// Prerequisite Checks
// ═══════════════════════════════════════════════════════════════

function getNodeVersion() {
  try {
    const raw = process.version.slice(1);
    const [major, minor, patch] = raw.split('.').map(Number);
    return { major, minor, patch, raw };
  } catch {
    return null;
  }
}

function getNpmVersion() {
  try {
    return execSync('npm --version', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function checkPrerequisites() {
  header('Checking Prerequisites');
  
  let valid = true;
  
  // Node.js version check
  const nodeVersion = getNodeVersion();
  if (!nodeVersion) {
    fail('Node.js not found');
    valid = false;
  } else if (nodeVersion.major < MIN_NODE_VERSION) {
    fail(`Node.js ${nodeVersion.raw} is too old. Required: ${MIN_NODE_VERSION}.0.0+`);
    valid = false;
  } else {
    ok(`Node.js ${nodeVersion.raw}`);
  }
  
  // npm check
  const npmVersion = getNpmVersion();
  if (!npmVersion) {
    fail('npm not found');
    valid = false;
  } else {
    ok(`npm ${npmVersion}`);
  }
  
  // Directory check
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(pkgPath)) {
    fail('package.json not found. Run from ste-runtime-private directory.');
    valid = false;
  } else {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name === 'ste-runtime') {
        ok('In ste-runtime directory');
      } else {
        fail(`Wrong project: ${pkg.name}. Expected: ste-runtime`);
        valid = false;
      }
    } catch {
      fail('Failed to read package.json');
      valid = false;
    }
  }
  
  return { valid, nodeVersion: nodeVersion?.raw, npmVersion };
}

// ═══════════════════════════════════════════════════════════════
// Installation Steps
// ═══════════════════════════════════════════════════════════════

function runCommand(cmd, description, verbose) {
  try {
    if (verbose) log(`  Running: ${cmd}`);
    execSync(cmd, {
      stdio: verbose ? 'inherit' : 'pipe',
      encoding: 'utf8',
    });
    return true;
  } catch (e) {
    if (verbose) fail(`Command failed: ${e.message}`);
    return false;
  }
}

function installDependencies(verbose) {
  header('Installing Dependencies');
  step(1, 1, 'Running npm install...');
  
  const result = runCommand('npm install', 'Installing', verbose);
  
  if (result) {
    ok('Dependencies installed');
  } else {
    fail('Failed to install dependencies');
  }
  
  return result;
}

function buildProject(verbose) {
  header('Building Project');
  step(1, 1, 'Running npm run build...');
  
  const result = runCommand('npm run build', 'Building', verbose);
  
  if (result) {
    ok('Project built successfully');
    
    if (fs.existsSync(path.join(process.cwd(), 'dist'))) {
      ok('dist/ directory created');
    }
  } else {
    fail('Build failed');
  }
  
  return result;
}

function runInitialRecon(verbose) {
  header('Running Initial RECON');
  step(1, 2, 'Generating semantic graph (self-documentation)...');
  
  const result = runCommand('npm run recon:self', 'RECON', verbose);
  
  if (result) {
    ok('Self-documentation complete (.ste-self/state/)');
  } else {
    warn('Self-documentation had issues (non-fatal)');
  }
  
  step(2, 2, 'Verifying semantic graph...');
  
  const statePath = path.join(process.cwd(), '.ste-self', 'state');
  if (fs.existsSync(statePath)) {
    ok('Semantic graph created');
    
    // Count slices
    try {
      function countSlices(dir) {
        if (!fs.existsSync(dir)) return 0;
        let count = 0;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            count += countSlices(fullPath);
          } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
            count++;
          }
        }
        return count;
      }
      const sliceCount = countSlices(statePath);
      ok(`${sliceCount} AI-DOC slices generated`);
    } catch { /* ignore */ }
  } else {
    warn('Semantic graph directory not found (will be created on first use)');
  }
  
  return true;
}

function validateInstallation() {
  header('Validating Installation');
  
  let valid = true;
  
  const checks = [
    ['dist/cli/index.js', 'CLI entry point'],
    ['dist/cli/recon-cli.js', 'RECON CLI'],
    ['dist/mcp/mcp-server.js', 'MCP server'],
  ];
  
  for (const [file, name] of checks) {
    if (fs.existsSync(path.join(process.cwd(), file))) {
      ok(`${name} exists`);
    } else {
      fail(`${name} missing (${file})`);
      valid = false;
    }
  }
  
  // Config file (optional)
  if (fs.existsSync(path.join(process.cwd(), 'ste.config.json'))) {
    ok('Configuration file exists');
  } else {
    warn('No ste.config.json (will use auto-detection)');
  }
  
  // Try RSS stats
  try {
    execSync('node dist/cli/index.js rss-stats --state .ste-self/state', {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    ok('RSS operations functional');
  } catch {
    warn('RSS operations could not be verified');
  }
  
  return valid;
}

function configureMcp() {
  header('Configuring MCP for Cursor');
  
  const homeDir = os.homedir();
  const cursorDir = path.join(homeDir, '.cursor');
  const mcpPath = path.join(cursorDir, 'mcp.json');
  
  // Create .cursor if needed
  if (!fs.existsSync(cursorDir)) {
    try {
      fs.mkdirSync(cursorDir, { recursive: true });
      ok('Created ~/.cursor directory');
    } catch {
      fail('Failed to create ~/.cursor directory');
      return false;
    }
  }
  
  const runtimeDir = process.cwd();
  
  const steConfig = {
    disabled: false,
    timeout: 60,
    type: 'stdio',
    command: 'node',
    args: [
      path.join(runtimeDir, 'dist', 'cli', 'index.js'),
      'watch',
      '--mcp',
    ],
  };
  
  let config = { mcpServers: {} };
  
  // Load existing
  if (fs.existsSync(mcpPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      config = { ...config, ...existing };
      if (!config.mcpServers) config.mcpServers = {};
      ok('Loaded existing MCP configuration');
    } catch {
      warn('Could not parse existing mcp.json');
    }
  }
  
  config.mcpServers['ste-runtime'] = steConfig;
  
  try {
    fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2), 'utf8');
    ok('MCP configuration updated');
    log(`  Config path: ${mcpPath}`);
    log('');
    warn('Restart Cursor for changes to take effect');
  } catch {
    fail('Failed to write MCP configuration');
    return false;
  }
  
  return true;
}

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════

function printSummary(success, options) {
  header('Bootstrap Complete');
  
  if (success) {
    log(`${c.green}${c.bold}STE Runtime is ready to use!${c.reset}`);
    log('');
    log('Quick Start:');
    log(`  ${c.cyan}npm run recon:full${c.reset}    # Analyze your parent project`);
    log(`  ${c.cyan}npm run rss:stats${c.reset}     # View graph statistics`);
    log(`  ${c.cyan}npm run rss -- search "query"${c.reset}  # Search the graph`);
    log('');
    log('For Cursor MCP integration:');
    if (options.mcp) {
      log(`  ${c.green}✓ MCP configured${c.reset} - Restart Cursor to enable`);
    } else {
      log(`  Run: ${c.cyan}node scripts/init.cjs --mcp${c.reset}`);
      log('  Or see: documentation/guides/mcp-setup.md');
    }
  } else {
    log(`${c.red}${c.bold}Bootstrap failed. See errors above.${c.reset}`);
    log('');
    log('Common fixes:');
    log('  1. Ensure Node.js 18+ is installed');
    log('  2. Run from the ste-runtime-private directory');
    log('  3. Check network connectivity for npm install');
    log('  4. Try: rm -rf node_modules && npm install');
  }
  log('');
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  log('');
  log(`${c.bold}${c.cyan}╔════════════════════════════════════════════╗${c.reset}`);
  log(`${c.bold}${c.cyan}║   STE Runtime Initialization v${SCRIPT_VERSION}        ║${c.reset}`);
  log(`${c.bold}${c.cyan}╚════════════════════════════════════════════╝${c.reset}`);
  
  // Check prerequisites
  const prereqs = checkPrerequisites();
  
  if (!prereqs.valid) {
    printSummary(false, options);
    process.exit(1);
  }
  
  // --check only
  if (options.check) {
    log('');
    ok('All prerequisites met. Ready to bootstrap.');
    log('');
    log(`Run ${c.cyan}node scripts/init.cjs${c.reset} to continue.`);
    process.exit(0);
  }
  
  // Install dependencies
  if (!installDependencies(options.verbose)) {
    printSummary(false, options);
    process.exit(1);
  }
  
  // Build
  if (!options.skipBuild) {
    if (!buildProject(options.verbose)) {
      printSummary(false, options);
      process.exit(1);
    }
  } else {
    warn('Skipping build (--skip-build)');
  }
  
  // RECON
  if (!options.skipRecon) {
    runInitialRecon(options.verbose);
  } else {
    warn('Skipping RECON (--skip-recon)');
  }
  
  // Validate
  const isValid = validateInstallation();
  
  // MCP
  if (options.mcp) {
    configureMcp();
  }
  
  printSummary(isValid, options);
  process.exit(isValid ? 0 : 1);
}

main().catch((e) => {
  fail(`Bootstrap failed: ${e.message}`);
  process.exit(1);
});

