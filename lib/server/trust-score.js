import { createHash } from "node:crypto";

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

function normalizeProfile(profile) {
  const normalized = String(profile || "default").trim().toLowerCase();
  return ["default", "government", "msp"].includes(normalized) ? normalized : "default";
}

function normalizeWorkspaceId(value) {
  if (value == null) return null;
  const normalized = String(value || "").trim();
  return normalized === "" ? null : normalized;
}

function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.trunc(numeric);
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, toInteger(value, min)));
}

function clampFraction(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function normalizePassportVisibility(value) {
  const normalized = String(value || "public").trim().toLowerCase();
  return ["public", "private", "restricted"].includes(normalized) ? normalized : "public";
}

function normalizeEvidenceItem(item) {
  if (!item || typeof item !== "object") {
    throw new Error("Evidence items must be objects.");
  }
  const id = String(item.id || item.evidenceId || "").trim();
  if (!id) {
    throw new Error("Evidence item missing id.");
  }
  return {
    id,
    type: String(item.type || "generic").trim().toLowerCase() || "generic",
    freshnessDays: clampInteger(item.freshnessDays ?? item.ageDays ?? 0, 0, 365),
    verified: item.verified === true || String(item.verificationStatus || "").trim().toLowerCase() === "verified",
    visibility: normalizePassportVisibility(item.visibility),
    accessToken: String(item.accessToken || "").trim() || null,
    strength: clampFraction(item.strength ?? 0, 0, 1),
  };
}

function normalizeSoftware(software) {
  if (!software || typeof software !== "object") return { id: null, repositoryUrl: null, packageName: null };
  return {
    id: String(software.id || software.softwareId || "").trim() || null,
    repositoryUrl: String(software.repositoryUrl || software.repoUrl || "").trim() || null,
    packageName: String(software.packageName || software.name || "").trim() || null,
  };
}

function normalizeVendor(vendor) {
  if (!vendor || typeof vendor !== "object") return { id: null, complianceClaims: [] };
  const claims = Array.isArray(vendor.complianceClaims) ? vendor.complianceClaims.map((claim) => String(claim || "").trim()).filter(Boolean) : [];
  return {
    id: String(vendor.id || vendor.vendorId || "").trim() || null,
    complianceClaims: [...new Set(claims)].sort(),
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
  const normalized = clampInteger(freshnessDays, 0, 365);
  if (normalized <= 0) return 100;
  if (normalized >= 180) return 0;
  return Math.max(0, 100 - Math.floor((normalized * 100) / 180));
}

function calculateCompletenessScore(evidence) {
  const normalizedEvidence = Array.isArray(evidence) ? evidence : [];
  if (normalizedEvidence.length === 0) return 0;
  const hasSbom = normalizedEvidence.some((item) => String(item.type || "").toLowerCase() === "sbom");
  const hasSlsa = normalizedEvidence.some((item) => ["slsa", "slsa-provenance"].includes(String(item.type || "").toLowerCase()));
  const hasSigstore = normalizedEvidence.some(
    (item) => String(item.verificationMethod || "").toLowerCase() === "sigstore" || String(item.verificationStatus || "").toLowerCase() === "verified"
  );
  const hasStandards = normalizedEvidence.some((item) => ["soc2", "iso27001", "iso", "fedramp", "nist"].includes(String(item.type || "").toLowerCase()));
  const coveragePoints = (hasSbom ? 35 : 0) + (hasSlsa ? 20 : 0) + (hasSigstore ? 20 : 0) + (hasStandards ? 25 : 0);
  const coverage = Math.min(100, coveragePoints);
  const freshnessAverage = Math.floor(
    normalizedEvidence.reduce((sum, item) => sum + calculateFreshnessScore(item.freshnessDays), 0) / normalizedEvidence.length
  );
  return Math.floor((coverage + freshnessAverage) / 2);
}

export function normalizeInputs(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Trust score inputs must be an object.");
  }
  const software = normalizeSoftware(raw.software || raw.softwareInfo || {});
  const vendor = normalizeVendor(raw.vendor || {});
  const evidenceList = Array.isArray(raw.evidenceList) ? raw.evidenceList : [];
  const normalizedEvidence = evidenceList.map(normalizeEvidenceItem).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    software,
    vendor,
    evidenceList: normalizedEvidence,
    profile: normalizeProfile(raw.profile),
    workspaceId: normalizeWorkspaceId(raw.workspaceId),
  };
}

