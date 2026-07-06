import { createHash } from 'node:crypto';

const payloadHash = 'sha256:2d0b5706a20bd020ec794334aef6bb4e9abc7cd49a31e7f0e7c74bc30071f9d';
const entry = {
  previousAuditHash: null,
  createdAt: '2026-07-05T18:45:21.545Z',
  workspaceId: 'f0728d95-21c0-4f17-be05-a3863997b519',
  type: 'signal.created',
  targetId: 'sprsignal_udshro',
  payloadHash,
};
const target = 'sha256:16c7e1aa9e11d1b73118bc5fbc41de086b46c0486943bc74aff653f2feb7d7a0';

function hash(value) {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

const fields = ['previousAuditHash', 'createdAt', 'workspaceId', 'type', 'targetId', 'payloadHash'];
const perms = (arr) => arr.length === 0 ? [[]] : arr.flatMap((v, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [v, ...p]));
const strings = new Map();
for (const order of perms(fields)) {
  const obj = {};
  for (const key of order) obj[key] = entry[key];
  const stable = stableStringify(obj);
  const json = JSON.stringify(obj);
  strings.set(stable, { order, method: 'stable', hash: hash(stable) });
  strings.set(json, { order, method: 'json', hash: hash(json) });
}
for (const [text, info] of strings) {
  if (info.hash === target) {
    console.log('match', info);
    console.log(text);
    break;
  }
}
console.log('done');
