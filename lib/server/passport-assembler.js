import { evidencePipeline } from "./evidence-pipeline.js";
import { trustScore } from "./trust-score.js";
import {
  hashObject,
  normalizeProfile,
  normalizeWorkspaceId,
  normalizePassportVisibility,
  createPassportEnvelopeHash,
  signPassportEnvelope,
  verifyPassportEnvelope,
} from "./spr/shared.js";

// Re-export helpers used by other modules/tests
export { createPassportEnvelopeHash, signPassportEnvelope, verifyPassportEnvelope, normalizePassportVisibility };

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

export function computeSprPassportScore(software, evidence = [], vendor, profile = "default", adaptiveSignals = null) {
  const normalizedInputs = trustScore.normalizeInputs({
    software,
    vendor,
    evidenceList: evidence,
    profile,
    adaptiveSignals,
  });
  return trustScore.computeDeterministic(normalizedInputs);
}
// module ends here
