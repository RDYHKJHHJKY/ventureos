import { auditChain } from '../lib/server/audit-chain.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '.data', 'ventureos-db.json');
const db = JSON.parse(readFileSync(DB_PATH,'utf8'));
const audits = db.sprAuditLogs || [];
const id = 'spraudit_zbgrpb';
const entry = audits.find(e => e.id === id);
if (!entry) {
  console.error('Entry not found:', id);
  process.exit(1);
}
console.log('Found entry:', entry.id, entry.type, 'createdAt=', entry.createdAt || entry.created_at);
const storedPayloadHash = entry.payloadHash || entry.payload_hash;
console.log('stored payloadHash:', storedPayloadHash);
const computedPayloadHash = auditChain.hashPayload(entry.payload || {});
console.log('computed payloadHash:', computedPayloadHash);

const storedAuditHash = entry.auditHash || entry.audit_hash;
console.log('stored auditHash:', storedAuditHash);

const createdAtStored = entry.createdAt || entry.created_at;
const prevStored = entry.previousAuditHash || entry.previous_audit_hash || null;
const workspaceCandidates = [entry.workspaceId || null, (entry.payload && (entry.payload.workspaceId || entry.payload.workspace_id)) || null, null, ''];
const createdVariants = [createdAtStored, (createdAtStored ? new Date(createdAtStored).toISOString() : createdAtStored)];

for (const ws of workspaceCandidates) {
  for (const created of createdVariants) {
    const candidate = auditChain.hashEntry({ previousAuditHash: prevStored, createdAt: created, workspaceId: ws, type: entry.type, targetId: entry.targetId, payloadHash: computedPayloadHash });
    const ok = candidate === storedAuditHash;
    console.log('candidate workspace=', ws, 'created=', created, '->', candidate, ok ? 'MATCH' : '');
  }
}

console.log('\nIf none match, try varying previousAuditHash or createdAt microsecond differences.');
