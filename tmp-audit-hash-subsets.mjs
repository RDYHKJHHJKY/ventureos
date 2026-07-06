import { createHash } from 'node:crypto';

const entry = {
  previousAuditHash: null,
  createdAt: '2026-07-05T18:45:21.545Z',
  workspaceId: 'f0728d95-21c0-4f17-be05-a3863997b519',
  type: 'signal.created',
  targetId: 'sprsignal_udshro',
  payloadHash: 'sha256:2d0b5706a20bd020ec794334aef6bb4e9abc7cd49a31e7f0e7c74bc30071f9d',
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
function permute(arr) {
  if (arr.length === 0) return [[]];
  return arr.flatMap((x, i) => permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}
const fields = Object.keys(entry);
for (let mask = 1; mask < (1 << fields.length); mask++) {
  const subset = fields.filter((_, idx) => (mask & (1 << idx)) !== 0);
  const perms = permute(subset);
  for (const order of perms) {
    const obj = {};
    for (const key of order) obj[key] = entry[key];
    const stable = stableStringify(obj);
    if (hash(stable) === target) {
      console.log('match stable', order);
      console.log(stable);
      process.exit(0);
    }
    const js = JSON.stringify(obj);
    if (hash(js) === target) {
      console.log('match json', order);
      console.log(js);
      process.exit(0);
    }
    const concat = order.map((k) => String(entry[k])).join('');
    if (hash(concat) === target) {
      console.log('match concat', order);
      console.log(concat);
      process.exit(0);
    }
    const quotedConcat = order.map((k) => JSON.stringify(entry[k])).join('');
    if (hash(quotedConcat) === target) {
      console.log('match quoted concat', order);
      console.log(quotedConcat);
      process.exit(0);
    }
  }
}
console.log('no match');
