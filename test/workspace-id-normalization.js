import assert from "node:assert/strict";
import { createId, mutateDb } from "../lib/server/data-store.js";
import { createSession, createWorkspaceForUser, getSessionContext } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = { ...this.headers, ...headers };
    },
    end(payload) {
      this.body = payload;
    },
  };
}

async function seedScenario() {
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.sessions = [];
    db.msps = [];
    db.mspMembers = [];
  });

  const now = new Date().toISOString();
  const user = await mutateDb((db) => {
    const record = { id: createId("user", "normalize-user"), name: "Normalize User", email: "normalize@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const workspace = await mutateDb((db) => {
    const record = { id: createId("workspace", "normalize-workspace"), name: "Normalization Workspace", createdAt: now, updatedAt: now };
    db.workspaces.push(record);
    db.workspaceMembers.push({ id: createId("member", `${user.id}-${record.id}`), workspaceId: record.id, userId: user.id, role: "Owner", createdAt: now });
    return record;
  });

  const { token } = await createSession(user.id, { workspaceId: workspace.id });
  return { user, workspace, token };
}

async function main() {
  const { workspace, token } = await seedScenario();

  const ctxTrimmed = await getSessionContext(
    { headers: { cookie: `ventureos_session=${token}` } },
    ` ${workspace.id} `
  );
  assert.ok(ctxTrimmed, "Context should resolve with whitespace-wrapped workspace id.");
  assert.strictEqual(ctxTrimmed.workspace?.id, workspace.id, "Whitespace-normalized workspace id should match workspace.");

  const ctxArray = await getSessionContext(
    { headers: { cookie: `ventureos_session=${token}` } },
    [` ${workspace.id} `]
  );
  assert.ok(ctxArray, "Context should resolve when workspace id header is provided as an array.");
  assert.strictEqual(ctxArray.workspace?.id, workspace.id, "Array-normalized workspace id should match workspace.");

  const ctxBlank = await getSessionContext(
    { headers: { cookie: `ventureos_session=${token}` } },
    ""
  );
  assert.ok(ctxBlank, "Context should resolve when workspace id is blank and fallback to default workspace.");
  assert.strictEqual(ctxBlank.workspace?.id, workspace.id, "Blank workspace id should fallback to the user's first accessible workspace.");

  const req = {
    method: "GET",
    url: "/api/auth/session",
    headers: {
      cookie: `ventureos_session=${token}`,
      "x-workspace-id": ` ${workspace.id} `,
    },
  };
  const res = makeRes();
  await handleApiRequest(req, res);
  assert.strictEqual(res.statusCode, 200, "API session call should succeed with whitespace workspace header.");
  const payload = res.body ? JSON.parse(res.body) : null;
  assert.strictEqual(payload.workspace?.id, workspace.id, "API session response workspace id should match normalized workspace id.");

  console.log("Workspace ID normalization tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});