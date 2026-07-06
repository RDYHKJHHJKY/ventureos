function cleanInput(value) {
  return String(value || "").trim();
}

export function discoverAsset(input) {
  const source = cleanInput(input);
  if (!source) {
    const err = new Error("Asset URL or name is required.");
    err.statusCode = 400;
    throw err;
  }

  const withProtocol = /^https?:\/\//i.test(source) ? source : `https://${source}`;
  let parsed = null;
  try {
    parsed = new URL(withProtocol);
  } catch {
    parsed = null;
  }

  const isGitHub = parsed?.hostname?.toLowerCase().includes("github.com");
  const parts = parsed ? parsed.pathname.split("/").filter(Boolean) : [];
  const repoName = isGitHub && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "";
  const hostname = parsed?.hostname?.replace(/^www\./, "") || source;
  const name = repoName || hostname || source;

  return {
    name,
    canonicalUrl: parsed ? parsed.href.replace(/\/$/, "") : source,
    type: isGitHub ? "GitHub Repository" : "Software Asset",
    company: isGitHub ? parts[0] : hostname.split(".")[0] || "Unknown",
    industry: isGitHub ? "Open Source" : "Software",
    domains: parsed ? [hostname] : [],
    repos: isGitHub ? [parsed.href.replace(/\/$/, "")] : [],
    packages: [],
    tech: isGitHub ? ["GitHub"] : [],
    founded: "Unknown",
  };
}

export function runDeterministicScan(asset) {
  const hasRepo = Array.isArray(asset.repos) && asset.repos.length > 0;
  const hasDomain = Array.isArray(asset.domains) && asset.domains.length > 0;
  const hasTech = Array.isArray(asset.tech) && asset.tech.length > 0;
  const hasCompany = Boolean(asset.company && asset.company !== "Unknown");

  const scoreComponents = [
    { label: "Repository", present: hasRepo, weight: 30 },
    { label: "Domain", present: hasDomain, weight: 25 },
    { label: "Technology", present: hasTech, weight: 20 },
    { label: "Company", present: hasCompany, weight: 15 },
  ];

  const evidenceScore = scoreComponents.reduce((sum, component) => sum + (component.present ? component.weight : 0), 0);
  const trust = bounded(25 + evidenceScore);
  const confidence = bounded(30 + (hasRepo ? 20 : 0) + (hasDomain ? 15 : 0) + (hasTech ? 10 : 0) + (hasCompany ? 10 : 0));
  const verdict = verdictForScore(trust);
  const risk = riskForScore(trust);

  const findings = scoreComponents.map((component) => ({
    severity: component.present ? "good" : "medium",
    title: component.present
      ? `${component.label} evidence is present.`
      : `${component.label} evidence is missing or incomplete.`,
    detail: component.present
      ? `The asset includes verifiable ${component.label.toLowerCase()} evidence.`
      : `This asset lacks sufficient ${component.label.toLowerCase()} evidence for a more confident rating.`,
    engine: component.label,
  }));

  const evidence = [
    { label: "Canonical URL", value: asset.canonicalUrl, status: "good", source: "discovery" },
    { label: "Asset Type", value: asset.type, status: "good", source: "discovery" },
    { label: "Repository Present", value: String(hasRepo), status: hasRepo ? "good" : "warn", source: "scan.discovery" },
    { label: "Domain Present", value: String(hasDomain), status: hasDomain ? "good" : "warn", source: "scan.discovery" },
    { label: "Technology Signals", value: asset.tech?.join(", ") || "none", status: hasTech ? "good" : "warn", source: "scan.discovery" },
    { label: "Company Identifier", value: asset.company || "Unknown", status: hasCompany ? "good" : "warn", source: "scan.discovery" },
    { label: "Score", value: `${trust}/100`, status: trust >= 75 ? "good" : "warn", source: "scan.trust" },
    { label: "Confidence", value: `${confidence}%`, status: confidence >= 75 ? "good" : "warn", source: "scan.trust" },
    { label: "Verdict", value: verdict, status: trust >= 75 ? "good" : "warn", source: "scan.trust" },
  ];

  return {
    trust,
    confidence,
    verdict,
    risk,
    security: hasRepo ? 60 : 30,
    engineering: hasTech ? 55 : 25,
    business: hasDomain || hasCompany ? 50 : 25,
    product: hasDomain ? 50 : 25,
    findings,
    evidence,
  };
}

