import assert from "node:assert/strict";
import { createId, mutateDb, createMsp, createWorkspaceForMsp, readDb } from "../lib/server/data-store.js";
import { createSession } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";

async function seedScenario() {
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
    db.passports = [];
    db.projectEvents = [];
  });
  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "msp-session"), name: "MSP User", email: "msp-session@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });
  const msp = await mutateDb((db) => createMsp(db, { name: "Real MSP", billingEmail: "billing@real.local", region: "us-east-1", ownerUserId: user.id }));
  const workspace = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.msp.id, name: "Real Client", ownerUserId: user.id }));
  return { user, msp: msp.msp, workspace };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(code, headers) { this.statusCode = code; this.headers = { ...this.headers, ...(headers || {}) }; },
    end(body) { this.body = body; },
  };
}

async function requestJson(pathname, token) {
  const req = {
    method: "GET",
    url: pathname,
    headers: {
      cookie: token ? `ventureos_session=${token}` : "",
      "Content-Type": "application/json",
    },
  };
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

async function main() {
  const { user, msp } = await seedScenario();
  const { token } = await createSession(user.id);

  const session = await requestJson("/api/auth/session", token);
  assert.equal(session.statusCode, 200);
  assert.equal(session.payload.user.id, user.id);

  const mspList = await requestJson("/api/msps", token);
  assert.equal(mspList.statusCode, 200);
  assert.equal(mspList.payload.msps.length, 1);
  assert.equal(mspList.payload.msps[0].id, msp.id);

  const mspMode = await requestJson("/api/msp/mode", token);
  assert.equal(mspMode.statusCode, 200);
  assert.equal(mspMode.payload.mode, "active");

  const db = await readDb();
  assert.equal(db.msps.length, 1);

  console.log("MSP session tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
