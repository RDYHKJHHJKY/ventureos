import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const repoRoot = path.resolve(new URL(import.meta.url).pathname, '..', '..');
const fixturesDir = path.join(repoRoot, 'fixtures');
const fixture = path.join(fixturesDir, 'fixture.bin');
const sig = path.join(fixturesDir, 'fixture.sig');
const pub = path.join(fixturesDir, 'fixture.pub');

function findCosign() {
  const envPath = process.env.COSIGN_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  // Try default names: cosign (linux/mac) or cosign.exe (windows)
  const candidates = [
    path.join(process.cwd(), 'cosign'),
    path.join(process.cwd(), 'cosign.exe'),
    '/usr/local/bin/cosign',
    'cosign'
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch (e) { }
  }
  return 'cosign';
}

async function main() {
  if (!existsSync(fixture)) {
    console.error('Fixture not found at', fixture);
    process.exit(1);
  }
  if (!existsSync(sig) || !existsSync(pub)) {
    console.error('Signature or public key not found. Ensure fixtures/fixture.sig and fixtures/fixture.pub exist.');
    process.exit(1);
  }

  const cosign = findCosign();
  console.log('Using cosign at', cosign);

  const args = ['verify-blob', '--key', pub, '--signature', sig, fixture];
  const res = spawnSync(cosign, args, { stdio: 'inherit' });
  if (res.error) {
    console.error('Error running cosign:', res.error);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error('cosign verify-blob failed with exit code', res.status);
    process.exit(res.status || 1);
  }
  console.log('cosign verification succeeded');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
