import assert from "node:assert/strict";
import { mutateDb, createId, readDb } from "../lib/server/data-store.js";
import { createSession } from "../lib/server/auth.js";
import { handleApiRequest, verifyAuditChain, verifyPassportEnvelope, decryptWorkspacePayload } from "../lib/server/api-router.js";

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
    db.projects = [];
    db.projectArtifacts = [];
    db.projectDependencies = [];
    db.projectMetadata = [];
    db.projectSignals = [];
    db.projectScores = [];
    db.projectEvents = [];
    db.sprVendors = [];
    db.sprSoftware = [];
    db.sprEvidence = [];
    db.sprPassports = [];
    db.sprSignals = [];
    db.sprAuditLogs = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "spr"), name: "SPR User", email: "spr@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });
  const session = await createSession(user.id);

  const vendorResponse = await requestJson("/api/spr/vendors", "POST", { name: "Contoso Security", domain: "contoso.example", email: "security@contoso.example", country: "US", complianceClaims: ["SOC2", "ISO27001"] }, session.token);
  assert.equal(vendorResponse.statusCode, 201);
  assert.equal(vendorResponse.payload.ok, true);
  assert.equal(vendorResponse.payload.vendor.name, "Contoso Security");

  const softwareResponse = await requestJson("/api/spr/software", "POST", { name: "Contoso Trust Agent", vendorId: vendorResponse.payload.vendor.id, repositoryUrl: "https://github.com/contoso/trust-agent", packageName: "@contoso/trust-agent", version: "1.2.3", ecosystem: "npm" }, session.token);
  assert.equal(softwareResponse.statusCode, 201);
  assert.equal(softwareResponse.payload.ok, true);
  assert.equal(softwareResponse.payload.software.name, "Contoso Trust Agent");

  const vendorsListResponse = await requestJson("/api/spr/vendors", "GET", null, session.token);
  assert.equal(vendorsListResponse.statusCode, 200);
  assert.equal(vendorsListResponse.payload.ok, true);
  assert.ok((vendorsListResponse.payload.vendors || []).some((item) => item.id === vendorResponse.payload.vendor.id));

  const softwareListResponse = await requestJson("/api/spr/software", "GET", null, session.token);
  assert.equal(softwareListResponse.statusCode, 200);
  assert.equal(softwareListResponse.payload.ok, true);
  assert.ok((softwareListResponse.payload.software || []).some((item) => item.id === softwareResponse.payload.software.id));

  const evidenceResponse = await requestJson("/api/spr/evidence", "POST", { softwareId: softwareResponse.payload.software.id, type: "sbom", title: "CycloneDX SBOM", summary: "Generated from release pipeline", uri: "https://example.com/sbom.json", strength: 0.9, freshnessDays: 7, verified: true }, session.token);
  assert.equal(evidenceResponse.statusCode, 201);
  assert.equal(evidenceResponse.payload.ok, true);
  assert.equal(evidenceResponse.payload.evidence.type, "sbom");

  const visibilityResponse = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/visibility`, "POST", { visibility: "restricted", accessToken: `${vendorResponse.payload.vendor.id}:${"workspace-1"}:${"restricted"}`, vendorId: vendorResponse.payload.vendor.id, workspaceId: "workspace-1" }, session.token);
  assert.equal(visibilityResponse.statusCode, 200);
  assert.equal(visibilityResponse.payload.ok, true);
  assert.equal(visibilityResponse.payload.evidence.visibility, "restricted");

  const verifyResponse = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/verify`, "POST", { method: "sigstore", verified: true, details: "Signed by release pipeline" }, session.token);
  assert.equal(verifyResponse.statusCode, 200);
  assert.equal(verifyResponse.payload.ok, true);
  assert.equal(verifyResponse.payload.evidence.verificationStatus, "verified");

  const scoreResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/score`, "GET", null, session.token);
  assert.equal(scoreResponse.statusCode, 200);
  assert.equal(scoreResponse.payload.ok, true);
  assert.ok(scoreResponse.payload.score.trustScore >= 60);
  assert.equal(scoreResponse.payload.score.riskCategory, "Moderate");

  const monitorResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/monitor`, "GET", null, session.token);
  assert.equal(monitorResponse.statusCode, 200);
  assert.equal(monitorResponse.payload.ok, true);
  assert.ok(monitorResponse.payload.monitoring.alerts.length >= 0);

  const signalResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/signals`, "POST", { type: "cve", severity: "high", summary: "CVE-2026-0001", source: "nvd" }, session.token);
  assert.equal(signalResponse.statusCode, 201);
  assert.equal(signalResponse.payload.ok, true);
  assert.equal(signalResponse.payload.signal.type, "cve");

  const sbomResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/sbom`, "POST", { content: JSON.stringify({ components: [{ name: "left-pad", version: "1.0.0" }] }) }, session.token);
  assert.equal(sbomResponse.statusCode, 201);
  assert.equal(sbomResponse.payload.ok, true);
  assert.equal(sbomResponse.payload.evidence.type, "sbom");

  const provenanceResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/provenance`, "POST", { type: "slsa", build: "ci", source: "github-actions" }, session.token);
  assert.equal(provenanceResponse.statusCode, 201);
  assert.equal(provenanceResponse.payload.ok, true);
  assert.equal(provenanceResponse.payload.evidence.type, "slsa");

  const sigstoreResponse = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/verify`, "POST", { method: "sigstore", verified: true, details: "Signed by release pipeline" }, session.token);
  assert.equal(sigstoreResponse.statusCode, 200);
  assert.equal(sigstoreResponse.payload.ok, true);
  assert.equal(sigstoreResponse.payload.evidence.verificationStatus, "verified");

  const privacyResponse = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/privacy`, "POST", { visibility: "restricted", accessToken: `${vendorResponse.payload.vendor.id}:workspace-1:restricted`, vendorId: vendorResponse.payload.vendor.id, workspaceId: "workspace-1" }, session.token);
  assert.equal(privacyResponse.statusCode, 200);
  assert.equal(privacyResponse.payload.ok, true);
  assert.equal(privacyResponse.payload.evidence.visibility, "restricted");

  const auditDbAfterPrivacy = await readDb();
  assert.ok((auditDbAfterPrivacy.sprAuditLogs || []).some((item) => item.type === "evidence.visibility_changed" && item.targetId === evidenceResponse.payload.evidence.id));

  const standardsResponse = await requestJson("/api/spr/standards", "POST", { softwareId: softwareResponse.payload.software.id, framework: "soc2", title: "SOC 2 Report", summary: "Annual attestation", uri: "https://example.com/soc2.pdf", strength: 0.85, freshnessDays: 30, verified: true }, session.token);
  assert.equal(standardsResponse.statusCode, 201);
  assert.equal(standardsResponse.payload.ok, true);
  assert.equal(standardsResponse.payload.evidence.type, "soc2");

  const identityResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/identity`, "POST", { domain: true, repo: true, certificate: true, details: "Verified via DNS and TLS certificate" }, session.token);
  assert.equal(identityResponse.statusCode, 201);
  assert.equal(identityResponse.payload.ok, true);
  assert.equal(identityResponse.payload.identity.domain, true);

  const bundleResponse = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/bundle`, "POST", { requestId: "bundle-001", encrypted: true, recipients: ["buyer-123"], selectiveDisclosure: true }, session.token);
  assert.equal(bundleResponse.statusCode, 200);
  assert.equal(bundleResponse.payload.ok, true);
  assert.equal(bundleResponse.payload.evidence.bundle.encrypted, true);
  assert.equal(bundleResponse.payload.evidence.bundle.requestId, "bundle-001");
  assert.ok(bundleResponse.payload.evidence.bundle.integrityHash);
  const bundleWorkspaceId = bundleResponse.payload.evidence.bundle.workspaceId || "default";
  const decrypted = decryptWorkspacePayload(bundleWorkspaceId, bundleResponse.payload.evidence.bundle);
  assert.ok(decrypted.includes("CycloneDX SBOM"));

  const zkpResponse = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/zkp`, "POST", { statement: "soc2", proof: "zkp-123", verified: true }, session.token);
  assert.equal(zkpResponse.statusCode, 200);
  assert.equal(zkpResponse.payload.ok, true);
  assert.equal(zkpResponse.payload.evidence.zkProof.verified, true);

  const procurementResponse = await requestJson("/api/spr/procurement/filter", "POST", { minTrustScore: 60, maxRisk: "Moderate" }, session.token);
  assert.equal(procurementResponse.statusCode, 200);
  assert.equal(procurementResponse.payload.ok, true);
  assert.ok(Array.isArray(procurementResponse.payload.software));

  const passportResponse = await requestJson("/api/spr/passports/issue", "POST", { softwareId: softwareResponse.payload.software.id, visibility: "public", issuedBy: user.name }, session.token);
  assert.equal(passportResponse.statusCode, 201);
  assert.equal(passportResponse.payload.ok, true);
  assert.equal(passportResponse.payload.passport.visibility, "public");
  assert.ok(passportResponse.payload.passport.trustScore >= 60);
  assert.equal(passportResponse.payload.passport.riskCategory, "Moderate");
  assert.equal(passportResponse.payload.passport.status, "Active");

  const renewedPassportResponse = await requestJson(`/api/spr/passports/${passportResponse.payload.passport.id}/renew`, "POST", { issuedBy: user.name }, session.token);
  assert.equal(renewedPassportResponse.statusCode, 200);
  assert.equal(renewedPassportResponse.payload.passport.status, "Active");

  const invalidRestrictedPassportResponse = await requestJson("/api/spr/passports/issue", "POST", { softwareId: softwareResponse.payload.software.id, visibility: "restricted", issuedBy: user.name }, session.token);
  assert.equal(invalidRestrictedPassportResponse.statusCode, 400);
  assert.equal(invalidRestrictedPassportResponse.payload.code, "VALIDATION_ERROR");

  const governmentScoreResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/score?profile=government`, "GET", null, session.token);
  assert.equal(governmentScoreResponse.statusCode, 200);
  assert.equal(governmentScoreResponse.payload.ok, true);
  assert.equal(governmentScoreResponse.payload.score.profile, "government");

  const mspScoreResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/score?profile=msp`, "GET", null, session.token);
  assert.equal(mspScoreResponse.statusCode, 200);
  assert.equal(mspScoreResponse.payload.ok, true);
  assert.equal(mspScoreResponse.payload.score.profile, "msp");

  const publicViewResponse = await requestJson(`/api/passports/${passportResponse.payload.passport.id}/public`, "GET", null, session.token);
  assert.equal(publicViewResponse.statusCode, 200);
  assert.equal(publicViewResponse.payload.passportId, passportResponse.payload.passport.id);

  const restrictedPassportResponse = await requestJson("/api/spr/passports/issue", "POST", { softwareId: softwareResponse.payload.software.id, visibility: "restricted", issuedBy: user.name, accessToken: `${vendorResponse.payload.vendor.id}:workspace-1:restricted`, vendorId: vendorResponse.payload.vendor.id, workspaceId: "workspace-1" }, session.token);
  assert.equal(restrictedPassportResponse.statusCode, 201);
  assert.equal(restrictedPassportResponse.payload.ok, true);
  assert.equal(restrictedPassportResponse.payload.passport.visibility, "restricted");

  const restrictedViewResponse = await requestJson(`/api/spr/passports/${restrictedPassportResponse.payload.passport.id}/restricted?accessToken=${vendorResponse.payload.vendor.id}:workspace-1:restricted`, "GET", null, session.token);
  assert.equal(restrictedViewResponse.statusCode, 200);
  assert.equal(restrictedViewResponse.payload.passportId, restrictedPassportResponse.payload.passport.id);

  const auditDbAfterRestrictedAccess = await readDb();
  assert.ok((auditDbAfterRestrictedAccess.sprAuditLogs || []).some((item) => item.type === "passport.access_granted" && item.targetId === restrictedPassportResponse.payload.passport.id));
  assert.ok((auditDbAfterRestrictedAccess.sprAuditLogs || []).every((item) => item.auditHash));
  assert.equal(verifyAuditChain(auditDbAfterRestrictedAccess.sprAuditLogs), true);

  const invalidScopedTokenResponse = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/privacy`, "POST", { visibility: "restricted", accessToken: "wrong-token", vendorId: vendorResponse.payload.vendor.id, workspaceId: "workspace-1" }, session.token);
  assert.equal(invalidScopedTokenResponse.statusCode, 403);

  const freshPassportResponse = await requestJson("/api/spr/passports/issue", "POST", { softwareId: softwareResponse.payload.software.id, visibility: "restricted", issuedBy: user.name, accessToken: `${vendorResponse.payload.vendor.id}:workspace-1:restricted` }, session.token);
  assert.equal(freshPassportResponse.statusCode, 201);
  assert.equal(freshPassportResponse.payload.passport.visibility, "restricted");
  assert.ok(freshPassportResponse.payload.passport.passportEnvelopeHash);
  assert.equal(verifyPassportEnvelope(freshPassportResponse.payload.passport), true);

  const staleEvidenceResponse = await requestJson("/api/spr/evidence", "POST", { softwareId: softwareResponse.payload.software.id, type: "sbom", title: "Stale evidence", summary: "Old evidence", freshnessDays: 250, verified: false, visibility: "restricted", accessToken: `${vendorResponse.payload.vendor.id}:workspace-1:restricted` }, session.token);
  assert.equal(staleEvidenceResponse.statusCode, 201);
  const staleRestrictedPassportResponse = await requestJson("/api/spr/passports/issue", "POST", { softwareId: softwareResponse.payload.software.id, visibility: "restricted", issuedBy: user.name, accessToken: `${vendorResponse.payload.vendor.id}:workspace-1:restricted`, workspaceId: "workspace-1" }, session.token);
  assert.equal(staleRestrictedPassportResponse.statusCode, 400);
  assert.equal(staleRestrictedPassportResponse.payload.code, "VALIDATION_ERROR");
  const duplicateBundleResponse = await requestJson(`/api/spr/evidence/${evidenceResponse.payload.evidence.id}/bundle`, "POST", { requestId: "bundle-001", encrypted: true, recipients: ["buyer-123"], selectiveDisclosure: true }, session.token);
  assert.equal(duplicateBundleResponse.statusCode, 409);
  assert.equal(duplicateBundleResponse.payload.code, "REPLAY_ERROR");

  const invalidSignalResponse = await requestJson(`/api/spr/software/${softwareResponse.payload.software.id}/signals`, "POST", { type: "cve", severity: "high", source: "nvd" }, session.token);
  assert.equal(invalidSignalResponse.statusCode, 400);
  assert.equal(invalidSignalResponse.payload.code, "VALIDATION_ERROR");

  const replayResponse = await requestJson(`/api/spr/audit/passport/${restrictedPassportResponse.payload.passport.id}/replay`, "GET", null, session.token);
  assert.equal(replayResponse.statusCode, 200);
  assert.ok(replayResponse.payload.ok);
  assert.ok(replayResponse.payload.events.length >= 1);

  const renewResponse = await requestJson(`/api/spr/passports/${passportResponse.payload.passport.id}/renew`, "POST", { issuedBy: user.name }, session.token);
  assert.equal(renewResponse.statusCode, 200);
  assert.equal(renewResponse.payload.ok, true);
  assert.equal(renewResponse.payload.passport.status, "Active");

  const versionResponse = await requestJson(`/api/spr/passports/${passportResponse.payload.passport.id}/version`, "POST", { summary: "Updated evidence" }, session.token);
  assert.equal(versionResponse.statusCode, 201);
  assert.equal(versionResponse.payload.ok, true);
  assert.equal(versionResponse.payload.passport.version, 2);

  const revokeResponse = await requestJson(`/api/spr/passports/${passportResponse.payload.passport.id}/revoke`, "POST", { reason: "Security incident" }, session.token);
  assert.equal(revokeResponse.statusCode, 200);
  assert.equal(revokeResponse.payload.ok, true);
  assert.equal(revokeResponse.payload.passport.revoked, true);

  const listResponse = await requestJson("/api/spr/passports", "GET", null, session.token);
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.payload.ok, true);
  assert.ok(listResponse.payload.passports.length >= 1);

  console.log("SPR MVP tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
