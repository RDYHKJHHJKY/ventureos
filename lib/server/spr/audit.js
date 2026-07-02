import { auditChain as auditEngine } from "../audit-chain.js";

export function appendAuditEvent(db = {}, { type, targetId = null, payload = {}, workspaceId = null, createdAt = null } = {}) {
  return auditEngine.append(db, { type, targetId, payload, workspaceId, createdAt });
}

export function verifyAuditEntries(entries = []) {
  return auditEngine.verify(entries);
}

export function snapshotAudit(entries = [], options = {}) {
  return auditEngine.snapshot(entries, options);
}

export function hashPayload(payload = {}) {
  return auditEngine.hashPayload(payload);
}
