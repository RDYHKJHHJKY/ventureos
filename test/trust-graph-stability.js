import assert from "node:assert/strict";
import { createId, mutateDb, readDb } from "../lib/server/data-store.js";
import { createSession } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(body) { this.body = body; },
  };
}

async function requestJson(pathname, token) {
  const req = { method: "GET", url: pathname, headers: { cookie: token ? `ventureos_session=${token}` : "" } };
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

async function main() {
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.sessions = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "trust-graph"), name: "Trust Graph User", email: "trust-graph@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const { token } = await createSession(user.id);
  const result = await requestJson("/api/trust-graph", token);

  assert.equal(result.statusCode, 404);
  assert.ok(result.payload?.error || result.payload?.message);

  console.log("Trust graph stability test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