export function buildNarrative(asset, result) {
  const evidenceSources = [];
  if (asset.repos?.length) evidenceSources.push("repository evidence");
  if (asset.domains?.length) evidenceSources.push("domain evidence");
  if (asset.tech?.length) evidenceSources.push("technology signals");
  const evidencePhrase = evidenceSources.length
    ? `This scan used available ${evidenceSources.join(", ")}.`
    : "This scan did not have structured repository or domain evidence.";
  const finding = result.findings.find((item) => item.severity !== "good");
  const reason = finding ? finding.title.toLowerCase() : "no material gaps were identified in the available evidence";
  return `${asset.name} received a ${result.trust}/100 score with ${result.confidence}% confidence. ${evidencePhrase} The current verdict is ${result.verdict.toLowerCase()} because ${reason}.`;
}

export function buildProjectNarrative(project, signals, options = {}) {
  const { hasSbom = false, hasPackageList = false, hasMetadata = false, hasRepoUrl = false, totalDependencies = 0 } = options;
  const availableEvidence = [];
  if (hasSbom) availableEvidence.push("SBOM");
  if (hasPackageList) availableEvidence.push("package list");
  if (hasMetadata) availableEvidence.push("metadata");
  if (hasRepoUrl) availableEvidence.push("repository URL");

  const missingEvidence = [];
  if (!hasSbom && !hasPackageList) missingEvidence.push("SBOM or package list");
  else {
    if (!hasSbom) missingEvidence.push("SBOM");
    if (!hasPackageList) missingEvidence.push("package list");
  }
  if (!hasMetadata) missingEvidence.push("metadata");
  if (!hasRepoUrl) missingEvidence.push("repository URL");

  const lines = [];
  if (availableEvidence.length) {
    lines.push(`This evaluation used available evidence: ${availableEvidence.join(", ")}.`);
  } else {
    lines.push("No SBOM, package list, metadata, or repository URL was provided for this project.");
  }

  if (totalDependencies > 0) {
    lines.push(`Dependency hygiene and vulnerability coverage were assessed across ${totalDependencies} extracted dependencies.`);
  } else {
    lines.push("No dependency artifact was available, so dependency and supply-chain signals could not be fully evaluated.");
  }

  if (!hasRepoUrl) {
    lines.push("Repository-based signals such as patch latency and change cadence could not be proven without a repository URL.");
  }

  if (!hasMetadata) {
    lines.push("Policy maturity and governance signals could not be verified because metadata is missing.");
  }

  const skippedSignals = [
    "vulnerabilityDensity",
    "patchLatency",
    "dependencyHygiene",
    "thirdPartyConcentration",
    "criticalDependencyRisk",
    "policyMaturity",
    "changeCadence",
  ].filter((key) => signals[key] == null);

  if (skippedSignals.length) {
    lines.push(`Confidence is reduced because ${skippedSignals.length} key signal${skippedSignals.length === 1 ? "" : "s"} could not be proven: ${skippedSignals.join(", ")}.`);
  }

  if (missingEvidence.length) {
    lines.push(`Missing evidence: ${missingEvidence.join(", ")}. This reduces confidence and shifts the risk band toward caution.`);
  }

  const completeness = Math.round((signals.dataCompleteness ?? 0) * 100);
  lines.push(`Overall evidence completeness is ${completeness}%. Confidence reflects only provable data and does not assume missing inputs.`);

  return lines.join(" ");
}

export function applyTimelineDecay(drift = 0) {
  const normalized = Math.max(0, Number(drift) || 0);
  if (normalized <= 0.4) return 0;
  return Math.min(40, Math.round(((normalized - 0.4) / 0.6) * 30));
}

