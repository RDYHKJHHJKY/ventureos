import assert from "node:assert/strict";
import { createId, mutateDb, createMsp, createWorkspaceForMsp } from "../lib/server/data-store.js";
import { createSession } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";

async function seedScenario({ billingStatus = "active" }) {
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
    db.evidenceItems = [];
    db.passports = [];
    db.projectEvents = [];
    db.billingUsage = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "msp-dashboard"), name: "Dashboard User", email: "dashboard@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const mspResult = await mutateDb((db) => createMsp(db, { name: "Dashboard MSP", billingEmail: "billing@dashboard.local", region: "us-east-1", ownerUserId: user.id }));
  const msp = mspResult.msp;
  await mutateDb((db) => {
    const target = db.msps.find((item) => item.id === msp.id);
    if (target) {
      target.billingStatus = billingStatus;
      target.updatedAt = new Date().toISOString();
    }
  });

  const workspace = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: "Client Workspace", ownerUserId: user.id }));
  await mutateDb((db) => {
    const now = new Date().toISOString();
    db.assets.push({ id: createId("asset", workspace.id), workspaceId: workspace.id, name: "Alpha Asset", createdAt: now, updatedAt: now, latestTrustScore: 80, latestConfidenceScore: 90, risk: "High", passportStatus: "Active", monitoringStatus: "Active" });
    db.scanRuns.push({ id: createId("scan", workspace.id), workspaceId: workspace.id, createdAt: now, completedAt: now, trustScore: 80, confidenceScore: 90, verdict: "Verified", risk: 82, scores: { security: 0.8, engineering: 0.7, business: 0.6, product: 0.5 } });
    db.scanFindings.push({ id: createId("finding", workspace.id), workspaceId: workspace.id, title: "High risk dependency", severity: "high", createdAt: now });
    db.passports.push({ id: createId("passport", workspace.id), workspaceId: workspace.id, assetId: db.assets[0].id, createdAt: now, issuedAt: now, trustScore: 80, version: 1, revoked: false });
    db.projectEvents.push({ id: createId("event", workspace.id), workspaceId: workspace.id, type: "SCAN_COMPLETED", timestamp: now, createdAt: now });
    db.billingUsage.push({ id: createId("billingusage", msp.id), mspId: msp.id, type: "metered", description: "Scan usage", quantity: 2, amountCents: 200, currency: "USD", recordedAt: now, month: now.slice(0, 7) });
  });

  return { user, msp, workspace };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(body) { this.body = body; },
  };
}

async function requestJson(pathname, token) {
  const req = { method: "GET", url: pathname, headers: { cookie: `ventureos_session=${token}` } };
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: JSON.parse(res.body) };
}

async function main() {
  const { user, msp } = await seedScenario({ billingStatus: "active" });
  const session = await createSession(user.id);

  const summary = await requestJson(`/api/msp/${msp.id}/summary`, session.token);
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.payload.ok, true);
  assert.equal(summary.payload.mode, "active");
  assert.equal(summary.payload.billingStatus, "paid");
  assert.equal(summary.payload.workspaces, 1);
  assert.equal(summary.payload.totals.assetCount, 1);
  assert.equal(summary.payload.totals.scanCount, 1);
  assert.equal(summary.payload.totals.passportCount, 1);
  assert.equal(summary.payload.totals.riskEvents, 1);

  const overview = await requestJson(`/api/msp/${msp.id}/workspaces/overview`, session.token);
  assert.equal(overview.statusCode, 200);
  assert.equal(overview.payload.ok, true);
  assert.equal(overview.payload.workspaces.length, 1);
  assert.equal(overview.payload.workspaces[0].assetCount, 1);
  assert.equal(overview.payload.workspaces[0].scanCount, 1);
  assert.equal(overview.payload.workspaces[0].passportCount, 1);

  const billing = await requestJson(`/api/msp/${msp.id}/billing`, session.token);
  assert.equal(billing.statusCode, 200);
  assert.equal(billing.payload.ok, true);
  assert.equal(billing.payload.billingStatus, "active");
  assert.equal(billing.payload.plan, "starter");
  assert.equal(billing.payload.usageTotals.scanCount, 1);
  assert.equal(billing.payload.usageByWorkspace[0].workspaceName, "Client Workspace");

  const alerts = await requestJson(`/api/msp/${msp.id}/alerts`, session.token);
  assert.equal(alerts.statusCode, 200);
  assert.equal(alerts.payload.ok, true);
  assert.ok(alerts.payload.alerts.some((alert) => alert.message.includes("High risk")));

  const pastDueScenario = await seedScenario({ billingStatus: "past_due" });
  const pastDueSession = await createSession(pastDueScenario.user.id);
  const pastDueSummary = await requestJson(`/api/msp/${pastDueScenario.msp.id}/summary`, pastDueSession.token);
  assert.equal(pastDueSummary.statusCode, 200);
  assert.equal(pastDueSummary.payload.mode, "suspended");

  const unauthorized = await requestJson(`/api/msp/${msp.id}/summary`, "invalid-token");
  assert.equal(unauthorized.statusCode, 401);

  console.log("MSP dashboard tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
