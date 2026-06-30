import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const projectRoot = process.cwd();
const scripts = [
  { name: 'unit tests', file: join(projectRoot, 'scripts', 'run-tests.mjs') },
  { name: 'auth endpoints', file: join(projectRoot, 'scripts', 'validate-auth-endpoints.mjs') },
];

if (process.env.VERCEL_URL) {
  scripts.push({ name: 'deploy smoke test', file: join(projectRoot, 'scripts', 'validate-deploy-endpoints.mjs') });
}

function runScript(script) {
  if (!existsSync(script.file)) {
    throw new Error(`Missing smoke script: ${script.file}`);
  }
  console.log(`\n=== RUNNING ${script.name.toUpperCase()} ===`);
  execFileSync(process.execPath, [script.file], { stdio: 'inherit' });
}

function main() {
  console.log('Starting full smoke validation...');
  for (const script of scripts) {
    runScript(script);
  }
  console.log('\nAll smoke tests completed successfully.');
}

main();
