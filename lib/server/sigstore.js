import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

async function downloadToTemp(url, filename) {
  if (!globalThis.fetch) throw new Error('fetch not available');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigstore-'));
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, buffer);
  return { filePath, cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) };
}

export async function verifyReleaseAssetSignature(asset = {}, signatureAsset = null) {
  // asset: { name, downloadUrl }
  // signatureAsset: { name, downloadUrl }
  // Test-mode: mocked verification
  if (process.env.TEST_SLSA_MOCK === 'true') {
    const name = String(asset.name || '');
    const sigName = String(signatureAsset?.name || '');
    const ok = /\.sig$|\.asc$|signed/i.test(name) || /\.sig$|\.asc$|signed/i.test(sigName) || /\.sig$|\.asc$|signed/i.test((asset.name || '') + (sigName || ''));
    return { ok, method: 'mock', details: ok ? 'TEST_SLSA_MOCK: signature file present' : 'no signature detected' };
  }

  // If COSIGN_CLI_PATH or cosign in PATH, attempt verification
  const cosignPath = process.env.COSIGN_CLI_PATH || 'cosign';
  try {
    // quick availability check
    await execFileAsync(cosignPath, ['version']);
  } catch (err) {
    return { ok: false, method: 'cosign', details: 'cosign not available' };
  }

  if (!signatureAsset || !signatureAsset.downloadUrl || !asset.downloadUrl) {
    return { ok: false, method: 'cosign', details: 'missing asset or signature URL' };
  }

  let assetTmp, sigTmp;
  try {
    assetTmp = await downloadToTemp(asset.downloadUrl, `asset-${Date.now()}-${asset.name || 'asset'}`);
    sigTmp = await downloadToTemp(signatureAsset.downloadUrl, `sig-${Date.now()}-${signatureAsset.name || 'sig'}`);
    // cosign verify-blob --signature sigfile assetfile
    const args = ['verify-blob', '--signature', sigTmp.filePath, assetTmp.filePath];
    const result = await execFileAsync(cosignPath, args);
    // success if exit code 0
    return { ok: true, method: 'cosign', details: result.stdout + '\n' + result.stderr };
  } catch (err) {
    return { ok: false, method: 'cosign', details: String(err?.message || err) };
  } finally {
    try { if (assetTmp && assetTmp.cleanup) assetTmp.cleanup(); } catch {};
    try { if (sigTmp && sigTmp.cleanup) sigTmp.cleanup(); } catch {};
  }
}

export default { verifyReleaseAssetSignature };
