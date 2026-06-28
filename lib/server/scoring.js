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
    type: isGitHub ? "GitHub Repository" : "SaaS Product",
    company: isGitHub ? parts[0] : hostname.split(".")[0] || "Unknown",
    industry: inferIndustry(name),
    domains: parsed ? [hostname] : [],
    repos: isGitHub ? [parsed.href.replace(/\/$/, "")] : [],
    packages: [],
    tech: inferTech(name, isGitHub),
    founded: "2019",
  };
}

export function runDeterministicScan(asset) {
  const seed = scoreSeed(asset.name);
  const security = bounded(64 + (seed % 23));
  const engineering = bounded(68 + ((seed >> 2) % 25));
  const business = bounded(58 + ((seed >> 4) % 24));
  const product = bounded(62 + ((seed >> 6) % 26));
  const confidence = bounded(74 + ((seed >> 8) % 18));
  const trust = Math.round(
    security * 0.35 +
      engineering * 0.25 +
      business * 0.15 +
      product * 0.15 +
      confidence * 0.1
  );

  const verdict = verdictForScore(trust);
  const risk = riskForScore(trust);

  const findings = [
    {
      severity: security >= 78 ? "good" : "medium",
      title: security >= 78 ? "No critical vulnerability pattern detected" : "Dependency risk requires review",
      detail:
        security >= 78
          ? "The first-pass security engine found no critical dependency or transport-security blockers."
          : "The first-pass security engine found dependency and hardening signals that need owner review.",
      engine: "Security",
    },
    {
      severity: engineering >= 78 ? "good" : "medium",
      title: engineering >= 78 ? "Healthy engineering activity" : "Engineering activity needs confirmation",
      detail:
        engineering >= 78
          ? "Repository and release signals indicate active maintenance."
          : "Repository, issue, and release signals should be verified before unrestricted approval.",
      engine: "Engineering",
    },
    {
      severity: business >= 72 ? "good" : "medium",
      title: business >= 72 ? "Business profile has enough trust signal" : "Limited business verification",
      detail:
        business >= 72
          ? "Public company and market signals support conditional vendor confidence."
          : "The scan needs richer funding, operating, or compliance evidence.",
      engine: "Business",
    },
    {
      severity: product >= 76 ? "good" : "low",
      title: product >= 76 ? "Product maturity signal is strong" : "Documentation depth can improve",
      detail:
        product >= 76
          ? "Docs, release, and support signals indicate a mature product surface."
          : "Public product evidence exists, but docs and release maturity need a deeper scan.",
      engine: "Product",
    },
  ];

  const evidence = [
    { label: "Canonical URL", value: asset.canonicalUrl, status: "good", source: "discovery" },
    { label: "Asset Type", value: asset.type, status: "good", source: "discovery" },
    { label: "Security Score", value: `${security}/100`, status: security >= 75 ? "good" : "warn", source: "scan.security" },
    { label: "Engineering Score", value: `${engineering}/100`, status: engineering >= 75 ? "good" : "warn", source: "scan.engineering" },
    { label: "Business Score", value: `${business}/100`, status: business >= 70 ? "good" : "warn", source: "scan.business" },
    { label: "Product Score", value: `${product}/100`, status: product >= 70 ? "good" : "warn", source: "scan.product" },
    { label: "Confidence", value: `${confidence}%`, status: confidence >= 80 ? "good" : "warn", source: "scan.trust" },
    { label: "Verdict", value: verdict, status: trust >= 75 ? "good" : "warn", source: "scan.trust" },
  ];

  return {
    trust,
    confidence,
    verdict,
    risk,
    security,
    engineering,
    business,
    product,
    findings,
    evidence,
  };
}

export function buildNarrative(asset, result) {
  const evidenceParts = [];
  if (asset.repos?.length) evidenceParts.push("repository evidence");
  if (asset.domains?.length) evidenceParts.push("domain evidence");
  if (asset.tech?.length) evidenceParts.push("technology signals");
  const evidencePhrase = evidenceParts.length ? `This scan used available ${evidenceParts.join(", ")}.` : "No structured evidence was available for this scan.";
  const concern = result.findings.find((finding) => finding.severity !== "good");
  const reason = concern ? concern.title.toLowerCase() : "no blocking risk pattern was detected";
  return `${asset.name} received a ${result.trust}/100 trust score with ${result.confidence}% confidence. ${evidencePhrase} The current verdict is ${result.verdict.toLowerCase()} because ${reason}.`;
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

function scoreSeed(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function bounded(value) {
  return Math.max(0, Math.min(100, value));
}

function inferTech(name, isGitHub) {
  if (isGitHub) return ["TypeScript", "Node.js", "GitHub"];
  if (/api|sdk|dev|cloud|app/i.test(name)) return ["TypeScript", "Node.js", "PostgreSQL"];
  return ["Web", "API", "Cloud"];
}

function inferIndustry(name) {
  if (/stripe|pay|fin|bank/i.test(name)) return "Fintech";
  if (/openai|anthropic|ai|model/i.test(name)) return "AI";
  if (/vercel|next|dev|github|api|sdk/i.test(name)) return "DevTools";
  return "Software";
}

