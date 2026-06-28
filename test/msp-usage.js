import assert from "node:assert/strict";
import { createId, mutateDb, readDb } from "../lib/server/data-store.js";
import { createMsp, createWorkspaceForMsp, createMspMembership } from "../lib/server/data-store.js";
import { hashToken, getSessionContext } from "../lib/server/auth.js";
import { getWorkspaceUsageSummary, getMspUsageSummary } from "../lib/server/billing.js";

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
    db.passports = [];
    db.projects = [];
    db.projectEvents = [];
    db.scanFindings = [];
  });

  const owner = await mutateDb((db) => {
    const now = new Date().toISOString();
    const user = { id: createId("user", "usage-owner"), name: "Usage Owner", email: "usage-owner@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(user);
    return user;
  });

  const otherOwner = await mutateDb((db) => {
    const now = new Date().toISOString();
    const user = { id: createId("user", "usage-other"), name: "Other Owner", email: "usage-other@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(user);
    return user;
  });

  const msp = await mutateDb((db) => createMsp(db, { name: "Usage MSP", billingEmail: "billing@usage.local", region: "us-east-1", ownerUserId: owner.id }));
  const workspaceOne = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.msp.id, name: "Workspace One", ownerUserId: owner.id }));
  const workspaceTwo = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.msp.id, name: "Workspace Two", ownerUserId: owner.id }));

  await mutateDb((db) => {
    createMspMembership(db, { mspId: msp.msp.id, userId: owner.id, role: "admin" });
    createMspMembership(db, { mspId: msp.msp.id, userId: otherOwner.id, role: "viewer" });
  });

  await mutateDb((db) => {
    db.assets.push({ id: "asset_a", workspaceId: workspaceOne.id, createdAt: new Date().toISOString() });
    db.assets.push({ id: "asset_b", workspaceId: workspaceTwo.id, createdAt: new Date().toISOString() });
    db.scanRuns.push({ id: "scan_a", workspaceId: workspaceOne.id, createdAt: new Date().toISOString() });
    db.passports.push({ id: "passport_a", workspaceId: workspaceOne.id, assetId: "asset_a", createdAt: new Date().toISOString() });
    db.scanFindings.push({ id: "finding_a", workspaceId: workspaceOne.id, severity: "high", createdAt: new Date().toISOString() });
    db.projectEvents.push({ id: "event_a", workspaceId: workspaceOne.id, timestamp: new Date().toISOString() });
    db.projectEvents.push({ id: "event_b", workspaceId: workspaceTwo.id, timestamp: new Date().toISOString() });
    db.sessions.push({ id: createId("session", owner.id), userId: owner.id, tokenHash: hashToken("usage-token"), csrfToken: "csrf", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: new Date().toISOString() });
  });

  return { owner, msp: msp.msp, workspaceOne, workspaceTwo };
}

async function main() {
  const { owner, msp, workspaceOne, workspaceTwo } = await seedScenario();
  const db = await readDb();

  const workspaceUsage = getWorkspaceUsageSummary(db, workspaceOne.id);
  assert.strictEqual(workspaceUsage.assetCount, 1, "Workspace usage should count assets.");
  assert.strictEqual(workspaceUsage.scanCount, 1, "Workspace usage should count scans.");
  assert.strictEqual(workspaceUsage.passportCount, 1, "Workspace usage should count passports.");
  assert.strictEqual(workspaceUsage.riskEvents >= 1, true, "Workspace usage should count risk events.");

  const mspUsage = getMspUsageSummary(db, msp.id);
  assert.strictEqual(mspUsage.totalWorkspaces, 2, "MSP usage should aggregate all workspaces.");
  assert.strictEqual(mspUsage.totals.assetCount >= 2, true, "MSP usage should aggregate assets across workspaces.");
  assert.strictEqual(mspUsage.totals.scanCount >= 1, true, "MSP usage should aggregate scans.");
  assert.strictEqual(Object.keys(mspUsage.perWorkspace).length, 2, "MSP usage should include all workspaces.");

  const ctx = await getSessionContext({ headers: { cookie: "ventureos_session=usage-token" } }, workspaceOne.id);
  assert.ok(ctx, "Session context should resolve for admin users.");
  assert.strictEqual(ctx.mspRole, "admin", "Admin session should expose the MSP role.");

  console.log("MSP usage metering tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
