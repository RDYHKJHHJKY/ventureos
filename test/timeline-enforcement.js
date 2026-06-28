import assert from "node:assert";
import { createId } from "../lib/server/data-store.js";
import { computePipelineScore, recordProjectEvidenceEvents } from "../lib/server/api-router.js";

function countEvents(db, type) {
  return db.projectEvents.filter((event) => event.type === type).length;
}

function findEvent(db, type, detailKey, detailValue) {
  return db.projectEvents.find(
    (event) => event.type === type && event.details?.[detailKey] === detailValue
  );
}

function runScenario({ hasSbom, hasPackageList, hasMetadata, hasRepoUrl, totalDependencies, signals }) {
  const db = { projectEvents: [] };
  const projectId = createId("project", `test-${Date.now()}`);
  recordProjectEvidenceEvents(db, projectId, signals, {
    hasSbom,
    hasPackageList,
    hasMetadata,
    hasRepoUrl,
    totalDependencies,
  });
  return { db, projectId };
}

// Scenario 1: No evidence at all
const noEvidenceSignals = {
  vulnerabilityDensity: null,
  patchLatency: null,
  dependencyHygiene: null,
  thirdPartyConcentration: null,
  criticalDependencyRisk: null,
  policyMaturity: null,
  changeCadence: null,
  dataCompleteness: 0,
};
const noEvidence = runScenario({
  hasSbom: false,
  hasPackageList: false,
  hasMetadata: false,
  hasRepoUrl: false,
  totalDependencies: 0,
  signals: noEvidenceSignals,
});
assert.strictEqual(countEvents(noEvidence.db, "ARTIFACT_MISSING"), 4, "Should record four missing artifact events");
assert.strictEqual(countEvents(noEvidence.db, "SIGNAL_SKIPPED"), 7, "Should record one skipped event per null signal");
assert.ok(findEvent(noEvidence.db, "ARTIFACT_MISSING", "artifact", "SBOM"), "SBOM missing event must be recorded");
assert.ok(findEvent(noEvidence.db, "ARTIFACT_MISSING", "artifact", "PACKAGE_LIST"), "Package list missing event must be recorded");
assert.ok(findEvent(noEvidence.db, "ARTIFACT_MISSING", "artifact", "METADATA"), "Metadata missing event must be recorded");
assert.ok(findEvent(noEvidence.db, "ARTIFACT_MISSING", "artifact", "REPO_URL"), "Repository URL missing event must be recorded");
assert.ok(findEvent(noEvidence.db, "ABSTENTION_CONSIDERED", "reason", "No provable evidence"), "Abstention should be considered when no evidence exists");
assert.ok(findEvent(noEvidence.db, "EVIDENCE_INCOMPLETE", "completeness", 0), "Evidence incomplete event should record completeness");

// Scenario 2: Partial evidence still triggers relevant events
const partialSignals = {
  vulnerabilityDensity: 0.15,
  patchLatency: null,
  dependencyHygiene: 0.75,
  thirdPartyConcentration: null,
  criticalDependencyRisk: 0,
  policyMaturity: null,
  changeCadence: 0.65,
  dataCompleteness: 0.5,
};
const partialEvidence = runScenario({
  hasSbom: true,
  hasPackageList: false,
  hasMetadata: false,
  hasRepoUrl: true,
  totalDependencies: 10,
  signals: partialSignals,
});
assert.strictEqual(countEvents(partialEvidence.db, "ARTIFACT_MISSING"), 2, "Should record missing package list and metadata only");
assert.ok(findEvent(partialEvidence.db, "ARTIFACT_MISSING", "artifact", "PACKAGE_LIST"), "Package list missing event must be recorded");
assert.ok(findEvent(partialEvidence.db, "ARTIFACT_MISSING", "artifact", "METADATA"), "Metadata missing event must be recorded");
assert.strictEqual(countEvents(partialEvidence.db, "SIGNAL_SKIPPED"), 3, "Should record only the null signals");
assert.ok(findEvent(partialEvidence.db, "SIGNAL_SKIPPED", "signal", "patchLatency"), "Patch latency skipped event should be recorded");
assert.ok(findEvent(partialEvidence.db, "SIGNAL_SKIPPED", "signal", "thirdPartyConcentration"), "Third party concentration skipped event should be recorded");
assert.ok(findEvent(partialEvidence.db, "EVIDENCE_INCOMPLETE", "completeness", 50), "Partial completeness should be recorded");
assert.strictEqual(countEvents(partialEvidence.db, "ABSTENTION_CONSIDERED"), 0, "Abstention should not be recorded when some evidence exists");

// Scenario 3: Confidence enforcement reflects missing evidence and skipped signals
const confidenceSignals = {
  vulnerabilityDensity: 0.06,
  patchLatency: null,
  dependencyHygiene: 0.82,
  thirdPartyConcentration: null,
  criticalDependencyRisk: 0.14,
  policyMaturity: 0.4,
  changeCadence: null,
  dataCompleteness: 0.55,
};
const confidenceResult = computePipelineScore(confidenceSignals, {
  hasSbom: true,
  hasPackageList: false,
  hasMetadata: false,
  hasRepoUrl: true,
});
assert.ok(confidenceResult.confidence < 70, "Confidence should be reduced when key signals are missing and evidence is incomplete");
assert.deepStrictEqual(confidenceResult.confidenceDetail.missingSignals.sort(), ["changeCadence", "patchLatency", "thirdPartyConcentration"].sort(), "Confidence detail must list all skipped signals");
assert.strictEqual(confidenceResult.confidenceDetail.completeness, 55, "Confidence detail must encode overall evidence completeness");
assert.strictEqual(confidenceResult.confidenceDetail.hasMetadata, false, "Missing metadata should be surfaced in confidence detail");
assert.strictEqual(confidenceResult.confidenceDetail.hasRepoUrl, true, "Repo URL availability should be surfaced in confidence detail");

console.log("All timeline enforcement tests passed.");
