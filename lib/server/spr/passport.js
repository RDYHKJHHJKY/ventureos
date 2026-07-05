import { createId } from "../data-store.js";
import { createPassportEnvelopeHash, normalizePassportVisibility } from "./passport-envelope.js";
import { bindEvidence } from "./evidence.js";
import { trustScore } from "../trust-score.js";
import { passportVerifier } from "../passport-verifier.js";
import { restrictedTokens } from "../restricted-tokens.js";
import { freshness, DEFAULT_RESTRICTED_EVIDENCE_TTL_DAYS } from "../freshness.js";

export function buildPassportRecord({ software = {}, vendor = {}, evidenceList = [], payload = {}, ctx = {}, now = new Date() } = {}) {
  const visibility = normalizePassportVisibility(String(payload.visibility || "public").trim().toLowerCase());
  const scoringProfile = String(payload.profile || "default").trim().toLowerCase() || "default";
  const accessToken = String(payload.accessToken || "").trim() || null;
  const workspaceId = String(payload.workspaceId || "").trim() || null;

  const { bound, normalizedEvidence } = bindEvidence({
    software,
    vendor,
    evidenceList,
    visibility,
    accessToken,
    workspaceId,
    scoringProfile,
    issuedBy: String(payload.issuedBy || ctx.user?.name || "system").trim(),
  });

  const adaptiveSignals = payload.adaptiveSignals || payload.learningSignals || null;
  const normalizedInputs = trustScore.normalizeInputs({
    software,
    vendor,
    evidenceList: normalizedEvidence,
    profile: scoringProfile,
    workspaceId: bound.workspaceId,
    adaptiveSignals,
  });

  const deterministic = trustScore.computeDeterministic(normalizedInputs);
  const nowIso = now.toISOString();

  const record = {
    id: createId("sprpassport", bound.softwareId),
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
    trustScore: deterministic.trustScore,
    confidenceScore: deterministic.confidenceScore,
    adaptiveSignals,
    verdict: deterministic.verdict,
    riskCategory: deterministic.riskCategory,
    status:
      String(payload.status || "").trim() ||
      (bound.visibility === "public" ? "Active" : bound.visibility === "restricted" ? "Restricted" : "Draft"),
    issuedAt: nowIso.slice(0, 10),
    expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    issuedBy: bound.issuedBy,
    createdAt: nowIso,
    updatedAt: nowIso,
    version: Number(payload.version || 1),
    summary: String(payload.summary || "").trim() || null,
  };

  record.passportEnvelopeHash = createPassportEnvelopeHash(record);
  record.trustScoreHash = trustScore.hashOutput({
    scoreResult: deterministic,
    workspaceId: bound.workspaceId,
    passportEnvelopeHash: record.passportEnvelopeHash,
  });

  return { record, deterministic, normalizedEvidence, bound };
}

