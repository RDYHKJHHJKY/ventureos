import assert from "node:assert/strict";
import { createId, mutateDb } from "../lib/server/data-store.js";
import { createSession } from "../lib/server/auth.js";
import { handleApiRequest } from "../lib/server/api-router.js";
import { apiJson } from "../src/api-client.js";

// Force file-backed storage for test isolation even when a local DATABASE_URL is present.
delete process.env.DATABASE_URL;

// Minimal DOM + window shim for apiJson
if (typeof global.window === "undefined") global.window = {};
if (typeof global.document === "undefined") {
  global.document = {
    createElement: () => ({
      style: {},
      appendChild: () => {},
      remove: () => {},
      select: () => {},
    }),
  };
}

let sessionToken = null;

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
    const record = {
      id: createId("user", "frontend-normalize"),
      name: "Frontend Normalize",
      email: "frontend@ventureos.local",
      passwordHash: "hash",
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(record);
    return record;
  });

  const workspace = await mutateDb((db) => {
    const record = {
      id: createId("workspace", "frontend-normalize"),
      name: "Frontend Normalization Workspace",
      createdAt: now,
      updatedAt: now,
    };
    db.workspaces.push(record);
    db.workspaceMembers.push({
      id: createId("member", `${user.id}-${record.id}`),
      workspaceId: record.id,
      userId: user.id,
      role: "Owner",
      createdAt: now,
    });
    return record;
  });

  const session = await createSession(user.id, { workspaceId: workspace.id });
  sessionToken = session.token;
  return { workspace };
}

let lastFetchHeaders = null;

// Mock fetch → route through handleApiRequest
global.fetch = async function (url, opts = {}) {
  const headers = opts.headers || {};
  lastFetchHeaders = { ...headers };

  const req = {
    method: opts.method || "GET",
    url,
    headers,
    body: opts.body || null,
  };

  const res = {
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
    end(body) {
      this.body = body;
    },
  };

  await handleApiRequest(req, res);

  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    json: async () => JSON.parse(res.body || "{}"),
  };
};

async function sessionViaFrontend(workspaceId) {
  return await apiJson("/api/auth/session", {
    workspaceId,
    headers: {
      cookie: `ventureos_session=${sessionToken}`,
    },
  });
}

(async () => {
  const { workspace } = await seedScenario();

  // 1. No workspace selected -> default workspace
  const s1 = await sessionViaFrontend(null);
  assert.strictEqual(typeof s1.workspace?.id, "string");
  assert.strictEqual(s1.workspaceOwnershipVerified, true);
  assert.strictEqual(s1.workspaceId, workspace.id);
  const defaultWs = s1.workspace.id;

  // 2. Selecting a workspace updates window.VENTUREOSWORKSPACE_ID
  window.__VENTUREOS_WORKSPACE_ID__ = defaultWs;
  const s2 = await sessionViaFrontend(defaultWs);
  assert.strictEqual(s2.workspace.id, defaultWs);
  assert.strictEqual(window.__VENTUREOS_WORKSPACE_ID__, defaultWs);

  // 3. Whitespace workspace selection -> normalized
  const s3 = await sessionViaFrontend(` ${defaultWs} `);
  assert.strictEqual(s3.workspace.id, defaultWs);

  // 4. Array-like workspace selection -> normalized to first element
  const s4 = await sessionViaFrontend([` ${defaultWs} `, "ignored"]);
  assert.strictEqual(s4.workspace.id, defaultWs);

  // 5. Invalid workspace selection should still reach the session endpoint with normalized header
  const s5 = await sessionViaFrontend("nonexistent-workspace");
  assert.notStrictEqual(s5.workspace.id, "nonexistent-workspace");
  assert.strictEqual(lastFetchHeaders["x-workspace-id"], "nonexistent-workspace");

  // 6. apiJson() must NOT send empty workspace header
  const s6 = await sessionViaFrontend("");
  assert.strictEqual(s6.workspace.id, defaultWs);
  assert.strictEqual(lastFetchHeaders["x-workspace-id"], undefined);

  console.log("frontend-workspace-selection.js: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});