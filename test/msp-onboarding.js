import assert from "node:assert";
import { createId, mutateDb, readDb, createMsp, createWorkspaceForMsp, createMspMembership, listMspMembers, getMembershipForUser } from "../lib/server/data-store.js";
import { createSession, registerUser, getSessionContext, sessionCookie } from "../lib/server/auth.js";
import { createMspCustomer, createSubscriptionForMsp, getBillingPortalUrl, getWorkspaceUsageSummary } from "../lib/server/billing.js";

async function run() {
  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const user = { id: createId("user", "msp-test"), name: "MSP Tester", email: "msp@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(user);
    return user;
  });

  const { msp } = await mutateDb((db) => createMsp(db, { name: "Acme MSP", billingEmail: "billing@acme.test", region: "us-west-2", ownerUserId: user.id }));
  assert.strictEqual(msp.name, "Acme MSP", "MSP name should be stored.");
  assert.strictEqual(msp.billingEmail, "billing@acme.test", "MSP billing email should be stored.");
  assert.strictEqual(msp.region, "us-west-2", "MSP region should be stored.");

  const workspace = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: "Acme Client Workspace", ownerUserId: user.id }));
  assert.strictEqual(workspace.mspId, msp.id, "Workspace should be linked to the MSP.");
  assert.strictEqual(workspace.name, "Acme Client Workspace", "Workspace name should be saved.");

  const dbAfterMsp = await readDb();
  const ownerMembership = getMembershipForUser(dbAfterMsp, msp.id, user.id);
  assert.ok(ownerMembership, "MSP owner should receive a membership record.");
  assert.strictEqual(ownerMembership.role, "admin", "MSP owner role should be admin.");

  const otherUser = await mutateDb((db) => {
    const now = new Date().toISOString();
    const user = { id: createId("user", "msp-member"), name: "MSP Member", email: "member@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(user);
    return user;
  });
  const invited = await mutateDb((db) => createMspMembership(db, { mspId: msp.id, userId: otherUser.id, role: "analyst" }));
  assert.strictEqual(invited.mspId, msp.id, "Invited user should be linked to the MSP.");
  assert.strictEqual(invited.userId, otherUser.id, "Invited membership should reference the correct user.");
  assert.strictEqual(invited.role, "analyst", "Invited membership should retain the normalized role.");

  const dbAfterInvite = await readDb();
  const members = listMspMembers(dbAfterInvite, msp.id);
  assert.ok(Array.isArray(members), "MSP members list should be an array.");
  assert.strictEqual(members.length, 2, "There should be two MSP members after invitation.");

  const foundMembership = getMembershipForUser(await readDb(), msp.id, otherUser.id);
  assert.ok(foundMembership, "Invited user should be discoverable by getMembershipForUser.");
  assert.strictEqual(foundMembership.role, "analyst", "Invited user role should be analyst.");

  const customer = createMspCustomer(msp);
  const subscription = createSubscriptionForMsp(msp, "starter");
  assert.ok(customer.id.startsWith("cust_"), "Billing customer ID should be stubbed.");
  assert.ok(subscription.id.startsWith("sub_"), "Billing subscription ID should be stubbed.");
  assert.strictEqual(getBillingPortalUrl(msp), `https://billing.ventureos.local/portal/${encodeURIComponent(msp.id)}`);

  const { token } = await createSession(user.id);
  const ctx = await getSessionContext({ headers: { cookie: sessionCookie(token) } });
  assert.ok(ctx, "Session context should resolve for authenticated MSP users.");
  assert.strictEqual(ctx.mspId, msp.id, "Session context should contain the MSP ID.");
  assert.strictEqual(ctx.mspRole, "admin", "Session context should contain the MSP role.");
  assert.ok(Array.isArray(ctx.accessibleWorkspaces), "Session context should expose accessibleWorkspaces.");
  assert.ok(ctx.accessibleWorkspaces.some((ws) => ws.id === workspace.id), "Accessible workspaces should include the MSP workspace.");

  const db = await readDb();
  const usage = getWorkspaceUsageSummary(db, workspace.id);
  assert.strictEqual(typeof usage.assets, "number", "Usage summary should include asset count.");
  assert.strictEqual(typeof usage.scans, "number", "Usage summary should include scan count.");
  assert.strictEqual(typeof usage.passports, "number", "Usage summary should include passport count.");
  assert.strictEqual(typeof usage.nodes, "number", "Usage summary should include graph node count.");
  assert.strictEqual(typeof usage.edges, "number", "Usage summary should include graph edge count.");
  assert.strictEqual(typeof usage.timelineEvents, "number", "Usage summary should include timeline event count.");

  console.log("MSP onboarding tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
