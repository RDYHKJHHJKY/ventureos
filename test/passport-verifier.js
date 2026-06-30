import assert from "node:assert/strict";
import { bindEvidence, createPassportEnvelopeHash } from "../lib/server/passport-assembler.js";
import { trustScore } from "../lib/server/trust-score.js";
import { passportVerifier } from "../lib/server/passport-verifier.js";

function makeEvidence(id, bundle = null) {
  return {
    id,
    softwareId: "software-1",
    type: "sbom",
    freshnessDays: 7,
    verified: true,
    visibility: "public",
    accessToken: null,
    title: "SBOM",
    source: "pipeline",
    bundle,
  };
}

function makeSoftware() {
  return {
    id: "software-1",
    repositoryUrl: "https://github.com/example/repo",
    packageName: "example-package",
    vendorId: "vendor-1",
  };
}

function makeVendor() {
  return {
    id: "vendor-1",
    complianceClaims: ["SOC2", "ISO27001"],
  };
}

function makePassportRecord({ workspaceId = "workspace-1", scoringProfile = "default", visibility = "public", evidenceList = [] } = {}) {
  const software = makeSoftware();
  const vendor = makeVendor();
  const { bound, normalizedEvidence } = bindEvidence({
    software,
    vendor,
    evidenceList,
    visibility,
    workspaceId,
    scoringProfile,
    issuedBy: "system",
  });
  const normalizedInputs = trustScore.normalizeInputs({
    software,
    vendor,
    evidenceList: normalizedEvidence,
    profile: bound.scoringProfile,
    workspaceId: bound.workspaceId,
  });
  const computed = trustScore.computeDeterministic(normalizedInputs);
  const record = {
    id: "sprpassport:test-passport",
    softwareId: bound.softwareId,
    vendorId: bound.vendorId,
    softwareName: bound.softwareName,
    vendorName: bound.vendorName,
    visibility: bound.visibility,
    accessToken: bound.accessToken,
    workspaceId: bound.workspaceId,
    scoringProfile: bound.scoringProfile,
    evidenceIds: bound.evidenceIds,
    trustGraphHash: bound.trustGraphHash,
    evidenceFreshnessHash: bound.evidenceFreshnessHash,
    evidenceBundleHash: passportVerifier.createEvidenceBundleHash(normalizedEvidence),
    evidenceSummary: bound.evidenceSummary,
    passportEnvelopeVersion: 1,
    trustScore: computed.trustScore,
    confidenceScore: computed.confidenceScore,
    verdict: computed.verdict,
    riskCategory: computed.riskCategory,
    profile: computed.profile,
    status: bound.visibility === "public" ? "Active" : bound.visibility === "restricted" ? "Restricted" : "Draft",
    issuedAt: new Date().toISOString().slice(0, 10),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    issuedBy: bound.issuedBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  record.passportEnvelopeHash = createPassportEnvelopeHash(record);
  record.trustScoreHash = trustScore.hashOutput({
    scoreResult: computed,
    workspaceId: record.workspaceId,
    passportEnvelopeHash: record.passportEnvelopeHash,
  });
  return { record, db: { sprSoftware: [software], sprVendors: [vendor], sprEvidence: normalizedEvidence } };
}

function main() {
  const evidenceBundle = {
    integrityHash: "sha256:testhash",
    workspaceId: "workspace-1",
    requestId: "bundle-1",
    encrypted: false,
    selectiveDisclosure: false,
    recipients: [],
  };
  const evidence = makeEvidence("e1", evidenceBundle);
  const { record: passport, db } = makePassportRecord({ evidenceList: [evidence] });

  const valid = passportVerifier.verifyPassport(passport, db, "workspace-1");
  assert.equal(valid.ok, true, "Valid passport should pass verification.");

  const modifiedEvidenceDb = { ...db, sprEvidence: [{ ...evidence, freshnessDays: 30 }] };
  const evidenceTampered = passportVerifier.verifyPassport(passport, modifiedEvidenceDb, "workspace-1");
  assert.equal(evidenceTampered.ok, false, "Modified evidence should fail verification.");
  assert.equal(evidenceTampered.integrity?.evidenceOk ?? false, false, "Evidence integrity check should fail when evidence changes.");

  const modifiedScorePassport = { ...passport, trustScore: passport.trustScore + 1 };
  const scoreTampered = passportVerifier.verifyPassport(modifiedScorePassport, db, "workspace-1");
  assert.equal(scoreTampered.ok, false, "Modified score should fail verification.");
  assert.equal(scoreTampered.score?.ok ?? false, false, "Score recomputation should detect tampered score.");

  const modifiedEnvelopePassport = { ...passport, evidenceIds: [...passport.evidenceIds, "missing"] };
  const envelopeTampered = passportVerifier.verifyPassport(modifiedEnvelopePassport, db, "workspace-1");
  assert.equal(envelopeTampered.ok, false, "Modified envelope should fail verification.");
  assert.equal(envelopeTampered.integrity?.envelopeOk ?? false, false, "Envelope integrity check should fail when envelope data changes.");

  const wrongWorkspace = passportVerifier.verifyPassport(passport, db, "workspace-2");
  assert.equal(wrongWorkspace.ok, false, "Cross-workspace verification should fail.");
  assert.equal(wrongWorkspace.workspaceOk, false, "Workspace scope mismatch should be detected.");

  console.log("Passport verifier tests passed.");
}

main();
