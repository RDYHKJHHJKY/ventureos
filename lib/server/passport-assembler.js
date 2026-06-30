import { createHash } from "node:crypto";
import { evidencePipeline } from "./evidence-pipeline.js";
import { trustScore } from "./trust-score.js";

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hashObject(value) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

export function normalizePassportVisibility(value) {
  const normalized = String(value || "public").trim().toLowerCase();
  return ["public", "private", "restricted"].includes(normalized) ? normalized : "public";
}

function normalizeProfile(value) {
  const normalized = String(value || "default").trim().toLowerCase();
  return ["default", "government", "msp"].includes(normalized) ? normalized : "default";
}

function normalizeWorkspaceId(value) {
  if (value == null) return null;
  const normalized = String(value || "").trim();
  return normalized === "" ? null : normalized;
}

function normalizeEvidenceItem(item) {
  const normalized = evidencePipeline.normalize(item, { workspaceId: item?.workspaceId || null, kind: "evidence" });
  return {
    id: String(normalized.id || "").trim() || null,
    softwareId: String(normalized.softwareId || "").trim() || null,
    type: String(normalized.type || "generic").trim().toLowerCase() || "generic",
    freshnessDays: Number(normalized.freshnessDays || 0),
    verified:
      normalized.verified === true || String(normalized.verificationStatus || "").trim().toLowerCase() === "verified",
    visibility: normalizePassportVisibility(normalized.visibility || "public"),
    accessToken: String(normalized.accessToken || "").trim() || null,
    workspaceId: normalizeWorkspaceId(normalized.workspaceId),
    title: String(normalized.title || "").trim(),
    source: String(normalized.source || "").trim(),
  };
}

function getProfileWeights(profile = "default") {
  const normalized = normalizeProfile(profile);
  if (normalized === "government") {
    return { vendorCompliance: 7, repository: 4, evidence: 5, verifiedEvidence: 5, freshness: 3, evidenceCount: 3, sbom: 7, slsa: 7, sigstore: 6, standards: 6, completeness: 16 };
  }
  if (normalized === "msp") {
    return { vendorCompliance: 5, repository: 3, evidence: 4, verifiedEvidence: 4, freshness: 2, evidenceCount: 2, sbom: 5, slsa: 4, sigstore: 4, standards: 5, completeness: 14 };
  }
  return { vendorCompliance: 5, repository: 3, evidence: 4, verifiedEvidence: 3, freshness: 2, evidenceCount: 2, sbom: 5, slsa: 4, sigstore: 4, standards: 4, completeness: 15 };
}

function calculateFreshnessScore(freshnessDays) {
  const days = Number(freshnessDays || 0);
  if (days <= 0) return 100;
  if (days >= 180) return 0;
  return Math.max(0, 100 - Math.floor((days / 180) * 100));
}

function calculateCompletenessScore(evidence) {
  const normalized = Array.isArray(evidence) ? evidence : [];
  if (normalized.length === 0) return 0;
  const hasSbom = normalized.some((item) => String(item.type || "").toLowerCase() === "sbom");
  const hasSlsa = normalized.some((item) => ["slsa", "slsa-provenance"].includes(String(item.type || "").toLowerCase()));
  const hasSigstore = normalized.some(
    (item) => String(item.verificationMethod || "").toLowerCase() === "sigstore" || String(item.verificationStatus || "").toLowerCase() === "verified"
  );
  const hasStandards = normalized.some((item) => ["soc2", "iso27001", "iso", "fedramp", "nist"].includes(String(item.type || "").toLowerCase()));
  const coveragePoints = (hasSbom ? 35 : 0) + (hasSlsa ? 20 : 0) + (hasSigstore ? 20 : 0) + (hasStandards ? 25 : 0);
  const coverage = Math.min(100, coveragePoints);
  const freshnessScore = normalized.reduce((sum, item) => sum + calculateFreshnessScore(Number(item.freshnessDays || 0)), 0) / normalized.length;
  return Math.floor((coverage + freshnessScore) / 2);
}

export function bindEvidence({ software, vendor, evidenceList = [], visibility = "public", accessToken = null, workspaceId = null, projectId = null, scoringProfile = "default", issuedBy = "system" } = {}) {
  const normalizedEvidence = Array.isArray(evidenceList)
    ? evidenceList.map(normalizeEvidenceItem).filter((item) => item && item.id)
    : [];
  const sortedEvidence = normalizedEvidence.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const evidenceIds = sortedEvidence.map((item) => item.id);
  const profile = normalizeProfile(scoringProfile);
  const normalizedVisibility = normalizePassportVisibility(visibility);
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

  if (normalizedVisibility === "restricted" && !accessToken) {
    throw new Error("Restricted passports require an access token.");
  }

  const trustGraphHash = hashObject({
    software: { id: software?.id || null, repositoryUrl: software?.repositoryUrl || null, packageName: software?.packageName || null },
    vendor: { id: vendor?.id || null, complianceClaims: Array.isArray(vendor?.complianceClaims) ? [...vendor.complianceClaims].sort() : [] },
    evidenceTypes: [...new Set(sortedEvidence.map((item) => item.type || ""))].sort(),
    evidenceIds,
  });

  const evidenceFreshnessHash = hashObject({
    evidence: sortedEvidence.map((item) => ({ id: item.id, freshnessDays: Number(item.freshnessDays || 0), verified: Boolean(item.verified), workspaceId: item.workspaceId || null })),
  });

  return {
    bound: {
      softwareId: String(software?.id || "").trim() || null,
      vendorId: String(software?.vendorId || vendor?.id || "").trim() || null,
      softwareName: String(software?.name || software?.softwareName || "").trim() || null,
      vendorName: String(vendor?.name || "").trim() || null,
      evidenceIds,
      visibility: normalizedVisibility,
      accessToken: normalizedVisibility === "restricted" ? String(accessToken || "").trim() || null : null,
      workspaceId: normalizedWorkspaceId,
      projectId: String(projectId || "").trim() || null,
      scoringProfile: profile,
      trustGraphHash,
      evidenceFreshnessHash,
      evidenceSummary: evidenceIds.length > 0 ? `${evidenceIds.length} evidence item(s) reviewed.` : "No evidence submitted yet.",
      issuedBy: String(issuedBy || "system").trim(),
    },
    normalizedEvidence: sortedEvidence,
  };
}

export function computeSprPassportScore(software, evidence = [], vendor, profile = "default") {
  const normalizedInputs = trustScore.normalizeInputs({
    software,
    vendor,
    evidenceList: evidence,
    profile,
  });
  return trustScore.computeDeterministic(normalizedInputs);
}

export function createPassportEnvelopeHash(passport = {}) {
  const envelope = {
    identity: passport.softwareId || null,
    evidenceIds: Array.isArray(passport.evidenceIds) ? passport.evidenceIds.slice().sort() : [],
    visibility: passport.visibility || null,
    scoringProfile: passport.scoringProfile || null,
    issuedAt: passport.issuedAt || null,
    passportEnvelopeVersion: Number(passport.passportEnvelopeVersion || 1),
    trustGraphHash: passport.trustGraphHash || null,
    evidenceFreshnessHash: passport.evidenceFreshnessHash || null,
    evidenceSummary: passport.evidenceSummary || null,
  };
  return hashObject({ type: "passport.envelope", passportId: String(passport.id || "").trim() || null, envelope });
}

export function signPassportEnvelope(passport = {}) {
  return createPassportEnvelopeHash(passport);
}

export function verifyPassportEnvelope(passport = {}) {
  return createPassportEnvelopeHash(passport) === passport.passportEnvelopeHash;
}
