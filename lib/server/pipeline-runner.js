import * as executionLocks from "./execution-locks.js";

export async function isolateExecution(options = {}, fn) {
  const workspaceId = options.workspaceId ? String(options.workspaceId || "").trim() : null;
  const projectId = options.projectId ? String(options.projectId || "").trim() : null;
  const passportKey = options.passportKey ? String(options.passportKey || "").trim() : null;

  if (workspaceId) {
    return executionLocks.workspaceLock(workspaceId, async () => {
      if (projectId) {
        return executionLocks.projectLock(projectId, async () => {
          if (passportKey) {
            return executionLocks.passportLock(passportKey, fn);
          }
          return fn();
        });
      }
      if (passportKey) {
        return executionLocks.passportLock(passportKey, fn);
      }
      return fn();
    });
  }

  if (projectId) {
    return executionLocks.projectLock(projectId, async () => {
      if (passportKey) {
        return executionLocks.passportLock(passportKey, fn);
      }
      return fn();
    });
  }

  if (passportKey) {
    return executionLocks.passportLock(passportKey, fn);
  }

  return fn();
}
