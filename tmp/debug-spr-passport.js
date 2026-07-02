import { mutateDb, createId } from '../lib/server/data-store.js';
import { createSession } from '../lib/server/auth.js';
import { handleApiRequest } from '../lib/server/api-router.js';

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

async function run() {
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.msps = [];
    db.mspMembers = [];
    db.sessions = [];
    db.sprVendors = [];
    db.sprSoftware = [];
    db.sprEvidence = [];
    db.sprPassports = [];
    db.sprAuditLogs = [];
  });

  const now = new Date().toISOString();
  const user = { id: createId('user', 'spr'), name: 'SPR User', email: 'spr@test.local', passwordHash: 'hash', createdAt: now, updatedAt: now };
  await mutateDb((db) => db.users.push(user));

  const workspace = { id: createId('workspace', 'spr-workspace'), name: 'SPR Workspace', createdAt: now, updatedAt: now };
  await mutateDb((db) => {
    db.workspaces.push(workspace);
    db.workspaceMembers.push({ id: createId('member', `${user.id}-${workspace.id}`), workspaceId: workspace.id, userId: user.id, role: 'Owner', createdAt: now });
  });

  const session = await createSession(user.id, { workspaceId: workspace.id });

  const vendorReq = {
    method: 'POST',
    url: '/api/spr/vendors',
    headers: { cookie: `ventureos_session=${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Contoso Security', domain: 'contoso.example', email: 'security@contoso.example', country: 'US', complianceClaims: ['SOC2', 'ISO27001'] }),
  };
  const vendorRes = makeRes();
  await handleApiRequest(vendorReq, vendorRes);
  console.log('vendor', vendorRes.statusCode, vendorRes.body);
  const vendorPayload = JSON.parse(vendorRes.body);

  const softwareReq = {
    method: 'POST',
    url: '/api/spr/software',
    headers: { cookie: `ventureos_session=${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Contoso Trust Agent', vendorId: vendorPayload.vendor.id, repositoryUrl: 'https://github.com/contoso/trust-agent', packageName: '@contoso/trust-agent', version: '1.2.3', ecosystem: 'npm' }),
  };
  const softwareRes = makeRes();
  await handleApiRequest(softwareReq, softwareRes);
  console.log('software', softwareRes.statusCode, softwareRes.body);
  const softwarePayload = JSON.parse(softwareRes.body);

  const evidenceReq = {
    method: 'POST',
    url: '/api/spr/evidence',
    headers: { cookie: `ventureos_session=${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ softwareId: softwarePayload.software.id, type: 'sbom', title: 'CycloneDX SBOM', summary: 'Generated from release pipeline', uri: 'https://example.com/sbom.json', strength: 0.9, freshnessDays: 7, verified: true }),
  };
  const evidenceRes = makeRes();
  await handleApiRequest(evidenceReq, evidenceRes);
  console.log('evidence', evidenceRes.statusCode, evidenceRes.body);
  const evidencePayload = JSON.parse(evidenceRes.body);

  const passportReq = {
    method: 'POST',
    url: '/api/spr/passports/issue',
    headers: { cookie: `ventureos_session=${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ softwareId: softwarePayload.software.id, visibility: 'restricted', issuedBy: user.name, accessToken: `${vendorPayload.vendor.id}:${workspace.id}:restricted`, vendorId: vendorPayload.vendor.id, workspaceId: workspace.id }),
  };
  const passportRes = makeRes();
  await handleApiRequest(passportReq, passportRes);
  console.log('passport', passportRes.statusCode, passportRes.body);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
