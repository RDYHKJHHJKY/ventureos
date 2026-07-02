import { mutateDb, createId, createMsp, createWorkspaceForMsp } from '../lib/server/data-store.js';
import { getWorkspaceOverview, getWorkspaceUsageSummary } from '../lib/server/billing.js';

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
    db.passports = [];
    db.projectEvents = [];
    db.billingUsage = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId('user', 'workspace-overview'), name: 'Overview User', email: 'overview@test.local', passwordHash: 'hash', createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const mspResult = await mutateDb((db) => createMsp(db, { name: 'Overview MSP', billingEmail: 'billing@overview.local', region: 'us-east-1', ownerUserId: user.id }));
  const msp = mspResult.msp;
  await mutateDb((db) => {
    const target = db.msps.find((item) => item.id === msp.id);
    if (target) {
      target.billingStatus = 'active';
      target.updatedAt = new Date().toISOString();
    }
  });

  const workspaceA = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: 'Client A', ownerUserId: user.id }));
  const workspaceB = await mutateDb((db) => createWorkspaceForMsp(db, { mspId: msp.id, name: 'Client B', ownerUserId: user.id }));

  await mutateDb((db) => {
    const now = new Date().toISOString();
    const olderScan = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const newerScan = new Date().toISOString();
    const olderPassport = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const newerPassport = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const olderTimeline = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const newerTimeline = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    db.assets.push({ id: createId('asset', 'a'), workspaceId: workspaceA.id, name: 'Asset A', createdAt: now, updatedAt: now, latestTrustScore: 20, latestConfidenceScore: 40, risk: 'High', passportStatus: 'Review', monitoringStatus: 'Active' });
    db.scanRuns.push({ id: createId('scan', 'a1'), workspaceId: workspaceA.id, createdAt: olderScan, completedAt: olderScan, trustScore: 20, confidenceScore: 40, verdict: 'Review', risk: 70, scores: { security: 0.2, engineering: 0.4, business: 0.3, product: 0.2 } });
    db.scanRuns.push({ id: createId('scan', 'a2'), workspaceId: workspaceA.id, createdAt: newerScan, completedAt: newerScan, trustScore: 25, confidenceScore: 45, verdict: 'Review', risk: 60, scores: { security: 0.25, engineering: 0.45, business: 0.35, product: 0.25 } });
    db.scanFindings.push({ id: createId('finding', 'a'), workspaceId: workspaceA.id, title: 'Critical issue', severity: 'high', createdAt: now });
    db.passports.push({ id: createId('passport', 'a1'), workspaceId: workspaceA.id, assetId: db.assets[0].id, createdAt: olderPassport, updatedAt: olderPassport, issuedAt: olderPassport, trustScore: 20, version: 1, revoked: false });
    db.passports.push({ id: createId('passport', 'a2'), workspaceId: workspaceA.id, assetId: db.assets[0].id, createdAt: newerPassport, updatedAt: newerPassport, issuedAt: newerPassport, trustScore: 30, version: 2, revoked: false });
    db.projectEvents.push({ id: createId('event', 'a1'), workspaceId: workspaceA.id, type: 'SCAN_COMPLETED', timestamp: olderTimeline, createdAt: olderTimeline });
    db.projectEvents.push({ id: createId('event', 'a2'), workspaceId: workspaceA.id, type: 'SCAN_COMPLETED', timestamp: newerTimeline, createdAt: newerTimeline });
  });

  const db = await mutateDb((db) => db);
  const overview = getWorkspaceOverview({ db, mspId: msp.id, workspaces: [workspaceA, workspaceB] });
  const usageA = getWorkspaceUsageSummary(db, workspaceA.id);
  console.log('overview', JSON.stringify(overview, null, 2));
  console.log('usageA', JSON.stringify(usageA, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});