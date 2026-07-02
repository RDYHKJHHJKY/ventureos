import assert from "node:assert/strict";
import { mutateDb, createId, createMsp, createWorkspaceForMsp } from "../lib/server/data-store.js";
import { createSession } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";
import { getWorkspaceOverview } from "../lib/server/billing.js";

async function seedScenario({ billingStatus = "active", includeIdleWorkspace = false }) {
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
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "workspace-overview"), name: "Overview User", email: "overview@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const mspResult = await mutateDb((db) => createMsp(db, { name: "Overview MSP", billingEmail: "billing@overview.local", region: "us-east-1", ownerUserId: user.id }));
  const msp = mspResult.msp;
  await mutateDb((db) => {
    const target = db.msps.find((item) => item.id === msp.id);
    if (target) {
      target.billingStatus = billingStatus;
      target.updatedAt = new Date().toISOString();
    }
  });

  const workspaceA = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: "Client A", ownerUserId: user.id }));
  const workspaceB = includeIdleWorkspace
    ? await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: "Client B", ownerUserId: user.id }))
    : null;

  await mutateDb((db) => {
    const now = new Date().toISOString();
    const olderScan = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const newerScan = new Date().toISOString();
    const olderPassport = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const newerPassport = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const olderTimeline = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const newerTimeline = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    db.assets.push({ id: createId("asset", "a"), workspaceId: workspaceA.id, name: "Asset A", createdAt: now, updatedAt: now, latestTrustScore: 20, latestConfidenceScore: 40, risk: "High", passportStatus: "Review", monitoringStatus: "Active" });
    db.scanRuns.push({ id: createId("scan", "a1"), workspaceId: workspaceA.id, createdAt: olderScan, completedAt: olderScan, trustScore: 20, confidenceScore: 40, verdict: "Review", risk: 70, scores: { security: 0.2, engineering: 0.4, business: 0.3, product: 0.2 } });
    db.scanRuns.push({ id: createId("scan", "a2"), workspaceId: workspaceA.id, createdAt: newerScan, completedAt: newerScan, trustScore: 25, confidenceScore: 45, verdict: "Review", risk: 60, scores: { security: 0.25, engineering: 0.45, business: 0.35, product: 0.25 } });
    db.scanFindings.push({ id: createId("finding", "a"), workspaceId: workspaceA.id, title: "Critical issue", severity: "high", createdAt: now });
    db.passports.push({ id: createId("passport", "a1"), workspaceId: workspaceA.id, assetId: db.assets[0].id, createdAt: olderPassport, updatedAt: olderPassport, issuedAt: olderPassport, trustScore: 20, version: 1, revoked: false });
    db.passports.push({ id: createId("passport", "a2"), workspaceId: workspaceA.id, assetId: db.assets[0].id, createdAt: newerPassport, updatedAt: newerPassport, issuedAt: newerPassport, trustScore: 30, version: 2, revoked: false });
    db.projectEvents.push({ id: createId("event", "a1"), workspaceId: workspaceA.id, type: "SCAN_COMPLETED", timestamp: olderTimeline, createdAt: olderTimeline });
    db.projectEvents.push({ id: createId("event", "a2"), workspaceId: workspaceA.id, type: "SCAN_COMPLETED", timestamp: newerTimeline, createdAt: newerTimeline });
  });

  return { user, msp, workspaces: includeIdleWorkspace ? [workspaceA, workspaceB] : [workspaceA], workspaceA, workspaceB };
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
  const req = { method: "GET", url: pathname, headers: token ? { cookie: `ventureos_session=${token}` } : {} };
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function main() {
  const { user, msp, workspaces, workspaceA, workspaceB } = await seedScenario({ billingStatus: "active", includeIdleWorkspace: true });
  const session = await createSession(user.id);

  const overview = getWorkspaceOverview({ mspId: msp.id, workspaces, db: await mutateDb((db) => db) });
  assert.equal(overview.length, 2);
  const activeWorkspace = overview.find((item) => item.id === workspaceA.id);
  const idleWorkspace = overview.find((item) => item.id === workspaceB.id);

  assert.equal(activeWorkspace.assetCount, 1);
  assert.equal(activeWorkspace.scanCount, 2);
  assert.equal(activeWorkspace.passportCount, 2);
  assert.equal(activeWorkspace.nodeCount >= 0, true);
  assert.equal(activeWorkspace.edgeCount >= 0, true);
  assert.equal(activeWorkspace.riskEvents, 2);
  assert.equal(activeWorkspace.timelineEvents, 2);
  assert.equal(activeWorkspace.mode, "active");
  assert.ok(isIsoTimestamp(activeWorkspace.lastScan));
  assert.ok(isIsoTimestamp(activeWorkspace.lastPassport));
  assert.ok(isIsoTimestamp(activeWorkspace.lastTimelineEvent));
  assert.equal(idleWorkspace.assetCount, 0);
  assert.equal(idleWorkspace.scanCount, 0);
  assert.equal(idleWorkspace.passportCount, 0);
  assert.equal(idleWorkspace.riskEvents, 0);
  assert.equal(idleWorkspace.timelineEvents, 0);
  assert.equal(idleWorkspace.lastScan, null);
  assert.equal(idleWorkspace.lastPassport, null);
  assert.equal(idleWorkspace.lastTimelineEvent, null);
  assert.equal(idleWorkspace.mode, "active");

  const endpoint = await requestJson(`/api/msp/${msp.id}/workspaces/overview`, session.token, workspaceA.id);
  assert.equal(endpoint.statusCode, 200);
  assert.equal(endpoint.payload.ok, true);
  assert.equal(endpoint.payload.mspId, msp.id);
  assert.equal(endpoint.payload.workspaces.length, 2);
  assert.equal(endpoint.payload.meta.generatedAt.length > 0, true);
  assert.equal(endpoint.payload.workspaces.some((workspace) => workspace.lastScan === null), true);
  assert.equal(endpoint.payload.workspaces.some((workspace) => workspace.lastPassport === null), true);
  assert.equal(endpoint.payload.workspaces.some((workspace) => workspace.lastTimelineEvent === null), true);
  assert.equal(endpoint.payload.workspaces.every((workspace) => ["active", "suspended", "trial", "cancelled"].includes(workspace.mode)), true);

  const otherUser = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "other-msp"), name: "Other User", email: "other@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });
  const otherSession = await createSession(otherUser.id);
  const nonMspResponse = await requestJson(`/api/msp/${msp.id}/workspaces/overview`, otherSession.token, otherScenario.workspace.id);
  assert.equal(nonMspResponse.statusCode, 403);

  const otherMspResult = await mutateDb((db) => createMsp(db, { name: "Other MSP", billingEmail: "billing@other.local", region: "us-east-1", ownerUserId: otherUser.id }));
  const crossMspResponse = await requestJson(`/api/msp/${msp.id}/workspaces/overview`, otherSession.token, otherScenario.workspace.id);
  assert.equal(crossMspResponse.statusCode, 403);

  const suspendedScenario = await seedScenario({ billingStatus: "past_due", includeIdleWorkspace: false });
  const suspendedSession = await createSession(suspendedScenario.user.id);
  const suspendedEndpoint = await requestJson(`/api/msp/${suspendedScenario.msp.id}/workspaces/overview`, suspendedSession.token, suspendedScenario.workspaceA.id);
  assert.equal(suspendedEndpoint.statusCode, 200);
  assert.equal(suspendedEndpoint.payload.workspaces.length, 1);
  assert.equal(suspendedEndpoint.payload.workspaces[0].mode, "suspended");

  console.log("MSP workspace overview tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
