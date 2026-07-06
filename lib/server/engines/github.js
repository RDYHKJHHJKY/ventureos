import https from "node:https";

const GITHUB_API_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN_FOR_SPR;

function githubApiHeaders(extra = {}) {
  const headers = {
    "User-Agent": "ventureos-spr",
    Accept: "application/vnd.github+json",
    ...extra,
  };
  if (GITHUB_API_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_API_TOKEN}`;
  }
  return headers;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIsoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeFreshnessScore(scannedAt, lastCommitAt) {
  const current = scannedAt ? new Date(scannedAt) : new Date();
  const lastCommit = lastCommitAt ? new Date(lastCommitAt) : null;
  if (!lastCommit) return 0.25;
  const diffDays = Math.max(0, Math.floor((current.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24)));
  if (diffDays <= 7) return 1;
  if (diffDays <= 30) return 0.75;
  if (diffDays <= 90) return 0.45;
  return 0.2;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: githubApiHeaders() }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`GitHub API error ${res.statusCode}: ${body}`));
          return;
        }
        resolve(body);
      });
    });
    req.on("error", reject);
  });
}

function fetchJson(endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.get(endpoint, { headers: githubApiHeaders() }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`GitHub API error ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
  });
}

function classifyWorkflowSignals(content) {
  const text = String(content || "");
  const lower = text.toLowerCase();
  const hasSlsaKeywords = /\bslsa\b/i.test(text) || /\bprovenance\b/i.test(text);
  const hasSigstoreKeywords = /\bsigstore\b|\bcosign\b|\bin-toto\b|\brekor\b|\bfulcio\b/i.test(text);
  const hasCheckout = /uses:\s*.*actions\/checkout(@|\b)/i.test(text);
  const hasBuildStep = /run:\s*(?:.*\b(?:npm|yarn|pnpm|make|go build|cargo build|mvn|gradle|dotnet build|docker build)\b)/i.test(text);
  const hasAttestation = hasSigstoreKeywords || /uses:\s*.*(slsa-framework|slsa-github-generator|slsa-action|opencontainers\/provenance-action|sigstore\/cosign-action|in-toto|cosign|fulcio|rekor)/i.test(text) || /\brun:\s*(?:cosign|slsacli|in-toto|rekor|fulcio|sigstore)\b/i.test(text);
  const hasSbomKeyword = /\b(sbom|bom|software bill of materials|cyclonedx|spdx)\b/i.test(text);

  return {
    hasSlsaKeywords,
    hasSigstoreKeywords,
    hasCheckout,
    hasBuildStep,
    hasAttestation,
    hasSbomKeyword,
  };
}

function classifySlsaEvidence(workflowFiles, sbomArtifacts, releaseAssets, raw) {
  const hasWorkflows = workflowFiles.length > 0;
  const hasSlsaKeywords = workflowFiles.some((file) => file.hasSlsaKeywords);
  const hasSigstoreKeywords = workflowFiles.some((file) => file.hasSigstoreKeywords);
  const hasAttestation = workflowFiles.some((file) => file.hasAttestation);
  const hasBuildStep = workflowFiles.some((file) => file.hasBuildStep);
  const hasCheckout = workflowFiles.some((file) => file.hasCheckout);
  const hasSbomKeywords = workflowFiles.some((file) => file.hasSbomKeyword);
  const hasSbomArtifacts = Array.isArray(sbomArtifacts) && sbomArtifacts.length > 0;
  const hasReleaseAssets = Array.isArray(releaseAssets) && releaseAssets.length > 0;

  const lastCommitDate = raw.pushed_at || raw.updated_at || raw.created_at || null;
  const lastCommit = parseIsoDate(lastCommitDate);
  const now = new Date();
  const lastCommitAgeDays = lastCommit ? Math.max(0, Math.floor((now.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24))) : null;

  const workflowsEvidence = hasAttestation || hasSlsaKeywords || hasSigstoreKeywords || hasSbomKeywords || hasBuildStep || hasCheckout;
  const status = !hasWorkflows
    ? "insufficient_data"
    : workflowsEvidence || hasSbomArtifacts || hasReleaseAssets
      ? "partial"
      : "workflow_detected";
  const levelEstimate = !hasWorkflows ? null : workflowsEvidence ? 2 : 1;
  const confidence = !hasWorkflows ? 0 : workflowsEvidence ? 65 : 35;
  const reasoning = [];

  if (!hasWorkflows) {
    reasoning.push("No GitHub Actions workflow evidence was detected.");
  } else {
    reasoning.push(`Detected ${workflowFiles.length} workflow file(s) in .github/workflows.`);
    if (hasCheckout) reasoning.push("Workflow includes checkout steps, showing a real repository build flow.");
    if (hasBuildStep) reasoning.push("Workflow includes build/test step patterns.");
    if (hasSlsaKeywords) reasoning.push("Workflow content includes SLSA or provenance-related signals.");
    if (hasSigstoreKeywords) reasoning.push("Workflow content includes Sigstore or signing-related signals.");
    if (hasAttestation) reasoning.push("Workflow contains explicit attestation or signing actions.");
    if (hasSbomKeywords) reasoning.push("Workflow references SBOM or bill-of-materials tooling.");
    if (hasSbomArtifacts) reasoning.push(`Detected ${sbomArtifacts.length} SBOM-like artifact file(s) in repository root.`);
    if (hasReleaseAssets) reasoning.push(`Repository release assets were discovered, which may include signed or attested artifacts.`);
  }

  if (lastCommitAgeDays != null) {
    reasoning.push(`Last commit activity was ${lastCommitAgeDays} day(s) ago.`);
  }

  return {
    status,
    levelEstimate,
    confidence,
    workflowCount: workflowFiles.length,
    sbomArtifactCount: sbomArtifacts.length,
    workflowFiles: workflowFiles.map((file) => ({
      name: file.name,
      path: file.path,
      hasSlsaKeywords: file.hasSlsaKeywords,
      hasSigstoreKeywords: file.hasSigstoreKeywords,
      hasAttestation: file.hasAttestation,
      hasBuildStep: file.hasBuildStep,
      hasCheckout: file.hasCheckout,
      hasSbomKeyword: file.hasSbomKeyword,
    })),
    sbomArtifacts: Array.isArray(sbomArtifacts)
      ? sbomArtifacts.map((item) => ({ name: item.name, path: item.path, downloadUrl: item.downloadUrl || null }))
      : [],
    lastCommitAgeDays,
    reasoning,
  };
}

