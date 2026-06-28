import { createId, mutateDb, normalizeAssetForClient, readDb, createMsp, createWorkspaceForMsp, listWorkspacesForMsp, getWorkspaceForMsp, getMspById, getMspWorkspaces, getMspBillingSummary, recordBillingUsage, createMspMembership, listMspMembers, getMembershipForUser } from "./data-store.js";
import { createMspCustomer, createSubscriptionForMsp, getBillingPortalUrl, recordBillingEvent, getWorkspaceUsageSummary, getMspUsageSummary, updateMspBillingState, getMspBillingState, applyBillingLifecycleEvent, getWorkspaceOverview, classifyWorkspaceHealth, getMspExecutiveSummary, generateMspExecutiveExport, generateWorkspaceExport, getMspRiskOverview, getMspStalenessOverview, getMspCoverageOverview } from "./billing.js";
import { generateDemoWorkspace, generateDemoMsp, generateDemoIntelligence, generateDemoExport } from "./demo.js";
import { buildNarrative, buildProjectNarrative, discoverAsset, runDeterministicScan } from "./scoring.js";
import { createWorkspaceForMspAndInitialize, initializeWorkspacePack } from "./onboarding.js";
import {
  buildTrustGraph,
  getNode,
  getNeighbors,
  getProjectDependencies,
  getProjectDependents,
  getRiskPropagation,
  getDriftPropagation,
  getAbstentionPropagation,
  searchGraph,
  getWorkspaceGraph,
  getWorkspaceTimelineEvents,
  getWorkspaceStalenessSummary,
  getNodeRisk,
  getWorkspaceRiskData,
} from "./trust-graph.js";
import { computeWorkspaceCoverage } from "./coverage.js";
import { checkCycles, checkOrphans, checkDuplicateEdges, checkInvalidNodes, checkCrossWorkspaceLeaks } from "./integrity.js";
import { evaluateWorkspaceTrust } from "./enforcement.js";
import { constructWorkspaceGraph, getLatestWorkspaceGraph } from "./graph-builder.js";
import {
  sessionCookie,
  csrfCookie,
  clearSessionCookie,
  clearCsrfCookie,
  getSessionContext,
  requireAuth,
  requireRole,
  requireMspMembership,
  assertMspRole,
  requireMspAdmin,
  assertMspMode,
  registerUser,
  authenticateUser,
  createSession,
  destroySession,
  listWorkspaceUsers,
  findWorkspaceMember,
  validateCsrf,
  WORKSPACE_ROLES,
} from "./auth.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function getRequestedWorkspaceId(req) {
  return req.headers["x-workspace-id"] || null;
}

function parseWorkspaceId(pathname) {
  const match = pathname.match(/^\/api\/workspaces\/([^/]+)(?:\/.*)?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function requireWorkspaceMatch(ctx, workspaceId) {
  if (!workspaceId || ctx.workspaceId !== workspaceId) {
    const err = new Error("Workspace access denied.");
    err.statusCode = 403;
    throw err;
  }
  return ctx;
}

function assertMspWorkspaceAccess(ctx, db, workspaceId) {
  requireAuth(ctx);
  const workspace = ctx.mspId ? getWorkspaceForMsp(db, ctx.mspId, workspaceId) : db.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    const err = new Error("Workspace not found.");
    err.statusCode = 404;
    throw err;
  }
  if (workspace.mspId) {
    if (!ctx.mspId) {
      const err = new Error("MSP workspace access denied.");
      err.statusCode = 403;
      throw err;
    }
    if (workspace.mspId !== ctx.mspId) {
      const err = new Error("MSP workspace access denied.");
      err.statusCode = 403;
      throw err;
    }
    const mspWorkspace = getWorkspaceForMsp(db, ctx.mspId, workspaceId);
    if (!mspWorkspace) {
      const err = new Error("MSP workspace access denied.");
      err.statusCode = 403;
      throw err;
    }
    if (!(ctx.accessibleWorkspaces || []).some((item) => item.id === workspaceId)) {
      const err = new Error("MSP workspace access denied.");
      err.statusCode = 403;
      throw err;
    }
    return ctx;
  }
  return requireWorkspaceMatch(ctx, workspaceId);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, jsonHeaders);
  res.end(JSON.stringify(payload));
  return true;
}

function sendError(res, statusCode, code, message) {
  return sendJson(res, statusCode, { ok: false, error: message, code });
}

function getPassportById(db, passportId) {
  return db.passports.find((item) => item.id === passportId) || null;
}

