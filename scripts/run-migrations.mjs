#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const scriptPath = path.resolve(process.cwd(), 'scripts', 'db-setup.js');
if (!existsSync(scriptPath)) {
  console.error(`Missing database setup script: ${scriptPath}`);
  process.exit(1);
}

// Collect and validate CLI args to avoid injection or unexpected values.
const rawArgs = process.argv.slice(2).filter((v) => typeof v === 'string' && v.length > 0);
// Allowable characters: alphanumeric, underscore, dash, dot, slash, equals, colon, and @
const VALID_ARG_RE = /^[A-Za-z0-9_\-./=:@]+$/;
for (const a of rawArgs) {
  if (!VALID_ARG_RE.test(a)) {
    console.error('Invalid argument passed to migration script:', a);
    process.exit(1);
  }
}

// Additional safety checks
for (const a of rawArgs) {
  // disallow path traversal segments
  if (a.includes('..')) {
    console.error('Invalid argument (path traversal not allowed):', a);
    process.exit(1);
  }
  // disallow null bytes
  if (a.indexOf('\0') !== -1) {
    console.error('Invalid argument (null byte):', a);
    process.exit(1);
  }
  // limit argument length
  if (a.length > 200) {
    console.error('Invalid argument (too long):', a);
    process.exit(1);
  }
  // disallow absolute filesystem paths (POSIX and Windows) in args
  if (a.startsWith('/') || /^[A-Za-z]:[\\/]/.test(a) || a.startsWith('\\\\')) {
    console.error('Invalid argument (absolute paths not allowed):', a);
    process.exit(1);
  }
}

const safeEnv = { ...process.env };
// Avoid leaking shell-specific variables; keep NODE_ENV if present or set to 'production'.
safeEnv.NODE_ENV = safeEnv.NODE_ENV || 'production';

const spawnOptions = {
  stdio: 'inherit',
  shell: false,
  env: safeEnv,
  cwd: path.dirname(scriptPath),
  timeout: 5 * 60 * 1000, // 5 minutes
};

const result = spawnSync(process.execPath, [scriptPath, ...rawArgs], spawnOptions);

if (result.error) {
  console.error('Failed to launch migration script:', result.error && result.error.message ? result.error.message : result.error);
  process.exit(1);
}

if (result.signal) {
  console.error('Migration script terminated by signal:', result.signal);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
