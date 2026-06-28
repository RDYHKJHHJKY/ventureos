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
    const record = { id: createId("user", "demo"), name: "Demo User", email: "demo@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });
  const msp = await mutateDb((db) => createMsp(db, { name: "Real MSP", billingEmail: "billing@real.local", region: "us-east-1", ownerUserId: user.id }));
  const ws = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.msp.id, name: "Real Client", ownerUserId: user.id }));
  return { user, msp: msp.msp, workspace: ws };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(body) { this.body = body; },
  };
}

async function requestJson(pathname, token) {
  const req = { method: "GET", url: pathname, headers: { cookie: token ? `ventureos_session=${token}` : "" } };
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: JSON.parse(res.body) };
}

async function main() {
  const { user } = await seedScenario();
  const { token } = await createSession(user.id, { demoMode: true });

  const session = await requestJson("/api/auth/session", token);
  assert.equal(session.statusCode, 200);
  assert.equal(session.payload.demoMode, true);

  const demoMsp = await requestJson("/api/demo/msp");
  assert.equal(demoMsp.statusCode, 200);
  assert.equal(demoMsp.payload.ok, true);
  assert.ok(demoMsp.payload.demo.name.includes("Demo"));

  const demoWorkspaces = await requestJson("/api/demo/workspaces");
  assert.equal(demoWorkspaces.statusCode, 200);
  assert.equal(demoWorkspaces.payload.ok, true);
  assert.equal(demoWorkspaces.payload.workspaces.length, 6);

  const demoExec = await requestJson("/api/demo/executive");
  assert.equal(demoExec.statusCode, 200);
  assert.equal(demoExec.payload.ok, true);
  assert.ok(demoExec.payload.executive.healthScore >= 0);

  const demoIntel = await requestJson("/api/demo/intelligence");
  assert.equal(demoIntel.statusCode, 200);
  assert.equal(demoIntel.payload.ok, true);

  const demoExport = await requestJson("/api/demo/export");
  assert.equal(demoExport.statusCode, 200);
  assert.equal(demoExport.payload.ok, true);

  // Ensure demo endpoints didn't mutate DB
  const db = await readDb();
  assert.ok(db.msps.length === 1);

  console.log("MSP demo tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
