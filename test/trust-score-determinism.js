import assert from "node:assert/strict";
import { trustScore } from "../lib/server/trust-score.js";

function makeEvidence(id, overrides = {}) {
  return {
    id,
    type: "sbom",
    freshnessDays: 10,
    verified: true,
    visibility: "public",
    strength: 0.8,
    ...overrides,
  };
}

function makeSoftware() {
  return { id: "software-1", repositoryUrl: "https://github.com/example/repo", packageName: "example" };
}

function makeVendor() {
  return { id: "vendor-1", complianceClaims: ["SOC2", "ISO27001"] };
}

function main() {
  const inputsA = trustScore.normalizeInputs({
    software: makeSoftware(),
    vendor: makeVendor(),
    evidenceList: [makeEvidence("e1"), makeEvidence("e2")],
    profile: "government",
    workspaceId: "workspace-a",
  });

  const inputsB = trustScore.normalizeInputs({
    software: makeSoftware(),
    vendor: makeVendor(),
    evidenceList: [makeEvidence("e2"), makeEvidence("e1")],
    profile: "government",
    workspaceId: "workspace-a",
  });

  assert.deepEqual(inputsA, inputsB, "Inputs should normalize to the same sorted form.");

  const scoreA = trustScore.computeDeterministic(inputsA);
  const scoreB = trustScore.computeDeterministic(inputsB);
  assert.deepEqual(scoreA, scoreB, "Same normalized inputs should yield same deterministic score.");

  const hashA = trustScore.hashOutput({ scoreResult: scoreA, workspaceId: "workspace-a", passportEnvelopeHash: "env1" });
  const hashB = trustScore.hashOutput({ scoreResult: scoreB, workspaceId: "workspace-a", passportEnvelopeHash: "env1" });
  assert.equal(hashA, hashB, "Same score and workspace should produce same hash.");

  const hashC = trustScore.hashOutput({ scoreResult: scoreA, workspaceId: "workspace-b", passportEnvelopeHash: "env1" });
  assert.notEqual(hashA, hashC, "Different workspace should produce different hash.");

  assert.throws(() => trustScore.normalizeInputs(null), /must be an object/i);
  assert.throws(() => trustScore.computeDeterministic(null), /must be an object/i);
  assert.throws(() => trustScore.hashOutput({}), /Score result is required/i);

  console.log("Trust score determinism tests passed.");
}

main();
