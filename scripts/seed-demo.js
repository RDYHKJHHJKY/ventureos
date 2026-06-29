import { mutateDb, createId, createMsp, createWorkspaceForMsp } from "../lib/server/data-store.js";
import demo from "../lib/server/demo.js";

async function run() {
  const mspData = demo.generateDemoMsp({ workspaceCount: 5, name: "Demo MSP" });
  await mutateDb((db) => {
    const now = new Date().toISOString();
    const ownerId = createId("user", "demo-owner");
    db.users.push({ id: ownerId, name: "Demo Owner", email: "demo@ventureos.local", passwordHash: "hash", createdAt: now, updatedAt: now });
    const { msp } = createMsp(db, { name: mspData.name, billingEmail: "demo@ventureos.local", region: "us-east-1", ownerUserId: ownerId });
    for (const ws of mspData.workspaces) {
      const workspace = createWorkspaceForMsp(db, { mspId: msp.id, name: ws.name, ownerUserId: ownerId });
      // create assets
      for (let i = 0; i < ws.assetCount; i++) {
        const aid = createId("asset", `${workspace.id}-${i}`);
        const trust = Math.round(Math.max(10, Math.min(95, ws.coverageScore + (Math.random() * 20 - 10))));
        db.assets.push({ id: aid, workspaceId: workspace.id, name: `demo/${workspace.name.toLowerCase().replace(/\s+/g, "-")}-asset-${i + 1}`, latestTrustScore: trust, latestConfidenceScore: Math.max(40, trust - 5), risk: trust >= 75 ? "Low" : trust >= 50 ? "Medium" : "High", passportStatus: i < ws.passportCount ? "Active" : "Review", monitoringStatus: "Active", createdAt: now, updatedAt: now });
      }
      // create scans
      for (let s = 0; s < Math.min(ws.scanCount, Math.max(1, Math.floor(ws.assetCount / 3))); s++) {
        const asset = db.assets.find((a) => a.workspaceId === workspace.id && a.id);
        if (!asset) continue;
        const scanId = createId("scan", `${workspace.id}-${s}`);
        const risk = Math.random() > 0.7 ? 75 : Math.random() > 0.5 ? 45 : 20;
        db.scanRuns.push({ id: scanId, assetId: asset.id, assetName: asset.name, workspaceId: workspace.id, createdBy: ownerId, status: "completed", trustScore: asset.latestTrustScore, confidenceScore: asset.latestConfidenceScore, verdict: asset.latestTrustScore >= 75 ? "TRUSTED" : "CONDITIONALLY TRUSTED", risk, scores: { security: 60, engineering: 70, business: 50, product: 55 }, explanation: "Demo scan", startedAt: now, completedAt: now, createdAt: now });
      }
      // passports
      for (let p = 0; p < Math.min(ws.passportCount, ws.assetCount); p++) {
        const asset = db.assets.filter((a) => a.workspaceId === workspace.id)[p];
        if (!asset) continue;
        const pid = createId("passport", `${workspace.id}-${p}`);
        db.passports.push({ id: pid, workspaceId: workspace.id, assetId: asset.id, assetName: asset.name, company: "Demo Co", version: 1, trustScore: asset.latestTrustScore, confidenceScore: asset.latestConfidenceScore, verdict: asset.latestTrustScore >= 75 ? "TRUSTED" : "CONDITIONALLY TRUSTED", status: asset.latestTrustScore >= 75 ? "Active" : "Review", isPublic: true, revoked: false, issuedAt: now.slice(0, 10), expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), evidenceSummary: "Demo passport", badgeEmbed: "", publicUrl: `/passport/${pid}`, issuedBy: ownerId, createdAt: now, updatedAt: now });
      }
      // timeline events
      for (let t = 0; t < ws.timelineEvents; t++) {
        db.projectEvents.push({ id: createId("event", `${workspace.id}-${t}`), workspaceId: workspace.id, type: "SCAN_COMPLETED", timestamp: new Date(Date.now() - t * 86400000).toISOString(), createdAt: now });
      }
    }
    return { ok: true, mspId: msp.id };
  });
  console.log("Demo MSP seeded into DB.");
}

run().catch((e) => { console.error(e); process.exit(1); });
