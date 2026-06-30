import { buildProjectNarrative } from "./scoring.js";

const KNOWN_RISK_PACKAGES = new Set(["openssl", "xz", "log4j", "spring-core", "left-pad", "lodash", "event-stream"]);

export function dbHasArtifact(db, projectId, type) {
  return Boolean(db.projectArtifacts.find((item) => item.projectId === projectId && item.type === type));
}

export function computeProjectSignals(db, project, dependencies, metadata) {
  const totalDeps = Array.isArray(dependencies) ? dependencies.length : 0;
  const uniqueVendors = new Set(
    (dependencies || []).map((dep) => dep.packageName.split(/\//)[0].replace(/^@/, "").toLowerCase())
  ).size;
  const highRiskCount = (dependencies || []).filter((dep) => KNOWN_RISK_PACKAGES.has(String(dep.packageName || "").toLowerCase())).length;
  const vulnerableDeps = highRiskCount;
  const stableDeps = (dependencies || []).filter((dep) => dep.version && !dep.version.match(/(?:alpha|beta|rc|dev|snapshot)/i)).length;

  const hasSbom = dbHasArtifact(db, project.id, "SBOM");
  const hasPackageList = dbHasArtifact(db, project.id, "PACKAGE_LIST");
  const hasMetadata = metadata && Object.keys(metadata).length > 0;

  const dependencyDataAvailable = totalDeps > 0;
  const vulnerabilityDensity = dependencyDataAvailable ? Math.min(1, vulnerableDeps / totalDeps) : null;
  const patchLatency = project.repoUrl ? 0.35 : null;
  const dependencyHygiene = dependencyDataAvailable ? Math.min(1, stableDeps / totalDeps) : null;
  const thirdPartyConcentration = dependencyDataAvailable ? Math.min(1, uniqueVendors / totalDeps) : null;
  const criticalDependencyRisk = dependencyDataAvailable ? (highRiskCount > 0 ? 1 : 0) : null;

  const normalizedFlags = {
    hasSecurityPolicy: Boolean(metadata?.hasSecurityPolicy || metadata?.securityPolicy),
    hasIncidentResponsePlan: Boolean(metadata?.hasIncidentResponsePlan || metadata?.incidentResponsePlan),
    hasGovernancePolicy: Boolean(metadata?.governancePolicy || metadata?.policyMaturity),
  };
  const policyMaturity = hasMetadata
    ? (Number(normalizedFlags.hasSecurityPolicy) + Number(normalizedFlags.hasIncidentResponsePlan) + Number(normalizedFlags.hasGovernancePolicy)) / 3
    : null;
  const changeCadence = project.repoUrl ? 0.75 : null;
  const dataCompleteness = (Number(hasSbom) + Number(hasPackageList) + Number(hasMetadata)) / 3;

  return {
    vulnerabilityDensity,
    patchLatency,
    dependencyHygiene,
    thirdPartyConcentration,
    criticalDependencyRisk,
    policyMaturity,
    changeCadence,
    dataCompleteness,
    computedAt: new Date().toISOString(),
  };
}

function buildRiskBand(score) {
  if (score >= 80) return "Stable";
  if (score >= 60) return "Elevated";
  if (score >= 40) return "Concerning";
  return "Critical";
}

export function computePipelineScore(signals, options = {}) {
  const { hasSbom = false, hasPackageList = false, hasMetadata = false, hasRepoUrl = false } = options;
  const normalizedVulnerability = signals.vulnerabilityDensity != null ? 1 - signals.vulnerabilityDensity : 0;
  const normalizedPatchLatency = signals.patchLatency != null ? 1 - signals.patchLatency : 0;
  const normalizedDependencyHygiene = signals.dependencyHygiene ?? 0;
  const normalizedThirdParty = signals.thirdPartyConcentration != null ? 1 - signals.thirdPartyConcentration : 0;
  const normalizedCriticalRisk = signals.criticalDependencyRisk != null ? 1 - signals.criticalDependencyRisk : 0;
  const codeScore = (normalizedVulnerability + normalizedPatchLatency + normalizedDependencyHygiene) / 3;
  const supplyChainScore = (normalizedThirdParty + normalizedCriticalRisk) / 2;
  const governanceScore = signals.policyMaturity ?? 0;
  const behaviorScore = signals.changeCadence ?? 0;
  const score = Math.round(((codeScore * 0.4) + (supplyChainScore * 0.3) + (governanceScore * 0.2) + (behaviorScore * 0.1)) * 100);

  const completeness = signals.dataCompleteness ?? 0;
  const skippedSignals = [
    "vulnerabilityDensity",
    "patchLatency",
    "dependencyHygiene",
    "thirdPartyConcentration",
    "criticalDependencyRisk",
    "policyMaturity",
    "changeCadence",
  ].filter((key) => signals[key] == null);
  const missingSignalPenalty = skippedSignals.length * 0.06;
  const repoBonus = hasRepoUrl ? 0.08 : 0;
  const metadataBonus = hasMetadata ? 0.07 : 0;
  const evidenceScore = Math.min(0.95, Math.max(0.1, 0.18 + completeness * 0.45 + repoBonus + metadataBonus - missingSignalPenalty));
  const confidence = Math.round(evidenceScore * 100);

  const confidenceDetail = {
    completeness: Math.round(completeness * 100),
    missingSignals: skippedSignals,
    hasSbom,
    hasPackageList,
    hasMetadata,
    hasRepoUrl,
    confidenceSource: "evidence-driven",
  };

  const riskBand = buildRiskBand(score);
  return { score, confidence, confidenceDetail, riskBand, modelVersion: "v1" };
}
