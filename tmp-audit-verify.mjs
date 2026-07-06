import { query } from './lib/server/db.js';
import { auditChain } from './lib/server/audit-chain.js';
(async () => {
  try {
    const sql = 'SELECT id, type, target_id as "targetId", payload, workspace_id as "workspaceId", payload_hash as "payloadHash", previous_audit_hash as "previousAuditHash", audit_hash as "auditHash", created_at as "createdAt" FROM spr_audit_logs ORDER BY created_at ASC';
    const res = await query(sql);
    console.log(JSON.stringify({ count: res.rows.length, verify: auditChain.verify(res.rows), rows: res.rows.map(r => ({ id: r.id, type: r.type, targetId: r.targetId, workspaceId: r.workspaceId, payloadHash: r.payloadHash, previousAuditHash: r.previousAuditHash, auditHash: r.auditHash, createdAt: r.createdAt })) }, null, 2));
  } catch (err) {
    console.error(err);
  }
})();
