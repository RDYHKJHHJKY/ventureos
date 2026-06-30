import assert from "node:assert/strict";
import { createId, mutateDb, readDb } from "../lib/server/data-store.js";
import { createSession } from "../lib/server/auth.js";
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

async function requestJson(pathname, method = "GET", payload = null, token) {
  const req = {
    method,
    url: pathname,
    headers: token ? { cookie: `ventureos_session=${token}` } : {},
  };
  if (payload) {
    req.body = JSON.stringify(payload);
    req.headers["content-type"] = "application/json";
  }
  const res = makeRes();
  await handleApiRequest(req, res);
  return { statusCode: res.statusCode, payload: res.body ? JSON.parse(res.body) : null };
}

async function main() {
  await mutateDb((db) => {
    db.users = [];
    db.workspaces = [];
    db.workspaceMembers = [];
    db.projects = [];
    db.projectArtifacts = [];
    db.projectDependencies = [];
    db.projectMetadata = [];
    db.projectSignals = [];
    db.projectScores = [];
    db.projectEvents = [];
  });

  const user = await mutateDb((db) => {
    const now = new Date().toISOString();
    const record = { id: createId("user", "pipeline"), name: "Pipeline User", email: "pipeline@test.local", passwordHash: "hash", createdAt: now, updatedAt: now };
    db.users.push(record);
    return record;
  });

  const workspace = await mutateDb((db) => {
    const now = new Date().toISOString();
    const ws = { id: createId("workspace", "pipeline"), ownerId: user.id, name: "Pipeline Workspace", plan: "starter", active: true, createdAt: now, updatedAt: now };
    db.workspaces.push(ws);
    db.workspaceMembers.push({ id: createId("membership", `${user.id}-${ws.id}`), workspaceId: ws.id, userId: user.id, role: "Reviewer", createdAt: now, updatedAt: now });
    return ws;
  });

  const session = await createSession(user.id, { workspaceId: workspace.id });

  const projectResponse = await requestJson("/api/projects", "POST", { name: "Pipeline Project", vendor: "Contoso", sector: "Software", repoUrl: "https://github.com/contoso/pipeline", description: "Pipeline test" }, session.token);
  assert.equal(projectResponse.statusCode, 201);
  assert.equal(projectResponse.payload.project.name, "Pipeline Project");

  const runResponse = await requestJson(`/api/projects/${encodeURIComponent(projectResponse.payload.project.id)}/run-pipeline`, "POST", { runId: "run-001" }, session.token);
  assert.equal(runResponse.statusCode, 200);
  assert.equal(runResponse.payload.score?.riskBand, "Critical");
  assert.ok(Array.isArray(runResponse.payload.project.events));
  assert.ok(runResponse.payload.project.events.some((event) => event.type === "PIPELINE_RUN_REQUESTED"));

  const duplicateResponse = await requestJson(`/api/projects/${encodeURIComponent(projectResponse.payload.project.id)}/run-pipeline`, "POST", { runId: "run-001" }, session.token);
  assert.equal(duplicateResponse.statusCode, 409);
  assert.equal(duplicateResponse.payload.code, "REPLAY_ERROR");

  const emptyProject = await requestJson("/api/projects", "POST", { name: "Empty Project", vendor: "Contoso", sector: "Software" }, session.token);
  assert.equal(emptyProject.statusCode, 201);
  const emptyRunResponse = await requestJson(`/api/projects/${encodeURIComponent(emptyProject.payload.project.id)}/run-pipeline`, "POST", { runId: "run-002" }, session.token);
  assert.equal(emptyRunResponse.statusCode, 400);
  assert.equal(emptyRunResponse.payload.code, "VALIDATION_ERROR");

  const db = await readDb();
  assert.ok(db.projectEvents.some((event) => event.type === "PIPELINE_RUN_REQUESTED"));
  console.log("Project run validation tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
