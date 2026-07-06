import { randomBytes, createHash } from "node:crypto";
import { createId } from "./data-store.js";
import { safeCompare } from "./spr/shared.js";

function nowISOString() {
  return new Date().toISOString();
}

function normalizeString(v) {
  return v == null ? null : String(v).trim() || null;
}

export function issueToken(db, options = {}) {
  const workspaceId = normalizeString(options.workspaceId);
  const projectId = normalizeString(options.projectId);
  const evidenceType = normalizeString(options.evidenceType);
  const ttlDays = Number.isFinite(Number(options.ttlDays)) ? Math.max(1, Math.trunc(Number(options.ttlDays))) : 90;
  const issuedBy = normalizeString(options.issuedBy) || "system";
  const secret = randomBytes(16).toString("hex") + "." + Date.now().toString(36);
  const token = createHash("sha256").update(secret).digest("hex");
  const now = nowISOString();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const record = {
    id: createId("restrictedtok", token.slice(0, 8)),
    token,
    workspaceId,
    projectId,
    evidenceType,
    ttlDays,
    issuedBy,
    createdAt: now,
    expiresAt,
  };
  db.sprRestrictedTokens = db.sprRestrictedTokens || [];
  db.sprRestrictedTokens.push(record);
  return record;
}

export function findToken(db, token) {
  if (!token) return null;
  const normalized = String(token).trim();
  return (db.sprRestrictedTokens || []).find((t) => safeCompare(t.token, normalized)) || null;
}

export function parseScopedAccessToken(token) {
  const normalized = String(token || "").trim();
  if (!normalized) return { token: null, vendorId: null, workspaceId: null, visibility: null };
  const [vendorId, workspaceId, visibility] = normalized.split(":");
  return {
    token: normalized,
    vendorId: String(vendorId || "").trim() || null,
    workspaceId: String(workspaceId || "").trim() || null,
    visibility: String(visibility || "").trim() || null,
  };
}

export function verifyToken(db, token, options = {}) {
  const workspaceId = normalizeString(options.workspaceId);
  const projectId = normalizeString(options.projectId);
  const evidenceType = normalizeString(options.evidenceType);
  const allowLegacy = options.allowLegacy !== false;
  if (!token) {
    const err = new Error("Restricted token required.");
    err.statusCode = 400; err.code = "VALIDATION_ERROR"; throw err;
  }
  const record = findToken(db, token);
  if (record) {
    const now = new Date();
    const expires = record.expiresAt ? new Date(record.expiresAt) : null;
    if (expires && expires.getTime() < now.getTime()) {
      const err = new Error("Restricted token expired.");
      err.statusCode = 400; err.code = "VALIDATION_ERROR";
      throw err;
    }
    if (workspaceId && record.workspaceId && workspaceId !== record.workspaceId) {
      const err = new Error("Restricted token workspace mismatch.");
      err.statusCode = 403; err.code = "FORBIDDEN";
      throw err;
    }
    if (projectId && record.projectId && projectId !== record.projectId) {
      const err = new Error("Restricted token project mismatch.");
      err.statusCode = 403; err.code = "FORBIDDEN";
      throw err;
    }
    if (evidenceType && record.evidenceType && evidenceType !== record.evidenceType) {
      const err = new Error("Restricted token evidence type mismatch.");
      err.statusCode = 403; err.code = "FORBIDDEN";
      throw err;
    }
    return { ok: true, record };
  }
  if (allowLegacy) {
    const parsed = parseScopedAccessToken(token);
    if (!parsed.token) {
      const err = new Error("Restricted token invalid.");
      err.statusCode = 403; err.code = "FORBIDDEN";
      throw err;
    }
    if (workspaceId && (!parsed.workspaceId || workspaceId !== parsed.workspaceId)) {
      const err = new Error("Restricted token workspace mismatch.");
      err.statusCode = 403; err.code = "FORBIDDEN";
      throw err;
    }
    if (evidenceType && parsed.visibility && parsed.visibility !== "restricted") {
      const err = new Error("Restricted token evidence type mismatch.");
      err.statusCode = 403; err.code = "FORBIDDEN";
      throw err;
    }
    return { ok: true, record: parsed, legacy: true };
  }
  const err = new Error("Restricted token invalid.");
  err.statusCode = 403; err.code = "FORBIDDEN";
  throw err;
}

export const restrictedTokens = {
  issue: issueToken,
  find: findToken,
  verify: verifyToken,
};
