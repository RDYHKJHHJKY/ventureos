// Force file-backed storage for this repro
process.env.DATABASE_URL = '';
import { mutateDb, createId } from './lib/server/data-store.js';
import { createSession, createWorkspaceForUser } from './lib/server/auth.js';
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

(async () => {
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.msps = [];
    db.mspMembers = [];
    db.sessions = [];
    db.assets = [];
    db.scanRuns = [];
    db.scanFindings = [];
    db.evidenceItems = [];
    db.passports = [];
    db.projects = [];
    db.projectArtifacts = [];
    db.projectDependencies = [];
    db.projectMetadata = [];
    db.projectSignals = [];
    db.projectScores = [];
    db.projectEvents = [];
    db.sprVendors = [];
    db.sprSoftware = [];
    db.sprEvidence = [];
    db.sprPassports = [];
    db.sprSignals = [];
    db.sprAuditLogs = [];
  });
  const userId = createId('user', 'spr');
  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: userId, name: 'SPR User', email: 'spr@test.local', passwordHash: 'hash', createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });
  const workspace = await createWorkspaceForUser(user.id, 'SPR Workspace');
  const session = await createSession(user.id, workspace.id);
  const softwareResponse = await requestJson('/api/spr/software', 'POST', { name: 'Test Software', vendorName: 'Test Vendor', ecosystem: 'npm', packageName: 'test-package', repositoryUrl: 'https://example.com/repo' }, session.token);
  const evidenceResponse = await requestJson(`/api/spr/evidence`, 'POST', { softwareId: softwareResponse.payload.software.id, type: 'sbom', title: 'Test SBOM', summary: 'summary', source: 'manual', uri: 'https://example.com', strength: 0.9, freshnessDays: 30, verified: true, visibility: 'public' }, session.token);
  console.log('evidenceResponse:', evidenceResponse.statusCode, JSON.stringify(evidenceResponse.payload));
  if (!evidenceResponse.payload || !evidenceResponse.payload.evidence) {
    console.error('evidence creation failed, aborting');
    process.exit(1);
  }
  const first = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/bundle`, 'POST', { requestId: 'bundle-001', encrypted: true, recipients: ['buyer-123'], selectiveDisclosure: true }, session.token);
  console.log('first:', first.statusCode, JSON.stringify(first.payload));
  const second = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/bundle`, 'POST', { requestId: 'bundle-001', encrypted: true, recipients: ['buyer-123'], selectiveDisclosure: true }, session.token);
  console.log('second:', second.statusCode, JSON.stringify(second.payload));
})();