export async function fetchGitHubRepo(owner, repo) {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return fetchJson(endpoint);
}

export async function fetchGitHubRepoContents(owner, repo, path = "") {
  const normalizedPath = String(path || "").trim();
  const encodedPath = normalizedPath ? normalizedPath.split("/").map(encodeURIComponent).join("/") : "";
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${encodedPath ? `/${encodedPath}` : ""}`;
  return fetchJson(endpoint);
}

export async function fetchGitHubWorkflowFiles(owner, repo) {
  let contents = [];
  try {
    contents = await fetchGitHubRepoContents(owner, repo, ".github/workflows");
  } catch (error) {
    if (String(error.message).includes("GitHub API error 404")) {
      return [];
    }
    throw error;
  }

  if (!Array.isArray(contents)) {
    return [];
  }

  const workflowFiles = await Promise.all(
    contents
      .filter((item) => item.type === "file")
      .slice(0, 5)
      .map(async (item) => {
        let content = "";
        try {
          if (item.download_url) {
            content = await fetchText(item.download_url);
          } else if (item.url) {
            const fileJson = await fetchJson(item.url);
            if (fileJson && typeof fileJson.content === "string") {
              const decoded = Buffer.from(fileJson.content, fileJson.encoding || "base64").toString("utf8");
              content = decoded;
            }
          }
        } catch {
          content = "";
        }
        const signals = classifyWorkflowSignals(content);
        return {
          name: item.name,
          path: item.path,
          downloadUrl: item.download_url || null,
          ...signals,
        };
      })
  );

  return workflowFiles;
}

export async function fetchGitHubSbomArtifacts(owner, repo) {
  let contents = [];
  try {
    contents = await fetchGitHubRepoContents(owner, repo, "");
  } catch (error) {
    if (String(error.message).includes("GitHub API error 404")) {
      return [];
    }
    throw error;
  }

  if (!Array.isArray(contents)) {
    return [];
  }

  const sbomNames = new Set([
    "sbom.xml",
    "sbom.json",
    "bom.xml",
    "bom.json",
    "cyclonedx.xml",
    "cyclonedx.json",
    "spdx.json",
    "spdx.rdf",
    "spdx.tag-value",
    "spdx.yml",
    "spdx.yaml",
  ]);

  return contents
    .filter((item) => item.type === "file" && sbomNames.has(String(item.name || "").toLowerCase()))
    .map((item) => ({ name: item.name, path: item.path, downloadUrl: item.download_url || null }));
}

export async function fetchGitHubReleaseAssets(owner, repo) {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
  let release = null;
  try {
    release = await fetchJson(endpoint);
  } catch (error) {
    if (String(error.message).includes("GitHub API error 404")) {
      return [];
    }
    throw error;
  }

  if (!release || !Array.isArray(release.assets)) {
    return [];
  }

  const assets = release.assets.map((asset) => ({
    name: asset.name,
    path: asset.browser_download_url || asset.url || null,
    downloadUrl: asset.browser_download_url || null,
  }));

  return assets;
}

export function normalizeGitHubMetadata(raw, options = {}) {
  const scannedAt = options.scannedAt || new Date().toISOString();
  const workflowFiles = Array.isArray(options.workflowFiles) ? options.workflowFiles : [];
  const sbomArtifacts = Array.isArray(options.sbomArtifacts) ? options.sbomArtifacts : [];
  const releaseAssets = Array.isArray(options.releaseAssets) ? options.releaseAssets : [];
  const lastCommitDate = raw.pushed_at || raw.updated_at || null;
  const parsedLastCommit = parseIsoDate(lastCommitDate);
  const now = new Date(scannedAt);
  const evidenceAgeDays = parsedLastCommit ? Math.max(0, Math.floor((now.getTime() - parsedLastCommit.getTime()) / (1000 * 60 * 60 * 24))) : 0;
  const freshnessScore = computeFreshnessScore(scannedAt, lastCommitDate);
  const isStale = evidenceAgeDays > 30;
  const isLowActivity = toNumber(raw.subscribers_count, 0) < 3 || evidenceAgeDays > 90;
  const isUnmaintained = evidenceAgeDays > 180 || toNumber(raw.open_issues_count, 0) > 50;
  const slsaClassification = classifySlsaEvidence(workflowFiles, sbomArtifacts, releaseAssets, raw);

  return {
    type: "github",
    title: `${raw.full_name || options.repo || "GitHub repository"} metadata`,
    summary: `GitHub repository metadata for ${raw.full_name || options.repo || "repository"}.`,
    source: "github",
    uri: raw.html_url || options.url || null,
    strength: 0.8,
    freshnessDays: evidenceAgeDays,
    verified: true,
    visibility: "public",
    accessToken: null,
    scannedAt,
    evidenceAgeDays,
    freshnessScore,
    isStale,
    isLowActivity,
    isUnmaintained,
    slsaClassification,
    numericSignals: {
      stars: toNumber(raw.stargazers_count, 0),
      forks: toNumber(raw.forks_count, 0),
      openIssues: toNumber(raw.open_issues_count, 0),
      subscribers: toNumber(raw.subscribers_count, 0),
      size: toNumber(raw.size, 0),
      defaultBranch: raw.default_branch || null,
      visibility: raw.private ? "private" : "public",
      license: raw.license?.spdx_id || raw.license?.name || null,
      lastCommitDate: lastCommitDate || null,
      repoAgeDays: raw.created_at ? Math.max(0, Math.floor((now.getTime() - new Date(raw.created_at).getTime()) / (1000 * 60 * 60 * 24))) : 0,
      contributorCount: toNumber(raw.contributors_count, 0),
    },
    payload: JSON.stringify({
      fullName: raw.full_name,
      stars: raw.stargazers_count,
      forks: raw.forks_count,
      openIssues: raw.open_issues_count,
      defaultBranch: raw.default_branch,
      visibility: raw.private ? "private" : "public",
      lastCommitDate: lastCommitDate,
      license: raw.license?.spdx_id || raw.license?.name || null,
      slsaClassification,
      workflowFiles: workflowFiles.map((file) => ({
        name: file.name,
        path: file.path,
        hasSlsaKeywords: file.hasSlsaKeywords,
        hasSigstoreKeywords: file.hasSigstoreKeywords,
        hasAttestation: file.hasAttestation,
        hasBuildStep: file.hasBuildStep,
        hasCheckout: file.hasCheckout,
        hasSbomKeyword: file.hasSbomKeyword,
      })),
      sbomArtifacts,
      releaseAssets,
    }),
    mimeType: "application/json",
    provenance: {
      source: "github-api",
      gitHubRepo: raw.full_name || options.repo || null,
      workflowEvidence: workflowFiles.map((file) => ({
        name: file.name,
        path: file.path,
        hasSlsaKeywords: file.hasSlsaKeywords,
        hasSigstoreKeywords: file.hasSigstoreKeywords,
        hasAttestation: file.hasAttestation,
        hasBuildStep: file.hasBuildStep,
        hasCheckout: file.hasCheckout,
        hasSbomKeyword: file.hasSbomKeyword,
      })),
      sbomArtifacts,
      releaseAssets,
      slsaClassification,
    },
  };
}
