import { registerUser, createSession } from './lib/server/auth.js';
import { query } from './lib/server/db.js';
import { handleApiRequest } from './lib/server/api-router.js';

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(code, headers) { this.statusCode = code; this.headers = { ...this.headers, ...headers }; },
    end(payload) { this.body = payload; },
  };
}

async function requestJson(pathname, method = 'GET', payload = null, token) {
  const req = { method, url: pathname, headers: token ? { cookie: `ventureos_session=${token}` } : {} };
  if (payload) { req.body = JSON.stringify(payload); req.headers['content-type'] = 'application/json'; }
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

async function main() {
  try {
    await query('DELETE FROM spr_audit_logs');
    await query('DELETE FROM spr_signals');
    await query('DELETE FROM spr_evidence');
    await query('DELETE FROM spr_software');
    await query('DELETE FROM spr_vendors');
    await query('DELETE FROM sessions');
    await query('DELETE FROM workspace_members');
    await query('DELETE FROM workspaces');
    await query('DELETE FROM users');
  } catch (e) {
    console.warn('cleanup', e.message);
  }

  const result = await registerUser({ name: 'SPR Score', email: 'sprscore@test.local', password: 'testpassword123', workspaceName: 'SPR Score Workspace' });
  const session = await createSession(result.user.id, { workspaceId: result.workspace.id });

  const vendorResponse = await requestJson('/api/spr/vendors', 'POST', { name: 'Contoso', domain: 'contoso.example', email: 'security@contoso.example', country: 'US', complianceClaims: ['SOC2'] }, session.token);
  const softwareResponse = await requestJson('/api/spr/software', 'POST', { name: 'Contoso Agent', vendorId: vendorResponse.payload.vendor.id, repositoryUrl: 'https://github.com/contoso/agent', packageName: '@contoso/agent', version: '1.0.0', ecosystem: 'npm' }, session.token);
  const evidenceResponse = await requestJson('/api/spr/evidence', 'POST', { softwareId: softwareResponse.payload.software.id, type: 'sbom', title: 'SBOM', summary: 'Test', uri: 'https://example.com/sbom.json', strength: 0.9, freshnessDays: 7, verified: true }, session.token);
  const verifyResponse = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/verify`, 'POST', { method: 'sigstore', verified: true, details: 'Signed' }, session.token);
  const scoreResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/score`, 'GET', null, session.token);
  console.log(JSON.stringify({ vendorResponse: vendorResponse.statusCode, softwareResponse: softwareResponse.statusCode, evidenceResponse: evidenceResponse.statusCode, verifyResponse: verifyResponse.statusCode, scoreResponse: scoreResponse.payload }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