export function applyExpiryPenalties({ scanAgeDays = 0, passportExpiresInDays = null, passportRevoked = false } = {}) {
  let penalty = 0;
  if (passportRevoked) {
    penalty += 30;
  } else if (passportExpiresInDays != null) {
    if (passportExpiresInDays < 0) penalty += 25;
    else if (passportExpiresInDays <= 30) penalty += 15;
  }
  if (scanAgeDays > 90) penalty += 20;
  else if (scanAgeDays > 30) penalty += 10;
  return penalty;
}

export function computeDependencyRisk(node = {}) {
  const trust = Math.max(0, Math.min(100, Number(node.trust || 0)));
  const evidence = Math.max(0, Math.min(1, Number(node.evidenceCompleteness || 0)));
  const driftPenalty = Math.round((Number(node.drift || 0) || 0) * 20);
  return Math.min(100, Math.max(0, 100 - trust + Math.round((1 - evidence) * 20) + driftPenalty));
}

export function computePropagationRisk(dependencyRisks = []) {
  if (!Array.isArray(dependencyRisks) || dependencyRisks.length === 0) return 0;
  return Math.max(...dependencyRisks.map((value) => Math.max(0, Number(value || 0))));
}

export function aggregateRiskFromDependencies(dependencyRisks = []) {
  return computePropagationRisk(dependencyRisks);
}

export function aggregateRiskFromDependents(dependentRisks = []) {
  if (!Array.isArray(dependentRisks) || dependentRisks.length === 0) return 0;
  return Math.max(...dependentRisks.map((value) => Math.max(0, Number(value || 0))));
}

export function computeNodeRiskScore(node = {}, options = {}) {
  const baseRisk = Math.max(0, 100 - Math.max(0, Math.min(100, Number(node.trust || 0))));
  const propagationRisk = Math.max(0, Number(options.propagationRisk || 0));
  const decayPenalty = applyTimelineDecay(Number(node.drift || 0));
  const expiryPenalty = applyExpiryPenalties(options);
  const missingEvidencePenalty = Math.round((1 - Math.max(0, Math.min(1, Number(node.evidenceCompleteness || 0)))) * 20) + (options.missingMetadata ? 10 : 0);
  return Math.min(100, Math.max(0, Math.round(baseRisk + propagationRisk + decayPenalty + expiryPenalty + missingEvidencePenalty)));
}

export function computeNodeConfidence(node = {}, options = {}) {
  const completeness = Math.max(0, Math.min(1, Number(node.evidenceCompleteness || 0)));
  const freshness = Math.max(0, 1 - Math.min(1, Number(node.drift || 0)));
  const evidenceQuality = Math.max(0, Math.min(1, Number(node.confidence || 0) / 100));
  const score = completeness * 0.5 + freshness * 0.3 + evidenceQuality * 0.2;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

export function computeWorkspaceRiskScore(nodeRiskScores = []) {
  if (!Array.isArray(nodeRiskScores) || nodeRiskScores.length === 0) return 0;
  const weighted = nodeRiskScores.reduce((sum, item) => {
    const weight = Math.max(0.1, Math.min(1, Number(item.confidence || 50) / 100));
    return sum + Math.max(0, Number(item.riskScore || 0)) * weight;
  }, 0);
  const totalWeight = nodeRiskScores.reduce((sum, item) => sum + Math.max(0.1, Math.min(1, Number(item.confidence || 50) / 100)), 0);
  return Math.round(totalWeight ? weighted / totalWeight : weighted / nodeRiskScores.length);
}

export function computeWorkspaceConfidence(nodeConfidences = []) {
  if (!Array.isArray(nodeConfidences) || nodeConfidences.length === 0) return 0;
  const total = nodeConfidences.reduce((sum, value) => sum + Math.max(0, Math.min(100, Number(value || 0))), 0);
  return Math.round(total / nodeConfidences.length);
}

export function verdictForScore(score) {
  if (score >= 75) return "TRUSTED";
  if (score >= 60) return "CONDITIONALLY TRUSTED";
  if (score >= 40) return "REVIEW REQUIRED";
  if (score >= 20) return "HIGH RISK";
  return "BLOCKED";
}

export function riskForScore(score) {
  if (score >= 75) return "Low";
  if (score >= 60) return "Medium";
  if (score >= 40) return "High";
  return "Critical";
}

function bounded(value) {
  return Math.max(0, Math.min(100, value));
}

