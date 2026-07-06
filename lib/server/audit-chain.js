import { createHash } from "node:crypto";
import { createId } from "./data-store.js";

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof value.toJSON === "function") {
    return stableStringify(value.toJSON());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function hashObject(value) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

export function hashPayload(payload = {}) {
  return hashObject(payload);
}

export function normalizeChainField(value) {
  if (value == null) return null;
  return String(value).trim() || null;
}

function hashEntry({ previousAuditHash = null, createdAt = null, workspaceId = null, type = null, targetId = null, payloadHash = null } = {}) {
  return hashObject({ previousAuditHash, createdAt, workspaceId, type, targetId, payloadHash });
}

export function append(db = {}, { type, targetId = null, payload = {}, workspaceId = null, createdAt = null } = {}) {
  if (!db || typeof db !== "object") {
    throw new Error("Audit chain append requires a database object.");
  }
  db.sprAuditLogs ||= [];
  const previousEntry = (db.sprAuditLogs || []).slice(-1)[0] || null;
  const previousAuditHash = previousEntry?.auditHash || null;
  const payloadHash = hashPayload(payload || {});
  const entryCreatedAt = createdAt || new Date().toISOString();
  const auditHash = hashEntry({
    previousAuditHash,
    createdAt: entryCreatedAt,
    workspaceId: normalizeChainField(workspaceId),
    type: normalizeChainField(type) || "unknown",
    targetId: normalizeChainField(targetId),
    payloadHash,
  });
  const entry = {
    id: createId("spraudit", `${String(type || "event").trim()}-${String(targetId || "global").trim()}`),
    type: String(type || "event").trim(),
    targetId: String(targetId || "").trim() || null,
    payload: payload || {},
    workspaceId: String(workspaceId || "").trim() || null,
    payloadHash,
    previousAuditHash,
    auditHash,
    createdAt: entryCreatedAt,
  };
  db.sprAuditLogs.push(entry);
  return entry;
}

export function verify(entries = []) {
  if (!Array.isArray(entries)) {
    return { ok: false, reason: "Audit entries must be an array." };
  }
  let previousHash = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const expectedPreviousHash = previousHash;
    if (entry.previousAuditHash !== expectedPreviousHash) {
      return {
        ok: false,
        reason: "Broken audit chain.",
        index,
        expectedPreviousHash,
        previousAuditHash: entry.previousAuditHash,
      };
    }
    const payloadHash = hashPayload(entry.payload || {});
    if (entry.payloadHash !== payloadHash) {
      return {
        ok: false,
        reason: "Audit entry payload tampering detected.",
        index,
        entryId: entry.id,
        expectedPayloadHash: payloadHash,
        payloadHash: entry.payloadHash,
      };
    }
    // Allow legacy rows where `workspaceId` may have been stored in the payload
    const topLevelWorkspace = entry.workspaceId != null && String(entry.workspaceId).trim() !== "" ? entry.workspaceId : null;
    const payloadWorkspace = entry.payload && (entry.payload.workspaceId != null || entry.payload.workspace_id != null)
      ? (entry.payload.workspaceId || entry.payload.workspace_id || null)
      : null;

    const candidateTop = hashEntry({
      previousAuditHash: expectedPreviousHash,
      createdAt: entry.createdAt,
      workspaceId: topLevelWorkspace,
      type: entry.type,
      targetId: entry.targetId,
      payloadHash,
    });
    const candidatePayload = hashEntry({
      previousAuditHash: expectedPreviousHash,
      createdAt: entry.createdAt,
      workspaceId: payloadWorkspace,
      type: entry.type,
      targetId: entry.targetId,
      payloadHash,
    });

    if (entry.auditHash !== candidateTop && entry.auditHash !== candidatePayload) {
      return {
        ok: false,
        reason: "Audit entry hash tampering detected.",
        index,
        entryId: entry.id,
        expectedAuditHash: candidatePayload,
        auditHash: entry.auditHash,
      };
    }
    previousHash = entry.auditHash;
  }
  return { ok: true, length: entries.length, lastHash: previousHash };
}

export function snapshot(entries = [], { workspaceId = null, trustGraphHash = null, passportEnvelopeHash = null } = {}) {
  const chainResult = verify(entries);
  const chainHash = chainResult.ok ? chainResult.lastHash : null;
  const summary = {
    workspaceId: String(workspaceId || "").trim() || null,
    trustGraphHash: String(trustGraphHash || "").trim() || null,
    passportEnvelopeHash: String(passportEnvelopeHash || "").trim() || null,
    chainHash,
    entryCount: Array.isArray(entries) ? entries.length : 0,
  };
  const snapshotHash = hashObject(summary);
  return { ok: chainResult.ok, chainResult, snapshotHash, summary };
}

export const auditChain = {
  append,
  verify,
  snapshot,
  hashPayload,
  hashEntry,
};
