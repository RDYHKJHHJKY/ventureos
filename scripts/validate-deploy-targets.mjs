import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = process.cwd();
const deployScript = resolve(projectRoot, 'scripts', 'validate-deploy-endpoints.mjs');
if (!existsSync(deployScript)) {
  throw new Error(`Missing deploy validation script: ${deployScript}`);
}

function runDeploy(target, url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error(`Invalid deploy URL for target ${target}`);
  }
  console.log(`\n=== RUNNING DEPLOY VALIDATION FOR ${target.toUpperCase()} ===`);
  execFileSync(process.execPath, [deployScript], {
    stdio: 'inherit',
    env: { ...process.env, VERCEL_URL: url },
  });
}

function main() {
  const urls = [];
  if (process.env.VERCEL_URL) {
    urls.push({ target: 'custom', url: process.env.VERCEL_URL });
  }
  if (process.env.VERCEL_PREVIEW_URL) {
    urls.push({ target: 'preview', url: process.env.VERCEL_PREVIEW_URL });
  }
  if (process.env.VERCEL_PRODUCTION_URL) {
    urls.push({ target: 'production', url: process.env.VERCEL_PRODUCTION_URL });
  }

  if (!urls.length) {
    urls.push({ target: 'local', url: 'http://127.0.0.1:5173' });
  }

  for (const { target, url } of urls) {
    runDeploy(target, url);
  }

  console.log('\nAll deploy targets validated successfully.');
}

main();
