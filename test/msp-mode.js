import assert from "node:assert/strict";
import { mutateDb, createId } from "../lib/server/data-store.js";
import { createSession, getSessionContext, assertMspMode } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";

async function seedScenario({ billingStatus }) {
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.msps = [];
    db.mspMembers = [];
    db.sessions = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "msp-mode"), name: "MSP Mode User", email: "msp-mode@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const msp = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("msp", "mode"), name: "Mode MSP", billingEmail: "billing@mode.local", region: "us-east-1", ownerUserId: user.id, createdAt: now, updatedAt: now, billingStatus, plan: "starter" };
    db.msps.push(record);
    return record;
  });

  await mutateDb((db) => {
    db.workspaces.push({ id: createId("workspace", "mode"), mspId: msp.id, name: "Mode Workspace", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    db.workspaceMembers.push({ id: createId("member", `${user.id}-mode`), workspaceId: db.workspaces[db.workspaces.length - 1].id, userId: user.id, role: "Owner", createdAt: new Date().toISOString() });
    db.mspMembers.push({ id: createId("mspmember", `${user.id}-${msp.id}`), mspId: msp.id, userId: user.id, role: "admin", createdAt: new Date().toISOString() });
  });

  return { user, msp };
}

async function main() {
  const activeScenario = await seedScenario({ billingStatus: "active" });
  const session = await createSession(activeScenario.user.id);
  const req = { method: "GET", url: "/", headers: { cookie: `ventureos_session=${session.token}` } };
  const ctx = await getSessionContext(req, null);
  assert.equal(ctx.mspMode, "active");
  assert.doesNotThrow(() => assertMspMode(ctx, { operation: "write" }));

  const pastDueScenario = await seedScenario({ billingStatus: "past_due" });
  const pastDueSession = await createSession(pastDueScenario.user.id);
  const pastDueReq = { method: "GET", url: "/", headers: { cookie: `ventureos_session=${pastDueSession.token}` } };
  const pastDueCtx = await getSessionContext(pastDueReq, null);
  assert.equal(pastDueCtx.mspMode, "past_due");
  assert.doesNotThrow(() => assertMspMode(pastDueCtx, { operation: "read" }));
  assert.throws(() => assertMspMode(pastDueCtx, { operation: "write" }), (error) => {
    assert.equal(error.statusCode, 403);
    return true;
  });

  const canceledScenario = await seedScenario({ billingStatus: "canceled" });
  const canceledSession = await createSession(canceledScenario.user.id);
  const canceledReq = { method: "GET", url: "/", headers: { cookie: `ventureos_session=${canceledSession.token}` } };
  const canceledCtx = await getSessionContext(canceledReq, null);
  assert.equal(canceledCtx.mspMode, "canceled");
  assert.throws(() => assertMspMode(canceledCtx, { operation: "read" }), (error) => {
    assert.equal(error.statusCode, 403);
    return true;
  });

  const endpointScenario = await seedScenario({ billingStatus: "active" });
  const modeEndpointSession = await createSession(endpointScenario.user.id);
  const modeReq = { method: "GET", url: "/api/msp/mode", headers: { cookie: `ventureos_session=${modeEndpointSession.token}` } };
  const modeRes = { statusCode: 200, headers: {}, writeHead(code, headers) { this.statusCode = code; this.headers = headers; }, end(body) { this.body = body; } };
  await handleApiRequest(modeReq, modeRes);
  const modePayload = JSON.parse(modeRes.body);
  assert.equal(modePayload.ok, true);
  assert.equal(modePayload.mode, "active");

  console.log("MSP mode tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
