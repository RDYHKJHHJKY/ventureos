import { query } from './lib/server/db.js';
import { auditChain } from './lib/server/audit-chain.js';

(async () => {
  try {
    const sql = 'SELECT id, type, target_id as "targetId", workspace_id as "workspaceId", payload, payload_hash as "payloadHash", previous_audit_hash as "previousAuditHash", audit_hash as "auditHash", created_at as "createdAt" FROM spr_audit_logs ORDER BY created_at ASC, id ASC';
    const result = await query(sql);
    console.log(JSON.stringify({ count: result.rows.length, rows: result.rows }, null, 2));
    console.log('verify', auditChain.verify(result.rows));
  } catch (err) {
    console.error(err);
  }
})();
