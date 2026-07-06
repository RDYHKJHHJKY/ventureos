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
const fields = Object.keys(entry);

function hash(value) {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}

function serialize(obj, style) {
  switch (style) {
    case 'json': return JSON.stringify(obj);
    case 'stable': {
      const keys = Object.keys(obj).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k], 'json')}`).join(',')}}`;
    }
    case 'noquotes': {
      const keys = Object.keys(obj).sort();
      return `{${keys.map((k) => `${k}:${serialize(obj[k], 'json')}`).join(',')}}`;
    }
    case 'keyvalue': {
      const keys = Object.keys(obj).sort();
      return keys.map((k) => `${k}=${serialize(obj[k], 'json')}`).join(';');
    }
    case 'keycolon': {
      const keys = Object.keys(obj).sort();
      return keys.map((k) => `${k}:${serialize(obj[k], 'json')}`).join(';');
    }
    case 'values': return Object.values(obj).map((v) => String(v)).join('');
    case 'valuescomma': return Object.values(obj).map((v) => String(v)).join(',');
    case 'valuespipe': return Object.values(obj).map((v) => String(v)).join('|');
    default: return JSON.stringify(obj);
  }
}

function permute(arr) {
  if (arr.length === 0) return [[]];
  return arr.flatMap((x, i) => permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

const styles = ['json', 'stable', 'noquotes', 'keyvalue', 'keycolon', 'values', 'valuescomma', 'valuespipe'];
const valuesStyles = ['json', 'string'];

let found = false;

for (let count = 1; count <= fields.length; count++) {
  const subset = permute(fields).filter((perm) => perm.length === count);
  for (const order of subset) {
    const obj = {};
    order.forEach((k) => obj[k] = entry[k]);
    for (const style of styles) {
      const text = serialize(obj, style);
      if (hash(text) === target) {
        console.log('MATCH style', style, 'order', order, 'text', text);
        found = true;
        break;
      }
    }
    if (found) break;
  }
  if (found) break;
}
if (!found) console.log('no match');
