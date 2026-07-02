import { restrictedTokens } from '../lib/server/restricted-tokens.js';

const token = 'sprvendor_e51ifb:workspace-1:restricted';
const options = { workspaceId: 'workspace-1', evidenceType: 'passport' };
try {
  const result = restrictedTokens.verify({}, token, options);
  console.log('result', result);
} catch (err) {
  console.error('error', err.statusCode, err.code, err.message);
}
