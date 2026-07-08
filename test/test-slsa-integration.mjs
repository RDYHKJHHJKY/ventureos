import assert from 'node:assert/strict';
import { mutateDb, createId } from '../lib/server/data-store.js';
import { createSession, createWorkspaceForUser, registerUser } from '../lib/server/auth.js';
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
  const req = {
    method,
    url: pathname,
    headers: {
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

async function main() {
  // Ensure mock mode to avoid GitHub network calls
  process.env.TEST_SLSA_MOCK = 'true';

  // Minimal setup: create a user and workspace
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.sessions = [];
    db.sprVendors = [];
    db.sprSoftware = [];
    db.sprEvidence = [];
    db.sprSignals = [];
    db.sprAuditLogs = [];
  });

  let session = null;
  if (typeof registerUser === 'function') {
    const uniqueEmail = `test+${Date.now()}@example.com`;
    const result = await registerUser({ name: 'Test', email: uniqueEmail, password: 'testpassword123' });
    const userObj = result.user;
    const workspaceObj = result.workspace;
    session = await createSession(userObj.id, { workspaceId: workspaceObj.id });
  }
  // Fallback: create file-backed user/session if registerUser isn't available
  if (!session) {
    const userId = createId('user', 'slsa');
    await mutateDb((db) => {
      const now = new Date().toISOString();
      db.users.push({ id: userId, name: 'Test', email: 'test@example.com', passwordHash: 'hash', createdAt: now, updatedAt: now });
    });
    const createdWorkspace = await createWorkspaceForUser(userId, 'Test Workspace');
    const createdSession = await createSession(userId, { workspaceId: createdWorkspace.id });
    // use createdSession.token
    const token = createdSession.token;

    // create a software entry
    const softwareResponse = await requestJson('/api/spr/software', 'POST', { name: 'Test Software', vendorId: null, repositoryUrl: 'https://github.com/octocat/Hello-World', packageName: 'test', version: '1.0.0', ecosystem: 'npm' }, token);
    assert.equal(softwareResponse.statusCode, 201);
    const softwareId = softwareResponse.payload.software.id;

    const githubScanResponse = await requestJson('/api/spr/github/scan', 'POST', { owner: 'octocat', repo: 'Hello-World', softwareId }, token);
    assert.equal(githubScanResponse.statusCode, 201);
    assert.equal(githubScanResponse.payload.ok, true);
    // Our router sets verificationStatus to 'insufficient_data' when classifier returns insufficient
    assert.equal(githubScanResponse.payload.evidence.verificationStatus, 'insufficient_data');
    // payload should include mapped SLSA classification
    const parsedPayload = githubScanResponse.payload.evidence.payload ? JSON.parse(githubScanResponse.payload.evidence.payload) : {};
    assert.ok(parsedPayload.slsaMapped, 'slsaMapped present in persisted payload');
    assert.strictEqual(parsedPayload.slsaMapped.level, 0, 'Mocked insufficient_data maps to level 0');
    console.log('✓ SLSA integration test: insufficient_data returned (fallback)');
    return;
  }

  // If we got a session via registerUser, run the same flow using that session
  if (session) {
    const token = session.token;
    const softwareResponse = await requestJson('/api/spr/software', 'POST', { name: 'Test Software', vendorId: null, repositoryUrl: 'https://github.com/octocat/Hello-World', packageName: 'test', version: '1.0.0', ecosystem: 'npm' }, token);
    assert.equal(softwareResponse.statusCode, 201);
    const softwareId = softwareResponse.payload.software.id;

    const githubScanResponse = await requestJson('/api/spr/github/scan', 'POST', { owner: 'octocat', repo: 'Hello-World', softwareId }, token);
    assert.equal(githubScanResponse.statusCode, 201);
    assert.equal(githubScanResponse.payload.ok, true);
    assert.equal(githubScanResponse.payload.evidence.verificationStatus, 'insufficient_data');
    const parsedPayload = githubScanResponse.payload.evidence.payload ? JSON.parse(githubScanResponse.payload.evidence.payload) : {};
    assert.ok(parsedPayload.slsaMapped, 'slsaMapped present in persisted payload');
    assert.strictEqual(parsedPayload.slsaMapped.level, 0, 'Mocked insufficient_data maps to level 0');
    console.log('✓ SLSA integration test: insufficient_data returned (registerUser path)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