export function buildPassportIssueRecord({ db, software = {}, vendor = {}, evidenceList = [], payload = {}, ctx = {}, now = new Date() } = {}) {
  if (!software || !software.id) {
    throw Object.assign(new Error("Software not found."), { statusCode: 404, code: "NOT_FOUND" });
  }

  const parsedToken = parseScopedAccessToken(String(payload.accessToken || "").trim() || null);
  const workspaceId = String(payload.workspaceId || "").trim() || null;
  const normalizedVendorId = String(payload.vendorId || software.vendorId || "").trim() || null;
  const accessToken = String(payload.accessToken || "").trim() || null;
  const visibility = normalizePassportVisibility(String(payload.visibility || "public").trim().toLowerCase());

  if (visibility === "restricted" && !accessToken) {
    throw Object.assign(new Error("Restricted passports require an access token."), { statusCode: 400, code: "VALIDATION_ERROR" });
  }
  if (visibility === "restricted" && !workspaceId) {
    throw Object.assign(new Error("Workspace ID is required for restricted passports."), { statusCode: 400, code: "VALIDATION_ERROR" });
  }
  if (visibility === "restricted" && parsedToken.workspaceId && workspaceId && parsedToken.workspaceId !== workspaceId) {
    throw Object.assign(new Error("Workspace ID mismatch between token and payload."), { statusCode: 400, code: "VALIDATION_ERROR" });
  }
  if (visibility === "restricted" && parsedToken.vendorId && normalizedVendorId && parsedToken.vendorId !== normalizedVendorId) {
    throw Object.assign(new Error("Restricted passport token scope is invalid for this vendor."), { statusCode: 403, code: "FORBIDDEN" });
  }
  if (visibility === "restricted") {
    try {
      restrictedTokens.verify(db, accessToken, { workspaceId, evidenceType: "passport" });
    } catch (err) {
      throw Object.assign(new Error(err.message), { statusCode: err.statusCode || 400, code: err.code || "VALIDATION_ERROR" });
    }
  }

  const freshnessViolations = evidenceList.filter((item) => {
    if (item?.type === "github") return false;
    try {
      const r = freshness.enforceEvidenceTTL(item, { maxAgeDays: DEFAULT_RESTRICTED_EVIDENCE_TTL_DAYS });
      return !r.ok;
    } catch (e) {
      return true;
    }
  });

  if (visibility === "restricted" && freshnessViolations.length > 0) {
    throw Object.assign(new Error("Restricted passports require fresh evidence."), { statusCode: 400, code: "VALIDATION_ERROR" });
  }

  const { record: passportRecord } = buildPassportRecord({
    software,
    vendor,
    evidenceList,
    payload,
    ctx,
    now,
  });

  return passportRecord;
}

export function issuePassport({ db, software = {}, vendor = {}, evidenceList = [], payload = {}, ctx = {}, now = new Date() } = {}) {
  return buildPassportIssueRecord({ db, software, vendor, evidenceList, payload, ctx, now });
}

