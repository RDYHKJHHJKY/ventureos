import assert from "node:assert/strict";
import { createId, mutateDb, createMsp, createWorkspaceForMsp } from "../lib/server/data-store.js";
import { createSession } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = { ...this.headers, ...headers };
    },
    end(payload) {
      this.body = payload;
    },
  };
}

async function requestJson(pathname, token, workspaceId = null) {
  const headers = token ? { cookie: `ventureos_session=${token}` } : {};
  if (workspaceId) headers["x-workspace-id"] = workspaceId;
  const req = { method: "GET", url: pathname, headers };
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

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
    db.passports = [];
    db.projectEvents = [];
    db.billingUsage = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "msp-summary"), name: "Summary User", email: "summary@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const mspResult = await mutateDb((db) => createMsp(db, { name: "Summary MSP", billingEmail: "billing@summary.local", region: "us-east-1", ownerUserId: user.id }));
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
    db.passports.push({ id: createId("passport", workspace.id), workspaceId: workspace.id, assetId: db.assets[0].id, createdAt: now, issuedAt: now, trustScore: 80, version: 1, revoked: false });
    db.projectEvents.push({ id: createId("event", workspace.id), workspaceId: workspace.id, type: "SCAN_COMPLETED", timestamp: now, createdAt: now });
    db.billingUsage.push({ id: createId("billingusage", msp.id), mspId: msp.id, type: "metered", description: "Scan usage", quantity: 2, amountCents: 200, currency: "USD", recordedAt: now, month: now.slice(0, 7) });
  });

  return { user, msp, workspace };
}

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function main() {
  const { user, msp, workspace } = await seedScenario({ billingStatus: "active" });
  const session = await createSession(user.id);

  const summary = await requestJson(`/api/msp/${msp.id}/summary`, session.token, workspace.id);
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.payload.ok, true);
  assert.equal(summary.payload.mspId, msp.id);
  assert.equal(summary.payload.mode, "active");
  assert.equal(summary.payload.billingStatus, "paid");
  assert.equal(summary.payload.workspaces, 1);
  assert.equal(summary.payload.totals.assets, 1);
  assert.equal(summary.payload.totals.scans, 1);
  assert.equal(summary.payload.totals.passports, 1);
  assert.equal(summary.payload.totals.nodes, 2);
  assert.equal(summary.payload.totals.edges, 1);
  assert.equal(summary.payload.totals.riskEvents, 1);
  assert.equal(summary.payload.totals.timelineEvents, 2);
  assert.ok(isIsoTimestamp(summary.payload.meta.generatedAt));

  const nonMspResponse = await requestJson(`/api/msp/${msp.id}/summary`, null);
  assert.equal(nonMspResponse.statusCode, 401);

  const otherScenario = await seedScenario({ billingStatus: "active" });
  const otherUserSession = await createSession(otherScenario.user.id);
  const crossMspResponse = await requestJson(`/api/msp/${msp.id}/summary`, otherUserSession.token, otherScenario.workspace.id);
  assert.equal(crossMspResponse.statusCode, 403);

  const suspendedScenario = await seedScenario({ billingStatus: "past_due" });
  const suspendedSession = await createSession(suspendedScenario.user.id);
  const suspendedResponse = await requestJson(`/api/msp/${suspendedScenario.msp.id}/summary`, suspendedSession.token, suspendedScenario.workspace.id);
  assert.equal(suspendedResponse.statusCode, 200);
  assert.equal(suspendedResponse.payload.billingStatus, "overdue");
  assert.equal(suspendedResponse.payload.mode, "suspended");

  console.log("MSP summary tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
