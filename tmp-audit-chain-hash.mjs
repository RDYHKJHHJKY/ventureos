import { auditChain } from './lib/server/audit-chain.js';

const payload = {
  type: 'cve',
  source: 'nvd',
  severity: 2,
  workspaceId: 'f0728d95-21c0-4f17-be05-a3863997b519',
  numericSignals: { severity: 2, confidence: 0 },
};
const payloadHash = 'sha256:2d0b5706a20bd020ec794334aef6bb4e9abc7cd49a31e7f0e7c74bc30071f9d';
const entry = {
  previousAuditHash: null,
  createdAt: '2026-07-05T18:45:21.545Z',
  workspaceId: 'f0728d95-21c0-4f17-be05-a3863997b519',
  type: 'signal.created',
  targetId: 'sprsignal_udshro',
  payloadHash,
};
console.log('payloadHash', auditChain.hashPayload(payload));
console.log('computedAuditHash', auditChain.hashEntry(entry));
console.log('expectedAuditHash', 'sha256:16c7e1aa9e11d1b73118bc5fbc41de086b46c0486943bc74aff653f2feb7d7a0');
