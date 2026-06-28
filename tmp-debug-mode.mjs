import { mutateDb, createId } from './lib/server/data-store.js';
import { createSession } from './lib/server/auth.js';
import { handleApiRequest } from './lib/server/api-router.js';

(async () => {
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.msps = [];
    db.mspMembers = [];
    db.sessions = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId('user', 'msp-mode'), name: 'MSP Mode User', email: 'msp-mode@test.local', passwordHash: 'hash', createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const msp = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId('msp', 'mode'), name: 'Mode MSP', billingEmail: 'billing@mode.local', region: 'us-east-1', ownerUserId: user.id, createdAt: now, updatedAt: now, billingStatus: 'active', plan: 'starter' };
    db.msps.push(record);
    return record;
  });

  await mutateDb((db) => {
    const workspaceId = createId('workspace', 'mode');
    db.workspaces.push({ id: workspaceId, mspId: msp.id, name: 'Mode Workspace', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    db.workspaceMembers.push({ id: createId('member', `${user.id}-mode`), workspaceId, userId: user.id, role: 'Owner', createdAt: new Date().toISOString() });
    db.mspMembers.push({ id: createId('mspmember', `${user.id}-${msp.id}`), mspId: msp.id, userId: user.id, role: 'admin', createdAt: new Date().toISOString() });
  });

  const session = await createSession(user.id);
  const req = { method: 'GET', url: '/api/msp/mode', headers: { cookie: `ventureos_session=${session.token}` } };
  const res = {
    statusCode: 200,
    headers: {},
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(body) { this.body = body; },
  };
  await handleApiRequest(req, res);
  console.log('status', res.statusCode);
  console.log('body', res.body);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
