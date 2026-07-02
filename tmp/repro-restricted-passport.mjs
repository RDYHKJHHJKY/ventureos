import { mutateDb, createId } from '../lib/server/data-store.js';
import { createSession } from '../lib/server/auth.js';
import { handleApiRequest } from '../lib/server/api-router.js';

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

async function main() {
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

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = {
      id: createId('user', 'spr'),
      name: 'SPR User',
      email: 'spr@test.local',
      passwordHash: 'hash',
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(record);
    return record;
  });

  const workspace = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = {
      id: createId('workspace', 'spr-workspace'),
      name: 'SPR Workspace',
      createdAt: now,
      updatedAt: now,
    };
    db.workspaces.push(record);
    db.workspaceMembers.push({ id: createId('member', `${user.id}-${record.id}`), workspaceId: record.id, userId: user.id, role: 'Owner', createdAt: now });
    return record;
  });

  const session = await createSession(user.id, { workspaceId: workspace.id });

  const vendorResponse = await requestJson('/api/spr/vendors', 'POST', { name: 'Contoso Security', domain: 'contoso.example', email: 'security@contoso.example', country: 'US', complianceClaims: ['SOC2', 'ISO27001'] }, session.token);
  console.log('vendor', vendorResponse.statusCode, vendorResponse.payload);
  const softwareResponse = await requestJson('/api/spr/software', 'POST', { name: 'Contoso Trust Agent', vendorId: vendorResponse.payload.vendor.id, repositoryUrl: 'https://github.com/contoso/trust-agent', packageName: '@contoso/trust-agent', version: '1.2.3', ecosystem: 'npm' }, session.token);
  console.log('software', softwareResponse.statusCode, softwareResponse.payload);
  const githubScanResponse = await requestJson('/api/spr/github/scan', 'POST', { owner: 'octocat', repo: 'Hello-World', softwareId: softwareResponse.payload.software.id, workspaceId: workspace.id }, session.token);
  console.log('github scan', githubScanResponse.statusCode, githubScanResponse.payload);
  const evidenceResponse = await requestJson('/api/spr/evidence', 'POST', { softwareId: softwareResponse.payload.software.id, type: 'sbom', title: 'CycloneDX SBOM', summary: 'Generated from release pipeline', uri: 'https://example.com/sbom.json', strength: 0.9, freshnessDays: 7, verified: true, workspaceId: workspace.id }, session.token);
  console.log('evidence', evidenceResponse.statusCode, evidenceResponse.payload);
  const restrictedPassportResponse = await requestJson('/api/spr/passports/issue', 'POST', { softwareId: softwareResponse.payload.software.id, visibility: 'restricted', issuedBy: user.name, accessToken: `${vendorResponse.payload.vendor.id}:${workspace.id}:restricted`, vendorId: vendorResponse.payload.vendor.id, workspaceId: workspace.id }, session.token);
  console.log('restricted passport', restrictedPassportResponse.statusCode, restrictedPassportResponse.payload);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
