import { createHash } from "node:crypto";
import {
  hashObject,
  normalizeProfile,
  normalizeWorkspaceId,
  normalizePassportVisibility,
  clampInteger,
  clampFraction,
  getProfileWeights,
  calculateCompletenessScore,
} from "./spr/shared.js";

function normalizeAdaptiveSignals(raw = {}) {
  if (!raw || typeof raw !== "object") return {
    historicalAccuracy: 0.5,
    feedbackScore: 0.5,
    correctionCount: 0,
    anomalyCount: 0,
    reviewCount: 0,
  };
  const historicalAccuracy = clampFraction(raw.historicalAccuracy ?? raw.historyScore ?? 0.5, 0, 1);
  const feedbackScore = clampFraction(raw.feedbackScore ?? raw.feedback ?? 0.5, 0, 1);
  const correctionCount = clampInteger(raw.correctionCount ?? raw.corrections ?? 0, 0, 20);
  const anomalyCount = clampInteger(raw.anomalyCount ?? raw.anomalies ?? 0, 0, 20);
  const reviewCount = clampInteger(raw.reviewCount ?? raw.reviews ?? 0, 0, 20);
  return { historicalAccuracy, feedbackScore, correctionCount, anomalyCount, reviewCount };
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
    adaptiveSignals: normalizeAdaptiveSignals(raw.adaptiveSignals || raw.learningSignals),
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
  const adaptiveSignals = inputs.adaptiveSignals || {};
  const historicalAccuracy = Number(adaptiveSignals.historicalAccuracy ?? 0.5);
  const feedbackScore = Number(adaptiveSignals.feedbackScore ?? 0.5);
  const correctionCount = Number(adaptiveSignals.correctionCount ?? 0);
  const anomalyCount = Number(adaptiveSignals.anomalyCount ?? 0);
  const reviewCount = Number(adaptiveSignals.reviewCount ?? 0);
  const accuracyLift = (historicalAccuracy - 0.5) * 8;
  const feedbackLift = (feedbackScore - 0.5) * 6;
  const correctionPenalty = Math.min(8, correctionCount * 1.2);
  const anomalyPenalty = Math.min(10, anomalyCount * 2.2);
  const reviewPenalty = Math.min(6, reviewCount * 1.1);
  const adaptiveAdjustment = accuracyLift + feedbackLift - correctionPenalty - anomalyPenalty - reviewPenalty;
  const trustScore = Math.max(0, Math.min(100, baseScore + adaptiveAdjustment));
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
 
