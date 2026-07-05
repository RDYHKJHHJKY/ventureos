import assert from "node:assert/strict";
import { trustScore } from "../lib/server/trust-score.js";

function makeInputs(overrides = {}) {
  return trustScore.normalizeInputs({
    software: { id: "software-1", repositoryUrl: "https://github.com/example/repo", packageName: "example" },
    vendor: { id: "vendor-1", complianceClaims: ["SOC2", "ISO27001"] },
    evidenceList: [
      { id: "e1", type: "sbom", freshnessDays: 10, verified: true, visibility: "public", strength: 0.8 },
      { id: "e2", type: "slsa", freshnessDays: 20, verified: true, visibility: "public", strength: 0.7 },
    ],
    profile: "government",
    ...overrides,
  });
}

function main() {
  const baseline = trustScore.computeDeterministic(makeInputs());
  const adaptive = trustScore.computeDeterministic(
    makeInputs({
      adaptiveSignals: {
        historicalAccuracy: 0.9,
        feedbackScore: 0.85,
        correctionCount: 1,
        anomalyCount: 0,
        reviewCount: 0,
      },
    })
  );
  const penalized = trustScore.computeDeterministic(
    makeInputs({
      adaptiveSignals: {
        historicalAccuracy: 0.3,
        feedbackScore: 0.2,
        correctionCount: 5,
        anomalyCount: 4,
        reviewCount: 2,
      },
    })
  );

  assert.ok(adaptive.trustScore >= baseline.trustScore, "Positive adaptive history should raise the trust score.");
  assert.ok(penalized.trustScore <= baseline.trustScore, "Negative adaptive history should lower the trust score.");

  assert.equal(trustScore.computeDeterministic(makeInputs()).trustScore, trustScore.computeDeterministic(makeInputs()).trustScore, "Repeated runs should remain stable.");

  console.log("Adaptive trust score tests passed.");
}

main();
