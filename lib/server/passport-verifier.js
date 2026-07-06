import { trustScore } from "./trust-score.js";
import { hashObject, normalizeWorkspaceId, normalizeProfile, createPassportEnvelopeHash } from "./spr/shared.js";

export function createEvidenceBundleHash(evidenceList = []) {
  const normalizedEvidence = Array.isArray(evidenceList) ? evidenceList.slice() : [];
  if (normalizedEvidence.length === 0) return null;
  const sorted = normalizedEvidence.slice().sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
  const evidence = sorted.map((item) => ({
    id: String(item.id || "").trim() || null,
    bundle: item.bundle
      ? {
          integrityHash: String(item.bundle.integrityHash || null),
          workspaceId: normalizeWorkspaceId(item.bundle.workspaceId),
          requestId: String(item.bundle.requestId || null),
          encrypted: Boolean(item.bundle.encrypted),
          selectiveDisclosure: Boolean(item.bundle.selectiveDisclosure),
          recipients: Array.isArray(item.bundle.recipients)
            ? item.bundle.recipients.map((recipient) => String(recipient || "").trim()).filter(Boolean).sort()
            : [],
        }
      : null,
  }));
  return hashObject({ type: "passport.evidence.bundle", evidence });
}

export function loadEnvelope(passport = {}, db = {}) {
  if (!passport || typeof passport !== "object") {
    throw new Error("Passport is required to load verification envelope.");
  }
  const evidenceIds = Array.isArray(passport.evidenceIds) ? passport.evidenceIds.slice().sort() : [];
  const evidenceList = (db.sprEvidence || [])
    .filter((item) => evidenceIds.includes(item.id))
    .slice()
    .sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
  const software = (db.sprSoftware || []).find((item) => item.id === passport.softwareId) || null;
  const vendor = (db.sprVendors || []).find((item) => item.id === passport.vendorId) || null;
  return {
    passportEnvelopeHash: passport.passportEnvelopeHash || null,
    trustScoreHash: passport.trustScoreHash || null,
    evidenceBundleHash: passport.evidenceBundleHash || null,
    passport,
    software,
    vendor,
    evidenceList,
  };
}

export function verifyIntegrity(passport = {}, db = {}) {
  if (!passport || typeof passport !== "object") {
    throw new Error("Passport is required for integrity verification.");
  }
  const envelopeOk = createPassportEnvelopeHash(passport) === passport.passportEnvelopeHash;
  const loaded = loadEnvelope(passport, db);
  const computedEvidenceBundleHash = createEvidenceBundleHash(loaded.evidenceList);
  const evidenceOk = passport.evidenceBundleHash === computedEvidenceBundleHash;
  const computedScoreHash = trustScore.hashOutput({
    scoreResult: {
      trustScore: passport.trustScore,
      confidenceScore: passport.confidenceScore,
      verdict: passport.verdict,
      riskCategory: passport.riskCategory,
      profile: passport.profile || passport.scoringProfile,
    },
    workspaceId: passport.workspaceId,
    passportEnvelopeHash: passport.passportEnvelopeHash,
  });
  const scoreHashOk = passport.trustScoreHash === computedScoreHash;
  return {
    ok: envelopeOk && evidenceOk && scoreHashOk,
    envelopeOk,
    evidenceOk,
    scoreHashOk,
    computedEvidenceBundleHash,
    computedScoreHash,
  };
}

export function recomputeScore(passport = {}, db = {}) {
  if (!passport || typeof passport !== "object") {
    throw new Error("Passport is required to recompute score.");
  }
  const loaded = loadEnvelope(passport, db);
  if (!loaded.software) {
    return { ok: false, reason: "Passport software record not found.", expected: null, actual: null };
  }
  const normalizedInputs = trustScore.normalizeInputs({
    software: loaded.software,
    vendor: loaded.vendor || {},
    evidenceList: loaded.evidenceList,
    profile: passport.scoringProfile || passport.profile || "default",
    workspaceId: passport.workspaceId,
  });
  const computed = trustScore.computeDeterministic(normalizedInputs);
  const profileMatch = computed.profile === normalizeProfile(passport.profile || passport.scoringProfile || "default");
  const scoreMatches =
    computed.trustScore === passport.trustScore &&
    computed.confidenceScore === passport.confidenceScore &&
    computed.verdict === passport.verdict &&
    computed.riskCategory === passport.riskCategory &&
    profileMatch;
  return scoreMatches
    ? { ok: true, computed }
    : {
        ok: false,
        reason: "Passport score values do not match recomputed deterministic score.",
        expected: computed,
        actual: {
          trustScore: passport.trustScore,
          confidenceScore: passport.confidenceScore,
          verdict: passport.verdict,
          riskCategory: passport.riskCategory,
          profile: passport.profile || passport.scoringProfile || "default",
        },
      };
}

export function verifyWorkspaceScope(passport = {}, workspaceId = null) {
  const normalizedRequested = normalizeWorkspaceId(workspaceId);
  const passportWorkspace = normalizeWorkspaceId(passport.workspaceId);
  if (passportWorkspace && normalizedRequested !== passportWorkspace) {
    return false;
  }
  if (passportWorkspace && !normalizedRequested) {
    return false;
  }
  if (!passportWorkspace && normalizedRequested) {
    return false;
  }
  return true;
}

export function verifyPassport(passport = {}, db = {}, workspaceId = null) {
  const workspaceOk = verifyWorkspaceScope(passport, workspaceId);
  if (!workspaceOk) {
    return { ok: false, reason: "Passport workspace scope verification failed.", workspaceOk: false };
  }
  const integrity = verifyIntegrity(passport, db);
  if (!integrity.ok) {
    return { ok: false, reason: "Passport integrity verification failed.", integrity, workspaceOk: true };
  }
  const score = recomputeScore(passport, db);
  if (!score.ok) {
    return { ok: false, reason: "Passport score recomputation failed.", score, integrity, workspaceOk: true };
  }
  return { ok: true, workspaceOk: true, integrity, score };
}

export const passportVerifier = {
  loadEnvelope,
  verifyIntegrity,
  recomputeScore,
  verifyWorkspaceScope,
  verifyPassport,
  createEvidenceBundleHash,
};
