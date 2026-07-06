#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const scriptPath = path.resolve(process.cwd(), 'scripts', 'db-setup.js');
if (!existsSync(scriptPath)) {
  console.error(`Missing database setup script: ${scriptPath}`);
  process.exit(1);
}

const args = process.argv.slice(2).filter((value) => typeof value === 'string' && value.length > 0);
const result = spawnSync(process.execPath, [scriptPath, ...args], {
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

if (result.error) {
  console.error('Failed to launch migration script:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
