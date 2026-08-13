const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const hookChecks = {
  "pre-commit": [
    { label: "Building project", script: "build" },
    { label: "Running RECON self-check", script: "recon:self", quiet: true },
    { label: "Running tests", script: "test" },
    { label: "Running RSS stats check", script: "rss:stats", quiet: true },
    { label: "Checking test coverage", script: "test:coverage", coverage: true },
  ],
  "pre-push": [
    { label: "Running pre-push contract guards", script: "test:contract-guards" },
  ],
};

const invokedName = path.basename(process.argv[1]);
const hookName = hookChecks[invokedName] ? invokedName : process.argv[2];

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function runCheck(check) {
  console.log(`${check.label}...`);

  const result = spawnSync(npmCommand, ["run", check.script], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    stdio: check.quiet || check.coverage ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    fail(`${check.script} could not start: ${result.error.message}`);
  }

  if (check.quiet || check.coverage) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }

  if (result.status !== 0) {
    fail(`${check.script} failed - hook aborted`);
  }

  if (check.coverage) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const coverageMatch = output.match(/Statements\s*(?::|\|)\s*([\d.]+)/i);

    if (!coverageMatch) {
      console.warn("[WARN] Could not parse coverage percentage - skipping coverage check");
      return;
    }

    const coveragePercent = coverageMatch[1];
    const coverageInteger = Number.parseInt(coveragePercent, 10);
    const minimumCoverage = 50;

    if (coverageInteger < minimumCoverage) {
      fail(
        `Test coverage is ${coveragePercent}% (minimum: ${minimumCoverage}%) - hook aborted`,
      );
    }

    console.log(
      `[OK] Test coverage is ${coveragePercent}% (minimum: ${minimumCoverage}%)`,
    );
  }

  console.log(`[OK] ${check.label}`);
}

const checks = hookChecks[hookName];
if (!checks) {
  fail(`Unknown hook: ${hookName}`);
}

console.log("");
console.log("==========================================");
console.log(`Running ${hookName} checks...`);
console.log("==========================================");
console.log("");

for (const check of checks) {
  runCheck(check);
  console.log("");
}

console.log("==========================================");
console.log(`All ${hookName} checks passed!`);
console.log("==========================================");
console.log("");