export function computeDeterministic(inputs = {}) {
  if (!inputs || typeof inputs !== "object") {
    throw new Error("Trust score inputs must be an object.");
  }
  const profile = normalizeProfile(inputs.profile);
  const weights = getProfileWeights(profile);
  const evidenceItems = Array.isArray(inputs.evidenceList) ? inputs.evidenceList : [];
  const vendorCompliance = inputs.vendor?.complianceClaims?.length ? weights.vendorCompliance : 0;
  const repository = inputs.software?.repositoryUrl ? weights.repository : 0;
  const evidenceCount = evidenceItems.length > 0 ? weights.evidence : 0;
  const verifiedEvidenceCount = evidenceItems.filter((item) => item.verified).length;
  const verifiedEvidence = verifiedEvidenceCount > 0 ? weights.verifiedEvidence : 0;
  const freshnessBonus = evidenceItems.some((item) => clampInteger(item.freshnessDays, 0, 365) <= 30) ? weights.freshness : 0;
  const countBonus = evidenceItems.length >= 2 ? weights.evidenceCount : 0;
  const hasSbom = evidenceItems.some((item) => String(item.type || "").toLowerCase() === "sbom");
  const hasSlsa = evidenceItems.some((item) => ["slsa", "slsa-provenance"].includes(String(item.type || "").toLowerCase()));
  const hasSigstore = evidenceItems.some(
    (item) => String(item.verificationMethod || "").toLowerCase() === "sigstore" || String(item.verificationStatus || "").toLowerCase() === "verified"
  );
  const hasStandards = evidenceItems.some((item) => ["soc2", "iso27001", "iso", "fedramp", "nist"].includes(String(item.type || "").toLowerCase()));
  const sbomBonus = hasSbom ? weights.sbom : 0;
  const slsaBonus = hasSlsa ? weights.slsa : 0;
  const sigstoreBonus = hasSigstore ? weights.sigstore : 0;
  const standardsBonus = hasStandards ? weights.standards : 0;
  const completenessScore = calculateCompletenessScore(evidenceItems);
  const completenessBonus = Math.floor((completenessScore * weights.completeness) / 100);
  const baseScore =
    22 +
    vendorCompliance +
    repository +
    evidenceCount +
    verifiedEvidence +
    freshnessBonus +
    countBonus +
    sbomBonus +
    slsaBonus +
    sigstoreBonus +
    standardsBonus +
    completenessBonus;
  const trustScore = Math.max(0, Math.min(100, baseScore));
  const confidenceScore = Math.max(
    0,
    Math.min(
      100,
      55 + evidenceItems.length * 8 + verifiedEvidenceCount * 6 + Math.floor((completenessScore * 12) / 100)
    )
  );
  let verdict = "REVIEW";
  let riskCategory = "High";
  if (trustScore >= 75) {
    verdict = "TRUSTED";
    riskCategory = "Low";
  } else if (trustScore >= 55) {
    verdict = "CONDITIONALLY TRUSTED";
    riskCategory = "Moderate";
  }
  return {
    trustScore,
    confidenceScore,
    verdict,
    riskCategory,
    profile,
  };
}

export function hashOutput({ scoreResult, workspaceId = null, passportEnvelopeHash = null } = {}) {
  if (!scoreResult || typeof scoreResult !== "object") {
    throw new Error("Score result is required.");
  }
  const normalizedScore = {
    trustScore: clampInteger(scoreResult.trustScore, 0, 100),
    confidenceScore: clampInteger(scoreResult.confidenceScore, 0, 100),
    verdict: String(scoreResult.verdict || "REVIEW").trim(),
    riskCategory: String(scoreResult.riskCategory || "High").trim(),
    profile: normalizeProfile(scoreResult.profile),
  };
  return hashObject({
    score: normalizedScore,
    workspaceId: normalizeWorkspaceId(workspaceId),
    passportEnvelopeHash: String(passportEnvelopeHash || null),
  });
}

export const trustScore = {
  normalizeInputs,
  computeDeterministic,
  hashOutput,
};
