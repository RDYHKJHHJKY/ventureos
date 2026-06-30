const workspaceLocks = new Map();
const projectLocks = new Map();
const passportLocks = new Map();

function normalizeLockKey(value) {
  const key = String(value || "").trim();
  if (!key) {
    throw new Error("Lock key is required.");
  }
  return key;
}

async function withSerializedLock(lockMap, key, fn) {
  const normalizedKey = normalizeLockKey(key);
  const previousLock = (lockMap.get(normalizedKey) || Promise.resolve()).catch(() => {});
  let release;
  const currentLock = previousLock.then(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  lockMap.set(normalizedKey, currentLock);

  try {
    return await previousLock.then(fn);
  } finally {
    if (typeof release === "function") {
      release();
    }
    if (lockMap.get(normalizedKey) === currentLock) {
      lockMap.delete(normalizedKey);
    }
  }
}

export function isWorkspaceLocked(workspaceId) {
  return workspaceLocks.has(normalizeLockKey(workspaceId));
}

export function isProjectLocked(projectId) {
  return projectLocks.has(normalizeLockKey(projectId));
}

export function isPassportLocked(passportKey) {
  return passportLocks.has(normalizeLockKey(passportKey));
}

export async function workspaceLock(workspaceId, fn) {
  return withSerializedLock(workspaceLocks, workspaceId, fn);
}

export async function projectLock(projectId, fn) {
  return withSerializedLock(projectLocks, projectId, fn);
}

export async function passportLock(passportKey, fn) {
  return withSerializedLock(passportLocks, passportKey, fn);
}
