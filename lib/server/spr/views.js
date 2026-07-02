import { normalizePassportVisibility } from "./passport-envelope.js";

export function buildPassportView(passport = {}, ctx = {}) {
  const visibility = normalizePassportVisibility(passport.visibility);
  const isRestricted = visibility === "restricted";
  const isPrivate = visibility === "private";
  const result = {
    passportId: passport.id,
    version: passport.version || 1,
    softwareId: passport.softwareId || passport.assetId || null,
    vendorId: passport.vendorId || null,
    softwareName: passport.softwareName || passport.assetName || null,
    vendorName: passport.vendorName || passport.company || null,
    trustScore: passport.trustScore || 0,
    confidenceScore: passport.confidenceScore || 0,
    verdict: passport.verdict || "REVIEW",
    status: passport.status || "active",
    visibility,
    evidenceSummary: passport.evidenceSummary || null,
    issuedAt: passport.issuedAt,
    expiresAt: passport.expiresAt || null,
    revoked: Boolean(passport.revoked),
    revokedAt: passport.revokedAt || null,
  };

  if (!isRestricted && !isPrivate) {
    result.evidenceIds = Array.isArray(passport.evidenceIds) ? passport.evidenceIds.slice() : [];
    result.trustGraphHash = passport.trustGraphHash || null;
    result.evidenceFreshnessHash = passport.evidenceFreshnessHash || null;
    result.passportEnvelopeHash = passport.passportEnvelopeHash || null;
    result.trustScoreHash = passport.trustScoreHash || null;
  }

  if (isRestricted) {
    result.accessToken = ctx?.accessToken || null;
  }

  return result;
}

export function buildWorkspacePassportView(passport = {}, workspaceId = null, ctx = {}) {
  if (workspaceId && workspaceId !== passport.workspaceId) {
    throw new Error("Passport does not belong to the requested workspace.");
  }
  return buildPassportView(passport, ctx);
}