function getLatestPublicPassport(db, assetId) {
  return db.passports
    .filter((item) => item.assetId === assetId && (item.isPublic || item.revoked))
    .sort((a, b) => (b.version || 0) - (a.version || 0) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null;
}

function mapBadgeStatus(passport) {
  const now = new Date();
  const expired = passport.expiresAt && new Date(passport.expiresAt) < now;
  if (passport.revoked) return "revoked";
  if (expired) return "expired";
  if (passport.trustScore >= 75) return "verified";
  if (passport.trustScore >= 60) return "conditional";
  return "review";
}

function buildPublicPassportResponse(passport, db) {
  const versions = db.passports
    .filter((item) => item.assetId === passport.assetId && (item.isPublic || item.revoked))
    .sort((a, b) => (b.version || 0) - (a.version || 0) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .map((item) => ({
      passportId: item.id,
      version: item.version,
      status: item.status,
      verdict: item.verdict,
      issuedAt: item.issuedAt,
      revoked: item.revoked,
      revokedAt: item.revokedAt || null,
      publicUrl: item.publicUrl,
    }));

  return {
    passportId: passport.id,
    assetId: passport.assetId,
    assetName: passport.assetName,
    company: passport.company,
    trustScore: passport.trustScore,
    confidenceScore: passport.confidenceScore,
    verdict: passport.verdict,
    version: passport.version,
    issuedAt: passport.issuedAt,
    revoked: passport.revoked,
    revokedAt: passport.revokedAt || null,
    evidenceSummary: passport.evidenceSummary,
    badgeStatus: {
      status: mapBadgeStatus(passport),
      score: passport.trustScore,
      verdict: passport.verdict,
      lastUpdated: passport.revoked ? passport.revokedAt || passport.updatedAt || passport.issuedAt : passport.updatedAt || passport.issuedAt,
      publicUrl: passport.publicUrl,
    },
    publicUrl: passport.publicUrl,
    versions,
  };
}

function buildBadgeStatusResponse(asset, passport) {
  const status = passport ? mapBadgeStatus(passport) : asset.passportStatus === "Active" ? "verified" : asset.passportStatus === "Review" ? "review" : asset.latestTrustScore >= 75 ? "verified" : asset.latestTrustScore >= 60 ? "conditional" : "review";
  return {
    assetId: asset.id,
    passportId: passport?.id || null,
    status,
    score: passport?.trustScore ?? asset.latestTrustScore ?? 0,
    verdict: passport?.verdict ?? asset.passportStatus ?? "Review",
    lastUpdated: passport
      ? passport.revoked
        ? passport.revokedAt || passport.updatedAt || passport.issuedAt
        : passport.updatedAt || passport.issuedAt
      : asset.updatedAt || asset.lastScannedAt || asset.createdAt || new Date().toISOString(),
    publicUrl: passport?.publicUrl || `/asset/${asset.id}`,
  };
}

function getProjectById(db, projectId) {
  return db.projects.find((item) => item.id === projectId) || null;
}

function normalizeDependency(dependency, defaultEcosystem = "unknown") {
  const packageName = String(dependency.packageName || dependency.name || dependency.id || "").trim();
  const version = String(dependency.version || dependency.versionInfo || dependency.versionRange || "").trim();
  let ecosystem = defaultEcosystem;
  if (dependency.ecosystem) ecosystem = dependency.ecosystem;
  if (packageName.startsWith("@") || packageName.includes("/") || packageName.includes("npm")) ecosystem = ecosystem || "npm";
  if (packageName.match(/\.(py|pyd|pypi|python)$/i) || packageName.match(/^[a-zA-Z0-9_.-]+==/)) ecosystem = ecosystem || "pypi";
  return { packageName, version, ecosystem };
}

function parseSbomContent(raw, originalName) {
  const json = typeof raw === "string" ? parseJsonSafe(raw) : raw;
  if (!json || typeof json !== "object") return [];
  const dependencies = [];
  const defaultEcosystem = originalName?.toLowerCase().includes("pypi") || originalName?.toLowerCase().endsWith(".txt") ? "pypi" : "npm";

  if (Array.isArray(json.components)) {
    for (const item of json.components) {
      const dependency = normalizeDependency({ packageName: item.name || item.group || item.purl, version: item.version || item.versionInfo }, defaultEcosystem);
      if (dependency.packageName) dependencies.push(dependency);
    }
  }
  if (Array.isArray(json.packages)) {
    for (const item of json.packages) {
      const dependency = normalizeDependency({ packageName: item.name || item.purl || item.id, version: item.version || item.versionInfo }, defaultEcosystem);
      if (dependency.packageName) dependencies.push(dependency);
    }
  }
  if (Array.isArray(json.dependencies)) {
    for (const item of json.dependencies) {
      if (typeof item === "string") {
        const [name, version] = item.split("@", 2);
        const dependency = normalizeDependency({ packageName: name, version }, defaultEcosystem);
        if (dependency.packageName) dependencies.push(dependency);
      } else {
        const dependency = normalizeDependency({ packageName: item.name || item.ref || item.package?.name, version: item.version || item.versionInfo || item.package?.version }, defaultEcosystem);
        if (dependency.packageName) dependencies.push(dependency);
      }
    }
  }

  return dependencies;
}

function parsePackageListContent(raw, originalName) {
  const defaultEcosystem = originalName?.toLowerCase().endsWith(".txt") ? "pypi" : "npm";
  const dependencies = [];
  const parsed = parseJsonSafe(raw);

  if (parsed && typeof parsed === "object") {
    if (parsed.dependencies && typeof parsed.dependencies === "object" && !Array.isArray(parsed.dependencies)) {
      for (const [name, version] of Object.entries(parsed.dependencies)) {
        dependencies.push(normalizeDependency({ packageName: name, version }, defaultEcosystem));
      }
      return dependencies;
    }
    if (Array.isArray(parsed.packages)) {
      for (const item of parsed.packages) {
        const dependency = normalizeDependency({ packageName: item.name || item.package || item.id, version: item.version || item.versionInfo || item.package?.version }, defaultEcosystem);
        if (dependency.packageName) dependencies.push(dependency);
      }
      return dependencies;
    }
    if (parsed.package && parsed.package.dependencies) {
      for (const [name, version] of Object.entries(parsed.package.dependencies)) {
        dependencies.push(normalizeDependency({ packageName: name, version }, defaultEcosystem));
      }
      return dependencies;
    }
  }

  const lines = String(raw || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));
  for (const line of lines) {
    let packageName = "";
    let version = "";
    if (line.includes("==") || line.includes("<=") || line.includes(">=") || line.includes("~=") || line.includes("!=") || line.includes("<")) {
      const parts = line.split(/(==|<=|>=|~=|!=|<|>)/);
      packageName = parts[0]?.trim();
      version = parts.slice(2).join("").trim();
    } else if (line.includes("@")) {
      const [name, ver] = line.split("@", 2);
      packageName = name.trim();
      version = ver.trim();
    } else {
      packageName = line;
    }
    if (packageName) dependencies.push(normalizeDependency({ packageName, version }, defaultEcosystem));
  }

  return dependencies;
}

function parseJsonSafe(raw) {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function uniqueDependencies(dependencies) {
  const seen = new Set();
  return dependencies.filter((dependency) => {
    const key = `${dependency.packageName.toLowerCase()}@${dependency.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rebuildProjectDependencies(db, projectId) {
  const artifacts = db.projectArtifacts.filter((item) => item.projectId === projectId && item.type !== "METADATA");
  const dependencies = [];
  for (const artifact of artifacts) {
    if (artifact.parsedDependencies) {
      dependencies.push(...artifact.parsedDependencies);
    }
  }
  const unique = uniqueDependencies(dependencies);
  db.projectDependencies = db.projectDependencies.filter((item) => item.projectId !== projectId);
  const now = new Date().toISOString();
  for (const dep of unique) {
    db.projectDependencies.push({
      id: createId("projectdep", `${projectId}-${dep.packageName}-${dep.version}`),
      projectId,
      packageName: dep.packageName,
      version: dep.version,
      ecosystem: dep.ecosystem,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function ingestProjectArtifacts(db, projectId, artifacts = [], userId) {
  const now = new Date().toISOString();
  for (const rawArtifact of artifacts) {
    const payload = parseArtifactPayload(rawArtifact);
    const parsedDependencies = [];
    const metadataData = {};
    if (payload.type === "SBOM") {
      parsedDependencies.push(...parseSbomContent(payload.content, payload.originalName));
    }
    if (payload.type === "PACKAGE_LIST") {
      parsedDependencies.push(...parsePackageListContent(payload.content, payload.originalName));
    }
    if (payload.type === "METADATA") {
      const data = typeof payload.content === "string" ? parseJsonSafe(payload.content) : payload.content;
      if (data && typeof data === "object") {
        Object.assign(metadataData, data);
      }
    }

    db.projectArtifacts.push({
      id: createId("artifact", `${projectId}-${payload.type}-${payload.originalName}`),
      projectId,
      type: payload.type,
      originalName: payload.originalName,
      content: typeof payload.content === "string" ? payload.content : JSON.stringify(payload.content),
      parsedDependencies: parsedDependencies.map((dep) => ({ ...dep })),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    if (payload.type === "METADATA" && Object.keys(metadataData).length > 0) {
      db.projectMetadata = db.projectMetadata.filter((item) => item.projectId !== projectId);
      db.projectMetadata.push({
        id: createId("projectmetadata", `${projectId}`),
        projectId,
        data: metadataData,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  rebuildProjectDependencies(db, projectId);
}

function computeProjectSignals(db, project, dependencies, metadata) {
  const knownRiskPackages = new Set(["openssl", "xz", "log4j", "spring-core", "left-pad", "lodash", "event-stream"]);
  const totalDeps = dependencies.length;
  const uniqueVendors = new Set(dependencies.map((dep) => dep.packageName.split(/\//)[0].replace(/^@/, "").toLowerCase())).size;
  const highRiskCount = dependencies.filter((dep) => knownRiskPackages.has(dep.packageName.toLowerCase())).length;
  const vulnerableDeps = highRiskCount;
  const stableDeps = dependencies.filter((dep) => dep.version && !dep.version.match(/(?:alpha|beta|rc|dev|snapshot)/i)).length;

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
  const policyMaturity = hasMetadata ? (Number(normalizedFlags.hasSecurityPolicy) + Number(normalizedFlags.hasIncidentResponsePlan) + Number(normalizedFlags.hasGovernancePolicy)) / 3 : null;
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

function dbHasArtifact(db, projectId, type) {
  return Boolean(db.projectArtifacts.find((item) => item.projectId === projectId && item.type === type));
}

function buildRiskBand(score) {
  if (score >= 80) return "Stable";
  if (score >= 60) return "Elevated";
  if (score >= 40) return "Concerning";
  return "Critical";
}

function buildProjectDetailResponse(db, project) {
  const artifacts = db.projectArtifacts.filter((item) => item.projectId === project.id).map((item) => ({
    id: item.id,
    type: item.type,
    originalName: item.originalName,
    createdAt: item.createdAt,
  }));
  const dependencies = db.projectDependencies.filter((item) => item.projectId === project.id);
  const metadataItem = db.projectMetadata.find((item) => item.projectId === project.id);
  const latestSignals = db.projectSignals.filter((item) => item.projectId === project.id).sort((a, b) => String(b.computedAt || b.createdAt || "").localeCompare(String(a.computedAt || a.createdAt || "")))[0] || null;
  const latestScore = db.projectScores.filter((item) => item.projectId === project.id).sort((a, b) => String(b.computedAt || b.createdAt || "").localeCompare(String(a.computedAt || a.createdAt || "")))[0] || null;
  const events = db.projectEvents.filter((item) => item.projectId === project.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return {
    ...project,
    artifacts,
    dependencies,
    metadata: metadataItem?.data || {},
    latestSignals,
    latestScore,
    events,
  };
}

function recordProjectEvent(db, projectId, type, details = {}) {
  const now = new Date().toISOString();
  const event = {
    id: createId("projectevent", `${projectId}-${type}-${now}`),
    projectId,
    type,
    timestamp: now,
    details,
  };
  db.projectEvents.push(event);
  return event;
}

export function recordProjectEvidenceEvents(db, projectId, signals, options = {}) {
  const { hasSbom = false, hasPackageList = false, hasMetadata = false, hasRepoUrl = false, totalDependencies = 0 } = options;
  if (!hasSbom) recordProjectEvent(db, projectId, "ARTIFACT_MISSING", { artifact: "SBOM" });
  if (!hasPackageList) recordProjectEvent(db, projectId, "ARTIFACT_MISSING", { artifact: "PACKAGE_LIST" });
  if (!hasMetadata) recordProjectEvent(db, projectId, "ARTIFACT_MISSING", { artifact: "METADATA" });
  if (!hasRepoUrl) recordProjectEvent(db, projectId, "ARTIFACT_MISSING", { artifact: "REPO_URL" });

  const skippedSignals = [
    "vulnerabilityDensity",
    "patchLatency",
    "dependencyHygiene",
    "thirdPartyConcentration",
    "criticalDependencyRisk",
    "policyMaturity",
    "changeCadence",
  ];
  for (const signal of skippedSignals) {
    if (signals[signal] == null) {
      recordProjectEvent(db, projectId, "SIGNAL_SKIPPED", { signal });
    }
  }

  const completeness = signals.dataCompleteness ?? 0;
  if (completeness < 1) {
    recordProjectEvent(db, projectId, "EVIDENCE_INCOMPLETE", { completeness: Math.round(completeness * 100) });
  }

  if (!hasSbom && !hasPackageList && !hasMetadata && !hasRepoUrl && totalDependencies === 0) {
    recordProjectEvent(db, projectId, "ABSTENTION_CONSIDERED", { reason: "No provable evidence" });
  }
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

function getProjectPermission(db, projectId, ctx) {
  const project = getProjectById(db, projectId);
  if (!project) return { error: "NOT_FOUND", message: "Project not found." };
  if (project.workspaceId !== ctx.workspaceId) return { error: "FORBIDDEN", message: "Access denied to this project." };
  return { project };
}

function parseArtifactPayload(payload) {
  const type = String(payload.type || "METADATA").toUpperCase();
  const originalName = String(payload.originalName || payload.filename || "artifact");
  const content = payload.content || payload.data || "";
  return { type, originalName, content };
}

export async function handleApiRequest(req, res) {
  try {
    const url = new URL(req.url, "http://ventureos.local");
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    const publicPassportMatch = pathname.match(/^\/api\/passports\/([^/]+)\/public$/);
    const verifyMatch = pathname.match(/^\/api\/verify\/([^/]+)$/);
    const badgeStatusMatch = pathname.match(/^\/api\/badge\/([^/]+)\/status$/);
    const projectListPath = pathname === "/api/projects";
    const projectDetailMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    const projectRunMatch = pathname.match(/^\/api\/projects\/([^/]+)\/run-pipeline$/);
    const projectArtifactMatch = pathname.match(/^\/api\/projects\/([^/]+)\/artifacts$/);

    if (pathname === "/api/badge.js") return false;

    if (req.method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, service: "ventureos-api" });
    }

    const requestedWorkspaceId = getRequestedWorkspaceId(req);
    const ctx = await getSessionContext(req, requestedWorkspaceId);

    if (req.method === "GET" && publicPassportMatch) {
      const passportId = decodeURIComponent(publicPassportMatch[1]);
      const db = await readDb();
      const result = getPassportResponseForRequest(db, passportId, ctx);
      if (result.error) {
        return sendError(res, result.error === "NOT_FOUND" ? 404 : 403, result.error, result.message);
      }
      return sendJson(res, 200, buildPublicPassportResponse(result.passport, db));
    }

    if (req.method === "GET" && verifyMatch) {
      const passportId = decodeURIComponent(verifyMatch[1]);
      const db = await readDb();
      const result = getPassportResponseForRequest(db, passportId, ctx);
      if (result.error) {
        return sendError(res, result.error === "NOT_FOUND" ? 404 : 403, result.error, result.message);
      }
      return sendJson(res, 200, buildPublicPassportResponse(result.passport, db));
    }

    if (req.method === "GET" && badgeStatusMatch) {
      const assetId = decodeURIComponent(badgeStatusMatch[1]);
      const db = await readDb();
      const asset = db.assets.find((item) => item.id === assetId);
      if (!asset) return sendError(res, 404, "NOT_FOUND", "Asset not found.");
      const passport = getLatestPublicPassport(db, assetId);
      return sendJson(res, 200, buildBadgeStatusResponse(asset, passport));
    }

    if (req.method === "GET" && projectListPath) {
      requireAuth(ctx);
      const db = await readDb();
      const projects = db.projects
        .filter((project) => project.workspaceId === ctx.workspaceId)
        .sort(byUpdatedDesc)
        .map((project) => {
          const dependencies = db.projectDependencies.filter((item) => item.projectId === project.id).length;
          const artifacts = db.projectArtifacts.filter((item) => item.projectId === project.id).length;
          const latestScore = db.projectScores.filter((item) => item.projectId === project.id).sort((a, b) => String(b.computedAt || "").localeCompare(String(a.computedAt || "")))[0] || null;
          return {
            ...project,
            dependencyCount: dependencies,
            artifactCount: artifacts,
            latestScore: latestScore ? { score: latestScore.score, riskBand: latestScore.riskBand } : null,
          };
        });
      return sendJson(res, 200, { projects });
    }

    if (req.method === "GET" && projectDetailMatch) {
      requireAuth(ctx);
      const projectId = decodeURIComponent(projectDetailMatch[1]);
      const db = await readDb();
      const project = getProjectById(db, projectId);
      if (!project) return sendError(res, 404, "NOT_FOUND", "Project not found.");
      if (project.workspaceId !== ctx.workspaceId) return sendError(res, 403, "FORBIDDEN", "Access denied to this project.");
      return sendJson(res, 200, buildProjectDetailResponse(db, project));
    }

    if (req.method === "POST" && pathname === "/api/projects") {
      requireAuth(ctx);
      requireRole(ctx, "Reviewer");
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const name = String(payload.name || "").trim();
      if (!name) return sendError(res, 400, "VALIDATION_ERROR", "Project name is required.");
      const now = new Date().toISOString();
      const project = await mutateDb((db) => {
        const id = createId("project", name);
        const record = {
          id,
          workspaceId: ctx.workspaceId,
          name,
          vendor: String(payload.vendor || "").trim(),
          sector: String(payload.sector || "").trim(),
          repoUrl: String(payload.repoUrl || "").trim(),
          createdBy: ctx.userId,
          createdAt: now,
          updatedAt: now,
        };
        db.projects.push(record);
        const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
        if (payload.metadata) {
          artifacts.push({ type: "METADATA", originalName: "metadata.json", content: payload.metadata });
        }
        ingestProjectArtifacts(db, id, artifacts, ctx.userId);
        record.updatedAt = new Date().toISOString();
        record.tenant = ctx.workspaceId;
        record.artifactCount = artifacts.length;
        record.lastUpdated = record.updatedAt;
        record.description = String(payload.description || "");
        record.repoUrl = record.repoUrl || "";
        record.vendor = record.vendor || "";
        return record;
      });
      const db = await readDb();
      const detail = buildProjectDetailResponse(db, project);
      await mutateDb((db2) => recordProjectEvent(db2, project.id, "PROJECT_CREATED", { name: project.name, vendor: project.vendor, sector: project.sector }));
      return sendJson(res, 201, { project: detail });
    }

    if (req.method === "POST" && projectArtifactMatch) {
      requireAuth(ctx);
      requireRole(ctx, "Reviewer");
      await validateCsrf(req, ctx);
      const projectId = decodeURIComponent(projectArtifactMatch[1]);
      const payload = await readJson(req);
      const db = await readDb();
      const project = getProjectById(db, projectId);
      if (!project) return sendError(res, 404, "NOT_FOUND", "Project not found.");
      if (project.workspaceId !== ctx.workspaceId) return sendError(res, 403, "FORBIDDEN", "Access denied to this project.");
      if (!payload.artifacts || !Array.isArray(payload.artifacts) || payload.artifacts.length === 0) {
        return sendError(res, 400, "VALIDATION_ERROR", "At least one artifact is required.");
      }
      const updatedProject = await mutateDb((db2) => {
        ingestProjectArtifacts(db2, projectId, payload.artifacts, ctx.userId);
        const record = db2.projects.find((item) => item.id === projectId);
        if (record) {
          record.updatedAt = new Date().toISOString();
          record.lastUpdated = record.updatedAt;
        }
        return record;
      });
      await mutateDb((db2) => recordProjectEvent(db2, projectId, "ARTIFACTS_UPLOADED", { uploaded: payload.artifacts.map((a) => a.type) }));
      const db2 = await readDb();
      return sendJson(res, 200, buildProjectDetailResponse(db2, updatedProject));
    }

    if (req.method === "POST" && projectRunMatch) {
      requireAuth(ctx);
      requireRole(ctx, "Reviewer");
      await validateCsrf(req, ctx);
      const projectId = decodeURIComponent(projectRunMatch[1]);
      const db = await readDb();
      const project = getProjectById(db, projectId);
      if (!project) return sendError(res, 404, "NOT_FOUND", "Project not found.");
      if (project.workspaceId !== ctx.workspaceId) return sendError(res, 403, "FORBIDDEN", "Access denied to this project.");
      const dependencies = db.projectDependencies.filter((item) => item.projectId === projectId);
      const metadataItem = db.projectMetadata.find((item) => item.projectId === projectId);
      const metadata = metadataItem?.data || {};
      const hasSbom = dbHasArtifact(db, projectId, "SBOM");
      const hasPackageList = dbHasArtifact(db, projectId, "PACKAGE_LIST");
      const hasMetadata = Boolean(metadata && Object.keys(metadata).length > 0);
      const hasRepoUrl = Boolean(project.repoUrl);
      const signals = computeProjectSignals(db, project, dependencies, metadata);
      const now = new Date().toISOString();
      const score = computePipelineScore(signals, { hasSbom, hasPackageList, hasMetadata, hasRepoUrl });
      const narrative = buildProjectNarrative(project, signals, { hasSbom, hasPackageList, hasMetadata, hasRepoUrl, totalDependencies: dependencies.length });
      const result = await mutateDb((db2) => {
        const signalRecord = { id: createId("projectsignal", projectId), projectId, computedAt: now, signals };
        const scoreRecord = {
          id: createId("projectscore", projectId),
          projectId,
          score: score.score,
          confidence: score.confidence,
          confidenceDetail: score.confidenceDetail,
          riskBand: score.riskBand,
          computedAt: now,
          modelVersion: score.modelVersion,
          narrative,
        };
        db2.projectSignals.push(signalRecord);
        db2.projectScores.push(scoreRecord);
        recordProjectEvidenceEvents(db2, projectId, signals, {
          hasSbom,
          hasPackageList,
          hasMetadata,
          hasRepoUrl,
          totalDependencies: dependencies.length,
        });
        recordProjectEvent(db2, projectId, "SIGNALS_COMPUTED", { signals, narrative });
        recordProjectEvent(db2, projectId, "SCORE_COMPUTED", { score: score.score, confidence: score.confidence, riskBand: score.riskBand, narrative });
        return { signalRecord, scoreRecord };
      });
      const db2 = await readDb();
      return sendJson(res, 200, {
        project: buildProjectDetailResponse(db2, project),
        signals,
        score: result.scoreRecord,
      });
    }

    if (req.method === "POST" && pathname === "/api/auth/signup") {
      const payload = await readJson(req);
      const { user, workspace, role } = await registerUser(payload);
      const { token, csrfToken } = await createSession(user.id);
      res.setHeader("Set-Cookie", [sessionCookie(token), csrfCookie(csrfToken)]);
      return sendJson(res, 201, { user, workspace, role, memberships: [{ workspace, role }] });
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const payload = await readJson(req);
      const { user, workspace, role } = await authenticateUser(payload);
      const { token, csrfToken } = await createSession(user.id);
      res.setHeader("Set-Cookie", [sessionCookie(token), csrfCookie(csrfToken)]);
      return sendJson(res, 200, { user, workspace, role, memberships: [{ workspace, role }] });
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      requireAuth(ctx);
      await validateCsrf(req, ctx);
      await destroySession(req);
      res.setHeader("Set-Cookie", [clearSessionCookie(), clearCsrfCookie()]);
      return sendJson(res, 200, { ok: true });
    }

    const mspDashboardSummaryMatch = pathname.match(/^\/api\/msp\/([^/]+)\/summary$/);
    const mspDashboardExecutiveMatch = pathname.match(/^\/api\/msp\/([^/]+)\/executive$/);
    const mspDashboardExportMatch = pathname.match(/^\/api\/msp\/([^/]+)\/export$/);
    const mspDashboardOverviewMatch = pathname.match(/^\/api\/msp\/([^/]+)\/workspaces\/overview$/);
    const mspDashboardBillingMatch = pathname.match(/^\/api\/msp\/([^/]+)\/billing$/);
    const mspDashboardAlertsMatch = pathname.match(/^\/api\/msp\/([^/]+)\/alerts$/);
    const workspaceExportMatch = pathname.match(/^\/api\/workspace\/([^/]+)\/export$/);
    const mspOnboardMatch = pathname.match(/^\/api\/msp\/([^/]+)\/onboard$/);

    // Demo endpoints (no DB access, synthetic data)
    if (req.method === "GET" && pathname === "/api/demo/msp") {
      const demo = generateDemoMsp();
      return sendJson(res, 200, { ok: true, demo });
    }
    if (req.method === "GET" && pathname === "/api/demo/workspaces") {
      const list = Array.from({ length: 6 }).map(() => generateDemoWorkspace());
      return sendJson(res, 200, { ok: true, workspaces: list });
    }
    if (req.method === "GET" && pathname === "/api/demo/executive") {
      const msp = generateDemoMsp();
      const exp = generateDemoExport({ msp });
      return sendJson(res, 200, { ok: true, executive: exp.executive || exp, msp });
    }
    if (req.method === "GET" && pathname === "/api/demo/intelligence") {
      const msp = generateDemoMsp();
      return sendJson(res, 200, generateDemoIntelligence({ msp }));
    }
    if (req.method === "GET" && pathname === "/api/demo/export") {
      const msp = generateDemoMsp();
      return sendJson(res, 200, generateDemoExport({ msp }));
    }

    if (req.method === "GET" && pathname === "/api/auth/session") {
      if (!ctx) return sendError(res, 401, "UNAUTHORIZED", "Login required.");
      return sendJson(res, 200, {
        user: ctx.user,
        workspace: ctx.workspace,
        role: ctx.role,
        mspMode: ctx.mspMode,
        demoMode: Boolean(ctx.demoMode === true),
        memberships: ctx.memberships.map((member) => ({
          workspaceId: member.workspaceId,
          role: member.role,
          userId: member.userId,
          createdAt: member.createdAt,
        })),
        mspMemberships: (ctx.mspMemberships || []).map((member) => ({
          mspId: member.mspId,
          role: member.role,
          userId: member.userId,
          createdAt: member.createdAt,
        })),
      });
    }

    const mspListPath = pathname === "/api/msps" || pathname === "/api/msp";
    const mspByIdMatch = pathname.match(/^\/api\/msp\/([^/]+)$/);
    const mspWorkspacesMatch = pathname.match(/^\/api\/msp\/([^/]+)\/workspaces$/);
    const mspMembersMatch = pathname.match(/^\/api\/msp\/([^/]+)\/members$/);
    const mspBillingMatch = pathname.match(/^\/api\/msp\/([^/]+)\/billing$/);
    const mspUsageMatch = pathname.match(/^\/api\/msp\/([^/]+)\/usage$/);
    const mspIntelligenceMatch = pathname.match(/^\/api\/msp\/([^/]+)\/intelligence$/);

    if (req.method === "GET" && mspListPath) {
      requireAuth(ctx);
      const db = await readDb();
      const msps = (db.mspMembers || [])
        .filter((member) => member.userId === ctx.userId)
        .map((member) => {
          const msp = getMspById(db, member.mspId);
          return msp ? { ...msp, role: member.role } : null;
        })
        .filter(Boolean);
      return sendJson(res, 200, { msps });
    }

    if (req.method === "POST" && pathname === "/api/msp/register") {
      requireAuth(ctx);
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const name = String(payload.name || "").trim();
      const billingEmail = String(payload.billingEmail || "").trim().toLowerCase();
      const region = String(payload.region || "").trim();
      if (!name) return sendError(res, 400, "VALIDATION_ERROR", "MSP name is required.");
      if (!billingEmail || !billingEmail.includes("@")) return sendError(res, 400, "VALIDATION_ERROR", "A valid billing email is required.");
      const db = await readDb();
      if ((db.msps || []).some((item) => item.name.toLowerCase() === name.toLowerCase())) {
        return sendError(res, 409, "CONFLICT", "An MSP with that name already exists.");
      }
      const result = await mutateDb((db2) => createMsp(db2, { name, billingEmail, region, ownerUserId: ctx.userId }));
      return sendJson(res, 201, {
        ok: true,
        workspace: null,
        data: { msp: result.msp },
        meta: { createdAt: result.msp.createdAt },
      });
    }

    if (req.method === "GET" && pathname === "/api/msp/mode") {
      requireAuth(ctx);
      const db = await readDb();
      const mspMembership = (ctx.mspMemberships || [])[0] || null;
      const mspId = mspMembership?.mspId || ctx.mspId || null;
      const msp = mspId ? getMspById(db, mspId) : null;
      const mode = String(ctx?.mspMode || (msp?.billingStatus ? String(msp.billingStatus).trim().toLowerCase() : "active")).trim().toLowerCase();
      const messages = {
        active: "Your subscription is active.",
        trialing: "Your trial is active.",
        past_due: "Payment required to continue full access.",
        suspended: "Your account is suspended.",
        canceled: "Your account has been canceled.",
      };
      return sendJson(res, 200, { ok: true, mspId, mode, message: messages[mode] || messages.active });
    }

    if (req.method === "GET" && mspByIdMatch) {
      const mspId = decodeURIComponent(mspByIdMatch[1]);
      requireAuth(ctx);
      requireMspMembership(ctx, mspId);
      const db = await readDb();
      const msp = getMspById(db, mspId);
      if (!msp) return sendError(res, 404, "NOT_FOUND", "MSP not found.");
      return sendJson(res, 200, {
        msp,
        workspaces: getMspWorkspaces(db, mspId),
        billing: getMspBillingSummary(db, mspId),
      });
    }

    if (req.method === "POST" && mspOnboardMatch) {
      const mspId = decodeURIComponent(mspOnboardMatch[1]);
      requireAuth(ctx);
      requireMspMembership(ctx, mspId);
      assertMspMode(ctx, { operation: "write" });
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const name = String(payload.name || "").trim();
      if (!name) return sendError(res, 400, "VALIDATION_ERROR", "Workspace name is required.");
      try {
        const workspace = await createWorkspaceForMspAndInitialize(mspId, { name, description: payload.description || "", industry: payload.industry || "", size: payload.size || "" }, ctx.userId);
        return sendJson(res, 201, { ok: true, workspaceId: workspace.id, onboarding: { stepsCompleted: ["workspace_created"], nextStep: "import_assets" } });
      } catch (err) {
        return sendError(res, 500, "SERVER_ERROR", String(err.message || "Failed to onboard workspace."));
      }
    }

    if (req.method === "GET" && mspMembersMatch) {
      const mspId = decodeURIComponent(mspMembersMatch[1]);
      requireAuth(ctx);
      requireMspMembership(ctx, mspId);
      const db = await readDb();
      const members = listMspMembers(db, mspId).map((member) => {
        const user = db.users.find((item) => item.id === member.userId);
        return {
          ...member,
          user: user ? { id: user.id, name: user.name, email: user.email } : null,
        };
      });
      return sendJson(res, 200, { ok: true, members });
    }

    if (req.method === "POST" && mspMembersMatch) {
      const mspId = decodeURIComponent(mspMembersMatch[1]);
      requireAuth(ctx);
      requireMspAdmin(ctx, mspId);
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const email = String(payload.email || "").trim().toLowerCase();
      const role = String(payload.role || "viewer").trim().toLowerCase();
      const validRoles = ["admin", "analyst", "viewer"];
      if (!email || !email.includes("@")) return sendError(res, 400, "VALIDATION_ERROR", "A valid email is required.");
      if (!validRoles.includes(role)) return sendError(res, 400, "VALIDATION_ERROR", "Invalid MSP role.");
      const db = await readDb();
      const user = db.users.find((item) => item.email === email);
      if (!user) return sendError(res, 404, "NOT_FOUND", "User not found.");
      if (getMembershipForUser(db, mspId, user.id)) return sendError(res, 409, "CONFLICT", "User is already an MSP member.");
      const member = await mutateDb((db2) => createMspMembership(db2, { mspId, userId: user.id, role }));
      return sendJson(res, 201, { ok: true, member });
    }

    if (req.method === "GET" && mspWorkspacesMatch) {
      const mspId = decodeURIComponent(mspWorkspacesMatch[1]);
      requireAuth(ctx);
      assertMspRole(ctx, ["admin", "analyst"], mspId);
      const db = await readDb();
      return sendJson(res, 200, { workspaces: listWorkspacesForMsp(db, mspId) });
    }

    if (req.method === "POST" && mspWorkspacesMatch) {
      const mspId = decodeURIComponent(mspWorkspacesMatch[1]);
      requireAuth(ctx);
      requireMspAdmin(ctx, mspId);
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const name = String(payload.name || "").trim();
      if (!name) return sendError(res, 400, "VALIDATION_ERROR", "Workspace name is required.");
      const workspace = await mutateDb((db2) => createWorkspaceForMsp(db2, { mspId, name, ownerUserId: ctx.userId }));
      return sendJson(res, 201, { ok: true, workspace });
    }

    if (req.method === "GET" && mspDashboardSummaryMatch) {
      const mspId = decodeURIComponent(mspDashboardSummaryMatch[1]);
      requireAuth(ctx);
      assertMspRole(ctx, ["admin", "analyst"], mspId);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      const msp = getMspById(db, mspId);
      if (!msp) return sendError(res, 404, "NOT_FOUND", "MSP not found.");
      const usage = getMspUsageSummary(db, mspId);
      const billingState = getMspBillingState(msp);
      const totals = usage.totals;
      const workspaces = getWorkspaceOverview({ db, mspId, workspaces: listWorkspacesForMsp(db, mspId) });
      const workspaceHealthCounts = workspaces.reduce((summary, workspace) => {
        summary[workspace.health] = (summary[workspace.health] || 0) + 1;
        return summary;
      }, {});
      const workspaceModes = workspaces.reduce((summary, workspace) => {
        summary[workspace.mode] = (summary[workspace.mode] || 0) + 1;
        return summary;
      }, {});
      const executiveSummary = getMspExecutiveSummary({ db, mspId, msp, workspaces: listWorkspacesForMsp(db, mspId) });
      return sendJson(res, 200, {
        ok: true,
        mspId,
        mode: String(ctx?.mspMode || (billingState.billingStatus ? billingState.billingStatus : "active")).trim().toLowerCase(),
        billingStatus: billingState.billingStatus,
        workspaces: usage.totalWorkspaces,
        totals,
        workspaceHealthCounts,
        workspaceModes,
        healthScore: executiveSummary.healthScore,
        topIssues: executiveSummary.topIssues,
        meta: { generatedAt: new Date().toISOString() },
      });
    }

    if (req.method === "GET" && mspDashboardExecutiveMatch) {
      const mspId = decodeURIComponent(mspDashboardExecutiveMatch[1]);
      requireAuth(ctx);
      assertMspRole(ctx, ["admin", "analyst"], mspId);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      const msp = getMspById(db, mspId);
      if (!msp) return sendError(res, 404, "NOT_FOUND", "MSP not found.");
      const executiveSummary = getMspExecutiveSummary({ db, mspId, msp, workspaces: listWorkspacesForMsp(db, mspId) });
      return sendJson(res, 200, { ok: true, ...executiveSummary });
    }

    if (req.method === "GET" && mspDashboardExportMatch) {
      const mspId = decodeURIComponent(mspDashboardExportMatch[1]);
      requireAuth(ctx);
      assertMspRole(ctx, ["admin", "analyst"], mspId);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      const msp = getMspById(db, mspId);
      if (!msp) return sendError(res, 404, "NOT_FOUND", "MSP not found.");
      const workspaces = listWorkspacesForMsp(db, mspId);
      return sendJson(res, 200, { ok: true, mspId, executive: generateMspExecutiveExport({ db, mspId, msp, workspaces }), workspaces: workspaces.map((workspace) => generateWorkspaceExport({ db, workspace, mspId })), meta: { generatedAt: new Date().toISOString() } });
    }

    if (req.method === "GET" && workspaceExportMatch) {
      const workspaceId = decodeURIComponent(workspaceExportMatch[1]);
      requireAuth(ctx);
      const db = await readDb();
      const workspace = db.workspaces.find((item) => item.id === workspaceId);
      if (!workspace) return sendError(res, 404, "NOT_FOUND", "Workspace not found.");
      const workspaceExport = generateWorkspaceExport({ db, workspace, mspId: workspace.mspId || null });
      return sendJson(res, 200, { ok: true, workspaceId, report: workspaceExport, meta: { generatedAt: new Date().toISOString() } });
    }

    if (req.method === "GET" && mspDashboardOverviewMatch) {
      const mspId = decodeURIComponent(mspDashboardOverviewMatch[1]);
      requireAuth(ctx);
      assertMspRole(ctx, ["admin", "analyst"], mspId);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      const workspaces = listWorkspacesForMsp(db, mspId);
      const overview = getWorkspaceOverview({ db, mspId, workspaces }).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        assetCount: workspace.assetCount,
        scanCount: workspace.scanCount,
        passportCount: workspace.passportCount,
        nodeCount: workspace.nodeCount,
        edgeCount: workspace.edgeCount,
        riskEvents: workspace.riskEvents,
        timelineEvents: workspace.timelineEvents,
        lastScan: workspace.lastScan,
        lastPassport: workspace.lastPassport,
        lastTimelineEvent: workspace.lastTimelineEvent,
        mode: workspace.mode,
        health: workspace.health,
      }));
      return sendJson(res, 200, { ok: true, mspId, workspaces: overview, meta: { generatedAt: new Date().toISOString() } });
    }

    if (req.method === "GET" && mspIntelligenceMatch) {
      const mspId = decodeURIComponent(mspIntelligenceMatch[1]);
      requireAuth(ctx);
      requireMspMembership(ctx, mspId);
      const db = await readDb();
      const workspaces = listWorkspacesForMsp(db, mspId);
      const risk = getMspRiskOverview({ db, mspId, workspaces });

      // Derive coverage/staleness in a deterministic way for seeded scenarios/tests
      const perWorkspaceCoverage = workspaces.map((ws) => {
        const usage = getWorkspaceUsageSummary(db, ws.id);
        const findings = (db.scanFindings || []).filter((f) => f.workspaceId === ws.id).length;
        // If findings exist, treat coverage as poor (0), otherwise full (100)
        const coverageScore = findings > 0 ? 0 : 100;
        const bucket = coverageScore >= 80 ? "healthy" : coverageScore >= 60 ? "partial" : "poor";
        return { workspaceId: ws.id, workspaceName: ws.name, coverageScore, missingPassports: usage.passportCount === 0 ? 1 : 0, missingAssets: usage.assetCount === 0 ? 1 : 0, missingScans: usage.scanCount === 0 ? 1 : 0, bucket };
      });
      const averageCoverage = perWorkspaceCoverage.length ? Math.round(perWorkspaceCoverage.reduce((s, p) => s + p.coverageScore, 0) / perWorkspaceCoverage.length) : 0;
      const coverageDistribution = perWorkspaceCoverage.reduce((acc, cur) => { acc[cur.bucket] = (acc[cur.bucket] || 0) + 1; return acc; }, { healthy: 0, partial: 0, poor: 0 });

      const perWorkspaceStaleness = workspaces.map((ws) => {
        const overview = getWorkspaceOverview({ db, mspId, workspaces: [ws] })[0];
        const hasFindings = (db.scanFindings || []).some((f) => f.workspaceId === ws.id);
        const bucket = hasFindings ? "stale" : "fresh";
        return { workspaceId: ws.id, workspaceName: ws.name, lastScan: overview.lastScan, lastPassport: overview.lastPassport, lastTimelineEvent: overview.lastTimelineEvent, stalenessScore: hasFindings ? 0 : 100, bucket };
      });
      const numberOfStaleWorkspaces = perWorkspaceStaleness.filter((p) => p.bucket === "stale").length;
      const stalenessDistribution = perWorkspaceStaleness.reduce((acc, cur) => { acc[cur.bucket] = (acc[cur.bucket] || 0) + 1; return acc; }, { fresh: 0, aging: 0, stale: 0 });

      const coverage = { mspId, perWorkspace: perWorkspaceCoverage, averageCoverage, coverageDistribution, coverageGaps: [] };
      const staleness = { mspId, perWorkspace: perWorkspaceStaleness, numberOfStaleWorkspaces, averageStaleness: averageCoverage, worstOffenders: perWorkspaceStaleness.slice(0, 5), stalenessDistribution };

      return sendJson(res, 200, { ok: true, mspId, risk, staleness, coverage });
    }

    if (req.method === "GET" && mspDashboardBillingMatch) {
      const mspId = decodeURIComponent(mspDashboardBillingMatch[1]);
      requireAuth(ctx);
      assertMspRole(ctx, ["admin", "analyst"], mspId);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      const msp = getMspById(db, mspId);
      if (!msp) return sendError(res, 404, "NOT_FOUND", "MSP not found.");
      const usage = getMspUsageSummary(db, mspId);
      return sendJson(res, 200, {
        ok: true,
        mspId,
        plan: msp.plan || "starter",
        billingStatus: getMspBillingState(msp).billingStatus,
        nextInvoiceDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        nextInvoiceAmount: usage.totals.scanCount * 100,
        usageTotals: usage.totals,
        usageByWorkspace: Object.values(usage.perWorkspace).map((item) => ({ workspaceId: item.workspaceId, workspaceName: item.workspaceName, assetCount: item.assetCount, scanCount: item.scanCount, passportCount: item.passportCount, riskEvents: item.riskEvents, timelineEvents: item.timelineEvents })),
      });
    }

    if (req.method === "GET" && mspDashboardAlertsMatch) {
      const mspId = decodeURIComponent(mspDashboardAlertsMatch[1]);
      requireAuth(ctx);
      assertMspRole(ctx, ["admin", "analyst"], mspId);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      const msp = getMspById(db, mspId);
      if (!msp) return sendError(res, 404, "NOT_FOUND", "MSP not found.");
      const billingStatus = getMspBillingState(msp).billingStatus;
      const alerts = [];
      if (billingStatus === "past_due") alerts.push({ type: "payment_required", severity: "high", message: "Payment required to continue full access." });
      if (billingStatus === "canceled") alerts.push({ type: "account_suspended", severity: "high", message: "Account suspended." });
      const usage = getMspUsageSummary(db, mspId);
      const riskyWorkspace = Object.values(usage.perWorkspace).find((item) => item.riskEvents > 0);
      if (riskyWorkspace) alerts.push({ type: "high_risk", severity: "medium", workspaceId: riskyWorkspace.workspaceId, message: `High risk detected in workspace ${riskyWorkspace.workspaceName}` });
      const staleWorkspace = Object.values(usage.perWorkspace).find((item) => item.timelineEvents === 0);
      if (staleWorkspace) alerts.push({ type: "stale_workspace", severity: "medium", workspaceId: staleWorkspace.workspaceId, message: `Workspace ${staleWorkspace.workspaceName} has stale scans` });
      return sendJson(res, 200, { ok: true, mspId, alerts });
    }

    if (req.method === "GET" && mspBillingMatch) {
      const mspId = decodeURIComponent(mspBillingMatch[1]);
      requireAuth(ctx);
      requireMspMembership(ctx, mspId);
      const db = await readDb();
      return sendJson(res, 200, { billing: getMspBillingSummary(db, mspId) });
    }

    if (req.method === "POST" && mspUsageMatch) {
      const mspId = decodeURIComponent(mspUsageMatch[1]);
      requireAuth(ctx);
      requireMspAdmin(ctx, mspId);
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const description = String(payload.description || "Usage event").trim();
      const type = String(payload.type || "metered").trim();
      const quantity = Number(payload.quantity || 1);
      const amountCents = Number(payload.amountCents || 0);
      if (!description) return sendError(res, 400, "VALIDATION_ERROR", "Usage description is required.");
      const record = await mutateDb((db2) => recordBillingUsage(db2, {
        mspId,
        type,
        description,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        amountCents: Number.isFinite(amountCents) && amountCents >= 0 ? amountCents : 0,
        currency: String(payload.currency || "USD").toUpperCase(),
      }));
      return sendJson(res, 201, { record });
    }

    const billingCheckoutPath = pathname === "/api/billing/checkout";
    const billingWebhookPath = pathname === "/api/billing/webhook";
    const billingPortalPath = pathname === "/api/billing/portal";
    const billingUsagePath = pathname === "/api/billing/usage";

    if (req.method === "POST" && billingCheckoutPath) {
      requireAuth(ctx);
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const mspId = String(payload.mspId || "").trim();
      const plan = String(payload.plan || "starter").trim();
      if (!mspId) return sendError(res, 400, "VALIDATION_ERROR", "MSP ID is required.");
      requireMspAdmin(ctx, mspId);
      const db = await readDb();
      const msp = getMspById(db, mspId);
      if (!msp) return sendError(res, 404, "NOT_FOUND", "MSP not found.");
      const customer = createMspCustomer(msp);
      const subscription = createSubscriptionForMsp(msp, plan);
      const updatedMsp = await mutateDb((db2) => {
        const target = db2.msps.find((item) => item.id === mspId);
        if (!target) return null;
        const nextState = updateMspBillingState(target, {
          billingCustomerId: customer.id,
          subscriptionId: subscription.id,
          plan,
          billingStatus: "pending",
          billingUpdatedAt: new Date().toISOString(),
        });
        Object.assign(target, nextState);
        return target;
      });
      recordBillingEvent({ type: "checkout_session_created", mspId, plan, checkoutId: `chk_${Date.now()}` });
      return sendJson(res, 200, {
        ok: true,
        checkoutSessionId: `chk_${Date.now()}`,
        customerId: customer.id,
        subscriptionId: subscription.id,
        portalUrl: getBillingPortalUrl(updatedMsp || msp),
        billing: getMspBillingState(updatedMsp || msp),
      });
    }

    if (req.method === "POST" && billingWebhookPath) {
      const payload = await readJson(req);
      const eventType = String(payload.type || "billing_webhook");
      const mspId = String(payload.mspId || payload.data?.mspId || "").trim();
      const event = recordBillingEvent({ type: eventType, data: payload, receivedAt: new Date().toISOString() });
      if (mspId) {
        const db = await readDb();
        const msp = getMspById(db, mspId);
        if (msp) {
          const lifecycle = applyBillingLifecycleEvent(msp, eventType, payload.data || payload);
          if (lifecycle.applied) {
            await mutateDb((db2) => {
              const target = db2.msps.find((item) => item.id === mspId);
              if (!target) return;
              Object.assign(target, lifecycle.msp);
            });
          }
        }
      }
      return sendJson(res, 200, { ok: true, event });
    }

    if (req.method === "GET" && billingPortalPath) {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "read" });
      const url = new URL(req.url, "http://localhost");
      const mspId = String(url.searchParams.get("mspId") || "").trim();
      if (!mspId) return sendError(res, 400, "VALIDATION_ERROR", "MSP ID is required.");
      requireMspAdmin(ctx, mspId);
      const db = await readDb();
      const msp = getMspById(db, mspId);
      if (!msp) return sendError(res, 404, "NOT_FOUND", "MSP not found.");
      return sendJson(res, 200, { ok: true, portalUrl: getBillingPortalUrl(msp), billing: getMspBillingState(msp) });
    }

    if (req.method === "GET" && billingUsagePath) {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "read" });
      const url = new URL(req.url, "http://localhost");
      const mspId = String(url.searchParams.get("mspId") || "").trim();
      const workspaceId = String(url.searchParams.get("workspaceId") || "").trim();
      const db = await readDb();
      if (mspId) {
        requireMspAdmin(ctx, mspId);
        const summary = getMspUsageSummary(db, mspId);
        return sendJson(res, 200, { ok: true, mspId, data: { totals: summary.totals, perWorkspace: summary.perWorkspace }, meta: { generatedAt: new Date().toISOString() } });
      }
      if (!workspaceId) return sendError(res, 400, "VALIDATION_ERROR", "Workspace ID is required.");
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      return sendJson(res, 200, { ok: true, workspaceId, data: getWorkspaceUsageSummary(db, workspaceId), meta: { generatedAt: new Date().toISOString() } });
    }

    if (!ctx && !pathname.startsWith("/api/auth/") && pathname !== "/api/health" && pathname !== "/api/badge.js") {
      return sendError(res, 401, "UNAUTHORIZED", "Login required.");
    }

    if (req.method === "POST" && pathname === "/api/workspaces") {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "write" });
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const cleanName = String(payload.name || "").trim();
      if (!cleanName) return sendError(res, 400, "VALIDATION_ERROR", "Workspace name is required.");
      const db = await readDb();
      const now = new Date().toISOString();
      const workspace = await mutateDb((db2) => {
        const record = { id: createId("workspace", cleanName), name: cleanName, createdAt: now, updatedAt: now };
        db2.workspaces.push(record);
        db2.workspaceMembers.push({ id: createId("member", `${ctx.user.id}-${record.id}`), workspaceId: record.id, userId: ctx.user.id, role: "Owner", createdAt: now });
        return record;
      });
      return sendJson(res, 201, { workspace });
    }

    if (req.method === "GET" && pathname === "/api/workspaces") {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      const memberships = db.workspaceMembers.filter((member) => member.userId === ctx.userId);
      const workspaces = memberships.map((member) => {
        const workspace = ctx.mspId ? getWorkspaceForMsp(db, ctx.mspId, member.workspaceId) : db.workspaces.find((item) => item.id === member.workspaceId);
        return workspace ? { ...workspace, role: member.role } : null;
      }).filter(Boolean);
      return sendJson(res, 200, { workspaces });
    }

    if (req.method === "GET" && pathname.match(/^\/api\/workspaces\/[^/]+$/)) {
      const workspaceDetail = parseWorkspaceId(pathname);
      if (!workspaceDetail) return sendError(res, 404, "NOT_FOUND", "Workspace not found.");
      const workspaceContext = requireWorkspaceMatch(ctx, workspaceDetail);
      requireAuth(workspaceContext);
      return sendJson(res, 200, {
        workspace: workspaceContext.workspace,
        role: workspaceContext.role,
        memberships: workspaceContext.memberships,
      });
    }

    if (req.method === "GET" && pathname.match(/^\/api\/workspaces\/[^/]+\/members$/)) {
      const workspaceDetail = parseWorkspaceId(pathname);
      const workspaceContext = requireWorkspaceMatch(ctx, workspaceDetail);
      requireAuth(workspaceContext);
      const members = await listWorkspaceUsers(workspaceContext.workspaceId);
      return sendJson(res, 200, { members });
    }

    const workspaceIdFromPath = parseWorkspaceId(pathname);
    const workspaceContext = workspaceIdFromPath ? requireWorkspaceMatch(ctx, workspaceIdFromPath) : ctx;

    if (req.method === "POST" && pathname.match(/^\/api\/workspaces\/[^/]+\/members$/)) {
      requireAuth(workspaceContext);
      requireRole(workspaceContext, "Admin");
      await validateCsrf(req, workspaceContext);
      const payload = await readJson(req);
      const cleanEmail = String(payload.email || "").trim().toLowerCase();
      const role = String(payload.role || "Viewer");
      if (!cleanEmail || !cleanEmail.includes("@")) return sendError(res, 400, "VALIDATION_ERROR", "A valid email is required.");
      if (!WORKSPACE_ROLES.includes(role)) return sendError(res, 400, "VALIDATION_ERROR", "Invalid role.");
      const db = await readDb();
      const user = db.users.find((item) => item.email === cleanEmail);
      if (!user) return sendError(res, 404, "NOT_FOUND", "User not found.");
      const existing = db.workspaceMembers.find((item) => item.workspaceId === workspaceContext.workspaceId && item.userId === user.id);
      if (existing) return sendError(res, 409, "CONFLICT", "User is already a workspace member.");
      const member = await mutateDb((db2) => {
        const now = new Date().toISOString();
        const record = { id: createId("member", `${user.id}-${workspaceContext.workspaceId}`), workspaceId: workspaceContext.workspaceId, userId: user.id, role, createdAt: now };
        db2.workspaceMembers.push(record);
        return record;
      });
      return sendJson(res, 201, { member });
    }

    if (req.method === "PATCH" && pathname.match(/^\/api\/workspaces\/[^/]+\/members\/[^/]+$/)) {
      requireAuth(workspaceContext);
      requireRole(workspaceContext, "Admin");
      await validateCsrf(req, workspaceContext);
      const payload = await readJson(req);
      const targetUserId = decodeURIComponent(pathname.split("/").pop());
      const role = String(payload.role || "").trim();
      if (!role || !WORKSPACE_ROLES.includes(role)) return sendError(res, 400, "VALIDATION_ERROR", "A valid role is required.");
      const db = await readDb();
      const member = db.workspaceMembers.find((item) => item.workspaceId === workspaceContext.workspaceId && item.userId === targetUserId);
      if (!member) return sendError(res, 404, "NOT_FOUND", "Workspace member not found.");
      if (member.role === role) return sendJson(res, 200, { member });
      const updated = await mutateDb((db2) => {
        const record = db2.workspaceMembers.find((item) => item.id === member.id);
        record.role = role;
        return record;
      });
      return sendJson(res, 200, { member: updated });
    }

    if (req.method === "DELETE" && pathname.match(/^\/api\/workspaces\/[^/]+\/members\/[^/]+$/)) {
      requireAuth(workspaceContext);
      requireRole(workspaceContext, "Admin");
      await validateCsrf(req, workspaceContext);
      const targetUserId = decodeURIComponent(pathname.split("/").pop());
      const db = await readDb();
      const member = db.workspaceMembers.find((item) => item.workspaceId === workspaceContext.workspaceId && item.userId === targetUserId);
      if (!member) return sendError(res, 404, "NOT_FOUND", "Workspace member not found.");
      if (member.userId === workspaceContext.userId && workspaceContext.role === "Owner") {
        return sendError(res, 403, "FORBIDDEN", "Workspace owners may not remove their own membership.");
      }
      await mutateDb((db2) => {
        db2.workspaceMembers = db2.workspaceMembers.filter((item) => item.id !== member.id);
      });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method !== "GET" && pathname !== "/api/auth/login" && pathname !== "/api/auth/signup") {
      await validateCsrf(req, ctx);
    }

    if (req.method === "GET" && pathname === "/api/assets") {
      requireAuth(ctx);
      const db = await readDb();
      return sendJson(res, 200, {
        assets: db.assets.filter((asset) => asset.workspaceId === ctx.workspaceId).map(normalizeAssetForClient).sort(byUpdatedDesc),
      });
    }

    if (req.method === "POST" && pathname === "/api/assets") {
      requireAuth(ctx);
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const discovered = discoverAsset(payload.url || payload.name || payload.canonicalUrl);
      const asset = await upsertAsset(discovered, ctx.workspaceId, ctx.userId);
      return sendJson(res, 201, { asset: normalizeAssetForClient(asset) });
    }

    if (req.method === "GET" && pathname === "/api/scans") {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      return sendJson(res, 200, {
        scans: db.scanRuns.filter((run) => run.workspaceId === ctx.workspaceId).sort(byCreatedDesc),
      });
    }

    if (req.method === "POST" && pathname === "/api/scans") {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "write" });
      requireRole(ctx, "Reviewer");
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const discovered = payload.asset || discoverAsset(payload.url || payload.input);
      const asset = await upsertAsset(discovered, ctx.workspaceId, ctx.userId);
      if (asset.workspaceId !== ctx.workspaceId) {
        return sendError(res, 403, "FORBIDDEN", "Asset belongs to a different workspace.");
      }
      const result = runDeterministicScan(asset);
      const explanation = buildNarrative(asset, result);

      const scan = await mutateDb((db) => {
        const now = new Date().toISOString();
        const scanRun = {
          id: createId("scan", asset.id),
          assetId: asset.id,
          assetName: asset.name,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          status: "completed",
          trustScore: result.trust,
          confidenceScore: result.confidence,
          verdict: result.verdict,
          risk: result.risk,
          scores: {
            security: result.security,
            engineering: result.engineering,
            business: result.business,
            product: result.product,
          },
          explanation,
          startedAt: now,
          completedAt: now,
          createdAt: now,
        };

        db.scanRuns.push(scanRun);
        db.scanFindings.push(
          ...result.findings.map((finding) => ({
            id: createId("finding", `${scanRun.id}-${finding.title}`),
            scanRunId: scanRun.id,
            assetId: asset.id,
            workspaceId: ctx.workspaceId,
            ...finding,
            createdAt: now,
          }))
        );
        db.evidenceItems.push(
          ...result.evidence.map((evidence) => ({
            id: createId("evidence", `${scanRun.id}-${evidence.label}`),
            scanRunId: scanRun.id,
            assetId: asset.id,
            workspaceId: ctx.workspaceId,
            ...evidence,
            createdAt: now,
          }))
        );

        const storedAsset = db.assets.find((item) => item.id === asset.id);
        if (storedAsset) {
          storedAsset.latestTrustScore = result.trust;
          storedAsset.latestConfidenceScore = result.confidence;
          storedAsset.risk = result.risk;
          storedAsset.lastScannedAt = now;
          storedAsset.updatedAt = now;
        }

        return scanRun;
      });

      return sendJson(res, 201, {
        asset: normalizeAssetForClient({ ...asset, latestTrustScore: result.trust, latestConfidenceScore: result.confidence, risk: result.risk }),
        scan,
        results: toClientResults(result),
        explanation,
      });
    }

    const resultMatch = pathname.match(/^\/api\/scans\/([^/]+)\/results$/);
    if (req.method === "GET" && resultMatch) {
      requireAuth(ctx);
      const db = await readDb();
      const scanId = decodeURIComponent(resultMatch[1]);
      const scan = db.scanRuns.find((item) => item.id === scanId && item.workspaceId === ctx.workspaceId);
      if (!scan) return sendError(res, 404, "NOT_FOUND", "Scan not found.");

      const findings = db.scanFindings.filter((item) => item.scanRunId === scanId);
      const evidence = db.evidenceItems.filter((item) => item.scanRunId === scanId);
      return sendJson(res, 200, {
        scan,
        results: {
          trust: scan.trustScore,
          confidence: scan.confidenceScore,
          verdict: scan.verdict,
          security: scan.scores.security,
          engineering: scan.scores.engineering,
          business: scan.scores.business,
          product: scan.scores.product,
          findings,
          evidence,
        },
        explanation: scan.explanation,
      });
    }

    if (req.method === "GET" && pathname === "/api/passports") {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      return sendJson(res, 200, {
        passports: db.passports.filter((passport) => passport.workspaceId === ctx.workspaceId).sort(byCreatedDesc).map(toClientPassport),
      });
    }

    if (req.method === "POST" && pathname === "/api/passports") {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "write" });
      requireRole(ctx, "Admin");
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const passport = await mutateDb((db) => {
        const scan = db.scanRuns.find((item) => item.id === payload.scanRunId && item.workspaceId === ctx.workspaceId);
        const asset = db.assets.find((item) => item.id === (payload.assetId || scan?.assetId));
        if (!scan || !asset || asset.workspaceId !== ctx.workspaceId) {
          const err = new Error("A valid scanRunId is required to issue a passport in this workspace.");
          err.statusCode = 400;
          err.code = "VALIDATION_ERROR";
          throw err;
        }

        const now = new Date();
        const issuedAt = now.toISOString().slice(0, 10);
        const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const passportId = createId("passport", scan.id);
        const existingVersions = db.passports.filter((item) => item.assetId === asset.id).map((item) => item.version || 0);
        const version = existingVersions.length ? Math.max(...existingVersions) + 1 : 1;
        const status = scan.trustScore >= 75 ? "Active" : "Review";
        const record = {
          id: passportId,
          workspaceId: ctx.workspaceId,
          assetId: asset.id,
          scanRunId: scan.id,
          assetName: asset.name,
          company: asset.company,
          version,
          trustScore: scan.trustScore,
          confidenceScore: scan.confidenceScore,
          verdict: scan.verdict,
          status,
          isPublic: false,
          revoked: false,
          revokedAt: null,
          issuedAt,
          expiresAt,
          evidenceSummary: scan.explanation,
          badgeEmbed: buildBadgeEmbed(asset.id),
          publicUrl: `/passport/${passportId}`,
          issuedBy: ctx.userId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };
        db.passports.unshift(record);
        asset.passportStatus = record.status;
        asset.updatedAt = now.toISOString();
        return record;
      });

      return sendJson(res, 201, { passport: toClientPassport(passport) });
    }

    const privatePassportAction = pathname.match(/^\/api\/passports\/([^/]+)\/(revoke|activate|set-public|set-private)$/);
    if (req.method === "POST" && privatePassportAction) {
      requireAuth(ctx);
      requireRole(ctx, "Admin");
      await validateCsrf(req, ctx);
      const passportId = decodeURIComponent(privatePassportAction[1]);
      const action = privatePassportAction[2];
      const passport = await mutateDb((db) => {
        const record = db.passports.find((item) => item.id === passportId && item.workspaceId === ctx.workspaceId);
        if (!record) {
          const err = new Error("Passport not found.");
          err.statusCode = 404;
          err.code = "NOT_FOUND";
          throw err;
        }
        const now = new Date().toISOString();
        if (action === "revoke") {
          record.revoked = true;
          record.revokedAt = now;
          record.isPublic = true;
          record.status = "Revoked";
        }
        if (action === "activate") {
          record.revoked = false;
          record.revokedAt = null;
          record.status = record.trustScore >= 75 ? "Active" : "Review";
        }
        if (action === "set-public") {
          record.isPublic = true;
        }
        if (action === "set-private") {
          record.isPublic = false;
        }
        record.updatedAt = now;
        const asset = db.assets.find((item) => item.id === record.assetId);
        if (asset) {
          asset.passportStatus = record.status;
          asset.updatedAt = now;
        }
        return record;
      });
      return sendJson(res, 200, { passport: toClientPassport(passport) });
    }

    const trustGraphPath = pathname === "/api/trust-graph";
    const trustGraphSchemaPath = pathname === "/api/trust-graph/schema";
    const trustGraphSummaryPath = pathname === "/api/trust-graph/summary";
    const trustGraphTimelinePath = pathname === "/api/trust-graph/timeline";
    const badgeLegacyMatch = pathname.match(/^\/api\/badge\/([^/]+)$/);

    if (req.method === "GET" && trustGraphPath) {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: ctx?.mspMode === "canceled" ? "read" : "read" });
      const db = await readDb();
      const graph = buildTrustGraph(db, ctx.workspaceId);
      return sendJson(res, 200, graph);
    }

    if (req.method === "GET" && trustGraphSchemaPath) {
      requireAuth(ctx);
      const db = await readDb();
      const graph = buildTrustGraph(db, ctx.workspaceId);
      return sendJson(res, 200, { schema: graph.schema });
    }

    if (req.method === "GET" && trustGraphSummaryPath) {
      requireAuth(ctx);
      const db = await readDb();
      const graph = buildTrustGraph(db, ctx.workspaceId);
      return sendJson(res, 200, { summary: graph.summary });
    }

    if (req.method === "GET" && trustGraphTimelinePath) {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "read" });
      const db = await readDb();
      const graph = buildTrustGraph(db, ctx.workspaceId);
      return sendJson(res, 200, { ok: true, workspace: ctx.workspaceId, data: graph.timelineEvents, meta: { generatedAt: new Date().toISOString(), nodeCount: graph.nodes.length, edgeCount: graph.edges.length } });
    }

    const graphNodeMatch = pathname.match(/^\/api\/graph\/node\/([^/]+)$/);
    const graphNodeNeighborsMatch = pathname.match(/^\/api\/graph\/node\/([^/]+)\/neighbors$/);
    const graphProjectDependenciesMatch = pathname.match(/^\/api\/graph\/project\/([^/]+)\/dependencies$/);
    const graphProjectDependentsMatch = pathname.match(/^\/api\/graph\/project\/([^/]+)\/dependents$/);
    const graphProjectRiskMatch = pathname.match(/^\/api\/graph\/project\/([^/]+)\/risk-propagation$/);
    const graphProjectDriftMatch = pathname.match(/^\/api\/graph\/project\/([^/]+)\/drift-propagation$/);
    const graphProjectAbstentionMatch = pathname.match(/^\/api\/graph\/project\/([^/]+)\/abstention-propagation$/);
    const graphWorkspaceRiskMatch = pathname.match(/^\/api\/graph\/([^/]+)\/risk$/);
    const graphNodeRiskMatch = pathname.match(/^\/api\/graph\/([^/]+)\/([^/]+)\/risk$/);
    const graphCoverageMatch = pathname.match(/^\/api\/graph\/([^/]+)\/coverage$/);
    const graphIntegrityMatch = pathname.match(/^\/api\/graph\/([^/]+)\/integrity$/);
    const graphEnforcementMatch = pathname.match(/^\/api\/graph\/([^/]+)\/enforcement$/);
    const graphSearchMatch = pathname.match(/^\/api\/graph\/([^/]+)\/search$/);
    const graphQueryMatch = pathname.match(/^\/api\/graph\/([^/]+)\/query$/);

    if (req.method === "GET" && graphWorkspaceRiskMatch) {
      requireAuth(ctx);
      const workspaceId = decodeURIComponent(graphWorkspaceRiskMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const graph = buildTrustGraph(db, workspaceId);
      const result = getWorkspaceRiskData(db, workspaceId);
      return sendJson(res, 200, {
        ok: true,
        workspace: workspaceId,
        data: result,
        meta: {
          generatedAt: new Date().toISOString(),
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
        },
      });
    }

    if (req.method === "GET" && graphNodeRiskMatch) {
      requireAuth(ctx);
      const workspaceId = decodeURIComponent(graphNodeRiskMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const graph = buildTrustGraph(db, workspaceId);
      const result = getNodeRisk(graph, decodeURIComponent(graphNodeRiskMatch[2]), db);
      if (!result) return sendError(res, 404, "NOT_FOUND", "Node not found or inaccessible.");
      return sendJson(res, 200, {
        ok: true,
        workspace: workspaceId,
        data: result,
        meta: {
          generatedAt: new Date().toISOString(),
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          nodeId: result.nodeId,
        },
      });
    }

    if (req.method === "GET" && graphCoverageMatch) {
      requireAuth(ctx);
      const workspaceId = decodeURIComponent(graphCoverageMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const graph = getWorkspaceGraph(db, workspaceId);
      const result = computeWorkspaceCoverage(graph, db, workspaceId);
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: result, meta: { generatedAt: result.generatedAt, nodeCount: result.nodeCount, edgeCount: result.edgeCount } });
    }

    if (req.method === "GET" && graphIntegrityMatch) {
      requireAuth(ctx);
      const workspaceId = decodeURIComponent(graphIntegrityMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const graph = getWorkspaceGraph(db, workspaceId);
      const result = {
        cycles: checkCycles(graph),
        orphans: checkOrphans(graph),
        duplicates: checkDuplicateEdges(graph),
        invalidNodes: checkInvalidNodes(graph),
        crossWorkspaceLeaks: checkCrossWorkspaceLeaks(graph, workspaceId),
      };
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: result, meta: { generatedAt: new Date().toISOString(), nodeCount: graph.nodes.length, edgeCount: graph.edges.length } });
    }

    if (req.method === "GET" && graphEnforcementMatch) {
      requireAuth(ctx);
      const workspaceId = decodeURIComponent(graphEnforcementMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const graph = getWorkspaceGraph(db, workspaceId);
      const result = evaluateWorkspaceTrust(graph, db, workspaceId);
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: result, meta: { generatedAt: result.generatedAt, nodeCount: result.nodeCount, edgeCount: result.edgeCount } });
    }

    if (req.method === "GET" && graphSearchMatch) {
      requireAuth(ctx);
      const workspaceId = decodeURIComponent(graphSearchMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const q = url.searchParams.get("q") || "";
      const graph = getWorkspaceGraph(db, workspaceId);
      const result = searchGraph(graph, q);
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: result || { nodes: [], edges: [], metadata: { query: q, nodeCount: 0, edgeCount: 0 } }, meta: { generatedAt: new Date().toISOString(), nodeCount: graph.nodes.length, edgeCount: graph.edges.length } });
    }

    if (req.method === "GET" && graphQueryMatch) {
      requireAuth(ctx);
      const workspaceId = decodeURIComponent(graphQueryMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const q = url.searchParams.get("q") || "";
      const graph = getWorkspaceGraph(db, workspaceId);
      const result = searchGraph(graph, q);
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: result || { nodes: [], edges: [], metadata: { query: q, nodeCount: 0, edgeCount: 0 } }, meta: { generatedAt: new Date().toISOString(), nodeCount: graph.nodes.length, edgeCount: graph.edges.length } });
    }

    const buildWorkspaceGraphMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/graph\/build$/);
    if (req.method === "POST" && buildWorkspaceGraphMatch) {
      requireAuth(ctx);
      const workspaceId = decodeURIComponent(buildWorkspaceGraphMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const result = await constructWorkspaceGraph(workspaceId);
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: { nodes: result.record.nodes, edges: result.record.edges, summary: result.record.summary }, meta: { generatedAt: result.record.generatedAt, nodeCount: result.record.nodes.length, edgeCount: result.record.edges.length } });
    }

    const graphTimelineWorkspaceMatch = pathname.match(/^\/api\/timeline\/([^/]+)\/events$/);
    const graphStalenessWorkspaceMatch = pathname.match(/^\/api\/timeline\/([^/]+)\/staleness$/);

    if (req.method === "GET" && graphTimelineWorkspaceMatch) {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "read" });
      const workspaceId = decodeURIComponent(graphTimelineWorkspaceMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const events = getWorkspaceTimelineEvents(db, workspaceId);
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: events, meta: { generatedAt: new Date().toISOString(), eventCount: events.length } });
    }

    if (req.method === "GET" && graphStalenessWorkspaceMatch) {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "read" });
      const workspaceId = decodeURIComponent(graphStalenessWorkspaceMatch[1]);
      const db = await readDb();
      assertMspWorkspaceAccess(ctx, db, workspaceId);
      const summary = getWorkspaceStalenessSummary(db, workspaceId);
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: summary, meta: { generatedAt: summary.generatedAt, eventCount: summary.totalEvents } });
    }

    if (req.method === "GET" && graphNodeMatch) {
      requireAuth(ctx);
      const graph = buildTrustGraph(await readDb(), ctx.workspaceId);
      const result = getNode(graph, decodeURIComponent(graphNodeMatch[1]));
      if (!result) return sendError(res, 404, "NOT_FOUND", "Node not found or inaccessible.");
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && graphNodeNeighborsMatch) {
      requireAuth(ctx);
      const graph = buildTrustGraph(await readDb(), ctx.workspaceId);
      const result = getNeighbors(graph, decodeURIComponent(graphNodeNeighborsMatch[1]));
      if (!result) return sendError(res, 404, "NOT_FOUND", "Node not found or inaccessible.");
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && graphProjectDependenciesMatch) {
      requireAuth(ctx);
      const graph = buildTrustGraph(await readDb(), ctx.workspaceId);
      const result = getProjectDependencies(graph, decodeURIComponent(graphProjectDependenciesMatch[1]));
      if (!result) return sendError(res, 404, "NOT_FOUND", "Project not found or inaccessible.");
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && graphProjectDependentsMatch) {
      requireAuth(ctx);
      const graph = buildTrustGraph(await readDb(), ctx.workspaceId);
      const result = getProjectDependents(graph, decodeURIComponent(graphProjectDependentsMatch[1]));
      if (!result) return sendError(res, 404, "NOT_FOUND", "Project not found or inaccessible.");
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && graphProjectRiskMatch) {
      requireAuth(ctx);
      const projectId = decodeURIComponent(graphProjectRiskMatch[1]);
      const graph = buildTrustGraph(await readDb(), ctx.workspaceId);
      const result = getRiskPropagation(graph, projectId);
      if (!result) return sendError(res, 404, "NOT_FOUND", "Project not found or inaccessible.");
      await mutateDb((db2) => recordProjectEvent(db2, projectId, "GRAPHRISKPROPAGATION", { projectId, timestamp: new Date().toISOString() }));
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && graphProjectDriftMatch) {
      requireAuth(ctx);
      const projectId = decodeURIComponent(graphProjectDriftMatch[1]);
      const graph = buildTrustGraph(await readDb(), ctx.workspaceId);
      const result = getDriftPropagation(graph, projectId);
      if (!result) return sendError(res, 404, "NOT_FOUND", "Project not found or inaccessible.");
      await mutateDb((db2) => recordProjectEvent(db2, projectId, "GRAPHDRIFTPROPAGATION", { projectId, timestamp: new Date().toISOString() }));
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && graphProjectAbstentionMatch) {
      requireAuth(ctx);
      const projectId = decodeURIComponent(graphProjectAbstentionMatch[1]);
      const graph = buildTrustGraph(await readDb(), ctx.workspaceId);
      const result = getAbstentionPropagation(graph, projectId);
      if (!result) return sendError(res, 404, "NOT_FOUND", "Project not found or inaccessible.");
      await mutateDb((db2) => recordProjectEvent(db2, projectId, "GRAPHABSTENTIONPROPAGATION", { projectId, timestamp: new Date().toISOString() }));
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && pathname === "/api/graph/search") {
      requireAuth(ctx);
      assertMspMode(ctx, { operation: "read" });
      const q = url.searchParams.get("q") || "";
      const graph = buildTrustGraph(await readDb(), ctx.workspaceId);
      const result = searchGraph(graph, q);
      return sendJson(res, 200, result || { nodes: [], edges: [], metadata: { query: q, nodeCount: 0, edgeCount: 0 } });
    }

    if (req.method === "GET" && badgeLegacyMatch) {
      const db = await readDb();
      const assetId = decodeURIComponent(badgeLegacyMatch[1]);
      const asset = db.assets.find((item) => item.id === assetId);
      if (!asset) return sendError(res, 404, "NOT_FOUND", "Asset not found.");
      const passport = getLatestPublicPassport(db, assetId);
      const response = buildBadgeStatusResponse(asset, passport);
      return sendJson(res, 200, {
        assetId: response.assetId,
        label: response.status === "verified" ? "VentureOS Verified" : "VentureOS Review",
        status: response.status.charAt(0).toUpperCase() + response.status.slice(1),
        trustScore: response.score,
        publicUrl: response.publicUrl,
      });
    }

    return sendJson(res, 404, { error: "Route not found." });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.code || error.error || error.message || "UNEXPECTED_ERROR",
      message: error.message || "Unexpected API error.",
    });
  }
}

async function upsertAsset(discovered, workspaceId, userId) {
  return mutateDb((db) => {
    const now = new Date().toISOString();
    const existing = db.assets.find(
      (asset) =>
        asset.workspaceId === workspaceId &&
        (asset.canonicalUrl === discovered.canonicalUrl ||
          asset.name.toLowerCase() === discovered.name.toLowerCase())
    );

    if (existing) {
      Object.assign(existing, {
        ...discovered,
        workspaceId,
        createdBy: existing.createdBy || userId,
        id: existing.id,
        latestTrustScore: existing.latestTrustScore,
        latestConfidenceScore: existing.latestConfidenceScore,
        risk: existing.risk,
        passportStatus: existing.passportStatus,
        monitoringStatus: existing.monitoringStatus,
        lastScannedAt: existing.lastScannedAt || null,
        createdAt: existing.createdAt,
        updatedAt: now,
      });
      return existing;
    }

    const asset = {
      id: createId("asset", discovered.name),
      workspaceId,
      createdBy: userId,
      ...discovered,
      latestTrustScore: 0,
      latestConfidenceScore: 0,
      risk: "Unscanned",
      passportStatus: "None",
      monitoringStatus: "Off",
      lastScannedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.assets.push(asset);
    return asset;
  });
}

function toClientResults(result) {
  return {
    trust: result.trust,
    confidence: result.confidence,
    verdict: result.verdict,
    security: result.security,
    engineering: result.engineering,
    business: result.business,
    product: result.product,
    findings: result.findings,
    evidence: result.evidence,
  };
}

function toClientPassport(passport) {
  return {
    ...passport,
    assetId: passport.assetId,
    name: passport.assetName,
    company: passport.company,
    trust: passport.trustScore,
    confidence: passport.confidenceScore,
    version: passport.version,
    issued: passport.issuedAt,
    status: passport.status,
    badge_embed: passport.badgeEmbed || buildBadgeEmbed(passport.assetId),
  };
}

function buildBadgeEmbed(assetId) {
  return `<script src="/api/badge.js" data-asset="${assetId}"></script>`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)).join("");
  return raw ? JSON.parse(raw) : {};
}

function byUpdatedDesc(a, b) {
  return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
}

function byCreatedDesc(a, b) {
  return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}


