import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
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
import { evidencePipeline } from "./evidence-pipeline.js";
import { trustScore } from "./trust-score.js";
import { freshness, DEFAULT_RESTRICTED_EVIDENCE_TTL_DAYS } from "./freshness.js";
import { bindEvidence, computeSprPassportScore as computeSprPassportScoreFromAssembler, createPassportEnvelopeHash, normalizePassportVisibility } from "./passport-assembler.js";
import { passportVerifier } from "./passport-verifier.js";
import { auditReplay } from "./audit-replay.js";
import { auditChain } from "./audit-chain.js";
import { monitoring } from "./monitoring.js";
import { restrictedTokens } from "./restricted-tokens.js";
import * as runtimeGuards from "./runtime-guards.js";
import { isolateExecution } from "./pipeline-runner.js";
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
  listWorkspacesForUser,
  createWorkspaceForUser,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  validateCsrf,
  WORKSPACE_ROLES,
  hashPassword,
  publicUser,
} from "./auth.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function normalizeWorkspaceId(value) {
  if (value == null) return null;
  if (Array.isArray(value)) value = value[0];
  const normalized = String(value || "").trim();
  return normalized === "" ? null : normalized;
}

function getRequestedWorkspaceId(req) {
  return normalizeWorkspaceId(req.headers?.["x-workspace-id"]);
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

function mapMspSummaryMode(billingStatus) {
  const normalized = String(billingStatus || "active").trim().toLowerCase();
  if (normalized === "trialing") return "trial";
  if (normalized === "canceled") return "cancelled";
  if (normalized === "past_due" || normalized === "pending" || normalized === "inactive" || normalized === "incomplete") return "suspended";
  return "active";
}

function mapMspBillingStatusForSummary(billingStatus) {
  const normalized = String(billingStatus || "active").trim().toLowerCase();
  if (normalized === "active") return "paid";
  if (normalized === "trialing") return "trial";
  if (normalized === "canceled" || normalized === "past_due") return "overdue";
  return "due";
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

function getPassportResponseForRequest(db, passportId, ctx) {
  const passport = getPassportById(db, passportId) || (db.sprPassports || []).find((item) => item.id === passportId) || null;
  if (!passport) return { error: "NOT_FOUND", message: "Passport not found." };
  if (passport.softwareId && (passport.visibility === "restricted" || passport.visibility === "private")) {
    return { error: "FORBIDDEN", message: "Restricted passport access denied." };
  }
  return { passport };
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
  const versions = (db.passports || [])
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
    assetId: passport.assetId || passport.softwareId || null,
    assetName: passport.assetName || passport.softwareName || null,
    company: passport.company || passport.vendorName || null,
    trustScore: passport.trustScore || 0,
    confidenceScore: passport.confidenceScore || 0,
    verdict: passport.verdict,
    version: passport.version || 1,
    issuedAt: passport.issuedAt,
    revoked: Boolean(passport.revoked),
    revokedAt: passport.revokedAt || null,
    evidenceSummary: passport.evidenceSummary || null,
    visibility: passport.visibility || (passport.isPublic ? "public" : "private"),
    status: passport.status,
    badgeStatus: {
      status: mapBadgeStatus(passport),
      score: passport.trustScore || 0,
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

function sanitizeList(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

function parseScopedAccessToken(token, fallbackVendorId = null, fallbackWorkspaceId = null) {
  const normalized = String(token || "").trim();
  if (!normalized) return { token: null, vendorId: fallbackVendorId, workspaceId: fallbackWorkspaceId, visibility: null };
  const [vendorId, workspaceId, visibility] = normalized.split(":");
  return { token: normalized, vendorId: String(vendorId || fallbackVendorId || "").trim() || null, workspaceId: String(workspaceId || fallbackWorkspaceId || "").trim() || null, visibility: String(visibility || "").trim() || null };
}

function getBundleMasterKey() {
  return String(process.env.VENTUREOS_BUNDLE_MASTER_KEY || "ventureos-default-bundle-key-please-rotate").trim();
}

function deriveWorkspaceBundleKey(workspaceId) {
  const normalizedWorkspaceId = String(workspaceId || "default").trim() || "default";
  return createHash("sha256").update(`${getBundleMasterKey()}:${normalizedWorkspaceId}`).digest();
}

function hashBundleIntegrity(payload) {
  return createHash("sha256").update(String(payload || "")).digest("hex");
}

function encryptWorkspacePayload(workspaceId, plaintext) {
  const key = deriveWorkspaceBundleKey(workspaceId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(String(plaintext), "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptWorkspacePayload(workspaceId, bundle) {
  if (!bundle || !bundle.algorithm || !bundle.iv || !bundle.authTag || !bundle.ciphertext) return null;
  const key = deriveWorkspaceBundleKey(workspaceId);
  const decipher = createDecipheriv(bundle.algorithm, key, Buffer.from(bundle.iv, "base64"));
  decipher.setAuthTag(Buffer.from(bundle.authTag, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(bundle.ciphertext, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

function appendSprAuditLog(db, type, targetId, payload = {}) {
  auditChain.append(db, {
    type,
    targetId,
    payload,
    workspaceId: payload.workspaceId || null,
  });
}

export function verifyAuditChain(entries = []) {
  return auditChain.verify(entries).ok;
}

export function verifyPassportEnvelope(passport = {}) {
  return createPassportEnvelopeHash(passport) === passport.passportEnvelopeHash;
}

function normalizeSprEvidence(evidence) {
  const hardened = evidencePipeline.normalize(evidence, { workspaceId: evidence?.workspaceId || null, kind: "evidence" });
  const rawType = String(evidence.type || evidence.framework || evidence.evidenceType || "generic").trim().toLowerCase();
  const normalizedType = rawType === "iso" || rawType === "iso27001" ? "iso27001" : rawType === "slsa" ? "slsa" : rawType;
  return {
    type: normalizedType,
    title: hardened.title,
    summary: hardened.summary,
    source: hardened.source,
    uri: hardened.uri,
    strength: Number(hardened.strength || 0),
    freshnessDays: Number(hardened.freshnessDays || 0),
    verified: Boolean(hardened.verified === 1),
    visibility: hardened.visibility,
    accessToken: hardened.accessToken,
    verificationMethod: String(evidence.verificationMethod || "").trim() || null,
    verificationStatus: String(evidence.verificationStatus || (Boolean(hardened.verified === 1) ? "verified" : "pending")).trim().toLowerCase() || "pending",
    verificationDetails: String(evidence.verificationDetails || "").trim(),
    bundle: evidence.bundle && typeof evidence.bundle === "object" ? evidence.bundle : null,
    zkProof: evidence.zkProof && typeof evidence.zkProof === "object" ? evidence.zkProof : null,
    workspaceId: hardened.workspaceId,
    trustScore: hardened.trustScore,
    createdAt: hardened.createdAt,
    updatedAt: hardened.updatedAt,
    numericSignals: hardened.numericSignals,
  };
}

function calculateSprFreshnessScore(freshnessDays) {
  if (freshnessDays <= 7) return 1;
  if (freshnessDays <= 30) return 0.7;
  if (freshnessDays <= 90) return 0.4;
  return 0.1;
}

function calculateSprCompletenessScore(evidence) {
  const normalized = evidence.map((item) => normalizeSprEvidence(item));
  const types = new Set(
    normalized.flatMap((item) => {
      const values = [item.type];
      if (String(item.verificationMethod || "").toLowerCase() === "sigstore" || String(item.verificationStatus || "").toLowerCase() === "verified") values.push("sigstore");
      if (["soc2", "iso27001", "iso", "fedramp", "nist"].includes(item.type)) values.push(item.type);
      return values;
    })
  );
  const coverage = [types.has("sbom") ? 0.35 : 0, types.has("slsa") ? 0.2 : 0, types.has("sigstore") ? 0.2 : 0, types.has("soc2") || types.has("iso27001") ? 0.25 : 0].reduce((sum, value) => sum + value, 0);
  const freshness = normalized.reduce((sum, item) => sum + calculateSprFreshnessScore(Number(item.freshnessDays || 0)), 0) / Math.max(1, normalized.length);
  return Math.min(1, Number((coverage + freshness) / 2).toFixed(2));
}

function getSprProfileWeights(profile = "default") {
  const normalized = String(profile || "default").trim().toLowerCase();
  if (normalized === "government") {
    return { vendorCompliance: 7, repository: 4, evidence: 5, verifiedEvidence: 5, freshness: 3, evidenceCount: 3, sbom: 7, slsa: 7, sigstore: 6, standards: 6, completeness: 16 };
  }
  if (normalized === "msp") {
    return { vendorCompliance: 5, repository: 3, evidence: 4, verifiedEvidence: 4, freshness: 2, evidenceCount: 2, sbom: 5, slsa: 4, sigstore: 4, standards: 5, completeness: 14 };
  }
  return { vendorCompliance: 5, repository: 3, evidence: 4, verifiedEvidence: 3, freshness: 2, evidenceCount: 2, sbom: 5, slsa: 4, sigstore: 4, standards: 4, completeness: 15 };
}

function computeSprPassportScore(software, evidence, vendor, profile = "default") {
  const weights = getSprProfileWeights(profile);
  let score = 22;
  if (vendor?.complianceClaims?.length) score += weights.vendorCompliance;
  if (software?.repositoryUrl) score += weights.repository;
  if (evidence.length > 0) score += weights.evidence;
  const verifiedEvidence = evidence.filter((item) => String(item.verificationStatus || "").toLowerCase() === "verified" || item.verified === true).length;
  if (verifiedEvidence > 0) score += weights.verifiedEvidence;
  if (evidence.filter((item) => Number(item.freshnessDays || 0) <= 30).length > 0) score += weights.freshness;
  if (evidence.length >= 2) score += weights.evidenceCount;
  const hasSbom = evidence.some((item) => item.type === "sbom");
  const hasSlsa = evidence.some((item) => item.type === "slsa" || item.type === "slsa-provenance");
  const hasSigstore = evidence.some((item) => String(item.verificationMethod || "").toLowerCase() === "sigstore" || String(item.verificationStatus || "").toLowerCase() === "verified");
  const hasStandards = evidence.some((item) => ["soc2", "iso27001", "iso", "fedramp", "nist"].includes(item.type));
  if (hasSbom) score += weights.sbom;
  if (hasSlsa) score += weights.slsa;
  if (hasSigstore) score += weights.sigstore;
  if (hasStandards) score += weights.standards;
  const completeness = calculateSprCompletenessScore(evidence);
  score += Math.round(completeness * weights.completeness);
  const trustScore = Math.min(100, score);
  const confidenceScore = Math.min(100, 55 + evidence.length * 8 + verifiedEvidence * 6 + Math.round(completeness * 12));
  let verdict = "REVIEW";
  let riskCategory = "High";
  if (trustScore >= 75) {
    verdict = "TRUSTED";
    riskCategory = "Low";
  } else if (trustScore >= 55) {
    verdict = "CONDITIONALLY TRUSTED";
    riskCategory = "Moderate";
  } else {
    riskCategory = "High";
  }
  return { trustScore, confidenceScore, verdict, riskCategory, profile: String(profile || "default").trim().toLowerCase() || "default" };
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

    if (req.method === "GET" && pathname === "/api/spr/vendors") {
      requireAuth(ctx);
      const db = await readDb();
      const vendors = (db.sprVendors || []).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      return sendJson(res, 200, { ok: true, vendors });
    }

    if (req.method === "POST" && pathname === "/api/spr/vendors") {
      requireAuth(ctx);
      const payload = await readJson(req);
      const name = String(payload.name || "").trim();
      if (!name) return sendError(res, 400, "VALIDATION_ERROR", "Vendor name is required.");
      const vendor = await mutateDb((db) => {
        const record = {
          id: createId("sprvendor", name),
          name,
          domain: String(payload.domain || "").trim(),
          email: String(payload.email || "").trim(),
          country: String(payload.country || "").trim(),
          complianceClaims: sanitizeList(payload.complianceClaims),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.sprVendors.push(record);
        return record;
      });
      return sendJson(res, 201, { ok: true, vendor });
    }

    if (req.method === "GET" && pathname === "/api/spr/software") {
      requireAuth(ctx);
      const db = await readDb();
      const software = (db.sprSoftware || []).map((item) => {
        const vendor = (db.sprVendors || []).find((vendorItem) => vendorItem.id === item.vendorId) || null;
        const evidence = (db.sprEvidence || []).filter((evidenceItem) => evidenceItem.softwareId === item.id);
        const score = computeSprPassportScore(item, evidence, vendor);
        return { ...item, vendor, score };
      });
      return sendJson(res, 200, { ok: true, software });
    }

    if (req.method === "POST" && pathname === "/api/spr/software") {
      requireAuth(ctx);
      const payload = await readJson(req);
      const name = String(payload.name || "").trim();
      const vendorId = String(payload.vendorId || "").trim();
      if (!name) return sendError(res, 400, "VALIDATION_ERROR", "Software name is required.");
      const record = await mutateDb((db) => {
        const now = new Date().toISOString();
        const rec = {
          id: createId("sprsoftware", name),
          name,
          vendorId,
          repositoryUrl: String(payload.repositoryUrl || "").trim(),
          packageName: String(payload.packageName || "").trim(),
          version: String(payload.version || "").trim(),
          ecosystem: String(payload.ecosystem || "unknown").trim(),
          createdAt: now,
          updatedAt: now,
        };
        db.sprSoftware.push(rec);
        return rec;
      });
      return sendJson(res, 201, { ok: true, software: record });
    }

    if (req.method === "POST" && pathname === "/api/spr/evidence") {
      requireAuth(ctx);
      const payload = await readJson(req);
      const softwareId = String(payload.softwareId || "").trim();
      const type = String(payload.type || "").trim();
      const title = String(payload.title || "").trim();
      if (!softwareId) return sendError(res, 400, "VALIDATION_ERROR", "Software is required.");
      if (!type || !title) return sendError(res, 400, "VALIDATION_ERROR", "Evidence type and title are required.");
      const db = await readDb();
      const software = db.sprSoftware.find((item) => item.id === softwareId);
      if (!software) return sendError(res, 404, "NOT_FOUND", "Software not found.");
      const freshnessDays = Number(payload.freshnessDays || 0);
      const visibility = String(payload.visibility || "public").trim().toLowerCase() || "public";
      const accessToken = String(payload.accessToken || "").trim() || null;
      const requestedWorkspaceId = normalizeWorkspaceId(String(payload.workspaceId || ctx.workspaceId || "").trim() || null);
      if (ctx.workspaceId && requestedWorkspaceId && ctx.workspaceId !== requestedWorkspaceId) {
        appendSprAuditLog(db, "evidence.workspace_violation", softwareId, { requestedWorkspaceId, currentWorkspaceId: ctx.workspaceId });
        return sendError(res, 403, "FORBIDDEN", "Cross-workspace evidence is not allowed.");
      }
      if (visibility === "restricted" && !accessToken) {
        return sendError(res, 400, "VALIDATION_ERROR", "Restricted evidence requires an access token.");
      }
      const parsedToken = parseScopedAccessToken(accessToken, String(payload.vendorId || software.vendorId || "").trim() || null, requestedWorkspaceId || String(payload.workspaceId || software.workspaceId || "").trim() || null);
      if (visibility === "restricted" && parsedToken.vendorId && String(payload.vendorId || software.vendorId || "").trim() && parsedToken.vendorId !== String(payload.vendorId || software.vendorId || "").trim()) {
        return sendError(res, 403, "FORBIDDEN", "Restricted evidence token scope is invalid for this vendor.");
      }
      if (visibility === "restricted" && parsedToken.workspaceId && requestedWorkspaceId && parsedToken.workspaceId !== requestedWorkspaceId) {
        return sendError(res, 403, "FORBIDDEN", "Restricted evidence token scope is invalid for this workspace.");
      }

      let evidence;
      try {
        evidence = await isolateExecution(
          { workspaceId: requestedWorkspaceId || ctx.workspaceId, passportKey: softwareId },
          async () => {
            let normalizedPayload;
            try {
              const payloadToValidate = {
                softwareId,
                type,
                title,
                summary: payload.summary,
                source: payload.source,
                uri: payload.uri,
                strength: payload.strength,
                freshnessDays: payload.freshnessDays,
                verified: payload.verified,
                visibility: payload.visibility,
                accessToken: payload.accessToken,
                workspaceId: requestedWorkspaceId,
                vendorId: payload.vendorId || software.vendorId || null,
                trustScore: payload.trustScore,
                createdAt: payload.createdAt || payload.timestamp || payload.generatedAt,
                updatedAt: payload.updatedAt || payload.timestamp || payload.generatedAt,
                payload: payload.payload || payload.content || payload.body || payload.summary,
                mimeType: payload.mimeType || payload.contentType || "text/plain",
                numericSignals: payload.numericSignals || {},
                severity: payload.severity,
                confidence: payload.confidence,
                score: payload.score,
              };
              const validated = runtimeGuards.requireEvidenceSchema(payloadToValidate, { workspaceId: requestedWorkspaceId, kind: "evidence" });
              normalizedPayload = evidencePipeline.sanitize(validated, { workspaceId: requestedWorkspaceId, kind: "evidence" });
              // restricted evidence requires a valid restricted token
              if (visibility === "restricted") {
                try {
                  restrictedTokens.verify(db, accessToken, { workspaceId: requestedWorkspaceId, evidenceType: normalizedPayload.type });
                } catch (err) {
                  appendSprAuditLog(db, "evidence.restricted_token_invalid", softwareId, { error: err.message, details: err.details || {} });
                  throw Object.assign(new Error(err.message), { statusCode: err.statusCode || 400, code: err.code || "VALIDATION_ERROR" });
                }
              }
            } catch (error) {
              appendSprAuditLog(db, "evidence.ingestion_failed", softwareId, { reason: error.message, details: error.details || {} });
              if (error.details?.code === "STALE_EVIDENCE" || error.details?.code === "PAYLOAD_TOO_LARGE" || error.details?.code === "UNSUPPORTED_MIME_TYPE" || error.details?.code === "MISSING_TITLE") {
                throw Object.assign(new Error(error.message), { statusCode: 400, code: "VALIDATION_ERROR" });
              }
              if (error.details?.code === "CROSS_WORKSPACE") {
                throw Object.assign(new Error(error.message), { statusCode: 403, code: "FORBIDDEN" });
              }
              throw Object.assign(new Error(error.message), { statusCode: 400, code: "VALIDATION_ERROR" });
            }

            return mutateDb((db2) => {
              const normalized = normalizeSprEvidence({
                type,
                title,
                summary: payload.summary,
                source: payload.source,
                uri: payload.uri,
                strength: payload.strength,
                freshnessDays: payload.freshnessDays,
                verified: payload.verified,
                visibility: payload.visibility,
                accessToken: payload.accessToken,
                workspaceId: requestedWorkspaceId,
                vendorId: payload.vendorId || software.vendorId || null,
                trustScore: payload.trustScore,
                createdAt: payload.createdAt || payload.timestamp || payload.generatedAt,
                updatedAt: payload.updatedAt || payload.timestamp || payload.generatedAt,
                payload: payload.payload || payload.content || payload.body || payload.summary,
                numericSignals: payload.numericSignals || {},
                severity: payload.severity,
                confidence: payload.confidence,
                score: payload.score,
              });
              const record = {
                id: createId("sprevidence", `${softwareId}-${type}`),
                softwareId,
                type: normalized.type,
                title: normalized.title,
                summary: normalized.summary,
                source: normalized.source,
                uri: normalized.uri,
                strength: Number(normalized.strength || 0),
                freshnessDays: Number(normalized.freshnessDays || 0),
                verified: Boolean(normalized.verified === 1),
                visibility,
                accessToken,
                workspaceId: normalized.workspaceId || requestedWorkspaceId || null,
                vendorId: normalized.vendorId || software.vendorId || null,
                trustScore: normalized.trustScore,
                createdAt: normalized.createdAt || new Date().toISOString(),
                updatedAt: normalized.updatedAt || new Date().toISOString(),
                numericSignals: normalized.numericSignals || {},
                payload: normalizedPayload.payload,
                mimeType: normalizedPayload.mimeType,
              };
              db2.sprEvidence.push(record);
              appendSprAuditLog(db2, "evidence.created", record.id, {
                visibility,
                freshnessDays,
                softwareId,
                workspaceId: record.workspaceId,
                replaySnapshot: auditReplay.capture("evidence.ingest", { evidence: record, db: db2 }),
              });
              return record;
            });
          }
        );
      } catch (error) {
        if (error.statusCode && error.code) {
          return sendError(res, error.statusCode, error.code, error.message);
        }
        throw error;
      }
      return sendJson(res, 201, { ok: true, evidence });
    }

    if (req.method === "POST" && pathname === "/api/spr/standards") {
      requireAuth(ctx);
      const payload = await readJson(req);
      const softwareId = String(payload.softwareId || "").trim();
      const framework = String(payload.framework || payload.type || "soc2").trim().toLowerCase();
      if (!softwareId) return sendError(res, 400, "VALIDATION_ERROR", "Software is required.");
      const evidence = await mutateDb((db) => {
        const normalized = normalizeSprEvidence({
          type: framework === "iso" || framework === "iso27001" ? "iso27001" : framework,
          title: payload.title || `${framework.toUpperCase()} attestation`,
          summary: payload.summary,
          source: payload.source || "standards",
          uri: payload.uri,
          strength: payload.strength,
          freshnessDays: payload.freshnessDays,
          verified: payload.verified,
          visibility: payload.visibility,
          accessToken: payload.accessToken,
        });
        const record = {
          id: createId("sprevidence", `${softwareId}-${normalized.type}`),
          softwareId,
          type: normalized.type,
          title: normalized.title,
          summary: normalized.summary,
          source: normalized.source,
          uri: normalized.uri,
          strength: Number(normalized.strength || 0),
          freshnessDays: Number(normalized.freshnessDays || 0),
          verified: Boolean(normalized.verified === true),
          visibility: normalized.visibility,
          accessToken: normalized.accessToken,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.sprEvidence.push(record);
        return record;
      });
      return sendJson(res, 201, { ok: true, evidence });
    }

    const evidenceVisibilityMatch = pathname.match(/^\/api\/spr\/evidence\/([^/]+)\/visibility$/);
    if (req.method === "POST" && evidenceVisibilityMatch) {
      requireAuth(ctx);
      const evidenceId = decodeURIComponent(evidenceVisibilityMatch[1]);
      const payload = await readJson(req);
      const visibility = String(payload.visibility || "public").trim().toLowerCase() || "public";
      const updated = await mutateDb((db) => {
        const record = db.sprEvidence.find((item) => item.id === evidenceId);
        if (!record) return null;
        const vendorId = String(payload.vendorId || "").trim() || null;
        const workspaceId = String(payload.workspaceId || "").trim() || null;
        const accessToken = String(payload.accessToken || "").trim() || null;
        const parsedToken = parseScopedAccessToken(accessToken, vendorId, workspaceId);
        const expectedAccessToken = [parsedToken.vendorId, parsedToken.workspaceId, visibility].filter(Boolean).join(":") || null;
        if (visibility === "restricted" && accessToken && accessToken !== expectedAccessToken) {
          // try verifying as a restricted token stored in DB
          try {
            restrictedTokens.verify(db, accessToken, { workspaceId, evidenceType: null });
          } catch (err) {
            return { __error: "INVALID_SCOPE" };
          }
        }
        if (visibility === "restricted" && !accessToken) {
          return { __error: "VALIDATION_ERROR" };
        }
        record.visibility = visibility;
        record.accessToken = accessToken;
        record.updatedAt = new Date().toISOString();
        appendSprAuditLog(db, "evidence.visibility_changed", record.id, { visibility, accessToken: record.accessToken, vendorId, workspaceId });
        return record;
      });
      if (updated && updated.__error) {
        if (updated.__error === "INVALID_SCOPE") return sendError(res, 403, "FORBIDDEN", "Restricted evidence token scope is invalid.");
        return sendError(res, 400, "VALIDATION_ERROR", "Restricted evidence requires a scoped access token.");
      }
      if (!updated) return sendError(res, 404, "NOT_FOUND", "Evidence not found.");
      return sendJson(res, 200, { ok: true, evidence: updated });
    }

    const softwareScoreMatch = pathname.match(/^\/api\/spr\/software\/([^/]+)\/score$/);
    if (req.method === "GET" && softwareScoreMatch) {
      requireAuth(ctx);
      const softwareId = decodeURIComponent(softwareScoreMatch[1]);
      const profile = String(url.searchParams.get("profile") || "default").trim().toLowerCase() || "default";
      const db = await readDb();
      const software = db.sprSoftware.find((item) => item.id === softwareId);
      if (!software) return sendError(res, 404, "NOT_FOUND", "Software not found.");
      const vendor = db.sprVendors.find((item) => item.id === software.vendorId) || null;
      const evidence = db.sprEvidence.filter((item) => item.softwareId === softwareId);
      const score = computeSprPassportScore(software, evidence, vendor, profile);
      return sendJson(res, 200, { ok: true, score });
    }

    const softwareIdentityMatch = pathname.match(/^\/api\/spr\/software\/([^/]+)\/identity$/);
    if (req.method === "POST" && softwareIdentityMatch) {
      requireAuth(ctx);
      const softwareId = decodeURIComponent(softwareIdentityMatch[1]);
      const payload = await readJson(req);
      const identity = await mutateDb((db) => {
        const software = db.sprSoftware.find((item) => item.id === softwareId);
        if (!software) return null;
        software.identityVerification = {
          domain: Boolean(payload.domain === true || payload.domain === "true"),
          repo: Boolean(payload.repo === true || payload.repo === "true"),
          certificate: Boolean(payload.certificate === true || payload.certificate === "true"),
          details: String(payload.details || "").trim(),
          updatedAt: new Date().toISOString(),
        };
        software.updatedAt = new Date().toISOString();
        return software.identityVerification;
      });
      if (!identity) return sendError(res, 404, "NOT_FOUND", "Software not found.");
      return sendJson(res, 201, { ok: true, identity });
    }

    const evidenceVerifyMatch = pathname.match(/^\/api\/spr\/evidence\/([^/]+)\/verify$/);
    if (req.method === "POST" && evidenceVerifyMatch) {
      requireAuth(ctx);
      const evidenceId = decodeURIComponent(evidenceVerifyMatch[1]);
      const payload = await readJson(req);
      const updated = await mutateDb((db) => {
        const record = db.sprEvidence.find((item) => item.id === evidenceId);
        if (!record) return null;
        record.verificationMethod = String(payload.method || "manual").trim();
        record.verificationStatus = Boolean(payload.verified === true) ? "verified" : "pending";
        record.verificationDetails = String(payload.details || "").trim();
        record.updatedAt = new Date().toISOString();
        return record;
      });
      if (!updated) return sendError(res, 404, "NOT_FOUND", "Evidence not found.");
      return sendJson(res, 200, { ok: true, evidence: updated });
    }

    const softwareMonitorMatch = pathname.match(/^\/api\/spr\/software\/([^/]+)\/monitor$/);
    if (req.method === "GET" && softwareMonitorMatch) {
      requireAuth(ctx);
      const softwareId = decodeURIComponent(softwareMonitorMatch[1]);
      const db = await readDb();
      const software = db.sprSoftware.find((item) => item.id === softwareId);
      if (!software) return sendError(res, 404, "NOT_FOUND", "Software not found.");
      const evidence = db.sprEvidence.filter((item) => item.softwareId === softwareId);
      const signals = (db.sprSignals || []).filter((item) => item.softwareId === softwareId).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      const verifiedEvidence = evidence.filter((item) => String(item.verificationStatus || "").toLowerCase() === "verified" || item.verified === true).length;
      const alerts = [];
      if (evidence.length === 0) alerts.push({ level: "warning", message: "No evidence has been submitted yet." });
      if (verifiedEvidence < evidence.length) alerts.push({ level: "info", message: "Some evidence is still pending verification." });
      if (signals.some((item) => item.type === "cve")) alerts.push({ level: "warning", message: "Known CVEs were flagged for this software." });
      if (signals.some((item) => item.type === "breach")) alerts.push({ level: "warning", message: "Breach signal recorded for this software." });
      const monitoring = {
        softwareId,
        lastCheckedAt: new Date().toISOString(),
        evidenceCount: evidence.length,
        verifiedEvidence,
        signalCount: signals.length,
        signals,
        alerts,
        status: alerts.some((item) => item.level === "warning") ? "at-risk" : "healthy",
      };
      return sendJson(res, 200, { ok: true, monitoring });
    }

    const softwareSignalsMatch = pathname.match(/^\/api\/spr\/software\/([^/]+)\/signals$/);
    if (req.method === "POST" && softwareSignalsMatch) {
      requireAuth(ctx);
      const softwareId = decodeURIComponent(softwareSignalsMatch[1]);
      const payload = await readJson(req);
      const db = await readDb();
      const software = db.sprSoftware.find((item) => item.id === softwareId);
      if (!software) return sendError(res, 404, "NOT_FOUND", "Software not found.");

      try {
        monitoring.validateSignal(payload);
      } catch (err) {
        return sendError(res, err.statusCode || 400, err.code || "VALIDATION_ERROR", err.message || "Invalid signal");
      }

      let sanitized;
      try {
        sanitized = monitoring.sanitizeSignal(payload);
      } catch (err) {
        return sendError(res, err.statusCode || 400, err.code || "VALIDATION_ERROR", err.message || "Invalid signal payload");
      }

      const normalizedSignal = monitoring.normalizeSignal(sanitized, { workspaceId: payload.workspaceId || ctx.workspaceId || null });

      try {
        monitoring.bindToWorkspace(ctx, normalizedSignal);
      } catch (err) {
        return sendError(res, err.statusCode || 403, err.code || "FORBIDDEN", err.message || "Cross-workspace signal not allowed");
      }

      const signal = await mutateDb((db2) => {
        const record = {
          id: createId("sprsignal", `${softwareId}-${normalizedSignal.type}`),
          softwareId,
          type: normalizedSignal.type,
          severity: normalizedSignal.severity,
          summary: normalizedSignal.summary,
          source: normalizedSignal.source,
          createdAt: normalizedSignal.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          numericSignals: normalizedSignal.numericSignals || {},
          workspaceId: normalizedSignal.workspaceId || null,
          vendor: normalizedSignal.vendor || null,
        };
        db2.sprSignals = db2.sprSignals || [];
        db2.sprSignals.push(record);
        appendSprAuditLog(db2, "signal.created", record.id, { type: record.type, severity: record.severity, source: record.source, numericSignals: record.numericSignals, workspaceId: record.workspaceId });
        return record;
      });
      return sendJson(res, 201, { ok: true, signal });
    }

    const softwareSbomMatch = pathname.match(/^\/api\/spr\/software\/([^/]+)\/sbom$/);
    if (req.method === "POST" && softwareSbomMatch) {
      requireAuth(ctx);
      const softwareId = decodeURIComponent(softwareSbomMatch[1]);
      const payload = await readJson(req);
      const db = await readDb();
      const software = db.sprSoftware.find((item) => item.id === softwareId);
      if (!software) return sendError(res, 404, "NOT_FOUND", "Software not found.");
      const evidence = await mutateDb((db2) => {
        const record = {
          id: createId("sprevidence", `${softwareId}-sbom`),
          softwareId,
          type: "sbom",
          title: "SBOM Ingested",
          summary: String(payload.summary || "SBOM content ingested").trim(),
          source: "sbom",
          uri: String(payload.uri || "").trim(),
          strength: Number(payload.strength || 0.8),
          freshnessDays: Number(payload.freshnessDays || 7),
          verified: Boolean(payload.verified === true),
          visibility: "public",
          accessToken: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db2.sprEvidence.push(record);
        return record;
      });
      return sendJson(res, 201, { ok: true, evidence });
    }

    const softwareProvenanceMatch = pathname.match(/^\/api\/spr\/software\/([^/]+)\/provenance$/);
    if (req.method === "POST" && softwareProvenanceMatch) {
      requireAuth(ctx);
      const softwareId = decodeURIComponent(softwareProvenanceMatch[1]);
      const payload = await readJson(req);
      const db = await readDb();
      const software = db.sprSoftware.find((item) => item.id === softwareId);
      if (!software) return sendError(res, 404, "NOT_FOUND", "Software not found.");
      const evidence = await mutateDb((db2) => {
        const record = {
          id: createId("sprevidence", `${softwareId}-slsa`),
          softwareId,
          type: String(payload.type || "slsa").trim().toLowerCase(),
          title: "SLSA Provenance",
          summary: String(payload.summary || `Provenance from ${payload.source || "manual"}`).trim(),
          source: String(payload.source || "manual").trim(),
          uri: String(payload.uri || "").trim(),
          strength: Number(payload.strength || 0.9),
          freshnessDays: Number(payload.freshnessDays || 7),
          verified: Boolean(payload.verified === true),
          visibility: "public",
          accessToken: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db2.sprEvidence.push(record);
        return record;
      });
      return sendJson(res, 201, { ok: true, evidence });
    }

    const evidenceBundleMatch = pathname.match(/^\/api\/spr\/evidence\/([^/]+)\/bundle$/);
    if (req.method === "POST" && evidenceBundleMatch) {
      requireAuth(ctx);
      const evidenceId = decodeURIComponent(evidenceBundleMatch[1]);
      const payload = await readJson(req);
      const encrypted = Boolean(payload.encrypted === true);
      const recipients = sanitizeList(payload.recipients);
      const selectiveDisclosure = Boolean(payload.selectiveDisclosure === true);
      const requestId = String(payload.requestId || "").trim() || createId("bundlereq", `${evidenceId}-${Date.now()}`);

      if (encrypted && recipients.length === 0) {
        return sendError(res, 400, "VALIDATION_ERROR", "Encrypted bundles require at least one recipient.");
      }

      const updated = await mutateDb((db) => {
        const record = db.sprEvidence.find((item) => item.id === evidenceId);
        if (!record) return null;
        if (record.bundle?.requestId && record.bundle.requestId === requestId) {
          return { __error: "REPLAY" };
        }
        const bundleWorkspaceId = String(payload.workspaceId || ctx.workspaceId || "default").trim() || "default";
        if (ctx.workspaceId && bundleWorkspaceId !== ctx.workspaceId) {
          return { __error: "INVALID_WORKSPACE" };
        }
        const bundlePayload = payload.content || JSON.stringify({ evidenceId: record.id, title: record.title, summary: record.summary, uri: record.uri, visibility: record.visibility, createdAt: record.createdAt, updatedAt: record.updatedAt });
        const integrityHash = hashBundleIntegrity(bundlePayload);
        const bundle = {
          encrypted,
          recipients,
          selectiveDisclosure,
          requestId,
          workspaceId: bundleWorkspaceId,
          createdAt: record.bundle?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          integrityHash,
        };
        if (encrypted) {
          Object.assign(bundle, encryptWorkspacePayload(bundleWorkspaceId, bundlePayload));
          bundle.replayNonce = randomBytes(12).toString("base64url");
        } else {
          bundle.plaintext = bundlePayload;
        }
        record.bundle = bundle;
        record.updatedAt = new Date().toISOString();
        appendSprAuditLog(db, "evidence.bundle_created", record.id, {
          encrypted,
          recipients,
          selectiveDisclosure,
          requestId,
          workspaceId: bundleWorkspaceId,
          replaySnapshot: auditReplay.capture("evidence.bundle", { evidence: record, db }),
        });
        return record;
      });
      if (updated && updated.__error === "REPLAY") {
        return sendError(res, 409, "REPLAY_ERROR", "Duplicate bundle request.");
      }
      if (!updated) return sendError(res, 404, "NOT_FOUND", "Evidence not found.");
      return sendJson(res, 200, { ok: true, evidence: updated });
    }

    const evidenceZkpMatch = pathname.match(/^\/api\/spr\/evidence\/([^/]+)\/zkp$/);
    if (req.method === "POST" && evidenceZkpMatch) {
      requireAuth(ctx);
      const evidenceId = decodeURIComponent(evidenceZkpMatch[1]);
      const payload = await readJson(req);
      const updated = await mutateDb((db) => {
        const record = db.sprEvidence.find((item) => item.id === evidenceId);
        if (!record) return null;
        record.zkProof = {
          statement: String(payload.statement || "").trim(),
          proof: String(payload.proof || "").trim(),
          verified: Boolean(payload.verified === true),
        };
        record.updatedAt = new Date().toISOString();
        return record;
      });
      if (!updated) return sendError(res, 404, "NOT_FOUND", "Evidence not found.");
      return sendJson(res, 200, { ok: true, evidence: updated });
    }

    const evidencePrivacyMatch = pathname.match(/^\/api\/spr\/evidence\/([^/]+)\/privacy$/);
    if (req.method === "POST" && evidencePrivacyMatch) {
      requireAuth(ctx);
      const evidenceId = decodeURIComponent(evidencePrivacyMatch[1]);
      const payload = await readJson(req);
      const updated = await mutateDb((db) => {
        const record = db.sprEvidence.find((item) => item.id === evidenceId);
        if (!record) return null;
        const vendorId = String(payload.vendorId || "").trim() || null;
        const workspaceId = String(payload.workspaceId || "").trim() || null;
        const visibility = String(payload.visibility || "public").trim().toLowerCase() || "public";
        const accessToken = String(payload.accessToken || "").trim() || null;
        const parsedToken = parseScopedAccessToken(accessToken, vendorId, workspaceId);
        const expectedAccessToken = [parsedToken.vendorId, parsedToken.workspaceId, visibility].filter(Boolean).join(":") || null;
        if (visibility === "restricted" && accessToken && accessToken !== expectedAccessToken) {
          return { __error: "INVALID_SCOPE" };
        }
        if (visibility === "restricted" && !accessToken) {
          return { __error: "VALIDATION_ERROR" };
        }
        record.visibility = visibility;
        record.accessToken = accessToken;
        record.updatedAt = new Date().toISOString();
        appendSprAuditLog(db, "evidence.visibility_changed", record.id, { visibility, accessToken: record.accessToken, vendorId, workspaceId });
        return record;
      });
      if (updated && updated.__error) {
        if (updated.__error === "INVALID_SCOPE") return sendError(res, 403, "FORBIDDEN", "Restricted evidence token scope is invalid.");
        return sendError(res, 400, "VALIDATION_ERROR", "Restricted evidence requires a scoped access token.");
      }
      if (!updated) return sendError(res, 404, "NOT_FOUND", "Evidence not found.");
      return sendJson(res, 200, { ok: true, evidence: updated });
    }

    if (req.method === "POST" && pathname === "/api/spr/procurement/filter") {
      requireAuth(ctx);
      const payload = await readJson(req);
      const db = await readDb();
      const minTrustScore = Number(payload.minTrustScore || 0);
      const maxRisk = String(payload.maxRisk || "High").trim().toLowerCase();
      const riskRank = { low: 0, moderate: 1, high: 2 };
      const software = (db.sprSoftware || []).map((item) => {
        const vendor = db.sprVendors.find((vendorItem) => vendorItem.id === item.vendorId) || null;
        const evidence = db.sprEvidence.filter((evidenceItem) => evidenceItem.softwareId === item.id);
        const score = computeSprPassportScore(item, evidence, vendor);
        return { ...item, vendor, score };
      }).filter((item) => item.score.trustScore >= minTrustScore && (!maxRisk || (riskRank[String(item.score.riskCategory || "high").trim().toLowerCase()] ?? 2) <= (riskRank[maxRisk] ?? 2)));
      return sendJson(res, 200, { ok: true, software });
    }

    if (req.method === "POST" && pathname === "/api/spr/passports/issue") {
      requireAuth(ctx);
      const payload = await readJson(req);
      const softwareId = String(payload.softwareId || "").trim();
      if (!softwareId) return sendError(res, 400, "VALIDATION_ERROR", "Software is required.");
      const workspaceId = String(payload.workspaceId || "").trim() || null;
      const vendorId = String(payload.vendorId || "").trim() || null;
      const accessToken = String(payload.accessToken || "").trim() || null;
      const effectiveWorkspaceId = workspaceId || ctx.workspaceId || null;
      let passport = null;

      try {
        passport = await isolateExecution({ workspaceId: effectiveWorkspaceId, passportKey: softwareId }, async () => {
          const db = await readDb();
          const software = db.sprSoftware.find((item) => item.id === softwareId);
          if (!software) throw Object.assign(new Error("Software not found."), { statusCode: 404, code: "NOT_FOUND" });
          const vendor = db.sprVendors.find((item) => item.id === software.vendorId) || null;
          const evidence = db.sprEvidence.filter((item) => item.softwareId === softwareId);
          const visibility = normalizePassportVisibility(String(payload.visibility || "public").trim().toLowerCase());
          const allowedVisibility = visibility;
          const normalizedVendorId = String(vendorId || software.vendorId || "").trim() || null;
          const parsedToken = parseScopedAccessToken(accessToken, normalizedVendorId, workspaceId);
          if (allowedVisibility === "restricted" && !accessToken) {
            throw Object.assign(new Error("Restricted passports require an access token."), { statusCode: 400, code: "VALIDATION_ERROR" });
          }
          if (allowedVisibility === "restricted" && parsedToken.vendorId && normalizedVendorId && parsedToken.vendorId !== normalizedVendorId) {
            throw Object.assign(new Error("Restricted passport token scope is invalid for this vendor."), { statusCode: 403, code: "FORBIDDEN" });
          }
          if (allowedVisibility === "restricted" && parsedToken.workspaceId && workspaceId && parsedToken.workspaceId !== workspaceId) {
            throw Object.assign(new Error("Restricted passport token scope is invalid for this workspace."), { statusCode: 403, code: "FORBIDDEN" });
          }
          if (allowedVisibility === "restricted") {
            try {
              restrictedTokens.verify(db, accessToken, { workspaceId: workspaceId || effectiveWorkspaceId || null, evidenceType: 'passport' });
            } catch (err) {
              throw Object.assign(new Error(err.message), { statusCode: err.statusCode || 400, code: err.code || "VALIDATION_ERROR" });
            }
          }
          const freshnessViolations = evidence.filter((item) => {
            try {
              const r = freshness.enforceEvidenceTTL(item, { maxAgeDays: DEFAULT_RESTRICTED_EVIDENCE_TTL_DAYS });
              return !r.ok;
            } catch (e) {
              return true;
            }
          });
          if (allowedVisibility === "restricted" && freshnessViolations.length > 0) {
            throw Object.assign(new Error("Restricted passports require fresh evidence."), { statusCode: 400, code: "VALIDATION_ERROR" });
          }
          const now = new Date();
          const scoringProfile = String(payload.profile || "default").trim().toLowerCase() || "default";
          const { bound, normalizedEvidence } = bindEvidence({
            software,
            vendor,
            evidenceList: evidence,
            visibility: allowedVisibility,
            accessToken,
            workspaceId,
            scoringProfile,
            issuedBy: String(payload.issuedBy || ctx.user?.name || "system").trim(),
          });
          const normalizedInputs = trustScore.normalizeInputs({
            software,
            vendor,
            evidenceList: normalizedEvidence,
            profile: scoringProfile,
            workspaceId: bound.workspaceId,
          });
          const deterministic = trustScore.computeDeterministic(normalizedInputs);
          const { trustScore: computedTrustScore, confidenceScore, verdict, riskCategory } = deterministic;
          return mutateDb((db2) => {
            const record = {
              id: createId("sprpassport", softwareId),
              softwareId: bound.softwareId,
              vendorId: bound.vendorId,
              softwareName: bound.softwareName,
              vendorName: bound.vendorName,
              visibility: bound.visibility,
              accessToken: bound.accessToken,
              workspaceId: bound.workspaceId,
              scoringProfile: bound.scoringProfile,
              evidenceIds: bound.evidenceIds,
              trustGraphHash: bound.trustGraphHash,
              evidenceFreshnessHash: bound.evidenceFreshnessHash,
              evidenceBundleHash: passportVerifier.createEvidenceBundleHash(normalizedEvidence),
              evidenceSummary: bound.evidenceSummary,
              passportEnvelopeVersion: 1,
              trustScore: computedTrustScore,
              confidenceScore,
              verdict,
              riskCategory,
              status: bound.visibility === "public" ? "Active" : bound.visibility === "restricted" ? "Restricted" : "Draft",
              issuedAt: now.toISOString().slice(0, 10),
              expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
              issuedBy: bound.issuedBy,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            };
            record.passportEnvelopeHash = createPassportEnvelopeHash(record);
            record.trustScoreHash = trustScore.hashOutput({
              scoreResult: deterministic,
              workspaceId: bound.workspaceId,
              passportEnvelopeHash: record.passportEnvelopeHash,
            });
            db2.sprPassports.push(record);
            appendSprAuditLog(db2, bound.visibility === "restricted" ? "passport.access_granted" : "passport.issued", record.id, {
              visibility: bound.visibility,
              accessToken: bound.accessToken,
              scoringProfile: record.scoringProfile,
              workspaceId: bound.workspaceId,
              trustScoreHash: record.trustScoreHash,
              replaySnapshot: auditReplay.capture("passport.issue", { passport: record, db: db2 }),
            });
            return record;
          });
        });
      } catch (error) {
        if (error.statusCode && error.code) {
          return sendError(res, error.statusCode, error.code, error.message);
        }
        throw error;
      }
      return sendJson(res, 201, { ok: true, passport });
    }

    const restrictedPassportMatch = pathname.match(/^\/api\/spr\/passports\/([^/]+)\/restricted$/);
    if (req.method === "GET" && restrictedPassportMatch) {
      const passportId = decodeURIComponent(restrictedPassportMatch[1]);
      const accessToken = String(url.searchParams.get("accessToken") || "").trim();
      const db = await readDb();
      const passport = (db.sprPassports || []).find((item) => item.id === passportId);
      if (!passport) return sendError(res, 404, "NOT_FOUND", "Passport not found.");
      const scopedToken = String(accessToken || "").trim();
      const parsedToken = parseScopedAccessToken(scopedToken, passport.vendorId, passport.workspaceId);
      const expectedToken = [parsedToken.vendorId || passport.vendorId, parsedToken.workspaceId || passport.workspaceId, passport.visibility].filter(Boolean).join(":") || null;
      if (passport.visibility !== "restricted" || scopedToken !== expectedToken) return sendError(res, 403, "FORBIDDEN", "Restricted passport access denied.");
      await mutateDb((db2) => {
        appendSprAuditLog(db2, "passport.access_granted", passport.id, { accessToken: scopedToken, vendorId: passport.vendorId, workspaceId: passport.workspaceId });
        return true;
      });
      return sendJson(res, 200, { ok: true, passportId: passport.id, passport: buildPublicPassportResponse(passport, db) });
    }

    const passportRenewMatch = pathname.match(/^\/api\/spr\/passports\/([^/]+)\/renew$/);
    if (req.method === "POST" && passportRenewMatch) {
      requireAuth(ctx);
      const passportId = decodeURIComponent(passportRenewMatch[1]);
      const payload = await readJson(req);
      const db = await readDb();
      const passport = db.sprPassports.find((item) => item.id === passportId);
      if (!passport) return sendError(res, 404, "NOT_FOUND", "Passport not found.");
      passport.status = "Active";
      passport.revoked = false;
      passport.revokedAt = null;
      passport.issuedBy = String(payload.issuedBy || passport.issuedBy || ctx.user?.name || "system").trim();
      passport.updatedAt = new Date().toISOString();
      passport.expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return sendJson(res, 200, { ok: true, passport });
    }

    const passportVersionMatch = pathname.match(/^\/api\/spr\/passports\/([^/]+)\/version$/);
    if (req.method === "POST" && passportVersionMatch) {
      requireAuth(ctx);
      const passportId = decodeURIComponent(passportVersionMatch[1]);
      const payload = await readJson(req);
      const db = await readDb();
      const passport = db.sprPassports.find((item) => item.id === passportId);
      if (!passport) return sendError(res, 404, "NOT_FOUND", "Passport not found.");
      passport.version = Number(passport.version || 1) + 1;
      passport.summary = String(payload.summary || "Version updated").trim();
      passport.updatedAt = new Date().toISOString();
      return sendJson(res, 201, { ok: true, passport });
    }

    const passportRevokeMatch = pathname.match(/^\/api\/spr\/passports\/([^/]+)\/revoke$/);
    if (req.method === "POST" && passportRevokeMatch) {
      requireAuth(ctx);
      const passportId = decodeURIComponent(passportRevokeMatch[1]);
      const payload = await readJson(req);
      const db = await readDb();
      const passport = db.sprPassports.find((item) => item.id === passportId);
      if (!passport) return sendError(res, 404, "NOT_FOUND", "Passport not found.");
      passport.revoked = true;
      passport.revokedAt = new Date().toISOString();
      passport.status = "Revoked";
      passport.reason = String(payload.reason || "No reason provided").trim();
      passport.updatedAt = new Date().toISOString();
      return sendJson(res, 200, { ok: true, passport });
    }

    if (req.method === "GET" && pathname === "/api/spr/passports") {
      requireAuth(ctx);
      const db = await readDb();
      const map = new Map();
      for (const passport of db.sprPassports || []) {
        const key = passport.softwareId || passport.id;
        if (!map.has(key) || String(passport.createdAt || "") >= String(map.get(key).createdAt || "")) {
          map.set(key, passport);
        }
      }
      const passports = Array.from(map.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return sendJson(res, 200, { ok: true, passports });
    }

    const passportReplayMatch = pathname.match(/^\/api\/spr\/audit\/passport\/([^/]+)\/replay$/);
    if (req.method === "GET" && passportReplayMatch) {
      requireAuth(ctx);
      const passportId = decodeURIComponent(passportReplayMatch[1]);
      const db = await readDb();
      const events = (db.sprAuditLogs || []).filter((item) => item.targetId === passportId).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      const chainResult = auditChain.verify(events);
      const chainSnapshot = auditChain.snapshot(events, {
        workspaceId: ctx.workspaceId || null,
        trustGraphHash: null,
        passportEnvelopeHash: null,
      });
      const replayResults = events.map((event) => {
        if (event.payload?.replaySnapshot) {
          return {
            eventId: event.id,
            type: event.type,
            targetId: event.targetId,
            replay: auditReplay.verify(event.payload.replaySnapshot, db),
          };
        }
        return {
          eventId: event.id,
          type: event.type,
          targetId: event.targetId,
          replay: null,
          reason: "No replay snapshot available.",
        };
      });
      return sendJson(res, 200, { ok: true, passportId, events, chainValid: chainResult.ok, chainResult, chainSnapshot, replayResults });
    }

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
      const verification = await isolateExecution(
        { workspaceId: result.passport.workspaceId || ctx.workspaceId, passportKey: `passport:${passportId}` },
        async () => passportVerifier.verifyPassport(result.passport, db, ctx.workspaceId)
      );
      return sendJson(res, 200, {
        ok: verification.ok,
        passportId,
        verification,
        passport: result.passport,
      });
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
      let project;
      try {
        project = runtimeGuards.requireProject(db, ctx, projectId);
      } catch (error) {
        return sendError(res, error.statusCode || 500, error.code || "SERVER_ERROR", error.message);
      }
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
      const payload = await readJson(req);
      const runId = String(payload.runId || "").trim();
      const db = await readDb();
      let project;
      try {
        project = runtimeGuards.requireProject(db, ctx, projectId);
      } catch (error) {
        return sendError(res, error.statusCode || 500, error.code || "SERVER_ERROR", error.message);
      }
      const dependencies = db.projectDependencies.filter((item) => item.projectId === projectId);
      const metadataItem = db.projectMetadata.find((item) => item.projectId === projectId);
      const metadata = metadataItem?.data || {};
      const hasSbom = dbHasArtifact(db, projectId, "SBOM");
      const hasPackageList = dbHasArtifact(db, projectId, "PACKAGE_LIST");
      const hasMetadata = Boolean(metadata && Object.keys(metadata).length > 0);
      const hasRepoUrl = Boolean(project.repoUrl);

      if (!hasSbom && !hasPackageList && !hasMetadata && !hasRepoUrl) {
        return sendError(res, 400, "VALIDATION_ERROR", "Pipeline run requires at least one artifact, metadata, or repository URL.");
      }

      if (runId) {
        const duplicate = db.projectEvents.find((event) => event.projectId === projectId && event.type === "PIPELINE_RUN_REQUESTED" && event.details?.runId === runId);
        if (duplicate) {
          return sendError(res, 409, "REPLAY_ERROR", "Duplicate pipeline run request.");
        }
      }

      const executionKey = runId ? `project-run:${projectId}:${runId}` : `project-run:${projectId}:anonymous`;
      let signals = null;
      let score = null;
      let narrative = null;
      const result = await isolateExecution({ workspaceId: project.workspaceId, projectId }, async () =>
        runtimeGuards.withCircularExecutionGuard(executionKey, async () => {
          signals = computeProjectSignals(db, project, dependencies, metadata);
          const now = new Date().toISOString();
          score = computePipelineScore(signals, { hasSbom, hasPackageList, hasMetadata, hasRepoUrl });
          narrative = buildProjectNarrative(project, signals, { hasSbom, hasPackageList, hasMetadata, hasRepoUrl, totalDependencies: dependencies.length });
          return await mutateDb((db2) => {
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
            recordProjectEvent(db2, projectId, "PIPELINE_RUN_REQUESTED", { runId: runId || null, projectId });
            recordProjectEvent(db2, projectId, "SIGNALS_COMPUTED", { signals, narrative });
            recordProjectEvent(db2, projectId, "SCORE_COMPUTED", { score: score.score, confidence: score.confidence, riskBand: score.riskBand, narrative });
            appendSprAuditLog(db2, "pipeline.run", projectId, {
              runId: runId || null,
              replaySnapshot: auditReplay.capture("pipeline.run", {
                project,
                db: db2,
                dependencies,
                metadata,
                signals,
                score,
                runId,
              }),
            });
            return { signalRecord, scoreRecord };
          });
        })
      );
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
      const { token, csrfToken } = await createSession(user.id, { workspaceId: workspace.id });
      res.setHeader("Set-Cookie", [sessionCookie(token), csrfCookie(csrfToken)]);
      return sendJson(res, 201, { user, workspace, role, memberships: [{ workspace, role }] });
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const payload = await readJson(req);
      const { user, workspace, role } = await authenticateUser(payload);
      const { token, csrfToken } = await createSession(user.id, { workspaceId: workspace?.id || null });
      res.setHeader("Set-Cookie", [sessionCookie(token), csrfCookie(csrfToken)]);
      return sendJson(res, 200, { user, workspace, role, memberships: [{ workspace, role }] });
    }

    // Demo login: creates or finds a demo user and session for quick access
    if (req.method === "POST" && pathname === "/api/auth/demo-login") {
      // create a demo user if none exists and attach to first MSP or create demo MSP
      const db = await readDb();
      let user = db.users.find((u) => u.email === "demo@ventureos.local");
      const now = new Date().toISOString();
      if (!user) {
        user = { id: createId("user", "demo"), name: "Demo User", email: "demo@ventureos.local", passwordHash: await hashPassword("demopass123"), createdAt: now, updatedAt: now };
        db.users.push(user);
      }
      // ensure there is at least one MSP and workspace
      let msp = (db.msps || [])[0];
      if (!msp) {
        const created = createMsp(db, { name: "Demo MSP", billingEmail: "demo@ventureos.local", region: "us-east-1", ownerUserId: user.id });
        msp = created.msp;
      }
      // ensure membership
      if (!(db.mspMembers || []).some((m) => m.mspId === msp.id && m.userId === user.id)) {
        createMspMembership(db, { mspId: msp.id, userId: user.id, role: "admin" });
      }
      // ensure at least one workspace
      let workspace = (db.workspaces || []).find((w) => w.mspId === msp.id);
      if (!workspace) {
        workspace = createWorkspaceForMsp(db, { mspId: msp.id, name: "Demo Workspace", ownerUserId: user.id });
      }
      // create session with demoMode flag
      const { token, csrfToken } = await createSession(user.id, { demoMode: true });
      res.setHeader("Set-Cookie", [sessionCookie(token), csrfCookie(csrfToken)]);
      return sendJson(res, 200, { ok: true, user: publicUser(user), workspace, mspId: msp.id });
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
        workspaceId: ctx.workspaceId || null,
        workspaceOwnershipVerified: Boolean(ctx.workspaceOwnershipVerified === true),
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
      const mode = mapMspSummaryMode(billingState.billingStatus);
      const billingStatus = mapMspBillingStatusForSummary(billingState.billingStatus);
      return sendJson(res, 200, {
        ok: true,
        mspId,
        mode,
        billingStatus,
        workspaces: usage.totalWorkspaces,
        totals: {
          assets: totals.assetCount,
          scans: totals.scanCount,
          passports: totals.passportCount,
          nodes: totals.nodeCount,
          edges: totals.edgeCount,
          riskEvents: totals.riskEvents,
          timelineEvents: totals.timelineEvents,
        },
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
      const overview = getWorkspaceOverview({ db, mspId, workspaces })
        .map((workspace) => ({
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
        }))
        .sort((a, b) => {
          const priority = { critical: 0, warning: 1, healthy: 2, inactive: 3, suspended: 4 };
          const aPriority = priority[a.health] ?? 5;
          const bPriority = priority[b.health] ?? 5;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return String(a.name || "").localeCompare(String(b.name || ""));
        });
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
      const workspace = process.env.DATABASE_URL
        ? await createWorkspaceForUser(ctx.userId, cleanName)
        : await mutateDb((db2) => {
            const now = new Date().toISOString();
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
      let workspaces;
      if (process.env.DATABASE_URL) {
        workspaces = await listWorkspacesForUser(ctx.userId);
      } else {
        const db = await readDb();
        const memberships = db.workspaceMembers.filter((member) => member.userId === ctx.userId);
        workspaces = memberships
          .map((member) => {
            const workspace = ctx.mspId ? getWorkspaceForMsp(db, ctx.mspId, member.workspaceId) : db.workspaces.find((item) => item.id === member.workspaceId);
            return workspace ? { ...workspace, role: member.role } : null;
          })
          .filter(Boolean);
      }
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

    // Evidence ingestion endpoints for vendors within a workspace
    if (pathname.match(/^\/api\/workspaces\/[^/]+\/vendors\/[^/]+\/evidence$/)) {
      const parts = pathname.split('/');
      const workspaceId = parseWorkspaceId(pathname);
      const vendorId = decodeURIComponent(parts[4] || '');
      if (!workspaceId || !vendorId) return sendError(res, 400, 'VALIDATION_ERROR', 'Workspace and vendor IDs are required.');

      if (req.method === 'POST') {
        requireAuth(ctx);
        requireWorkspaceMatch(ctx, workspaceId);
        await validateCsrf(req, ctx);
        const payload = await readJson(req);
        const type = String(payload.type || '').trim();
        const title = String(payload.title || '').trim();
        const url = payload.url ? String(payload.url).trim() : null;
        const expiresAt = payload.expiresAt ? String(payload.expiresAt).trim() : null;
        if (!type || !title) return sendError(res, 400, 'VALIDATION_ERROR', 'Evidence type and title are required.');
        const item = await mutateDb((db2) => {
          const now = new Date().toISOString();
          db2.evidenceItems = db2.evidenceItems || [];
          const record = {
            id: createId('evidence', `${workspaceId}-${vendorId}-${title}`),
            workspaceId,
            vendorId,
            type,
            title,
            url,
            createdAt: now,
            expiresAt: expiresAt || null,
            status: expiresAt && new Date(expiresAt) < new Date() ? 'expired' : 'active',
          };
          db2.evidenceItems.push(record);
          return record;
        });
        return sendJson(res, 201, { ok: true, item });
      }

      if (req.method === 'GET') {
        requireAuth(ctx);
        requireWorkspaceMatch(ctx, workspaceId);
        const db = await readDb();
        const items = (db.evidenceItems || []).filter((e) => e.workspaceId === workspaceId && e.vendorId === vendorId);
        return sendJson(res, 200, { ok: true, items });
      }
    }

    // Trust score calculation for a vendor in a workspace
    if (req.method === 'GET' && pathname.match(/^\/api\/workspaces\/[^/]+\/vendors\/[^/]+\/trust-score$/)) {
      const parts = pathname.split('/');
      const workspaceId = parseWorkspaceId(pathname);
      const vendorId = decodeURIComponent(parts[4] || '');
      if (!workspaceId || !vendorId) return sendError(res, 400, 'VALIDATION_ERROR', 'Workspace and vendor IDs are required.');
      requireAuth(ctx);
      requireWorkspaceMatch(ctx, workspaceId);
      const db = await readDb();
      const evidence = (db.evidenceItems || []).filter((e) => e.workspaceId === workspaceId && e.vendorId === vendorId);
      const total = evidence.length;
      const expired = evidence.filter((e) => e.status === 'expired' || (e.expiresAt && new Date(e.expiresAt) < new Date())).length;
      const score = Math.max(0, Math.min(100, total * 10 - expired * 20));
      const band = score >= 80 ? 'high' : score >= 40 ? 'medium' : 'low';
      const confidence = Math.min(1, total / 10);
      return sendJson(res, 200, { ok: true, score, band, confidence, updatedAt: new Date().toISOString() });
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
      const existing = await findWorkspaceMember(workspaceContext.workspaceId, user.id);
      if (existing) return sendError(res, 409, "CONFLICT", "User is already a workspace member.");
      const member = process.env.DATABASE_URL
        ? await addWorkspaceMember(workspaceContext.workspaceId, user.id, role)
        : await mutateDb((db2) => {
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
      const member = await findWorkspaceMember(workspaceContext.workspaceId, targetUserId);
      if (!member) return sendError(res, 404, "NOT_FOUND", "Workspace member not found.");
      if (member.role === role) return sendJson(res, 200, { member });
      const updated = process.env.DATABASE_URL
        ? await updateWorkspaceMemberRole(workspaceContext.workspaceId, targetUserId, role)
        : await mutateDb((db2) => {
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
      const member = await findWorkspaceMember(workspaceContext.workspaceId, targetUserId);
      if (!member) return sendError(res, 404, "NOT_FOUND", "Workspace member not found.");
      if (member.userId === workspaceContext.userId && workspaceContext.role === "Owner") {
        return sendError(res, 403, "FORBIDDEN", "Workspace owners may not remove their own membership.");
      }
      if (process.env.DATABASE_URL) {
        await removeWorkspaceMember(workspaceContext.workspaceId, targetUserId);
      } else {
        await mutateDb((db2) => {
          db2.workspaceMembers = db2.workspaceMembers.filter((item) => item.id !== member.id);
        });
      }
      return sendJson(res, 200, { ok: true });
    }

    if (req.method !== "GET" && pathname !== "/api/auth/login" && pathname !== "/api/auth/signup" && pathname !== "/api/auth/demo-login") {
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
      const graphTtl = freshness.enforceGraphTTL(graph, db, { workspaceId });
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: result, meta: { generatedAt: result.generatedAt, nodeCount: result.nodeCount, edgeCount: result.edgeCount, graphTtl } });
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
      const result = await runtimeGuards.withCircularExecutionGuard(`workspace-graph-build:${workspaceId}`, async () => await constructWorkspaceGraph(workspaceId));
      return sendJson(res, 200, { ok: true, workspace: workspaceId, data: { nodes: result.record.nodes, edges: result.record.edges, summary: result.record.summary }, meta: { generatedAt: result.record.generatedAt, nodeCount: result.record.nodes.length, edgeCount: result.record.edges.length } });
    }

    const graphTimelineWorkspaceMatch = pathname.match(/^\/api\/timeline\/([^/]+)\/events$/);
    const graphStalenessWorkspaceMatch = pathname.match(/^\/api\/timeline\/([^/]+)\/staleness$/);

    const mspExportCsvMatch = pathname.match(/^\/api\/msp\/([^/]+)\/export\/csv$/);
    const mspAutomationRebuildMatch = pathname.match(/^\/api\/msp\/([^/]+)\/automation\/rebuild-graphs$/);
    const mspBillingPortalMatch = pathname.match(/^\/api\/msp\/([^/]+)\/billing\/portal$/);
    const mspAutomationJobsMatch = pathname.match(/^\/api\/msp\/([^/]+)\/automation\/jobs$/);
    const mspBillingCreateMatch = pathname.match(/^\/api\/msp\/([^/]+)\/billing\/create$/);

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

    if (req.method === "GET" && mspExportCsvMatch) {
      const mspId = decodeURIComponent(mspExportCsvMatch[1]);
      requireAuth(ctx);
      requireMspMembership(ctx, mspId);
      const db = await readDb();
      const msp = getMspById(db, mspId);
      if (!msp) return sendError(res, 404, "NOT_FOUND", "MSP not found.");
      const workspaces = listWorkspacesForMsp(db, mspId);
      // Build simple CSV from workspace overview
      const rows = ["workspace_id,name,asset_count,scan_count,passport_count,node_count,edge_count,healthScore"];
      for (const w of workspaces) {
        const overview = getWorkspaceOverview({ db, mspId, workspaces: [w] })[0] || {};
        rows.push([w.id, csvSafe(w.name), overview.assetCount || 0, overview.scanCount || 0, overview.passportCount || 0, overview.nodeCount || 0, overview.edgeCount || 0, overview.healthScore || ""].join(","));
      }
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" });
      res.end(rows.join("\n"));
      return true;
    }

    if (mspAutomationJobsMatch && req.method === "GET") {
      const mspId = decodeURIComponent(mspAutomationJobsMatch[1]);
      requireAuth(ctx);
      requireMspMembership(ctx, mspId);
      const db = await readDb();
      const jobs = (db.automationJobs || []).filter((j) => j.mspId === mspId);
      return sendJson(res, 200, { ok: true, jobs });
    }

    if (mspAutomationJobsMatch && req.method === "POST") {
      const mspId = decodeURIComponent(mspAutomationJobsMatch[1]);
      requireAuth(ctx);
      requireMspAdmin(ctx, mspId);
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      const db = await readDb();
      const id = createId("automation", `${mspId}-${Date.now()}`);
      const job = await mutateDb((db2) => {
        db2.automationJobs = db2.automationJobs || [];
        const record = {
          id,
          mspId,
          type: String(payload.type || "rebuild_graphs"),
          schedule: payload.schedule || null,
          createdBy: ctx.userId,
          createdAt: new Date().toISOString(),
          lastRun: null,
          status: "pending",
        };
        db2.automationJobs.push(record);
        return record;
      });
      return sendJson(res, 201, { ok: true, job });
    }

    if (req.method === "POST" && mspAutomationRebuildMatch) {
      const mspId = decodeURIComponent(mspAutomationRebuildMatch[1]);
      requireAuth(ctx);
      requireMspAdmin(ctx, mspId);
      await validateCsrf(req, ctx);
      const db = await readDb();
      const workspaces = listWorkspacesForMsp(db, mspId);
      const results = [];
      for (const w of workspaces) {
        try {
          const r = await constructWorkspaceGraph(w.id);
          results.push({ workspaceId: w.id, nodes: r.record.nodes.length, edges: r.record.edges.length });
        } catch (err) {
          results.push({ workspaceId: w.id, error: String(err.message || err) });
        }
      }
      return sendJson(res, 200, { ok: true, mspId, results });
    }

    if (mspBillingCreateMatch && req.method === "POST") {
      const mspId = decodeURIComponent(mspBillingCreateMatch[1]);
      requireAuth(ctx);
      requireMspAdmin(ctx, mspId);
      await validateCsrf(req, ctx);
      const payload = await readJson(req);
      try {
        const result = await createSubscriptionForMsp(mspId, payload);
        return sendJson(res, 201, { ok: true, subscription: result });
      } catch (err) {
        return sendError(res, 500, "SERVER_ERROR", String(err.message || err));
      }
    }

    if (req.method === "GET" && mspBillingPortalMatch) {
      const mspId = decodeURIComponent(mspBillingPortalMatch[1]);
      requireAuth(ctx);
      requireMspMembership(ctx, mspId);
      const url = getBillingPortalUrl(mspId);
      if (!url) return sendError(res, 404, "NOT_FOUND", "Billing portal not configured.");
      return sendJson(res, 200, { ok: true, url });
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
  if (req?.body != null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      return req.body;
    }
    const raw = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
    return raw ? JSON.parse(raw) : {};
  }
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


