import assert from "node:assert/strict";
import { createId, mutateDb, readDb } from "../lib/server/data-store.js";
import { createMsp, createWorkspaceForMsp, createMspMembership } from "../lib/server/data-store.js";
import { getSessionContext, hashToken } from "../lib/server/auth.js";

async function createUser(db, email) {
  const now = new Date().toISOString();
  const user = {
    id: createId("user", email),
    name: email.split("@")[0],
    email,
    passwordHash: "hash",
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(user);
  return user;
}

async function buildScenario() {
  const now = new Date().toISOString();
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.msps = [];
    db.mspMembers = [];
    db.sessions = [];
  });

  const owner = await mutateDb((db) => createUser(db, "owner@test.local"));
  const viewer = await mutateDb((db) => createUser(db, "viewer@test.local"));
  const analyst = await mutateDb((db) => createUser(db, "analyst@test.local"));
  const admin = await mutateDb((db) => createUser(db, "admin@test.local"));

  const otherOwner = await mutateDb((db) => createUser(db, "other-owner@test.local"));

  const mspOne = await mutateDb((db) => createMsp(db, { name: "MSP One", billingEmail: "billing1@test.local", region: "us-east-1", ownerUserId: owner.id }));
  const mspTwo = await mutateDb((db) => createMsp(db, { name: "MSP Two", billingEmail: "billing2@test.local", region: "us-west-2", ownerUserId: otherOwner.id }));

  const workspaceOne = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: mspOne.msp.id, name: "Workspace One", ownerUserId: owner.id }));
  const workspaceTwo = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: mspTwo.msp.id, name: "Workspace Two", ownerUserId: otherOwner.id }));

  await mutateDb((db) => {
    createMspMembership(db, { mspId: mspOne.msp.id, userId: viewer.id, role: "viewer" });
    createMspMembership(db, { mspId: mspOne.msp.id, userId: analyst.id, role: "analyst" });
    createMspMembership(db, { mspId: mspOne.msp.id, userId: admin.id, role: "admin" });
  });

  await mutateDb((db) => {
    db.sessions.push({ id: createId("session", owner.id), userId: owner.id, tokenHash: hashToken("owner-token"), csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now });
    db.sessions.push({ id: createId("session", viewer.id), userId: viewer.id, tokenHash: hashToken("viewer-token"), csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now });
    db.sessions.push({ id: createId("session", analyst.id), userId: analyst.id, tokenHash: hashToken("analyst-token"), csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now });
    db.sessions.push({ id: createId("session", admin.id), userId: admin.id, tokenHash: hashToken("admin-token"), csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now });
  });

  return { owner, viewer, analyst, admin, workspaceOne, workspaceTwo, mspOne: mspOne.msp, mspTwo: mspTwo.msp };
}

async function makeRequest(req) {
  return getSessionContext(req, req.headers["x-workspace-id"] || null);
}

async function main() {
  const { owner, viewer, analyst, admin, workspaceOne, workspaceTwo } = await buildScenario();
  const ownerReq = { headers: { cookie: "ventureos_session=owner-token", "x-workspace-id": workspaceOne.id } };
  const viewerReq = { headers: { cookie: "ventureos_session=viewer-token", "x-workspace-id": workspaceOne.id } };
  const analystReq = { headers: { cookie: "ventureos_session=analyst-token", "x-workspace-id": workspaceOne.id } };
  const adminReq = { headers: { cookie: "ventureos_session=admin-token", "x-workspace-id": workspaceOne.id } };

  const ownerCtx = await makeRequest(ownerReq);
  const viewerCtx = await makeRequest(viewerReq);
  const analystCtx = await makeRequest(analystReq);
  const adminCtx = await makeRequest(adminReq);

  assert.ok(ownerCtx, "Owner session context should resolve.");
  assert.ok(ownerCtx.workspaceOwnershipVerified, "Owner session should mark workspace ownership as verified.");
  assert.strictEqual(ownerCtx.workspace?.id, workspaceOne.id, "Owner should resolve their own workspace.");

  assert.ok(viewerCtx, "Viewer session context should resolve.");
  assert.strictEqual(viewerCtx.workspace?.id, workspaceOne.id, "Viewer should still access their MSP workspace.");
  assert.strictEqual(viewerCtx.workspaceOwnershipVerified, true, "Viewer should have verified workspace ownership.");

  assert.ok(analystCtx, "Analyst session context should resolve.");
  assert.strictEqual(analystCtx.workspace?.id, workspaceOne.id, "Analyst should still access their MSP workspace.");
  assert.strictEqual(analystCtx.workspaceOwnershipVerified, true, "Analyst should have verified workspace ownership.");

  assert.ok(adminCtx, "Admin session context should resolve.");
  assert.strictEqual(adminCtx.workspace?.id, workspaceOne.id, "Admin should resolve their own workspace.");
  assert.strictEqual(adminCtx.workspaceOwnershipVerified, true, "Admin should have verified workspace ownership.");

  const crossTenantReq = { headers: { cookie: "ventureos_session=viewer-token", "x-workspace-id": workspaceTwo.id } };
  const crossTenantCtx = await makeRequest(crossTenantReq);
  assert.strictEqual(crossTenantCtx, null, "Cross-tenant workspace access should be rejected for an MSP member.");

  console.log("MSP workspace ownership tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
