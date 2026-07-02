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

  const workspace = await mutateDb((db) => {
    const record = { id: createId("workspace", "mode"), mspId: msp.id, name: "Mode Workspace", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.workspaces.push(record);
    db.workspaceMembers.push({ id: createId("member", `${user.id}-mode`), workspaceId: record.id, userId: user.id, role: "Owner", createdAt: new Date().toISOString() });
    db.mspMembers.push({ id: createId("mspmember", `${user.id}-${msp.id}`), mspId: msp.id, userId: user.id, role: "admin", createdAt: new Date().toISOString() });
    return record;
  });

  return { user, msp, workspace };
}

async function main() {
  const activeScenario = await seedScenario({ billingStatus: "active" });
  const session = await createSession(activeScenario.user.id, { workspaceId: activeScenario.workspace.id });
  const req = { method: "GET", url: "/", headers: { cookie: `ventureos_session=${session.token}`, "x-workspace-id": activeScenario.workspace.id } };
  const ctx = await getSessionContext(req, activeScenario.workspace.id);
  assert.equal(ctx.mspMode, "active");
  assert.doesNotThrow(() => assertMspMode(ctx, { operation: "write" }));

  const pastDueScenario = await seedScenario({ billingStatus: "past_due" });
  const pastDueSession = await createSession(pastDueScenario.user.id, { workspaceId: pastDueScenario.workspace.id });
  const pastDueReq = { method: "GET", url: "/", headers: { cookie: `ventureos_session=${pastDueSession.token}`, "x-workspace-id": pastDueScenario.workspace.id } };
  const pastDueCtx = await getSessionContext(pastDueReq, pastDueScenario.workspace.id);
  assert.equal(pastDueCtx.mspMode, "past_due");
  assert.doesNotThrow(() => assertMspMode(pastDueCtx, { operation: "read" }));
  assert.throws(() => assertMspMode(pastDueCtx, { operation: "write" }), (error) => {
    assert.equal(error.statusCode, 403);
    return true;
  });

  const canceledScenario = await seedScenario({ billingStatus: "canceled" });
  const canceledSession = await createSession(canceledScenario.user.id, { workspaceId: canceledScenario.workspace.id });
  const canceledReq = { method: "GET", url: "/", headers: { cookie: `ventureos_session=${canceledSession.token}`, "x-workspace-id": canceledScenario.workspace.id } };
  const canceledCtx = await getSessionContext(canceledReq, canceledScenario.workspace.id);
  assert.equal(canceledCtx.mspMode, "canceled");
  assert.throws(() => assertMspMode(canceledCtx, { operation: "read" }), (error) => {
    assert.equal(error.statusCode, 403);
    return true;
  });

  const endpointScenario = await seedScenario({ billingStatus: "active" });
  const modeEndpointSession = await createSession(endpointScenario.user.id, { workspaceId: endpointScenario.workspace.id });
  const modeReq = { method: "GET", url: "/api/msp/mode", headers: { cookie: `ventureos_session=${modeEndpointSession.token}`, "x-workspace-id": endpointScenario.workspace.id } };
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
