const MAX_EVIDENCE_PAYLOAD_BYTES = 256 * 1024;
const ALLOWED_EVIDENCE_MIME_TYPES = new Set(["application/json", "application/xml", "text/plain", "text/markdown", "application/octet-stream"]);

function toNumber(value, fallback = 0) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const cleaned = value.trim().toLowerCase();
    if (cleaned === "true") return 1;
    if (cleaned === "false") return 0;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toBooleanNumber(value, fallback = 0) {
  if (value === true || value === 1 || value === "true" || value === "1") return 1;
  if (value === false || value === 0 || value === "false" || value === "0") return 0;
  return fallback;
}

function normalizeSeverity(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(3, Math.round(value)));
  if (typeof value === "string" && value.trim() !== "") {
    const cleaned = value.trim().toLowerCase();
    const severityMap = { info: 0, low: 1, medium: 2, high: 2, critical: 3 };
    if (severityMap[cleaned] != null) return severityMap[cleaned];
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(3, Math.round(parsed)));
  }
  return fallback;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeWorkspaceId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeVendorMetadata(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: String(value.id || "").trim() || null,
    name: String(value.name || "").trim() || null,
    domain: String(value.domain || "").trim() || null,
  };
}

function normalizeTrustScore(value) {
  const numeric = toNumber(value, 0);
  return Math.max(0, Math.min(100, numeric));
}

function sanitizeString(value) {
  return String(value ?? "").trim();
}

function sanitizePayload(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 16).map((item) => sanitizePayload(item));
  if (typeof value === "object") {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof key === "string" && key.length <= 64) {
        output[key] = sanitizePayload(entry);
      }
    }
    return output;
  }
  return null;
}

function buildValidationError(message, details = {}) {
  const error = new Error(message);
  error.name = "EvidencePipelineValidationError";
  error.details = details;
  return error;
}

export const evidencePipeline = {
  normalize(input, context = {}) {
    const workspaceId = normalizeWorkspaceId(context.workspaceId || input.workspaceId || input.tenant || null);
    const normalized = {
      id: String(input.id || "").trim() || null,
      softwareId: String(input.softwareId || "").trim() || null,
      type: String(input.type || input.framework || input.evidenceType || "generic").trim().toLowerCase() || "generic",
      title: sanitizeString(input.title || input.summary || "Evidence"),
      summary: sanitizeString(input.summary || input.title || ""),
      source: sanitizeString(input.source || "manual"),
      uri: sanitizeString(input.uri || ""),
      strength: toNumber(input.strength, 0),
      freshnessDays: toNumber(input.freshnessDays, 0),
      verified: toBooleanNumber(input.verified, 0),
      visibility: String(input.visibility || "public").trim().toLowerCase() || "public",
      accessToken: sanitizeString(input.accessToken || "") || null,
      workspaceId,
      vendor: normalizeVendorMetadata(input.vendor || input.vendorMetadata || null),
      vendorId: String(input.vendorId || input.vendor?.id || "").trim() || null,
      trustScore: normalizeTrustScore(input.trustScore),
      createdAt: normalizeTimestamp(input.createdAt || input.timestamp || input.generatedAt),
      updatedAt: normalizeTimestamp(input.updatedAt || input.updatedAt || input.createdAt || input.timestamp || input.generatedAt),
      payload: sanitizePayload(input.payload || input.content || input.body || null),
      mimeType: String(input.mimeType || input.contentType || "application/json").trim().toLowerCase() || "application/json",
      numericSignals: {},
    };
    if (input.numericSignals && typeof input.numericSignals === "object") {
      normalized.numericSignals = Object.fromEntries(Object.entries(input.numericSignals).map(([key, value]) => [key, toNumber(value, 0)]));
    }
    if (input.severity != null) normalized.numericSignals.severity = normalizeSeverity(input.severity, 0);
    if (input.confidence != null) normalized.numericSignals.confidence = toBooleanNumber(input.confidence, 0);
    if (input.score != null) normalized.numericSignals.score = toNumber(input.score, 0);
    if (input.trustScore != null) normalized.numericSignals.trustScore = normalizeTrustScore(input.trustScore);
    return normalized;
  },

  validate(input, context = {}) {
    const normalized = this.normalize(input, context);
    if (!normalized.softwareId) {
      throw buildValidationError("Missing software identifier.", { code: "MISSING_SOFTWARE_ID" });
    }
    if (!normalized.type) {
      throw buildValidationError("Missing evidence type.", { code: "MISSING_EVIDENCE_TYPE" });
    }
    if (!normalized.title) {
      throw buildValidationError("Missing evidence title.", { code: "MISSING_TITLE" });
    }
    if (normalized.createdAt) {
      const createdAt = new Date(normalized.createdAt);
      const now = new Date();
      const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 365) {
        throw buildValidationError("Evidence timestamp is stale.", { code: "STALE_EVIDENCE", ageDays });
      }
    }
    if (normalized.workspaceId && context.workspaceId && normalized.workspaceId !== context.workspaceId) {
      throw buildValidationError("Cross-workspace evidence is not allowed.", { code: "CROSS_WORKSPACE", workspaceId: normalized.workspaceId });
    }
    const payloadText = typeof normalized.payload === "string" ? normalized.payload : JSON.stringify(normalized.payload || {});
    const payloadBytes = Buffer.byteLength(payloadText, "utf8");
    if (payloadBytes > MAX_EVIDENCE_PAYLOAD_BYTES) {
      throw buildValidationError("Evidence payload exceeds allowed size.", { code: "PAYLOAD_TOO_LARGE", sizeBytes: payloadBytes });
    }
    if (normalized.mimeType && !ALLOWED_EVIDENCE_MIME_TYPES.has(normalized.mimeType)) {
      throw buildValidationError("Unsupported evidence MIME type.", { code: "UNSUPPORTED_MIME_TYPE", mimeType: normalized.mimeType });
    }
    return normalized;
  },

  sanitize(input, context = {}) {
    const normalized = this.validate(input, context);
    return {
      ...normalized,
      payload: normalized.payload,
      summary: normalized.summary.slice(0, 2048),
      title: normalized.title.slice(0, 256),
      uri: normalized.uri.slice(0, 1024),
      source: normalized.source.slice(0, 128),
    };
  },
};
