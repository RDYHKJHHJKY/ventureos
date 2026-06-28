import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { createId, mutateDb, readDb, getMembershipForUser, listWorkspacesForMsp, getMspById } from "./data-store.js";

const SESSION_COOKIE = "ventureos_session";
const CSRF_COOKIE = "ventureos_csrf";
const ROLE_RANK = { Viewer: 1, Reviewer: 2, Admin: 3, Owner: 4 };
export const WORKSPACE_ROLES = Object.keys(ROLE_RANK);

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = hashPassword(password, salt).split(":")[1];
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookies(req) {
  const header = req.headers?.cookie || "";
  return Object.fromEntries(header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
}

export function csrfCookie(token) {
  return `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function clearCsrfCookie() {
  return `${CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
}

export async function createSession(userId, options = {}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const csrfToken = randomBytes(24).toString("hex");
  const now = Date.now();
  const expiresAt = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
  const demoMode = Boolean(options.demoMode === true);
  await mutateDb((db) => {
    db.sessions.push({ id: createId("session", userId), userId, tokenHash, csrfToken, expiresAt, createdAt: new Date(now).toISOString(), demoMode });
  });
  return { token, csrfToken };
}

export async function destroySession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return;
  const tokenHash = hashToken(token);
  await mutateDb((db) => {
    db.sessions = db.sessions.filter((session) => session.tokenHash !== tokenHash);
  });
}

function getMspMode(msp) {
  const billingStatus = String(msp?.billingStatus || "active").trim().toLowerCase();
  if (billingStatus === "past_due") return "past_due";
  if (billingStatus === "canceled") return "canceled";
  if (billingStatus === "trialing") return "trialing";
  if (billingStatus === "pending") return "past_due";
  if (billingStatus === "inactive") return "suspended";
  return "active";
}

export async function getSessionContext(req, requestedWorkspaceId) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const db = await readDb();
  const now = new Date();
  const session = db.sessions.find((item) => item.tokenHash === tokenHash && new Date(item.expiresAt) > now);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) return null;
  const memberships = db.workspaceMembers.filter((item) => item.userId === user.id);
  const mspMemberships = db.mspMembers.filter((item) => item.userId === user.id);
  const accessibleWorkspaces = [];
  const accessibleWorkspaceIds = new Set();
  for (const membership of mspMemberships) {
    for (const workspace of listWorkspacesForMsp(db, membership.mspId)) {
      if (!accessibleWorkspaceIds.has(workspace.id)) {
        accessibleWorkspaceIds.add(workspace.id);
        accessibleWorkspaces.push(workspace);
      }
    }
  }
  let workspace = null;
  let currentMembership = null;
  if (requestedWorkspaceId) {
    workspace = db.workspaces.find((item) => item.id === requestedWorkspaceId);
    if (workspace) {
      currentMembership = memberships.find((item) => item.workspaceId === requestedWorkspaceId);
      if (!currentMembership && workspace.mspId && !accessibleWorkspaceIds.has(workspace.id)) {
        return null;
      }
    }
  }
  if (!workspace || !currentMembership) {
    currentMembership = memberships[0] || null;
    workspace = currentMembership ? db.workspaces.find((item) => item.id === currentMembership.workspaceId) : workspace;
    if (!workspace && accessibleWorkspaces.length) {
      workspace = accessibleWorkspaces[0];
    }
  }
  if (!workspace && !mspMemberships.length) return null;
  const mspMembership = workspace && workspace.mspId
    ? getMembershipForUser(db, workspace.mspId, user.id)
    : mspMemberships[0] || null;
  const msp = mspMembership?.mspId ? getMspById(db, mspMembership.mspId) : null;
  return {
    user: publicUser(user),
    workspace,
    role: currentMembership?.role || null,
    memberships,
    mspMemberships,
    mspId: mspMembership?.mspId || null,
    mspRole: mspMembership?.role || null,
    mspMode: getMspMode(msp),
    demoMode: Boolean(session.demoMode === true),
    accessibleWorkspaces,
    workspaceOwnershipVerified: Boolean(workspace && (!workspace.mspId || (mspMembership?.mspId === workspace.mspId))),
    isAdmin: (currentMembership?.role === "Owner") || (String(mspMembership?.role || "").toLowerCase() === "admin"),
    workspaceId: workspace?.id || null,
    userId: user.id,
    csrfToken: session.csrfToken,
  };
}

export function requireAuth(ctx) {
  if (!ctx) {
    const err = new Error("Authentication required.");
    err.statusCode = 401;
    throw err;
  }
  return ctx;
}

export function requireRole(ctx, role) {
  requireAuth(ctx);
  if ((ROLE_RANK[ctx.role] || 0) < (ROLE_RANK[role] || 0)) {
    const err = new Error(`${role} access required.`);
    err.statusCode = 403;
    throw err;
  }
  return ctx;
}

export function requireMspMembership(ctx, mspId) {
  requireAuth(ctx);
  if (!mspId || !(ctx.mspMemberships || []).some((member) => member.mspId === mspId)) {
    const err = new Error("MSP access denied.");
    err.statusCode = 403;
    throw err;
  }
  return ctx;
}

