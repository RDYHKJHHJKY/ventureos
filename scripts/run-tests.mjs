import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const testDir = resolve(process.cwd(), 'test');
let tests = [];
try {
  tests = readdirSync(testDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ name: file, path: join(testDir, file) }))
    .filter((entry) => statSync(entry.path).isFile())
    .sort((a, b) => a.name.localeCompare(b.name));
} catch (err) {
  console.error('No test directory found or unable to read tests:', err.message);
  process.exit(1);
}

for (const test of tests) {
  console.log('---- RUN:', test.name);
  try {
    execFileSync(process.execPath, [test.path], { stdio: 'inherit', env: process.env });
  } catch (err) {
    console.error(`Test failed: ${test.name}`);
    process.exit(err.status || 1);
  }
}
console.log('All tests completed.');
