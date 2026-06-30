function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeAgeDays(date, now = new Date()) {
  if (!date) return null;
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

export const DEFAULT_EVIDENCE_TTL_DAYS = 365;
export const DEFAULT_RESTRICTED_EVIDENCE_TTL_DAYS = 180;
export const DEFAULT_PIPELINE_TTL_DAYS = 30;
export const DEFAULT_PASSPORT_TTL_DAYS = 90;
export const DEFAULT_GRAPH_NODE_TTL_DAYS = 30;
export const DEFAULT_GRAPH_PASSPORT_TTL_DAYS = 30;

export function resolveEvidenceAgeDays(evidence = {}) {
  const freshnessDays = evidence.freshnessDays != null ? normalizeInteger(evidence.freshnessDays) : null;
  if (freshnessDays != null) return freshnessDays;
  const createdAt = parseDate(evidence.createdAt || evidence.generatedAt || evidence.timestamp);
  return createdAt ? Math.floor(computeAgeDays(createdAt)) : null;
}

export function enforceEvidenceTTL(evidence = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const maxAgeDays = normalizeInteger(options.maxAgeDays ?? DEFAULT_EVIDENCE_TTL_DAYS);
  const ageDays = resolveEvidenceAgeDays(evidence);
  const expired = ageDays != null ? ageDays > maxAgeDays : false;
  const result = {
    ok: !expired,
    ageDays,
    maxAgeDays,
    expired,
    details: {
      id: String(evidence.id || evidence.softwareId || "").trim() || null,
      type: String(evidence.type || "").trim() || null,
      visibility: String(evidence.visibility || "").trim() || null,
    },
  };

  if (options.strict && expired) {
    const error = new Error(`Evidence TTL exceeded: ${ageDays} days old exceeds max ${maxAgeDays} days.`);
    error.statusCode = 400;
    error.code = "STALE_EVIDENCE_TTL";
    error.details = { ...result };
    throw error;
  }

  return result;
}

export function enforcePassportTTL(passport = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const maxAgeDays = normalizeInteger(options.maxAgeDays ?? DEFAULT_PASSPORT_TTL_DAYS);
  const expiresAt = parseDate(passport.expiresAt);
  const issuedAt = parseDate(passport.issuedAt || passport.createdAt || passport.updatedAt);
  const ageDays = issuedAt ? Math.floor(computeAgeDays(issuedAt, now)) : null;
  const expired = expiresAt ? expiresAt.getTime() < now.getTime() : false;
  const revoked = passport.revoked === true || String(passport.status || "").toLowerCase() === "revoked";
  const stale = ageDays != null ? ageDays > maxAgeDays : false;
  const ok = !expired && !revoked && !stale;
  const result = {
    ok,
    expired,
    revoked,
    stale,
    ageDays,
    maxAgeDays,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    details: {
      id: String(passport.id || passport.softwareId || "").trim() || null,
      visibility: String(passport.visibility || "").trim() || null,
      status: String(passport.status || "").trim() || null,
    },
  };

  if (options.strict && !ok) {
    const message = expired
      ? "Passport has expired."
      : revoked
      ? "Passport has been revoked."
      : "Passport TTL exceeded.";
    const error = new Error(message);
    error.statusCode = 400;
    error.code = revoked ? "PASSPORT_REVOKED" : expired ? "PASSPORT_EXPIRED" : "PASSPORT_STALE";
    error.details = { ...result };
    throw error;
  }

  return result;
}

export function enforcePipelineTTL(runRecord = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const maxAgeDays = normalizeInteger(options.maxAgeDays ?? DEFAULT_PIPELINE_TTL_DAYS);
  const timestamp = parseDate(runRecord.computedAt || runRecord.createdAt || runRecord.updatedAt || runRecord.timestamp);
  const ageDays = timestamp ? Math.floor(computeAgeDays(timestamp, now)) : null;
  const stale = ageDays != null ? ageDays > maxAgeDays : false;
  const ok = !stale;
  const result = {
    ok,
    stale,
    ageDays,
    maxAgeDays,
    timestamp: timestamp ? timestamp.toISOString() : null,
    details: {
      id: String(runRecord.id || runRecord.projectId || "").trim() || null,
      type: String(runRecord.type || "pipeline").trim() || "pipeline",
    },
  };

  if (options.strict && stale) {
    const error = new Error(`Pipeline run TTL exceeded: ${ageDays} days old exceeds max ${maxAgeDays} days.`);
    error.statusCode = 400;
    error.code = "PIPELINE_STALE";
    error.details = { ...result };
    throw error;
  }

  return result;
}

function getNodeTimestamp(node = {}, db = {}) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "Asset") {
    const assetId = String(node.id || "").replace(/^Asset:/, "");
    const asset = (db.assets || []).find((item) => item.id === assetId);
    if (!asset) return null;
    return parseDate(asset.lastScannedAt || asset.updatedAt || asset.createdAt);
  }
  if (node.type === "Project") {
    const projectId = String(node.id || "").replace(/^Project:/, "");
    const project = (db.projects || []).find((item) => item.id === projectId);
    if (!project) return null;
    const latestScore = (db.projectScores || [])
      .filter((item) => item.projectId === projectId)
      .sort((a, b) => String(b.computedAt || b.updatedAt || b.createdAt || "").localeCompare(String(a.computedAt || a.updatedAt || a.createdAt || "")))[0] || null;
    return parseDate(latestScore?.computedAt || project.updatedAt || project.createdAt);
  }
  return null;
}

