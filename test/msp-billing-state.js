import assert from "node:assert/strict";
import { createId, mutateDb, readDb, createMsp, createWorkspaceForMsp, createMspMembership } from "../lib/server/data-store.js";
import { getSessionContext, hashToken } from "../lib/server/auth.js";
import { getMspBillingState, updateMspBillingState } from "../lib/server/billing.js";

async function seedScenario() {
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.msps = [];
    db.mspMembers = [];
    db.sessions = [];
  });

  const owner = await mutateDb((db) => {
    const now = new Date().toISOString();
    const user = { id: createId("user", "billing-owner"), name: "Billing Owner", email: "billing-owner@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(user);
    return user;
  });

  const msp = await mutateDb((db) => createMsp(db, { name: "Billing MSP", billingEmail: "billing@state.local", region: "us-east-1", ownerUserId: owner.id }));
  const workspace = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.msp.id, name: "Billing Workspace", ownerUserId: owner.id }));
  await mutateDb((db) => createMspMembership(db, { mspId: msp.msp.id, userId: owner.id, role: "admin" }));
  await mutateDb((db) => {
    db.sessions.push({ id: createId("session", owner.id), userId: owner.id, workspaceId: workspace.id, tokenHash: hashToken("billing-token"), csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: new Date().toISOString() });
  });

  return { owner, msp: msp.msp, workspace };
}

async function main() {
  const { owner, msp, workspace } = await seedScenario();
  const db = await readDb();
  const persistedMsp = db.msps.find((item) => item.id === msp.id);
  const initialState = getMspBillingState(persistedMsp);
  assert.strictEqual(initialState.billingStatus, "pending", "New MSPs should default to a pending billing state.");

  const updated = updateMspBillingState(persistedMsp, { billingStatus: "active", billingUpdatedAt: new Date().toISOString() });
  assert.strictEqual(updated.billingStatus, "active", "Billing helper should allow valid transitions.");

  const invalid = () => updateMspBillingState({ ...updated, billingStatus: "active" }, { billingStatus: "pending" });
  assert.throws(invalid, /Invalid billing transition/, "Invalid billing state transitions should be rejected.");

  const ctx = await getSessionContext({ headers: { cookie: "ventureos_session=billing-token", "x-workspace-id": workspace.id } }, workspace.id);
  assert.ok(ctx, "Session context should resolve for billing admin users.");

  console.log("MSP billing state tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
