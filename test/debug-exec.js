import { createId, mutateDb, createMsp, createWorkspaceForMsp } from "../lib/server/data-store.js";
import { createSession } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";

async function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(body) { this.body = body; },
  };
}

async function run() {
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
    const record = { id: createId("user", "msp-executive"), name: "Executive User", email: "executive@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const mspResult = await mutateDb((db) => createMsp(db, { name: "Executive MSP", billingEmail: "billing@executive.local", region: "us-east-1", ownerUserId: user.id }));
  const msp = mspResult.msp;
  await mutateDb((db) => {
    const target = db.msps.find((item) => item.id === msp.id);
    if (target) {
      target.billingStatus = "active";
      target.updatedAt = new Date().toISOString();
    }
  });

  const workspaceA = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: "Client A", ownerUserId: user.id }));
  const workspaceB = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: "Client B", ownerUserId: user.id }));

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const freshDate = new Date().toISOString();

  await mutateDb((db) => {
    db.assets.push({ id: createId("asset", "a"), workspaceId: workspaceA.id, name: "Asset A", createdAt: oldDate, updatedAt: oldDate, latestTrustScore: 20, latestConfidenceScore: 40, risk: "High", passportStatus: "Review", monitoringStatus: "Active" });
    db.scanRuns.push({ id: createId("scan", "a"), workspaceId: workspaceA.id, assetId: db.assets[0].id, createdAt: oldDate, completedAt: oldDate, trustScore: 20, confidenceScore: 40, verdict: "Review", risk: 70, scores: { security: 0.2, engineering: 0.4, business: 0.3, product: 0.2 } });
    db.scanFindings.push({ id: createId("finding", "a"), workspaceId: workspaceA.id, title: "Critical issue", severity: "high", createdAt: oldDate });
    db.projectEvents.push({ id: createId("event", "a"), workspaceId: workspaceA.id, type: "SCAN_COMPLETED", timestamp: oldDate, createdAt: oldDate });

    db.assets.push({ id: createId("asset", "b"), workspaceId: workspaceB.id, name: "Asset B", createdAt: freshDate, updatedAt: freshDate, latestTrustScore: 80, latestConfidenceScore: 82, risk: "Low", passportStatus: "Active", monitoringStatus: "Active" });
    db.scanRuns.push({ id: createId("scan", "b"), workspaceId: workspaceB.id, assetId: db.assets[1].id, createdAt: freshDate, completedAt: freshDate, trustScore: 80, confidenceScore: 82, verdict: "Verified", risk: 20, scores: { security: 0.8, engineering: 0.7, business: 0.6, product: 0.5 } });
    db.passports.push({ id: createId("passport", "b"), workspaceId: workspaceB.id, assetId: db.assets[1].id, createdAt: freshDate, issuedAt: freshDate, trustScore: 80, version: 1, revoked: false });
    db.projectEvents.push({ id: createId("event", "b"), workspaceId: workspaceB.id, type: "SCAN_COMPLETED", timestamp: freshDate, createdAt: freshDate });
  });

  const { token } = await createSession(user.id);
  const req = { method: 'GET', url: `/api/msp/${msp.id}/executive`, headers: { cookie: `ventureos_session=${token}` } };
  const res = await makeRes();
  await handleApiRequest(req, res);
  console.log('statusCode=', res.statusCode);
  console.log('body=', JSON.stringify(JSON.parse(res.body), null, 2));
}

run().catch((e)=>{ console.error(e); process.exit(1); });
