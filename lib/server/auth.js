import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from 'bcrypt';
import { createId, mutateDb, readDb, getMembershipForUser, listWorkspacesForMsp, getMspById } from "./data-store.js";
import { query, transaction } from './db.js';

const SESSION_COOKIE = "ventureos_session";
const CSRF_COOKIE = "ventureos_csrf";
const ROLE_RANK = { Viewer: 1, Reviewer: 2, Admin: 3, Owner: 4 };
export const WORKSPACE_ROLES = Object.keys(ROLE_RANK);

// Production password hashing using bcrypt
const SALT_ROUNDS = 10;

export async function hashPassword(password) {
  // Use bcrypt for better security in production
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  // Support both old pbkdf2 format and new bcrypt
  if (stored.includes(":")) {
    // Old pbkdf2 format - fallback for migration
    const [salt, hash] = stored.split(":");
    const candidate = pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
    try {
      return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
    } catch {
      return false;
    }
  }
  // New bcrypt format
  return bcrypt.compare(password, stored);
}

// Fallback legacy password hashing for compatibility
function legacyHashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
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
  let workspaceId = options.workspaceId || null;

  if (process.env.DATABASE_URL && !workspaceId) {
    try {
      workspaceId = await getDefaultWorkspaceIdForUser(userId);
    } catch (error) {
      console.warn("PostgreSQL default workspace lookup failed, falling back to file storage:", error.message);
      workspaceId = null;
    }
  }

  // Try PostgreSQL first if DATABASE_URL is set and we have a workspace context
  if (process.env.DATABASE_URL && workspaceId) {
    try {
      await query(
        `INSERT INTO sessions (id, user_id, workspace_id, data, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [tokenHash, userId, workspaceId, JSON.stringify({ demoMode, csrfToken }), expiresAt]
      );
    } catch (pgError) {
      console.warn("PostgreSQL session creation failed, falling back to file storage:", pgError.message);
      await mutateDb((db) => {
        db.sessions.push({ id: createId("session", userId), userId, tokenHash, csrfToken, expiresAt, createdAt: new Date(now).toISOString(), demoMode });
      });
      return { token, csrfToken };
    }

    return { token, csrfToken };
  }

  await mutateDb((db) => {
    db.sessions.push({ id: createId("session", userId), userId, tokenHash, csrfToken, expiresAt, createdAt: new Date(now).toISOString(), demoMode });
  });

  return { token, csrfToken };
}

export async function destroySession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return;
  const tokenHash = hashToken(token);

  if (process.env.DATABASE_URL) {
    try {
      await query(`DELETE FROM sessions WHERE id = $1`, [tokenHash]);
    } catch (pgError) {
      console.warn("PostgreSQL session deletion failed:", pgError.message);
    }
  }

  await mutateDb((db) => {
    db.sessions = db.sessions.filter((session) => session.tokenHash !== tokenHash);
  });
}

async function readSession(tokenHash) {
  if (process.env.DATABASE_URL) {
    try {
      const result = await query(`SELECT id, user_id, workspace_id, data, expires_at FROM sessions WHERE id = $1`, [tokenHash]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const data = row.data || {};
        return {
          id: row.id,
          userId: row.user_id,
          workspaceId: row.workspace_id,
          csrfToken: data.csrfToken,
          demoMode: Boolean(data.demoMode === true),
          expiresAt: row.expires_at,
        };
      }
    } catch (pgError) {
      console.warn("PostgreSQL session lookup failed:", pgError.message);
    }
  }

  const db = await readDb();
  return db.sessions.find((item) => item.tokenHash === tokenHash) || null;
}

async function readUserFromPostgres(userId) {
  const result = await query(
    `SELECT id, email, name, created_at as "createdAt", updated_at as "updatedAt"
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function readWorkspaceFromPostgres(workspaceId) {
  const result = await query(
    `SELECT id, owner_id as "ownerId", name, plan, active, created_at as "createdAt", updated_at as "updatedAt"
     FROM workspaces
     WHERE id = $1`,
    [workspaceId]
  );
  return result.rows[0] || null;
}

async function readWorkspaceMembershipsFromPostgres(userId) {
  const result = await query(
    `SELECT workspace_id as "workspaceId", role, created_at as "createdAt"
     FROM workspace_members
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [userId]
  );
  return result.rows;
}

async function getDefaultWorkspaceIdForUser(userId) {
  const result = await query(
    `SELECT workspace_id
     FROM workspace_members
     WHERE user_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.workspace_id || null;
}

export async function listWorkspacesForUser(userId) {
  if (process.env.DATABASE_URL) {
    const result = await query(
      `SELECT w.id, w.owner_id as "ownerId", w.name, w.plan, w.active, w.created_at as "createdAt", w.updated_at as "updatedAt", wm.role
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1
       ORDER BY w.updated_at DESC`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      plan: row.plan,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      role: row.role,
    }));
  }

  const db = await readDb();
  return (db.workspaceMembers || [])
    .filter((member) => member.userId === userId)
    .map((member) => {
      const workspace = db.workspaces.find((item) => item.id === member.workspaceId);
      return workspace ? { ...workspace, role: member.role } : null;
    })
    .filter(Boolean);
}

export async function listWorkspaceUsers(workspaceId) {
  if (process.env.DATABASE_URL) {
    const result = await query(
      `SELECT wm.id, wm.workspace_id as "workspaceId", wm.user_id as "userId", wm.role, wm.created_at as "createdAt",
              u.email, u.name
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
       ORDER BY wm.created_at ASC`,
      [workspaceId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      role: row.role,
      createdAt: row.createdAt,
      user: { id: row.userId, name: row.name, email: row.email },
    }));
  }

  const db = await readDb();
  return db.workspaceMembers
    .filter((member) => member.workspaceId === workspaceId)
    .map((member) => ({
      ...member,
      user: publicUser(db.users.find((user) => user.id === member.userId)),
    }));
}

export async function findWorkspaceMember(workspaceId, userId) {
  if (process.env.DATABASE_URL) {
    const result = await query(
      `SELECT id, workspace_id as "workspaceId", user_id as "userId", role, created_at as "createdAt"
       FROM workspace_members
       WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    );
    return result.rows[0] || null;
  }

  const db = await readDb();
  return db.workspaceMembers.find((member) => member.workspaceId === workspaceId && member.userId === userId) || null;
}

export async function createWorkspaceForUser(ownerUserId, name) {
  if (process.env.DATABASE_URL) {
    return transaction(async (client) => {
      const workspaceResult = await client.query(
        `INSERT INTO workspaces (owner_id, name)
         VALUES ($1, $2)
         RETURNING id, owner_id as "ownerId", name, plan, active, created_at as "createdAt", updated_at as "updatedAt"`,
        [ownerUserId, name]
      );
      const workspace = workspaceResult.rows[0];
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [workspace.id, ownerUserId, "Owner"]
      );
      return workspace;
    });
  }

  const now = new Date().toISOString();
  const db = await readDb();
  const workspace = { id: createId("workspace", name), name, createdAt: now, updatedAt: now };
  await mutateDb((db2) => {
    db2.workspaces.push(workspace);
    db2.workspaceMembers.push({ id: createId("member", `${ownerUserId}-${workspace.id}`), workspaceId: workspace.id, userId: ownerUserId, role: "Owner", createdAt: now });
  });
  return workspace;
}

export async function addWorkspaceMember(workspaceId, userId, role) {
  if (process.env.DATABASE_URL) {
    const result = await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING id, workspace_id as "workspaceId", user_id as "userId", role, created_at as "createdAt"`,
      [workspaceId, userId, role]
    );
    return result.rows[0];
  }

  const now = new Date().toISOString();
  return mutateDb((db) => {
    const member = { id: createId("member", `${userId}-${workspaceId}`), workspaceId, userId, role, createdAt: now };
    db.workspaceMembers.push(member);
    return member;
  });
}

export async function updateWorkspaceMemberRole(workspaceId, userId, role) {
  if (process.env.DATABASE_URL) {
    const result = await query(
      `UPDATE workspace_members
       SET role = $3
       WHERE workspace_id = $1 AND user_id = $2
       RETURNING id, workspace_id as "workspaceId", user_id as "userId", role, created_at as "createdAt"`,
      [workspaceId, userId, role]
    );
    return result.rows[0] || null;
  }

  return mutateDb((db) => {
    const member = db.workspaceMembers.find((item) => item.workspaceId === workspaceId && item.userId === userId);
    if (member) member.role = role;
    return member || null;
  });
}

export async function removeWorkspaceMember(workspaceId, userId) {
  if (process.env.DATABASE_URL) {
    await query(
      `DELETE FROM workspace_members
       WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    );
    return;
  }

  return mutateDb((db) => {
    db.workspaceMembers = db.workspaceMembers.filter((item) => !(item.workspaceId === workspaceId && item.userId === userId));
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

function normalizeWorkspaceId(value) {
  if (value == null) return null;
  if (Array.isArray(value)) value = value[0];
  const normalized = String(value || "").trim();
  return normalized === "" ? null : normalized;
}

export async function getSessionContext(req, requestedWorkspaceId) {
  requestedWorkspaceId = normalizeWorkspaceId(requestedWorkspaceId);
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await readSession(tokenHash);
  if (!session || new Date(session.expiresAt) <= new Date()) return null;

  if (process.env.DATABASE_URL) {
    try {
      const user = await readUserFromPostgres(session.userId);
      if (user) {
        const memberships = await readWorkspaceMembershipsFromPostgres(user.id);
        let workspace = null;
        let currentMembership = null;

        if (requestedWorkspaceId) {
          currentMembership = memberships.find((item) => item.workspaceId === requestedWorkspaceId);
          if (currentMembership) {
            workspace = await readWorkspaceFromPostgres(requestedWorkspaceId);
          }
        }

        if (!workspace && memberships.length > 0) {
          currentMembership = currentMembership || memberships[0];
          workspace = await readWorkspaceFromPostgres(currentMembership.workspaceId);
        }

        if (!workspace && session.workspaceId) {
          workspace = await readWorkspaceFromPostgres(session.workspaceId);
          if (workspace) {
            currentMembership = currentMembership || memberships.find((item) => item.workspaceId === workspace.id) || null;
          }
        }

        if (!workspace) {
          return null;
        }

        return {
          user: publicUser(user),
          workspace,
          role: currentMembership?.role || null,
          memberships,
          mspMemberships: [],
          mspId: null,
          mspRole: null,
          mspMode: getMspMode(null),
          demoMode: Boolean(session.demoMode === true),
          accessibleWorkspaces: memberships.map((item) => ({ id: item.workspaceId })),
          workspaceOwnershipVerified: true,
          isAdmin: currentMembership?.role === "Owner",
          workspaceId: workspace?.id || null,
          userId: user.id,
          csrfToken: session.csrfToken,
        };
      }
    } catch (pgError) {
      console.warn("PostgreSQL session context failed, falling back to file storage:", pgError.message);
    }
  }

  const db = await readDb();
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
  if (!workspace && !mspMemberships.length) {
    return {
      user: publicUser(user),
      workspace: null,
      role: null,
      memberships,
      mspMemberships,
      mspId: null,
      mspRole: null,
      mspMode: "active",
      demoMode: Boolean(session.demoMode === true),
      accessibleWorkspaces,
      workspaceOwnershipVerified: false,
      isAdmin: false,
      workspaceId: null,
      userId: user.id,
      csrfToken: session.csrfToken,
    };
  }
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

  // Try PostgreSQL first if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      const result = await registerUserPostgres({ name: cleanName, email: cleanEmail, password, workspaceName });
      return result;
    } catch (pgError) {
      // If email already exists, throw the error
      if (pgError.message && pgError.message.includes("already")) {
        throw statusError("Email is already registered.", 409);
      }
      // Otherwise fall through to file-based storage
      console.warn("PostgreSQL registration failed, falling back to file storage:", pgError.message);
    }
  }

  // Fall back to file-based storage
  return mutateDb(async (db) => {
    if (db.users.some((user) => user.email === cleanEmail)) throw statusError("Email is already registered.", 409);
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    const user = { id: createId("user", cleanEmail), name: cleanName, email: cleanEmail, passwordHash, createdAt: now, updatedAt: now };
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

  // Try PostgreSQL first if DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      const result = await authenticateUserPostgres({ email: cleanEmail, password });
      return result;
    } catch (pgError) {
      // If auth failed, throw the error
      if (pgError.message && pgError.message.includes("Invalid")) {
        throw statusError("Invalid email or password.", 401);
      }
      // Otherwise fall through to file-based storage
      console.warn("PostgreSQL authentication failed, falling back to file storage:", pgError.message);
    }
  }

  // Fall back to file-based storage
  const db = await readDb();
  const user = db.users.find((item) => item.email === cleanEmail);
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw statusError("Invalid email or password.", 401);
  const member = db.workspaceMembers.find((item) => item.userId === user.id);
  const workspace = db.workspaces.find((item) => item.id === member?.workspaceId);
  return { user: publicUser(user), workspace, role: member?.role || "Viewer" };
}

export async function validateCsrf(req, ctx) {
  if (req.method === "GET" || req.method === "HEAD") return;
  // Allow unauthenticated demo login without CSRF token for quick demos
  try {
    const url = req.url || req.originalUrl || "";
    if (req.method === "POST" && String(url).startsWith("/api/auth/demo-login")) return;
  } catch (e) {}
  const headerToken = req.headers["x-csrf-token"];
  const cookieToken = parseCookies(req)[CSRF_COOKIE];
  // If there's no CSRF cookie set, allow the request (useful for initial demo sign-ins)
  if (!cookieToken) return;
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

// ============================================================================
// PostgreSQL Authentication Functions (when DATABASE_URL is set)
// ============================================================================

async function registerUserPostgres({ name, email, password, workspaceName }) {
  try {
    const passwordHash = await hashPassword(password);
    
    const result = await transaction(async (client) => {
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id, email, name`,
        [email, passwordHash, name]
      );
      
      const user = userResult.rows[0];
      
      // Create workspace owned by user
      const wsResult = await client.query(
        `INSERT INTO workspaces (owner_id, name, plan)
         VALUES ($1, $2, $3)
         RETURNING id, name, plan`,
        [user.id, workspaceName || `${name}'s Workspace`, 'starter']
      );
      
      const workspace = wsResult.rows[0];
      
      // Add user as workspace member with owner role
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [workspace.id, user.id, 'Owner']
      );
      
      return { user: publicUser({ ...user, passwordHash }), workspace, role: 'Owner' };
    });
    
    return result;
  } catch (error) {
    if (error.message.includes("duplicate") || error.message.includes("UNIQUE")) {
      throw new Error("Email already registered");
    }
    throw error;
  }
}

async function authenticateUserPostgres({ email, password }) {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.password_hash,
              w.id as workspace_id, w.name as workspace_name, w.plan,
              wm.role
       FROM users u
       LEFT JOIN workspace_members wm ON u.id = wm.user_id
       LEFT JOIN workspaces w ON wm.workspace_id = w.id
       WHERE u.email = $1
       LIMIT 1`,
      [email]
    );
    
    if (result.rows.length === 0) {
      throw new Error("Invalid email or password");
    }
    
    const row = result.rows[0];
    const isValid = await verifyPassword(password, row.password_hash);
    
    if (!isValid) {
      throw new Error("Invalid email or password");
    }
    
    return {
      user: publicUser({ id: row.id, email: row.email, name: row.name }),
      workspace: { id: row.workspace_id, name: row.workspace_name, plan: row.plan },
      role: row.role || 'Viewer'
    };
  } catch (error) {
    throw error;
  }
}
