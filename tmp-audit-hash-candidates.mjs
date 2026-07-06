import { createHash } from 'node:crypto';

const target = 'sha256:16c7e1aa9e11d1b73118bc5fbc41de086b46c0486943bc74aff653f2feb7d7a0';
const payloadHash = 'sha256:2d0b5706a20bd020ec794334aef6bb4e9abc7cd49a31e7f0e7c74bc30071f9d';
const createdAt = '2026-07-05T18:45:21.545Z';
const workspaceId = 'f0728d95-21c0-4f17-be05-a3863997b519';
const type = 'signal.created';
const targetId = 'sprsignal_udshro';

function hash(s) { return 'sha256:' + createHash('sha256').update(s).digest('hex'); }
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

const candidates = [
  { previousAuditHash: null, workspaceId, createdAt, type, targetId, payloadHash },
  { previousAuditHash: 'null', workspaceId, createdAt, type, targetId, payloadHash },
  { previousAuditHash: '', workspaceId, createdAt, type, targetId, payloadHash },
  { createdAt, type, targetId, payloadHash, workspaceId, previousAuditHash: null },
  { createdAt, targetId, type, workspaceId, payloadHash, previousAuditHash: null },
  { previousAuditHash: null, createdAt, type, workspaceId, targetId, payloadHash },
  { previousAuditHash: null, createdAt, type, targetId, payloadHash },
  { previousAuditHash: null, createdAt, type, targetId, payloadHash, workspaceId: null },
  { previousAuditHash: undefined, createdAt, workspaceId, type, targetId, payloadHash },
  { previousAuditHash: null, createdAt, workspaceId, type, targetId, payloadHash: payloadHash.slice(7) },
];

for (const candidate of candidates) {
  const stable = stableStringify(candidate);
  const json = JSON.stringify(candidate);
  const simple = Object.values(candidate).map((v) => String(v)).join('');
  console.log('candidate', candidate);
  console.log(' stable', hash(stable));
  console.log(' json', hash(json));
  console.log(' simple', hash(simple));
  console.log('---');
  if (hash(stable) === target || hash(json) === target || hash(simple) === target) {
    console.log('MATCH', candidate);
    break;
  }
}