export function validateRestrictedPassportAccess(db = {}, passportId, accessToken = "") {
  const passport = findPassportById(db, passportId);
  if (!passport) {
    const error = new Error("Passport not found.");
    error.statusCode = 404;
    error.code = "NOT_FOUND";
    throw error;
  }
  if (!isRestrictedPassportTokenValid(passport, accessToken)) {
    const error = new Error("Restricted passport access denied.");
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
  return passport;
}

export function parseScopedAccessToken(token) {
  const normalized = String(token || "").trim();
  if (!normalized) {
    return { token: null, vendorId: null, workspaceId: null, visibility: null };
  }
  const [vendorId, workspaceId, visibility] = normalized.split(":");
  return {
    token: normalized,
    vendorId: String(vendorId || "").trim() || null,
    workspaceId: String(workspaceId || "").trim() || null,
    visibility: String(visibility || "").trim() || null,
  };
}

export function isRestrictedPassportTokenValid(passport = {}, accessToken = "") {
  const token = String(accessToken || "").trim();
  if (!token || passport.visibility !== "restricted") return false;
  const parsedToken = parseScopedAccessToken(token, passport.vendorId, passport.workspaceId);
  const expectedToken = [parsedToken.vendorId || passport.vendorId, parsedToken.workspaceId || passport.workspaceId, passport.visibility]
    .filter(Boolean)
    .join(":") || null;
  return token === expectedToken;
}

export function renewPassport(passport = {}, issuedBy = "system") {
  passport.status = "Active";
  passport.revoked = false;
  passport.revokedAt = null;
  passport.issuedBy = String(issuedBy || passport.issuedBy || "system").trim();
  passport.updatedAt = new Date().toISOString();
  passport.expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return passport;
}

export function renewPassportById(db = {}, passportId, issuedBy = "system") {
  const passport = findPassportById(db, passportId);
  if (!passport) {
    const error = new Error("Passport not found.");
    error.statusCode = 404;
    error.code = "NOT_FOUND";
    throw error;
  }
  return renewPassport(passport, issuedBy);
}

export function versionPassport(passport = {}, summary = "Version updated") {
  passport.version = Number(passport.version || 1) + 1;
  passport.summary = String(summary || "Version updated").trim();
  passport.updatedAt = new Date().toISOString();
  return passport;
}

export function versionPassportById(db = {}, passportId, summary = "Version updated") {
  const passport = findPassportById(db, passportId);
  if (!passport) {
    const error = new Error("Passport not found.");
    error.statusCode = 404;
    error.code = "NOT_FOUND";
    throw error;
  }
  return versionPassport(passport, summary);
}

export function revokePassport(passport = {}, reason = "No reason provided") {
  passport.revoked = true;
  passport.revokedAt = new Date().toISOString();
  passport.status = "Revoked";
  passport.reason = String(reason || "No reason provided").trim();
  passport.updatedAt = new Date().toISOString();
  return passport;
}

export function revokePassportById(db = {}, passportId, reason = "No reason provided") {
  const passport = findPassportById(db, passportId);
  if (!passport) {
    const error = new Error("Passport not found.");
    error.statusCode = 404;
    error.code = "NOT_FOUND";
    throw error;
  }
  return revokePassport(passport, reason);
}

export function findPassportById(db = {}, passportId) {
  return (db.sprPassports || []).find((item) => item.id === passportId) || null;
}

export function listLatestPassports(db = {}) {
  const map = new Map();
  for (const passport of db.sprPassports || []) {
    const key = passport.softwareId || passport.id;
    if (!map.has(key) || String(passport.createdAt || "") >= String(map.get(key).createdAt || "")) {
      map.set(key, passport);
    }
  }
  return Array.from(map.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function mapPassportBadgeStatus(passport) {
  const now = new Date();
  const expired = passport.expiresAt && new Date(passport.expiresAt) < now;
  if (passport.revoked) return "revoked";
  if (expired) return "expired";
  if (passport.trustScore >= 75) return "verified";
  if (passport.trustScore >= 60) return "conditional";
  return "review";
}

function getLegacyPassportById(db = {}, passportId) {
  return db.passports?.find((item) => item.id === passportId) || null;
}

export function getPassportResponseForRequest(db = {}, passportId, ctx = {}) {
  const passport = getLegacyPassportById(db, passportId) || findPassportById(db, passportId);
  if (!passport) return { error: "NOT_FOUND", message: "Passport not found." };
  if (passport.softwareId && (passport.visibility === "restricted" || passport.visibility === "private")) {
    return { error: "FORBIDDEN", message: "Restricted passport access denied." };
  }
  return { passport };
}

export function buildPublicPassportResponse(passport = {}, db = {}) {
  const versions = [...(db.passports || []), ...(db.sprPassports || [])]
    .filter((item) => String(item.assetId || item.softwareId || "") === String(passport.assetId || passport.softwareId || "") && (item.isPublic || item.revoked || item.visibility === "public" || item.visibility === "restricted"))
    .sort((a, b) => (b.version || 0) - (a.version || 0) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .map((item) => ({
      passportId: item.id,
      version: item.version,
      status: item.status,
      verdict: item.verdict,
      issuedAt: item.issuedAt,
      revoked: item.revoked,
      revokedAt: item.revokedAt || null,
      publicUrl: item.publicUrl || `/passport/${item.id}`,
    }));

  const publicUrl = passport.publicUrl || (passport.assetId || passport.softwareId ? `/passport/${passport.id}` : null);

  return {
    passportId: passport.id,
    assetId: passport.assetId || passport.softwareId || null,
    assetName: passport.assetName || passport.softwareName || null,
    company: passport.company || passport.vendorName || null,
    trustScore: passport.trustScore || 0,
    confidenceScore: passport.confidenceScore || 0,
    verdict: passport.verdict,
    version: passport.version || 1,
    issuedAt: passport.issuedAt,
    revoked: Boolean(passport.revoked),
    revokedAt: passport.revokedAt || null,
    evidenceSummary: passport.evidenceSummary || null,
    visibility: passport.visibility || (passport.isPublic ? "public" : "private"),
    status: passport.status,
    badgeStatus: {
      status: mapPassportBadgeStatus(passport),
      score: passport.trustScore || 0,
      verdict: passport.verdict,
      lastUpdated: passport.revoked ? passport.revokedAt || passport.updatedAt || passport.issuedAt : passport.updatedAt || passport.issuedAt,
      publicUrl: passport.publicUrl,
    },
    publicUrl,
    versions,
  };
}
