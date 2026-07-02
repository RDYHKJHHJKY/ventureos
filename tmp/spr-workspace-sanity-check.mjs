import assert from 'node:assert/strict';
import { mutateDb, createId, readDb } from '../lib/server/data-store.js';
import { createSession } from '../lib/server/auth.js';
import { handleApiRequest } from '../lib/server/api-router.js';
import { restrictedTokens } from '../lib/server/restricted-tokens.js';

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

async function requestJson(pathname, method = 'POST', payload = null, token) {
  const req = { method, url: pathname, headers: token ? { cookie: `ventureos_session=${token}` } : {} };
  if (payload) {
    req.body = JSON.stringify(payload);
    req.headers['content-type'] = 'application/json';
  }
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

async function main() {
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.sessions = [];
    db.msps = [];
    db.mspMembers = [];
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
    db.sprRestrictedTokens = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId('user', 'sanity'), name: 'Sanity User', email: 'sanity@test.local', passwordHash: 'hash', createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });
  const workspace = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId('workspace', 'sanity-ws'), name: 'Sanity WS', createdAt: now, updatedAt: now };
    db.workspaces.push(record);
    db.workspaceMembers.push({ id: createId('member', `${user.id}-${record.id}`), workspaceId: record.id, userId: user.id, role: 'Owner', createdAt: now });
    return record;
  });
  const session = await createSession(user.id, { workspaceId: workspace.id });

  const vendorResp = await requestJson('/api/spr/vendors', 'POST', { name: 'Contoso Security', domain: 'contoso.example', email: 'security@contoso.example', country: 'US', complianceClaims: ['SOC2'] }, session.token);
  assert.equal(vendorResp.statusCode, 201);
  const softwareResp = await requestJson('/api/spr/software', 'POST', { name: 'Test SW', vendorId: vendorResp.payload.vendor.id, repositoryUrl: 'https://example.com', packageName: '@test/sw', version: '1.0.0', ecosystem: 'npm' }, session.token);
  assert.equal(softwareResp.statusCode, 201);

  console.log('restricted passport no workspace:');
  const noWorkspacePassport = await requestJson('/api/spr/passports/issue', 'POST', {
    softwareId: softwareResp.payload.software.id,
    visibility: 'restricted',
    issuedBy: user.name,
    accessToken: `${vendorResp.payload.vendor.id}:${workspace.id}:restricted`,
    vendorId: vendorResp.payload.vendor.id,
  }, session.token);
  console.log(noWorkspacePassport.statusCode, noWorkspacePassport.payload);

  console.log('restricted passport mismatched workspace:');
  const mismatchPassport = await requestJson('/api/spr/passports/issue', 'POST', {
    softwareId: softwareResp.payload.software.id,
    visibility: 'restricted',
    issuedBy: user.name,
    accessToken: `${vendorResp.payload.vendor.id}:${workspace.id}:restricted`,
    vendorId: vendorResp.payload.vendor.id,
    workspaceId: 'other-workspace',
  }, session.token);
  console.log(mismatchPassport.statusCode, mismatchPassport.payload);

  console.log('evidence no workspace:');
  const noWorkspaceEvidence = await requestJson('/api/spr/evidence', 'POST', {
    softwareId: softwareResp.payload.software.id,
    type: 'sbom',
    title: 'Test SBOM',
    summary: 'test',
    uri: 'https://example.com',
    strength: 0.5,
    freshnessDays: 7,
    verified: true,
    visibility: 'public',
  }, session.token);
  console.log(noWorkspaceEvidence.statusCode, noWorkspaceEvidence.payload);

  const db = await readDb();
  try {
    restrictedTokens.verify(db, `${vendorResp.payload.vendor.id}:restricted`, { workspaceId: workspace.id, evidenceType: 'passport' });
    console.log('legacy token explicit workspace check: ok');
  } catch (err) {
    console.log('legacy token explicit workspace check:', err.statusCode, err.code, err.message);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
