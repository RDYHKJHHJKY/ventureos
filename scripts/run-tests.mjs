import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const testDir = join(process.cwd(), 'test');
let tests = [];
try {
  tests = readdirSync(testDir).filter((f) => f.endsWith('.js')).sort();
} catch (err) {
  console.error('No test directory found or unable to read tests:', err.message);
  process.exit(1);
}

for (const file of tests) {
  console.log('---- RUN:', file);
  try {
    execFileSync(process.execPath, [join(testDir, file)], { stdio: 'inherit' });
  } catch (err) {
    console.error(`Test failed: ${file}`);
    process.exit(err.status || 1);
  }
}
console.log('All tests completed.');
