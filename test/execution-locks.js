import assert from "node:assert/strict";
import { workspaceLock, projectLock, passportLock, isWorkspaceLocked, isProjectLocked, isPassportLocked } from "../lib/server/execution-locks.js";
import { isolateExecution } from "../lib/server/pipeline-runner.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let workspaceActive = false;
  let projectActive = false;
  let passportActive = false;

  const workspaceOrder = [];
  const projectOrder = [];
  const passportOrder = [];

  const workspaceTasks = [1, 2, 3].map((value) =>
    workspaceLock("workspace-test", async () => {
      assert.strictEqual(workspaceActive, false, "Workspace lock should prevent concurrent execution.");
      workspaceActive = true;
      workspaceOrder.push(`start-${value}`);
      await delay(20);
      workspaceOrder.push(`end-${value}`);
      workspaceActive = false;
      return value;
    })
  );

  const projectTasks = ["a", "b", "c"].map((value) =>
    projectLock("project-test", async () => {
      assert.strictEqual(projectActive, false, "Project lock should prevent concurrent execution.");
      projectActive = true;
      projectOrder.push(`start-${value}`);
      await delay(10);
      projectOrder.push(`end-${value}`);
      projectActive = false;
      return value;
    })
  );

  const passportTasks = ["x", "y"].map((value) =>
    passportLock("passport-test", async () => {
      assert.strictEqual(passportActive, false, "Passport lock should prevent concurrent execution.");
      passportActive = true;
      passportOrder.push(`start-${value}`);
      await delay(5);
      passportOrder.push(`end-${value}`);
      passportActive = false;
      return value;
    })
  );

  const workspaceResults = await Promise.all(workspaceTasks);
  assert.deepStrictEqual(workspaceResults, [1, 2, 3]);
  assert.deepStrictEqual(workspaceOrder, ["start-1", "end-1", "start-2", "end-2", "start-3", "end-3"]);
  assert.strictEqual(isWorkspaceLocked("workspace-test"), false);

  const projectResults = await Promise.all(projectTasks);
  assert.deepStrictEqual(projectResults, ["a", "b", "c"]);
  assert.deepStrictEqual(projectOrder, ["start-a", "end-a", "start-b", "end-b", "start-c", "end-c"]);
  assert.strictEqual(isProjectLocked("project-test"), false);

  const passportResults = await Promise.all(passportTasks);
  assert.deepStrictEqual(passportResults, ["x", "y"]);
  assert.deepStrictEqual(passportOrder, ["start-x", "end-x", "start-y", "end-y"]);
  assert.strictEqual(isPassportLocked("passport-test"), false);

  let isolateActive = false;
  const result = await isolateExecution({ workspaceId: "workspace-isolate", projectId: "project-isolate", passportKey: "passport-isolate" }, async () => {
    assert.strictEqual(isolateActive, false, "isolateExecution should serialize the isolated work block.");
    isolateActive = true;
    await delay(10);
    isolateActive = false;
    return "isolated";
  });
  assert.strictEqual(result, "isolated");

  console.log("Execution locks tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});