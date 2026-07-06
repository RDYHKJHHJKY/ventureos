import { auditChain } from '../lib/server/audit-chain.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '.data', 'ventureos-db.json');

function print(...args) { console.log(...args); }

let db;
try {
  db = JSON.parse(readFileSync(DB_PATH, 'utf8'));
} catch (err) {
  console.error('Failed to load DB at', DB_PATH, err.message);
  process.exit(1);
}

const audits = db.sprAuditLogs || db.spr_audit_logs || db.spr_audit || [];
if (!Array.isArray(audits) || audits.length === 0) {
  console.error('No audit entries found in DB at', DB_PATH);
  process.exit(1);
}

print('Found', audits.length, 'audit entries. Inspecting first 6 entries...');

const entriesToCheck = audits.slice(0, 6);

for (let i = 0; i < entriesToCheck.length; i++) {
  const entry = entriesToCheck[i];
  print('\n=== ENTRY', i, 'id=' + (entry.id || entry.id), 'type=' + (entry.type || entry.type), 'createdAt=' + (entry.createdAt || entry.created_at) + ' ===');

  const storedPayloadHash = entry.payloadHash || entry.payload_hash || null;
  const computedPayloadHash = auditChain.hashPayload(entry.payload || {});
  print('stored payloadHash:', storedPayloadHash);
  print('computed payloadHash:', computedPayloadHash, storedPayloadHash === computedPayloadHash ? 'MATCH' : 'DIFFER');

  const storedAuditHash = entry.auditHash || entry.audit_hash || null;
  print('stored auditHash:', storedAuditHash);

  const createdAtStored = entry.createdAt || entry.created_at;
  const workspaceStored = entry.workspaceId || entry.workspace_id || null;
  const prevStored = entry.previousAuditHash || entry.previous_audit_hash || null;

  const createdVariants = [createdAtStored, (createdAtStored ? new Date(createdAtStored).toISOString() : createdAtStored)];
  const workspaceVariants = [workspaceStored, workspaceStored ? String(workspaceStored).trim() : null, null, ''];
  const prevVariants = [prevStored, null];

  let found = false;
  for (const created of createdVariants) {
    for (const ws of workspaceVariants) {
      for (const prev of prevVariants) {
        const candidate = auditChain.hashEntry({ previousAuditHash: prev, createdAt: created, workspaceId: ws, type: entry.type || entry.type, targetId: entry.targetId || entry.target_id, payloadHash: auditChain.hashPayload(entry.payload || {}) });
        const match = candidate === storedAuditHash;
        if (match) {
          print('\nMATCH FOUND for auditHash with variant:');
          print('  createdAt:', created);
          print('  workspaceId:', ws === null ? 'null' : String(ws));
          print('  previousAuditHash:', prev);
          print('  computed:', candidate);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (found) break;
  }
  if (!found) {
    print('\nNo matching auditHash found using basic variants.');
    print('Try additional normalizations or run full brute-force candidate script.');
  }
}

print('\nDiagnostic complete.');
