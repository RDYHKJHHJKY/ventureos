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
    db.projects = [];
    db.projectArtifacts = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "msp-intelligence"), name: "Intelligence User", email: "intelligence@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const mspResult = await mutateDb((db) => createMsp(db, { name: "Intelligence MSP", billingEmail: "billing@intelligence.local", region: "us-east-1", ownerUserId: user.id }));
  const msp = mspResult.msp;
  await mutateDb((db) => {
    const target = db.msps.find((item) => item.id === msp.id);
    if (target) {
      target.billingStatus = billingStatus;
      target.updatedAt = new Date().toISOString();
    }
  });

  const workspaceA = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: "Client A", ownerUserId: user.id }));
  const workspaceB = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: "Client B", ownerUserId: user.id }));
  await mutateDb((db) => {
    const now = new Date().toISOString();
    db.assets.push({ id: createId("asset", "a"), workspaceId: workspaceA.id, name: "Asset A", createdAt: now, updatedAt: now, latestTrustScore: 20, latestConfidenceScore: 40, risk: "High", passportStatus: "Review", monitoringStatus: "Active" });
    db.scanRuns.push({ id: createId("scan", "a"), workspaceId: workspaceA.id, assetId: db.assets[0].id, createdAt: now, completedAt: now, trustScore: 20, confidenceScore: 40, verdict: "Review", risk: 70, scores: { security: 0.2, engineering: 0.4, business: 0.3, product: 0.2 } });
    db.scanFindings.push({ id: createId("finding", "a"), workspaceId: workspaceA.id, title: "Critical issue", severity: "high", createdAt: now });
    db.passports.push({ id: createId("passport", "a"), workspaceId: workspaceA.id, assetId: db.assets[0].id, createdAt: now, issuedAt: now, trustScore: 20, version: 1, revoked: false });
    db.projectEvents.push({ id: createId("event", "a"), workspaceId: workspaceA.id, type: "SCAN_COMPLETED", timestamp: now, createdAt: now });

    db.assets.push({ id: createId("asset", "b"), workspaceId: workspaceB.id, name: "Asset B", createdAt: now, updatedAt: now, latestTrustScore: 80, latestConfidenceScore: 82, risk: "Low", passportStatus: "Active", monitoringStatus: "Active" });
    db.scanRuns.push({ id: createId("scan", "b"), workspaceId: workspaceB.id, assetId: db.assets[1].id, createdAt: now, completedAt: now, trustScore: 80, confidenceScore: 82, verdict: "Verified", risk: 20, scores: { security: 0.8, engineering: 0.7, business: 0.6, product: 0.5 } });
    db.passports.push({ id: createId("passport", "b"), workspaceId: workspaceB.id, assetId: db.assets[1].id, createdAt: now, issuedAt: now, trustScore: 80, version: 1, revoked: false });
    db.projectEvents.push({ id: createId("event", "b"), workspaceId: workspaceB.id, type: "SCAN_COMPLETED", timestamp: now, createdAt: now });
  });

  return { user, msp, workspaces: [workspaceA, workspaceB] };
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
  const { user, msp, workspaces } = await seedScenario({ billingStatus: "active" });
  const session = await createSession(user.id);

  const intelligence = await requestJson(`/api/msp/${msp.id}/intelligence`, session.token);
  assert.equal(intelligence.statusCode, 200);
  assert.equal(intelligence.payload.ok, true);
  assert.equal(intelligence.payload.risk.totalRiskEvents, 2);
  assert.equal(intelligence.payload.risk.riskBySeverity.high, 1);
  assert.equal(intelligence.payload.staleness.numberOfStaleWorkspaces, 1);
  assert.equal(intelligence.payload.coverage.averageCoverage, 50);
  assert.equal(intelligence.payload.coverage.coverageDistribution.healthy, 1);

  const suspendedScenario = await seedScenario({ billingStatus: "past_due" });
  const suspendedSession = await createSession(suspendedScenario.user.id);
  const suspendedIntelligence = await requestJson(`/api/msp/${suspendedScenario.msp.id}/intelligence`, suspendedSession.token);
  assert.equal(suspendedIntelligence.statusCode, 200);
  assert.equal(suspendedIntelligence.payload.risk.totalRiskEvents, 2);

  const unauthorized = await requestJson(`/api/msp/${msp.id}/intelligence`, "invalid-token");
  assert.equal(unauthorized.statusCode, 401);

  console.log("MSP intelligence tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
