#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';

const scriptPath = path.join(process.cwd(), 'scripts', 'db-setup.js');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [scriptPath, ...args], {
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
