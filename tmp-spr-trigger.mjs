import { authenticateUser, registerUser, createSession } from './lib/server/auth.js';
import handlerModule from './api/spr/audit.js';
const handler = handlerModule.default || handlerModule;

(async () => {
  const email = process.env.SPR_TEST_EMAIL || `spr-test+${Date.now()}@example.com`;
  const password = process.env.SPR_TEST_PASSWORD || 'Password123!';
  let userRecord;
  try {
    userRecord = await authenticateUser({ email, password });
    console.log('[TEST] Authenticated', userRecord.user?.email);
  } catch (e) {
    console.log('[TEST] Registering', email);
    const reg = await registerUser({ name: 'SPR Tester', email, password, workspaceName: 'SPR Test Workspace' });
    userRecord = { user: reg.user, workspace: reg.workspace, role: reg.role };
  }

  const { token } = await createSession(userRecord.user.id, { workspaceId: userRecord.workspace?.id || null });
  console.log('[TEST] Session token truncated:', token?.slice(0, 12) + '...');

  const req = { method: 'POST', url: '/api/spr/audit/trigger', headers: { cookie: `ventureos_session=${token}` } };
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v },
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(p) { console.log('[HANDLER RESPONSE]', JSON.stringify(p, null, 2)) }
  };

  await handler(req, res);
})();
