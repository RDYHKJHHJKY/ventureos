import https from "node:https";

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

export async function fetchGitHubRepo(owner, repo) {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  return new Promise((resolve, reject) => {
    const req = https.get(endpoint, {
      headers: {
        "User-Agent": "ventureos-spr",
        Accept: "application/vnd.github+json",
      },
    }, (res) => {
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

export function normalizeGitHubMetadata(raw, overrides = {}) {
  const scannedAt = overrides.scannedAt || new Date().toISOString();
  const lastCommitDate = raw.pushed_at || raw.updated_at || null;
  const parsedLastCommit = parseIsoDate(lastCommitDate);
  const now = new Date(scannedAt);
  const evidenceAgeDays = parsedLastCommit ? Math.max(0, Math.floor((now.getTime() - parsedLastCommit.getTime()) / (1000 * 60 * 60 * 24))) : 0;
  const freshnessScore = computeFreshnessScore(scannedAt, lastCommitDate);
  const isStale = evidenceAgeDays > 30;
  const isLowActivity = toNumber(raw.subscribers_count, 0) < 3 || evidenceAgeDays > 90;
  const isUnmaintained = evidenceAgeDays > 180 || toNumber(raw.open_issues_count, 0) > 50;

  return {
    type: "github",
    title: `${raw.full_name || overrides.repo || "GitHub repository"} metadata`,
    summary: `GitHub repository metadata for ${raw.full_name || overrides.repo || "repository"}.`,
    source: "github",
    uri: raw.html_url || overrides.url || null,
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
      commitCountLast30Days: toNumber(raw.commit_count_last_30_days, 0),
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
    }),
    mimeType: "application/json",
  };
}
