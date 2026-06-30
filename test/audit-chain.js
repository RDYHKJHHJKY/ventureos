import assert from "node:assert/strict";
import { auditChain } from "../lib/server/audit-chain.js";

function makeDb() {
  return { sprAuditLogs: [] };
}

async function testChainAppendAndVerify() {
  const db = makeDb();
  const first = auditChain.append(db, { type: "evidence.ingest", targetId: "e1", payload: { title: "SBOM" }, workspaceId: "workspace-1" });
  const second = auditChain.append(db, { type: "passport.issued", targetId: "p1", payload: { softwareId: "s1" }, workspaceId: "workspace-1" });

  assert.equal(db.sprAuditLogs.length, 2);
  assert.equal(db.sprAuditLogs[0].previousAuditHash, null);
  assert.equal(db.sprAuditLogs[1].previousAuditHash, first.auditHash);

  const verifyResult = auditChain.verify(db.sprAuditLogs);
  assert.equal(verifyResult.ok, true);
  assert.equal(verifyResult.length, 2);
  assert.equal(verifyResult.lastHash, second.auditHash);
}

async function testTamperingDetection() {
  const db = makeDb();
  auditChain.append(db, { type: "evidence.ingest", targetId: "e1", payload: { title: "SBOM" }, workspaceId: "workspace-1" });
  auditChain.append(db, { type: "passport.issued", targetId: "p1", payload: { softwareId: "s1" }, workspaceId: "workspace-1" });

  db.sprAuditLogs[0].payload.title = "COMPROMISED";
  const tamperResult = auditChain.verify(db.sprAuditLogs);
  assert.equal(tamperResult.ok, false);
  assert.equal(tamperResult.reason, "Audit entry payload tampering detected.");
}

async function testReorderDetection() {
  const db = makeDb();
  auditChain.append(db, { type: "evidence.ingest", targetId: "e1", payload: { title: "SBOM" }, workspaceId: "workspace-1" });
  auditChain.append(db, { type: "passport.issued", targetId: "p1", payload: { softwareId: "s1" }, workspaceId: "workspace-1" });

  const reordered = [db.sprAuditLogs[1], db.sprAuditLogs[0]];
  const reorderResult = auditChain.verify(reordered);
  assert.equal(reorderResult.ok, false);
  assert.equal(reorderResult.reason, "Broken audit chain.");
}

async function testMissingEntryDetection() {
  const db = makeDb();
  auditChain.append(db, { type: "evidence.ingest", targetId: "e1", payload: { title: "SBOM" }, workspaceId: "workspace-1" });
  auditChain.append(db, { type: "passport.issued", targetId: "p1", payload: { softwareId: "s1" }, workspaceId: "workspace-1" });

  const missing = [db.sprAuditLogs[1]];
  const missingResult = auditChain.verify(missing);
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.reason, "Broken audit chain.");
}

async function testSnapshotStability() {
  const db = makeDb();
  auditChain.append(db, { type: "evidence.ingest", targetId: "e1", payload: { title: "SBOM" }, workspaceId: "workspace-1" });
  auditChain.append(db, { type: "passport.issued", targetId: "p1", payload: { softwareId: "s1" }, workspaceId: "workspace-1" });

  const snapshotA = auditChain.snapshot(db.sprAuditLogs, { workspaceId: "workspace-1", trustGraphHash: "graph-1", passportEnvelopeHash: "env-1" });
  const snapshotB = auditChain.snapshot(db.sprAuditLogs, { workspaceId: "workspace-1", trustGraphHash: "graph-1", passportEnvelopeHash: "env-1" });

  assert.equal(snapshotA.ok, true);
  assert.equal(snapshotB.ok, true);
  assert.equal(snapshotA.snapshotHash, snapshotB.snapshotHash);
  assert.equal(snapshotA.summary.entryCount, 2);
}

async function main() {
  await testChainAppendAndVerify();
  await testTamperingDetection();
  await testReorderDetection();
  await testMissingEntryDetection();
  await testSnapshotStability();
  console.log("Audit chain tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
