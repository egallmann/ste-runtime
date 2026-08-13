const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");

const gitCheck = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});

if (gitCheck.error || gitCheck.status !== 0) {
  console.warn("Git repository not detected; skipping local hook setup.");
  process.exit(0);
}

const hookPath = spawnSync("git", ["config", "core.hooksPath", ".husky"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

if (hookPath.error) {
  console.error(`Unable to configure Git hooks: ${hookPath.error.message}`);
  process.exit(1);
}

if (hookPath.status !== 0) {
  process.exit(hookPath.status ?? 1);
}

console.log("Configured Git hooks path: .husky");
