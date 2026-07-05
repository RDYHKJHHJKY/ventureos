import { readDb } from './lib/server/data-store.js';

const db = await readDb();
db.sprEvidence = db.sprEvidence || [];
db.sprEvidence.push({
  id: 'evidence-demo-1',
  softwareId: 'demo-software',
  type: 'soc2',
  title: 'SOC2 evidence',
  summary: 'Sample evidence',
  visibility: 'restricted',
  workspaceId: 'ws-1',
  vendorId: 'vendor-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const evidence = db.sprEvidence.find((item) => item.id === 'evidence-demo-1');
console.log(JSON.stringify({
  evidenceId: evidence.id,
  visibility: evidence.visibility,
  hasAccessToken: false,
  redacted: evidence.visibility === 'restricted',
}, null, 2));
