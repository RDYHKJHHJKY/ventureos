import assert from "node:assert/strict";
import { mutateDb, createId, readDb } from "../lib/server/data-store.js";
import { createSession, createWorkspaceForUser, registerUser } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";
import { evidencePipeline } from "../lib/server/evidence-pipeline.js";
import { query } from "../lib/server/db.js";

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

async function requestJson(pathname, method = "GET", payload = null, token) {
  const req = {
    method,
    url: pathname,
    headers: token ? { cookie: `ventureos_session=${token}` } : {},
  };
  if (payload) {
    req.body = JSON.stringify(payload);
    req.headers["content-type"] = "application/json";
  }
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

async function cleanupPostgresForTest() {
  if (!process.env.DATABASE_URL) return;
  
  try {
    // Delete in correct order due to foreign keys
    await query(`DELETE FROM spr_audit_logs`);
    await query(`DELETE FROM spr_signals`);
    await query(`DELETE FROM spr_evidence`);
    await query(`DELETE FROM spr_software`);
    await query(`DELETE FROM spr_vendors`);
    await query(`DELETE FROM passports`);
    await query(`DELETE FROM evidence_items`);
    await query(`DELETE FROM scan_findings`);
    await query(`DELETE FROM scan_runs`);
    await query(`DELETE FROM assets`);
    await query(`DELETE FROM sessions`);
    await query(`DELETE FROM workspace_members`);
    await query(`DELETE FROM workspaces`);
    await query(`DELETE FROM users`);
    console.log("PostgreSQL cleanup completed");
  } catch (error) {
    console.warn("PostgreSQL cleanup warning:", error.message);
  }
}

async function main() {
  // Clean up PostgreSQL if in use
  await cleanupPostgresForTest();

  let user;
  let workspace;

  if (process.env.DATABASE_URL) {
    // PostgreSQL path: use registerUser to get proper UUIDs
    const result = await registerUser({
      name: "Evidence User",
      email: "evidence@test.local",
      password: "testpassword123",
      workspaceName: "Evidence Workspace",
    });
    user = result.user;
    workspace = result.workspace;
  } else {
    // File storage path: use legacy approach
    await mutateDb((db) => {
      db.users = [];
      db.workspaces = [];
      db.workspaceMembers = [];
      db.sprVendors = [];
      db.sprSoftware = [];
      db.sprEvidence = [];
      db.sprSignals = [];
      db.sprAuditLogs = [];
    });

    const userId = createId("user", "evidence-pipeline");
    user = await mutateDb((db) => {
      const now = new Date().toISOString();
      const record = { id: userId, name: "Evidence User", email: "evidence@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
      db.users.push(record);
      return record;
    });

    workspace = await createWorkspaceForUser(user.id, "Evidence Workspace");
  }

  if (!process.env.DATABASE_URL) {
    await mutateDb((db) => {
      const member = db.workspaceMembers.find((item) => item.userId === user.id && item.workspaceId === workspace.id);
      if (member) member.role = "Reviewer";
    });
  }

  const session = await createSession(user.id, { workspaceId: workspace.id });

  const vendorResponse = await requestJson("/api/spr/vendors", "POST", { name: "Contoso", domain: "contoso.example" }, session.token);
  assert.equal(vendorResponse.statusCode, 201);

  const softwareResponse = await requestJson("/api/spr/software", "POST", { name: "Evidence Agent", vendorId: vendorResponse.payload.vendor.id, repositoryUrl: "https://github.com/contoso/evidence-agent", packageName: "@contoso/evidence-agent", version: "1.0.0", ecosystem: "npm" }, session.token);
  assert.equal(softwareResponse.statusCode, 201);

  const malformedResponse = await requestJson("/api/spr/evidence", "POST", { softwareId: softwareResponse.payload.software.id, type: "sbom", title: "", summary: "Missing title", workspaceId: workspace.id, freshnessDays: 7 }, session.token);
  assert.equal(malformedResponse.statusCode, 400);
  assert.equal(malformedResponse.payload.code, "VALIDATION_ERROR");

  const staleResponse = await requestJson("/api/spr/evidence", "POST", { softwareId: softwareResponse.payload.software.id, type: "sbom", title: "Stale evidence", summary: "Old evidence", workspaceId: workspace.id, freshnessDays: 250, createdAt: "2020-01-01T00:00:00.000Z" }, session.token);
  assert.equal(staleResponse.statusCode, 400);
  assert.equal(staleResponse.payload.code, "VALIDATION_ERROR");

  const crossWorkspaceResponse = await requestJson("/api/spr/evidence", "POST", { softwareId: softwareResponse.payload.software.id, type: "sbom", title: "Cross workspace", summary: "Should be rejected", workspaceId: "other-workspace", freshnessDays: 7 }, session.token);
  assert.equal(crossWorkspaceResponse.statusCode, 403);
  assert.equal(crossWorkspaceResponse.payload.code, "FORBIDDEN");

  const oversizedPayload = "x".repeat(300 * 1024);
  const oversizedResponse = await requestJson("/api/spr/evidence", "POST", { softwareId: softwareResponse.payload.software.id, type: "sbom", title: "Oversized evidence", summary: oversizedPayload, workspaceId: workspace.id, freshnessDays: 7 }, session.token);
  assert.equal(oversizedResponse.statusCode, 400);
  assert.equal(oversizedResponse.payload.code, "VALIDATION_ERROR");

  const normalizedA = evidencePipeline.normalize({ softwareId: softwareResponse.payload.software.id, type: "sbom", title: "Normalized evidence", summary: "example", strength: true, freshnessDays: "7", verified: true, workspaceId: workspace.id, vendorId: vendorResponse.payload.vendor.id, trustScore: "82", createdAt: "2024-01-01T01:02:03.000Z" }, { kind: "evidence", workspaceId: workspace.id });
  const normalizedB = evidencePipeline.normalize({ softwareId: softwareResponse.payload.software.id, type: "sbom", title: "Normalized evidence", summary: "example", strength: true, freshnessDays: "7", verified: true, workspaceId: workspace.id, vendorId: vendorResponse.payload.vendor.id, trustScore: 82, createdAt: "2024-01-01T01:02:03.000Z" }, { kind: "evidence", workspaceId: workspace.id });
  assert.equal(normalizedA.trustScore, 82);
  assert.equal(normalizedA.strength, 1);
  assert.equal(normalizedA.verified, 1);
  assert.equal(normalizedA.workspaceId, workspace.id);
  assert.deepEqual(normalizedA, normalizedB);

  const signalResponse = await requestJson(`/api/spr/software/${encodeURIComponent(softwareResponse.payload.software.id)}/signals`, "POST", { type: "cve", severity: "high", summary: "CVE-2026-0001", source: "nvd", workspaceId: workspace.id, confidence: true }, session.token);
  assert.equal(signalResponse.statusCode, 201);
  assert.equal(signalResponse.payload.signal.numericSignals.severity, 2);
  assert.equal(signalResponse.payload.signal.numericSignals.confidence, 1);

  if (process.env.DATABASE_URL) {
    const auditRes = await query(`SELECT type FROM spr_audit_logs WHERE type = $1 LIMIT 1`, ["signal.created"]);
    assert.ok(auditRes && auditRes.rows && auditRes.rows.length > 0, 'Expected signal.created in spr_audit_logs');
  } else {
    const db = await readDb();
    assert.ok((db.sprAuditLogs || []).some((item) => item.type === "signal.created"));
  }

  console.log("Evidence pipeline hardening tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

