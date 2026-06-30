import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const deployScript = join(projectRoot, 'scripts', 'validate-deploy-endpoints.mjs');
if (!existsSync(deployScript)) {
  throw new Error(`Missing deploy validation script: ${deployScript}`);
}

function runDeploy(target, url) {
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
    throw new Error('Set VERCEL_URL, VERCEL_PREVIEW_URL, or VERCEL_PRODUCTION_URL to validate deployed targets.');
  }

  for (const { target, url } of urls) {
    runDeploy(target, url);
  }

  console.log('\nAll deploy targets validated successfully.');
}

main();
