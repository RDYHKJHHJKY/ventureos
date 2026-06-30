import assert from "node:assert/strict";
import * as runtimeGuards from "../lib/server/runtime-guards.js";

async function main() {
  const ctx = { workspaceId: "workspace-abc" };
  const db = {
    projects: [
      { id: "project-1", workspaceId: "workspace-abc", name: "Project One" },
      { id: "project-2", workspaceId: "workspace-xyz", name: "Project Two" },
    ],
  };

  assert.strictEqual(runtimeGuards.requireWorkspace(ctx, "workspace-abc"), ctx, "Workspace guard should permit matching workspace.");
  assert.throws(
    () => runtimeGuards.requireWorkspace(ctx, "workspace-other"),
    (error) => error.statusCode === 403 && error.code === "FORBIDDEN",
    "Workspace guard should reject mismatched workspace."
  );

  const project = runtimeGuards.requireProject(db, ctx, "project-1");
  assert.strictEqual(project.id, "project-1", "Project guard should return the project when access is valid.");

  assert.throws(
    () => runtimeGuards.requireProject(db, ctx, "project-2"),
    (error) => error.statusCode === 403 && error.code === "FORBIDDEN",
    "Project guard should reject project from another workspace."
  );

  assert.throws(
    () => runtimeGuards.requireProject(db, ctx, "missing-project"),
    (error) => error.statusCode === 404 && error.code === "NOT_FOUND",
    "Project guard should reject missing project."
  );

  const validEvidence = {
    softwareId: "software-1",
    type: "sbom",
    title: "SBOM Evidence",
    source: "scanner",
    uri: "https://example.com/sbom.json",
    workspaceId: "workspace-abc",
  };
  const normalized = runtimeGuards.requireEvidenceSchema(validEvidence, { workspaceId: "workspace-abc" });
  assert.strictEqual(normalized.softwareId, "software-1", "Evidence schema guard should preserve required fields.");

  assert.throws(
    () => runtimeGuards.requireEvidenceSchema({ type: "sbom", title: "Missing software" }, { workspaceId: "workspace-abc" }),
    (error) => error.statusCode === 400 && error.code === "VALIDATION_ERROR",
    "Evidence schema guard should reject missing required fields."
  );

  const key = runtimeGuards.preventCircularExecution("guarded-key");
  assert.strictEqual(runtimeGuards.isExecutionInProgress(key), true, "Execution guard should mark active execution.");
  assert.throws(
    () => runtimeGuards.preventCircularExecution("guarded-key"),
    (error) => error.statusCode === 409 && error.code === "CIRCULAR_EXECUTION",
    "Execution guard should detect duplicate active key."
  );
  runtimeGuards.releaseCircularExecution(key);
  assert.strictEqual(runtimeGuards.isExecutionInProgress(key), false, "Execution guard should release active key.");

  const returned = await runtimeGuards.withCircularExecutionGuard("async-key", async () => {
    assert.strictEqual(runtimeGuards.isExecutionInProgress("async-key"), true, "Async guard should set key while function executes.");
    return "ok";
  });
  assert.strictEqual(returned, "ok", "withCircularExecutionGuard should return the result of the callback.");
  assert.strictEqual(runtimeGuards.isExecutionInProgress("async-key"), false, "Async guard should release key after completion.");

  console.log("Runtime guards unit tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});