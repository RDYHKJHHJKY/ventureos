import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { mutateDb, createId, readDb } from '../lib/server/data-store.js';
import { createSession, createWorkspaceForUser, registerUser } from '../lib/server/auth.js';
import { handleApiRequest, loadSprDbPostgres, getPassportResponseForRequest } from '../lib/server/api-router.js';

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = { ...this.headers, ...headers };
    },
    end(payload) {
      this.body = payload;
    },
  };
}

async function requestJson(pathname, method = 'GET', payload = null, token, headers = {}) {
  const req = {
    method,
    url: pathname,
    headers: {
      ...headers,
      ...(token ? { cookie: `ventureos_session=${token}` } : {}),
    },
  };
  if (payload) {
    req.body = JSON.stringify(payload);
    req.headers['content-type'] = 'application/json';
  }
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

async function debug() {
  process.env.INGESTION_SECRET = process.env.INGESTION_SECRET || 'test-secret';
  let user;
  let workspace;
  if (process.env.DATABASE_URL) {
    const randomEmail = `spr-${randomUUID()}@test.local`;
    const result = await registerUser({
      name: 'SPR User',
      email: randomEmail,
      password: 'testpassword123',
      workspaceName: 'SPR Workspace',
    });
    user = result.user;
    workspace = result.workspace;
  } else {
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
      db.sprAuditLogs = [];
    });
    const userId = createId('user', 'spr');
    user = await mutateDb((db) => {
      const now = new Date().toISOString();
      const record = { id: userId, name: 'SPR User', email: 'spr@test.local', passwordHash: 'hash', createdAt: now, updatedAt: now };
      db.users.push(record);
      return record;
    });
    workspace = await createWorkspaceForUser(user.id, 'SPR Workspace');
  }
  const session = await createSession(user.id, { workspaceId: workspace.id });

  const vendorResponse = await requestJson('/api/spr/vendors', 'POST', { name: 'Contoso Security', domain: 'contoso.example', email: 'security@contoso.example', country: 'US', complianceClaims: ['SOC2', 'ISO27001'] }, session.token);
  console.log('vendorResponse', vendorResponse);
  const softwareResponse = await requestJson('/api/spr/software', 'POST', { name: 'Contoso Trust Agent', vendorId: vendorResponse.payload.vendor.id, repositoryUrl: 'https://github.com/contoso/trust-agent', packageName: '@contoso/trust-agent', version: '1.2.3', ecosystem: 'npm' }, session.token);
  console.log('softwareResponse', softwareResponse);
  const passportResponse = await requestJson('/api/spr/passports/issue', 'POST', { softwareId: softwareResponse.payload.software.id, visibility: 'public', issuedBy: user.name }, session.token);
  console.log('passportResponse', passportResponse);
  const publicViewResponse = await requestJson(`/api/passports/${passportResponse.payload.passport.id}/public`, 'GET', null, session.token);
  console.log('publicViewResponse', publicViewResponse);
}

debug().catch((err) => {
  console.error(err);
  process.exit(1);
});
