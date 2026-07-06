import { createHmac } from 'node:crypto';
import { hmacIngestionGate } from '../lib/server/middleware/hmac-auth.js';

process.env.INGESTION_SECRET = 'test-secret';

const payload = { softwareId: 'test', type: 'sbom', title: 'CycloneDX SBOM' };
const rawEvidenceBody = JSON.stringify(payload);
const evidenceSignature = createHmac('sha256', process.env.INGESTION_SECRET).update(rawEvidenceBody).digest('hex');
const req = {
  method: 'POST',
  url: '/api/spr/evidence',
  headers: {
    'content-type': 'application/json',
    'x-ventureos-signature': `sha256=${evidenceSignature}`,
  },
  body: rawEvidenceBody,
};
const res = {
  statusCode: 200,
  headers: {},
  body: null,
  setHeader(name, value) { this.headers[name] = value; },
  writeHead(code, headers) { this.statusCode = code; this.headers = { ...this.headers, ...headers }; },
  end(payload) { this.body = payload; },
};

const ok = hmacIngestionGate(req, res, () => {});
console.log('ok:', ok);
console.log('res:', res);
console.log('req.rawBody:', req.rawBody);