export function enforceGraphTTL(graph = {}, db = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const workspaceId = String(options.workspaceId || "").trim() || null;
  const maxNodeAgeDays = normalizeInteger(options.maxNodeAgeDays ?? DEFAULT_GRAPH_NODE_TTL_DAYS);
  const maxPassportAgeDays = normalizeInteger(options.maxPassportAgeDays ?? DEFAULT_GRAPH_PASSPORT_TTL_DAYS);

  const staleNodes = Array.isArray(graph.nodes) ? graph.nodes.reduce((result, node) => {
    const timestamp = getNodeTimestamp(node, db);
    const ageDays = timestamp ? Math.floor(computeAgeDays(timestamp, now)) : null;
    if (ageDays != null && ageDays > maxNodeAgeDays) {
      result.push({
        nodeId: node.id,
        nodeType: node.type,
        ageDays,
        maxNodeAgeDays,
      });
    }
    return result;
  }, []) : [];

  const passports = Array.isArray(db.passports)
    ? db.passports.filter((passport) => !workspaceId || String(passport.workspaceId || "").trim() === workspaceId)
    : [];

  const expiredPassports = passports
    .map((passport) => ({ passport, expiresAt: parseDate(passport.expiresAt) }))
    .filter((item) => item.expiresAt && item.expiresAt.getTime() < now.getTime())
    .map((item) => ({ passportId: item.passport.id, expiresAt: item.expiresAt.toISOString() }));

  const expiringPassports = passports
    .map((passport) => ({ passport, expiresAt: parseDate(passport.expiresAt) }))
    .filter((item) => item.expiresAt)
    .map((item) => ({
      passportId: item.passport.id,
      expiresAt: item.expiresAt.toISOString(),
      daysRemaining: Math.round((item.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .filter((item) => item.daysRemaining >= 0 && item.daysRemaining <= maxPassportAgeDays);

  const ok = staleNodes.length === 0 && expiredPassports.length === 0;
  const result = {
    ok,
    staleNodes,
    expiredPassports,
    expiringPassports,
    thresholds: {
      maxNodeAgeDays,
      maxPassportAgeDays,
    },
    generatedAt: now.toISOString(),
  };

  if (options.strict && !ok) {
    const error = new Error("Graph TTL enforcement failed. Stale nodes or expired passports were detected.");
    error.statusCode = 400;
    error.code = "GRAPH_TTL_VIOLATION";
    error.details = { ...result };
    throw error;
  }

  return result;
}

export const freshness = {
  enforceEvidenceTTL,
  enforcePassportTTL,
  enforcePipelineTTL,
  enforceGraphTTL,
  resolveEvidenceAgeDays,
};
