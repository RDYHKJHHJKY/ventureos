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

export function normalizePassportVisibility(value) {
  const normalized = String(value || "public").trim().toLowerCase();
  return ["public", "private", "restricted"].includes(normalized) ? normalized : "public";
}

export function normalizeProfile(value) {
  const normalized = String(value || "default").trim().toLowerCase();
  return ["default", "government", "msp"].includes(normalized) ? normalized : "default";
}

export function normalizeWorkspaceId(value) {
  if (value == null) return null;
  const normalized = String(value || "").trim();
  return normalized === "" ? null : normalized;
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
