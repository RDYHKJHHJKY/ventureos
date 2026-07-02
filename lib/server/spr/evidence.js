import { createHash } from "node:crypto";
import { evidencePipeline } from "../evidence-pipeline.js";
import { normalizePassportVisibility, normalizeWorkspaceId } from "./passport-envelope.js";

export function normalizeEvidenceItem(item = {}, context = {}) {
  const normalized = evidencePipeline.normalize(item, { workspaceId: item?.workspaceId || context.workspaceId || null, kind: "evidence" });
  return {
    id: String(normalized.id || "").trim() || null,
    softwareId: String(normalized.softwareId || "").trim() || null,
    type: String(normalized.type || "generic").trim().toLowerCase() || "generic",
    freshnessDays: Number(normalized.freshnessDays || 0),
    verified: normalized.verified === 1 || String(normalized.verificationStatus || "").trim().toLowerCase() === "verified",
    visibility: normalizePassportVisibility(normalized.visibility || "public"),
    accessToken: String(normalized.accessToken || "").trim() || null,
    workspaceId: normalizeWorkspaceId(normalized.workspaceId),
    title: String(normalized.title || "").trim(),
    source: String(normalized.source || "").trim(),
    summary: String(normalized.summary || "").trim(),
    payload: normalized.payload,
    numericSignals: normalized.numericSignals || {},
  };
}

export function normalizeEvidenceList(evidenceList = [], context = {}) {
  return Array.isArray(evidenceList)
    ? evidenceList.map((item) => normalizeEvidenceItem(item, context)).filter((item) => item && item.id)
    : [];
}

export function bindEvidence({ software, vendor, evidenceList = [], visibility = "public", accessToken = null, workspaceId = null, projectId = null, scoringProfile = "default", issuedBy = "system" } = {}) {
  const normalizedEvidence = normalizeEvidenceList(evidenceList, { workspaceId });
  const sortedEvidence = normalizedEvidence.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const evidenceIds = sortedEvidence.map((item) => item.id);
  const profile = String(scoringProfile || "default").trim().toLowerCase();
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