export function assertMspRole(ctx, allowedRoles, mspId = null) {
  requireAuth(ctx);
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  let membership = null;
  if (mspId) {
    membership = (ctx.mspMemberships || []).find((item) => item.mspId === mspId);
  } else {
    membership = ctx.mspMemberships?.[0] || null;
  }
  if (!membership) {
    const err = new Error("MSP access denied.");
    err.statusCode = 403;
    throw err;
  }
  const role = String(membership.role || "").trim().toLowerCase();
  if (!roles.includes(role)) {
    const err = new Error(`MSP role ${roles.join(" or ")} required.`);
    err.statusCode = 403;
    throw err;
  }
  return ctx;
}

export function requireMspAdmin(ctx, mspId) {
  requireAuth(ctx);
  assertMspRole(ctx, "admin", mspId);
  return ctx;
}

export function assertMspMode(ctx, { operation = "read" } = {}) {
  requireAuth(ctx);
  const mode = String(ctx?.mspMode || "active").trim().toLowerCase();
  if (mode === "canceled") {
    const err = new Error("MSP access is frozen.");
    err.statusCode = 403;
    throw err;
  }
  if (mode === "past_due" || mode === "suspended") {
    if (operation === "write") {
      const err = new Error("MSP access is read-only due to billing status.");
      err.statusCode = 403;
      throw err;
    }
  }
  return ctx;
}

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

export async function registerUser({ name, email, password, workspaceName }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim() || cleanEmail.split("@")[0];
  if (!cleanEmail.includes("@")) throw statusError("A valid email is required.", 400);
  if (String(password || "").length < 8) throw statusError("Password must be at least 8 characters.", 400);

  return mutateDb((db) => {
    if (db.users.some((user) => user.email === cleanEmail)) throw statusError("Email is already registered.", 409);
    const now = new Date().toISOString();
    const user = { id: createId("user", cleanEmail), name: cleanName, email: cleanEmail, passwordHash: hashPassword(password), createdAt: now, updatedAt: now };
    const workspace = { id: createId("workspace", cleanEmail), name: String(workspaceName || `${cleanName}'s Workspace`).trim(), createdAt: now, updatedAt: now };
    const member = { id: createId("member", `${user.id}-${workspace.id}`), workspaceId: workspace.id, userId: user.id, role: "Owner", createdAt: now };
    db.users.push(user);
    db.workspaces.push(workspace);
    db.workspaceMembers.push(member);

    if (db.users.length === 1) bootstrapUnownedRecords(db, workspace.id, user.id, now);

    return { user: publicUser(user), workspace, role: member.role };
  });
}

export async function authenticateUser({ email, password }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const db = await readDb();
  const user = db.users.find((item) => item.email === cleanEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) throw statusError("Invalid email or password.", 401);
  const member = db.workspaceMembers.find((item) => item.userId === user.id);
  const workspace = db.workspaces.find((item) => item.id === member?.workspaceId);
  return { user: publicUser(user), workspace, role: member?.role || "Viewer" };
}

export async function listWorkspaceUsers(workspaceId) {
  const db = await readDb();
  return db.workspaceMembers
    .filter((member) => member.workspaceId === workspaceId)
    .map((member) => ({
      ...member,
      user: publicUser(db.users.find((user) => user.id === member.userId)),
    }));
}

export async function findWorkspaceMember(workspaceId, userId) {
  const db = await readDb();
  return db.workspaceMembers.find((member) => member.workspaceId === workspaceId && member.userId === userId) || null;
}

export async function validateCsrf(req, ctx) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const headerToken = req.headers["x-csrf-token"];
  const cookieToken = parseCookies(req)[CSRF_COOKIE];
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    const err = new Error("CSRF validation failed.");
    err.statusCode = 403;
    throw err;
  }
}

function bootstrapUnownedRecords(db, workspaceId, userId, now) {
  for (const asset of db.assets) {
    if (!asset.workspaceId) asset.workspaceId = workspaceId;
    if (!asset.createdBy) asset.createdBy = userId;
  }
  for (const scan of db.scanRuns) {
    if (!scan.workspaceId) scan.workspaceId = workspaceId;
    if (!scan.createdBy) scan.createdBy = userId;
  }
  for (const finding of db.scanFindings) if (!finding.workspaceId) finding.workspaceId = workspaceId;
  for (const evidence of db.evidenceItems) if (!evidence.workspaceId) evidence.workspaceId = workspaceId;
  for (const passport of db.passports) {
    if (!passport.workspaceId) passport.workspaceId = workspaceId;
    if (!passport.issuedBy) passport.issuedBy = userId;
    passport.version = typeof passport.version === "number" ? passport.version : 1;
    passport.isPublic = passport.isPublic === true;
    passport.revoked = passport.revoked === true;
    passport.revokedAt = passport.revokedAt || null;
    passport.publicUrl = passport.publicUrl || `/passport/${passport.id}`;
    passport.updatedAt = passport.updatedAt || passport.createdAt || new Date().toISOString();
  }
  db.workspaces.find((workspace) => workspace.id === workspaceId).updatedAt = now;
}

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}
