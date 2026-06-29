import assert from 'node:assert/strict';
import { mutateDb, createId, createMsp, createWorkspaceForMsp } from '../lib/server/data-store.js';
import { createSession } from '../lib/server/auth.js';
import { handleApiRequest } from '../lib/server/api-router.js';
import { readDb } from '../lib/server/data-store.js';

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
    },
    end(body) {
      this.body = body;
    },
  };
}

async function main() {
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
  });

  const now = new Date().toISOString();
  const user = { id: createId('user', 'workspace-overview'), name: 'Overview User', email: 'overview@test.local', passwordHash: 'hash', createdAt: now, updatedAt: now };
  await mutateDb((db) => { db.users.push(user); });
  const { msp } = await mutateDb((db) => createMsp(db, { name: 'Overview MSP', billingEmail: 'billing@overview.local', region: 'us-east-1', ownerUserId: user.id }));
  await mutateDb((db) => {
    const target = db.msps.find((item) => item.id === msp.id);
    if (target) { target.billingStatus = 'active'; target.updatedAt = new Date().toISOString(); }
  });
  const workspaceA = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: 'Client A', ownerUserId: user.id }));
  const workspaceB = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: 'Client B', ownerUserId: user.id }));
  await mutateDb((db) => {
    db.assets.push({ id: createId('asset', 'a'), workspaceId: workspaceA.id, name: 'Asset A', createdAt: now, updatedAt: now, latestTrustScore: 20, latestConfidenceScore: 40, risk: 'High', passportStatus: 'Review', monitoringStatus: 'Active' });
    db.scanRuns.push({ id: createId('scan', 'a'), workspaceId: workspaceA.id, createdAt: now, completedAt: now, trustScore: 20, confidenceScore: 40, verdict: 'Review', risk: 70, scores: { security: 0.2, engineering: 0.4, business: 0.3, product: 0.2 } });
    db.scanFindings.push({ id: createId('finding', 'a'), workspaceId: workspaceA.id, title: 'Critical issue', severity: 'high', createdAt: now });
    db.passports.push({ id: createId('passport', 'a'), workspaceId: workspaceA.id, assetId: db.assets[0].id, createdAt: now, issuedAt: now, trustScore: 20, version: 1, revoked: false });
    db.projectEvents.push({ id: createId('event', 'a'), workspaceId: workspaceA.id, type: 'SCAN_COMPLETED', timestamp: now, createdAt: now });
    db.assets.push({ id: createId('asset', 'b'), workspaceId: workspaceB.id, name: 'Asset B', createdAt: now, updatedAt: now, latestTrustScore: 80, latestConfidenceScore: 82, risk: 'Low', passportStatus: 'Active', monitoringStatus: 'Active' });
    db.scanRuns.push({ id: createId('scan', 'b'), workspaceId: workspaceB.id, createdAt: now, completedAt: now, trustScore: 80, confidenceScore: 82, verdict: 'Verified', risk: 20, scores: { security: 0.8, engineering: 0.7, business: 0.6, product: 0.5 } });
    db.passports.push({ id: createId('passport', 'b'), workspaceId: workspaceB.id, assetId: db.assets[1].id, createdAt: now, issuedAt: now, trustScore: 80, version: 1, revoked: false });
    db.projectEvents.push({ id: createId('event', 'b'), workspaceId: workspaceB.id, type: 'SCAN_COMPLETED', timestamp: now, createdAt: now });
  });

  const session = await createSession(user.id);
  const req = { method: 'GET', url: `/api/msp/${encodeURIComponent(msp.id)}/workspaces/overview`, headers: { cookie: `ventureos_session=${session.token}` } };
  const res = makeRes();
  await handleApiRequest(req, res);
  console.log('status', res.statusCode);
  console.log('body', res.body);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
