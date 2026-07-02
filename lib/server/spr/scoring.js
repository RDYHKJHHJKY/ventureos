import { trustScore as trustScoreEngine } from "../trust-score.js";

export function normalizeScoringInputs(raw = {}) {
  return trustScoreEngine.normalizeInputs(raw);
}

export function computeTrustScore(raw = {}) {
  const inputs = normalizeScoringInputs(raw);
  return trustScoreEngine.computeDeterministic(inputs);
}

export function hashTrustScore(scoreResult = {}, workspaceId = null, passportEnvelopeHash = null) {
  return trustScoreEngine.hashOutput({ scoreResult, workspaceId, passportEnvelopeHash });
}
