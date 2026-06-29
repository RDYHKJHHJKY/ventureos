const { mutateDb, createId } = require('./lib/server/data-store.js');
const { createSession } = require('./lib/server/auth.js');
const { handleApiRequest } = require('./lib/server/api-router.js');

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
  if (payload) {
    req.body = JSON.stringify(payload);
    req.headers['content-type'] = 'application/json';
  }
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
  });
  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId('user', 'spr'), name: 'SPR User', email: 'spr@test.local', passwordHash: 'hash', createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });
  const session = await createSession(user.id);
  const vendor = await requestJson('/api/spr/vendors', 'POST', { name: 'Contoso Security', domain: 'contoso.example', email: 'security@contoso.example', country: 'US', complianceClaims: ['SOC2', 'ISO27001'] }, session.token);
  const software = await requestJson('/api/spr/software', 'POST', { name: 'Contoso Trust Agent', vendorId: vendor.payload.vendor.id, repositoryUrl: 'https://github.com/contoso/trust-agent', packageName: '@contoso/trust-agent', version: '1.2.3', ecosystem: 'npm' }, session.token);
  const evidence = await requestJson('/api/spr/evidence', 'POST', { softwareId: software.payload.software.id, type: 'sbom', title: 'CycloneDX SBOM', summary: 'Generated from release pipeline', uri: 'https://example.com/sbom.json', strength: 0.9, freshnessDays: 7, verified: true }, session.token);
  const visibility = await requestJson(`/api/spr/evidence/${evidence.payload.evidence.id}/visibility`, 'POST', { visibility: 'restricted', accessToken: 'buyer-123' }, session.token);
  const verify = await requestJson(`/api/spr/evidence/${evidence.payload.evidence.id}/verify`, 'POST', { method: 'sigstore', verified: true, details: 'Signed by release pipeline' }, session.token);
  const score = await requestJson(`/api/spr/software/${software.payload.software.id}/score`, 'GET', null, session.token);
  console.log(JSON.stringify({ vendor, software, evidence, visibility, verify, score }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
