import assert from "node:assert/strict";
import { mutateDb, createId } from "../lib/server/data-store.js";
import { activateMsp, suspendMsp, cancelMsp, applyBillingLifecycleEvent } from "../lib/server/billing.js";

async function seedMsp() {
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

  const msp = await mutateDb((db) => {
    const now = new Date().toISOString();
    const item = {
      id: createId("msp", "lifecycle"),
      name: "Lifecycle MSP",
      billingEmail: "billing@lifecycle.local",
      region: "us-east-1",
      ownerUserId: owner.id,
      createdAt: now,
      updatedAt: now,
      billingStatus: "pending",
      plan: "starter",
    };
    db.msps.push(item);
    return item;
  });

  return msp;
}

async function main() {
  const msp = await seedMsp();

  const activated = activateMsp(msp);
  assert.equal(activated.billingStatus, "active");
  assert.equal(activated.lifecycle.workspaceCreationEnabled, true);
  assert.equal(activated.lifecycle.scansEnabled, true);
  assert.equal(activated.lifecycle.passportsEnabled, true);
  assert.equal(activated.lifecycle.timelineEventsEnabled, true);
  assert.equal(activated.lifecycle.riskCoverageEnforcementEnabled, true);
  assert.equal(activated.lifecycle.billingPortalEnabled, true);
  assert.equal(activated.lifecycle.usageMeteringEnabled, true);

  const suspended = suspendMsp(activated, { billingStatus: "past_due" });
  assert.equal(suspended.billingStatus, "past_due");
  assert.equal(suspended.lifecycle.newScansDisabled, true);
  assert.equal(suspended.lifecycle.newPassportsDisabled, true);
  assert.equal(suspended.lifecycle.newAssetsDisabled, true);
  assert.equal(suspended.lifecycle.workspaceCreationEnabled, false);
  assert.equal(suspended.lifecycle.graphReadOnly, true);
  assert.equal(suspended.lifecycle.timelineReadOnly, true);
  assert.equal(suspended.lifecycle.dashboardBannerVisible, true);

  const canceled = cancelMsp(suspended, { billingStatus: "canceled" });
  assert.equal(canceled.billingStatus, "canceled");
  assert.equal(canceled.lifecycle.workspaceFrozen, true);
  assert.equal(canceled.lifecycle.scansEnabled, false);
  assert.equal(canceled.lifecycle.passportsEnabled, false);
  assert.equal(canceled.lifecycle.timelineEventsEnabled, false);
  assert.equal(canceled.lifecycle.riskCoverageEnforcementEnabled, false);
  assert.equal(canceled.lifecycle.dataExportEnabled, true);

  const webhookActivation = applyBillingLifecycleEvent(msp, "invoice.paid");
  assert.equal(webhookActivation.msp.billingStatus, "active");

  const webhookSuspension = applyBillingLifecycleEvent({ ...activated, billingStatus: "active" }, "invoice.paymentfailed");
  assert.equal(webhookSuspension.msp.billingStatus, "past_due");

  const webhookCancellation = applyBillingLifecycleEvent({ ...suspended, billingStatus: "past_due" }, "customer.subscription.deleted");
  assert.equal(webhookCancellation.msp.billingStatus, "canceled");

  console.log("MSP lifecycle tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
