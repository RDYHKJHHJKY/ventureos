import { query } from './lib/server/db.js';
(async () => {
  try {
    const sql = `SELECT id, type, target_id as "targetId", payload, workspace_id as "workspaceId", payload_hash as "payloadHash", previous_audit_hash as "previousAuditHash", audit_hash as "auditHash", created_at as "createdAt"
     FROM spr_audit_logs
     ORDER BY created_at ASC`;
    const res = await query(sql);
    console.log('count', res.rows.length);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  }
})();
