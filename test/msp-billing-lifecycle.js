import assert from "node:assert/strict";
import { createId, mutateDb, readDb, createMsp, createWorkspaceForMsp, createMspMembership } from "../lib/server/data-store.js";
import { applyBillingLifecycleEvent, activateMsp, suspendMsp } from "../lib/server/billing.js";

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
    const user = { id: createId("user", "lifecycle-owner"), name: "Lifecycle Owner", email: "lifecycle-owner@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(user);
    return user;
  });

  const msp = await mutateDb((db) => createMsp(db, { name: "Lifecycle MSP", billingEmail: "billing@lifecycle.local", region: "us-east-1", ownerUserId: owner.id }));
  await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.msp.id, name: "Lifecycle Workspace", ownerUserId: owner.id }));
  await mutateDb((db) => createMspMembership(db, { mspId: msp.msp.id, userId: owner.id, role: "admin" }));
  return msp.msp;
}

async function main() {
  const msp = await seedScenario();

  const paid = applyBillingLifecycleEvent(msp, "invoice.paid");
  assert.strictEqual(paid.msp.billingStatus, "active", "invoice.paid should activate the MSP.");
  assert.strictEqual(paid.msp.lifecycle.dashboardActivated, true, "Activation should unlock dashboard features.");

  const paymentFailed = applyBillingLifecycleEvent(paid.msp, "invoice.paymentfailed");
  assert.strictEqual(paymentFailed.msp.billingStatus, "past_due", "payment failed should suspend the MSP to past_due.");
  assert.strictEqual(paymentFailed.msp.lifecycle.newScansDisabled, true, "Suspension should disable new scans.");

  const deleted = applyBillingLifecycleEvent(paymentFailed.msp, "customer.subscription.deleted");
  assert.strictEqual(deleted.msp.billingStatus, "canceled", "subscription deletion should cancel the MSP.");

  const trialEnding = applyBillingLifecycleEvent({ ...msp, billingStatus: "trialing" }, "customer.subscription.trialwillend");
  assert.strictEqual(trialEnding.msp.billingStatus, "trialing", "trial end event should retain trialing state.");

  const invalid = () => applyBillingLifecycleEvent({ ...msp, billingStatus: "canceled" }, "invoice.paid");
  assert.throws(invalid, /Invalid billing transition/, "Invalid lifecycle transitions should be rejected.");

  const activation = activateMsp(msp);
  assert.strictEqual(activation.billingStatus, "active", "activateMsp should set active billing status.");

  const suspension = suspendMsp({ ...msp, billingStatus: "active" });
  assert.strictEqual(suspension.billingStatus, "past_due", "suspendMsp should default to past_due.");
  assert.strictEqual(suspension.lifecycle.dashboardBannerVisible, true, "Suspension should surface the dashboard banner.");

  console.log("MSP billing lifecycle tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
