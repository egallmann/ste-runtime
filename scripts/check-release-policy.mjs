import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const errors = [];

const packageJson = JSON.parse(read('package.json'));
if (packageJson.private !== true) {
  errors.push('package.json must remain private until the production-overhaul publication decision');
}
if (packageJson.publishConfig) {
  errors.push('package.json must not define publishConfig while npm publication is deferred');
}

const testWorkflow = read('.github/workflows/test.yml');
for (const branch of ['main', 'develop']) {
  if (!testWorkflow.includes(branch)) {
    errors.push(`test workflow must cover ${branch}`);
  }
}

for (const requiredPath of [
  '.github/workflows/ip-guard.yml',
  'adrs/MIGRATION.md',
  'adrs/adr-projection',
]) {
  if (!exists(requiredPath)) {
    errors.push(`required public-release control is missing: ${requiredPath}`);
  }
}

for (const retiredPath of ['adrs/physical', 'adrs/rendered']) {
  if (exists(retiredPath)) {
    errors.push(`retired generated/canonical path must remain absent: ${retiredPath}`);
  }
}

if (errors.length > 0) {
  console.error('release policy check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('release policy check: OK (public source, private package, promoted branches)');
}
