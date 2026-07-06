import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Canonical helpers for the SPR trust-scoring and passport-envelope system.
 *
 * These were previously copy-pasted (with small, silent drift) across
 * trust-score.js, passport-assembler.js, passport-verifier.js, and
 * passport-envelope.js. Anything that participates in hash computation
 * or score computation MUST live here and only here — duplicating it
 * risks two call sites silently disagreeing about what a "valid" hash
 * or score looks like, which defeats the point of an integrity check.
 */

// ---------------------------------------------------------------------------
// Stable hashing
// ---------------------------------------------------------------------------

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function hashObject(value) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Constant-time secret comparison
// ---------------------------------------------------------------------------

/**
 * Safe replacement for `a === b` when comparing bearer tokens/secrets.
 * Length is compared first (timingSafeEqual throws on mismatched length),
 * which leaks only the length, not the content — standard practice for
 * this kind of comparison.
 */
export function safeCompare(a, b) {
  const bufA = Buffer.from(String(a ?? ""), "utf8");
  const bufB = Buffer.from(String(b ?? ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeProfile(value) {
  const normalized = String(value || "default").trim().toLowerCase();
  return ["default", "government", "msp"].includes(normalized) ? normalized : "default";
}

export function normalizeWorkspaceId(value) {
  if (value == null) return null;
  const normalized = String(value || "").trim();
  return normalized === "" ? null : normalized;
}

export function normalizePassportVisibility(value) {
  const normalized = String(value || "public").trim().toLowerCase();
  return ["public", "private", "restricted"].includes(normalized) ? normalized : "public";
}

export function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.trunc(numeric);
}

export function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, toInteger(value, min)));
}

export function clampFraction(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

// ---------------------------------------------------------------------------
// Scoring weights + sub-scores
// ---------------------------------------------------------------------------

export function getProfileWeights(profile = "default") {
  const normalized = normalizeProfile(profile);
  if (normalized === "government") {
    return { vendorCompliance: 7, repository: 4, evidence: 5, verifiedEvidence: 5, freshness: 3, evidenceCount: 3, sbom: 7, slsa: 7, sigstore: 6, standards: 6, completeness: 16 };
  }
  if (normalized === "msp") {
    return { vendorCompliance: 5, repository: 3, evidence: 4, verifiedEvidence: 4, freshness: 2, evidenceCount: 2, sbom: 5, slsa: 4, sigstore: 4, standards: 5, completeness: 14 };
  }
  return { vendorCompliance: 5, repository: 3, evidence: 4, verifiedEvidence: 3, freshness: 2, evidenceCount: 2, sbom: 5, slsa: 4, sigstore: 4, standards: 4, completeness: 15 };
}

export function calculateFreshnessScore(freshnessDays) {
  const normalized = clampInteger(freshnessDays, 0, 365);
  if (normalized <= 0) return 100;
  if (normalized >= 180) return 0;
  return Math.max(0, 100 - Math.floor((normalized * 100) / 180));
}

export function calculateCompletenessScore(evidence) {
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

// ---------------------------------------------------------------------------
// Passport envelope hashing
// ---------------------------------------------------------------------------

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
