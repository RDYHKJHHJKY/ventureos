import { mkdir, readFile, writeFile, access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let DATA_FILE = process.env.VENTUREOS_DATA_FILE || null;

async function getDataFile() {
  if (DATA_FILE) return DATA_FILE;
  if (process.env.VENTUREOS_DATA_FILE) {
    DATA_FILE = process.env.VENTUREOS_DATA_FILE;
    return DATA_FILE;
  }
  if (process.env.VERCEL === "1" || process.env.NOW_REGION) {
    DATA_FILE = path.join(os.tmpdir(), "ventureos-db.json");
    return DATA_FILE;
  }

  const defaultFile = path.join(process.cwd(), ".data", "ventureos-db.json");
  const defaultDir = path.dirname(defaultFile);
  try {
    await mkdir(defaultDir, { recursive: true });
    await access(defaultDir, constants.W_OK);
    DATA_FILE = defaultFile;
    return DATA_FILE;
  } catch {
    DATA_FILE = path.join(os.tmpdir(), "ventureos-db.json");
    return DATA_FILE;
  }
}

const seed = {
  assets: [
    {
      id: "asset_stripe_js",
      name: "stripe/stripe-js",
      canonicalUrl: "https://github.com/stripe/stripe-js",
      type: "Library",
      company: "Stripe",
      industry: "Fintech",
      domains: ["github.com"],
      repos: ["https://github.com/stripe/stripe-js"],
      packages: [],
      latestTrustScore: 84,
      latestConfidenceScore: 88,
      risk: "Low",
      passportStatus: "Active",
      monitoringStatus: "Active",
      lastScannedAt: "2026-06-26T18:00:00.000Z",
      createdAt: "2026-06-01T12:00:00.000Z",
      updatedAt: "2026-06-26T18:00:00.000Z",
    },
    {
      id: "asset_next_js",
      name: "vercel/next.js",
      canonicalUrl: "https://github.com/vercel/next.js",
      type: "Framework",
      company: "Vercel",
      industry: "DevTools",
      domains: ["github.com"],
      repos: ["https://github.com/vercel/next.js"],
      packages: [],
      latestTrustScore: 91,
      latestConfidenceScore: 90,
      risk: "Low",
      passportStatus: "Active",
      monitoringStatus: "Active",
      lastScannedAt: "2026-06-26T15:00:00.000Z",
      createdAt: "2026-05-20T12:00:00.000Z",
      updatedAt: "2026-06-26T15:00:00.000Z",
    },
    {
      id: "asset_openai_node",
      name: "openai/openai-node",
      canonicalUrl: "https://github.com/openai/openai-node",
      type: "SDK",
      company: "OpenAI",
      industry: "AI",
      domains: ["github.com"],
      repos: ["https://github.com/openai/openai-node"],
      packages: [],
      latestTrustScore: 73,
      latestConfidenceScore: 82,
      risk: "Medium",
      passportStatus: "Review",
      monitoringStatus: "Off",
      lastScannedAt: "2026-06-25T20:00:00.000Z",
      createdAt: "2026-05-10T12:00:00.000Z",
      updatedAt: "2026-06-25T20:00:00.000Z",
    },
  ],
  scanRuns: [],
  scanFindings: [],
  evidenceItems: [],
  sprVendors: [],
  sprSoftware: [],
  sprEvidence: [],
  sprPassports: [],
  sprSignals: [],
  users: [],
  workspaces: [],
  workspaceMembers: [],
  msps: [],
  mspMembers: [],
  billingCustomers: [],
  billingSubscriptions: [],
  billingUsage: [],
  sessions: [],
  passports: [
    {
      id: "passport_stripe_js",
      assetId: "asset_stripe_js",
      assetName: "stripe/stripe-js",
      company: "Stripe",
      version: 1,
      trustScore: 84,
      confidenceScore: 88,
      verdict: "TRUSTED",
      status: "Active",
      isPublic: true,
      revoked: false,
      revokedAt: null,
      issuedAt: "2026-06-01",
      expiresAt: "2026-09-01",
      evidenceSummary: "Healthy release cadence, strong security posture, active monitoring.",
      badgeEmbed: "",
      publicUrl: "/passport/passport_stripe_js",
      issuedBy: "user_seed",
      createdAt: "2026-06-01T12:00:00.000Z",
      updatedAt: "2026-06-01T12:00:00.000Z",
    },
    {
      id: "passport_next_js",
      assetId: "asset_next_js",
      assetName: "vercel/next.js",
      company: "Vercel",
      version: 1,
      trustScore: 91,
      confidenceScore: 90,
      verdict: "TRUSTED",
      status: "Active",
      isPublic: true,
      revoked: false,
      revokedAt: null,
      issuedAt: "2026-05-20",
      expiresAt: "2026-08-20",
      evidenceSummary: "Excellent engineering activity and broad ecosystem adoption.",
      badgeEmbed: "",
      publicUrl: "/passport/passport_next_js",
      issuedBy: "user_seed",
      createdAt: "2026-05-20T12:00:00.000Z",
      updatedAt: "2026-05-20T12:00:00.000Z",
    },
    {
      id: "passport_openai_node",
      assetId: "asset_openai_node",
      assetName: "openai/openai-node",
      company: "OpenAI",
      version: 1,
      trustScore: 73,
      confidenceScore: 82,
      verdict: "CONDITIONALLY TRUSTED",
      status: "Review",
      isPublic: true,
      revoked: false,
      revokedAt: null,
      issuedAt: "2026-05-10",
      expiresAt: "2026-08-10",
      evidenceSummary: "Strong maintainer profile with medium dependency and evidence gaps.",
      badgeEmbed: "",
      publicUrl: "/passport/passport_openai_node",
      issuedBy: "user_seed",
      createdAt: "2026-05-10T12:00:00.000Z",
      updatedAt: "2026-05-10T12:00:00.000Z",
    },
  ],
  projects: [],
  projectArtifacts: [],
  projectDependencies: [],
  projectMetadata: [],
  projectSignals: [],
  projectScores: [],
  projectEvents: [],
};

function migrateDb(db) {
  db.users ||= [];
  db.workspaces ||= [];
  db.workspaceMembers ||= [];
  db.msps ||= [];
  db.mspMembers ||= [];
  db.billingCustomers ||= [];
  db.billingSubscriptions ||= [];
  db.billingUsage ||= [];
  db.sessions ||= [];
  db.assets ||= [];
  db.scanRuns ||= [];
  db.scanFindings ||= [];
  db.evidenceItems ||= [];
  db.sprVendors ||= [];
  db.sprSoftware ||= [];
  db.sprEvidence ||= [];
  db.sprPassports ||= [];
  db.sprSignals ||= [];
  db.sprAuditLogs ||= [];
  db.passports ||= [];
  db.projects ||= [];
  db.projectArtifacts ||= [];
  db.projectDependencies ||= [];
  db.projectMetadata ||= [];
  db.projectSignals ||= [];
  db.projectScores ||= [];
  db.projectEvents ||= [];
  db.workspaceGraphs ||= [];

  const fallbackWorkspaceId = db.workspaces[0]?.id;
  for (const asset of db.assets) {
    if (!asset.workspaceId && fallbackWorkspaceId) asset.workspaceId = fallbackWorkspaceId;
  }
  for (const scan of db.scanRuns) {
    if (!scan.workspaceId && fallbackWorkspaceId) scan.workspaceId = fallbackWorkspaceId;
  }
  for (const finding of db.scanFindings) {
    if (!finding.workspaceId && fallbackWorkspaceId) finding.workspaceId = fallbackWorkspaceId;
  }
  for (const evidence of db.evidenceItems) {
    if (!evidence.workspaceId && fallbackWorkspaceId) evidence.workspaceId = fallbackWorkspaceId;
  }
  for (const passport of db.passports) {
    if (!passport.workspaceId && fallbackWorkspaceId) passport.workspaceId = fallbackWorkspaceId;
    passport.version = typeof passport.version === "number" ? passport.version : 1;
    passport.isPublic = passport.isPublic === true;
    passport.revoked = passport.revoked === true;
    passport.revokedAt = passport.revokedAt || null;
    passport.publicUrl = passport.publicUrl || `/passport/${passport.id}`;
    passport.updatedAt = passport.updatedAt || passport.createdAt || new Date().toISOString();
  }
  return db;
}
async function ensureStore() {
  const dataFile = await getDataFile();
  await mkdir(path.dirname(dataFile), { recursive: true });
  try {
    const raw = await readFile(dataFile, "utf8");
    return migrateDb(JSON.parse(raw));
  } catch {
    const initialData = migrateDb(structuredClone(seed));
    await writeFile(dataFile, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

async function saveStore(db) {
  const dataFile = await getDataFile();
  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(db, null, 2));
}

export function createId(prefix, value = "") {
  const body = `${value}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let hash = 0;
  for (let i = 0; i < body.length; i += 1) {
    hash = (hash * 31 + body.charCodeAt(i)) >>> 0;
  }
  return `${prefix}_${hash.toString(36)}`;
}

export async function readDb() {
  return ensureStore();
}

export async function mutateDb(mutator) {
  const db = await ensureStore();
  const result = await mutator(db);
  await saveStore(db);
  return result;
}

export function getMspById(db, mspId) {
  return (db.msps || []).find((item) => item.id === mspId) || null;
}

export function getMspMemberships(db, userId) {
  return (db.mspMembers || []).filter((item) => item.userId === userId);
}

export function createMspMembership(db, { mspId, userId, role = "viewer" }) {
  const now = new Date().toISOString();
  const membership = {
    id: createId("mspmember", `${userId}-${mspId}`),
    mspId,
    userId,
    role: String(role || "viewer").trim().toLowerCase() || "viewer",
    createdAt: now,
  };
  db.mspMembers.push(membership);
  return membership;
}

export function getMembershipForUser(db, mspId, userId) {
  return (db.mspMembers || []).find((item) => item.mspId === mspId && item.userId === userId) || null;
}

export function listMspMembers(db, mspId) {
  return (db.mspMembers || []).filter((item) => item.mspId === mspId);
}

export function getMspWorkspaces(db, mspId) {
  return (db.workspaces || []).filter((workspace) => workspace.mspId === mspId);
}

export function getMspWorkspaceIds(db, mspId) {
  return getMspWorkspaces(db, mspId).map((workspace) => workspace.id);
}

export function workspaceIdsForMsp(db, mspMemberships) {
  const mspIds = (mspMemberships || []).map((membership) => membership.mspId);
  const workspaceIds = new Set();
  for (const mspId of mspIds) {
    for (const workspace of getMspWorkspaces(db, mspId)) {
      workspaceIds.add(workspace.id);
    }
  }
  return Array.from(workspaceIds);
}

export function getBillingCustomer(db, mspId) {
  return (db.billingCustomers || []).find((item) => item.mspId === mspId) || null;
}

export function getBillingSubscription(db, mspId) {
  return (db.billingSubscriptions || []).find((item) => item.mspId === mspId) || null;
}

export function getBillingUsage(db, mspId) {
  return (db.billingUsage || []).filter((item) => item.mspId === mspId).sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
}

export function getMspBillingSummary(db, mspId) {
  const customer = getBillingCustomer(db, mspId);
  const subscription = getBillingSubscription(db, mspId);
  const usage = getBillingUsage(db, mspId);
  const totalAmountCents = usage.reduce((sum, item) => sum + (item.amountCents || 0), 0);
  const totalQuantity = usage.reduce((sum, item) => sum + (item.quantity || 0), 0);
  return {
    customer,
    subscription,
    usage,
    totals: {
      totalAmountCents,
      totalQuantity,
      eventCount: usage.length,
    },
  };
}

export function createMsp(db, { name, billingEmail, region, ownerUserId }) {
  const now = new Date().toISOString();
  const cleanName = String(name || "").trim();
  const cleanEmail = String(billingEmail || "").trim().toLowerCase();
  const cleanRegion = String(region || "").trim() || "us-east-1";
  const id = createId("msp", cleanName);
  const msp = {
    id,
    name: cleanName,
    billingEmail: cleanEmail,
    region: cleanRegion,
    ownerUserId,
    active: true,
    plan: "starter",
    createdAt: now,
    updatedAt: now,
  };
  db.msps.push(msp);
  createMspMembership(db, { mspId: id, userId: ownerUserId, role: "admin" });
  const customer = {
    id: createId("billingcustomer", id),
    mspId: id,
    customerName: cleanName,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  db.billingCustomers.push(customer);
  const subscription = {
    id: createId("billingsub", id),
    mspId: id,
    plan: "starter",
    status: "active",
    startedAt: now,
    renewalAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    amountCents: 9900,
    currency: "USD",
    createdAt: now,
    updatedAt: now,
  };
  db.billingSubscriptions.push(subscription);
  return { msp, customer, subscription };
}

export function listWorkspacesForMsp(db, mspId) {
  return (db.workspaces || []).filter((workspace) => workspace.mspId === mspId);
}

export function getWorkspaceForMsp(db, mspId, workspaceId) {
  return (db.workspaces || []).find((workspace) => workspace.id === workspaceId && workspace.mspId === mspId) || null;
}

export function createWorkspaceForMsp(db, { mspId, name, ownerUserId }) {
  const now = new Date().toISOString();
  const cleanName = String(name || "").trim();
  const workspace = {
    id: createId("workspace", cleanName),
    mspId,
    name: cleanName,
    createdAt: now,
    updatedAt: now,
  };
  db.workspaces.push(workspace);
  db.workspaceMembers.push({
    id: createId("member", `${ownerUserId}-${workspace.id}`),
    workspaceId: workspace.id,
    userId: ownerUserId,
    role: "Owner",
    createdAt: now,
  });
  return workspace;
}

export const createMspWorkspace = createWorkspaceForMsp;

export function recordBillingUsage(db, { mspId, type = "metered", description = "Usage event", quantity = 1, amountCents = 0, currency = "USD" }) {
  const now = new Date().toISOString();
  const record = {
    id: createId("billingusage", `${mspId}-${type}-${now}`),
    mspId,
    type,
    description,
    quantity,
    amountCents,
    currency,
    recordedAt: now,
    month: now.slice(0, 7),
  };
  db.billingUsage.push(record);
  return record;
}

export function normalizeAssetForClient(asset) {
  return {
    ...asset,
    trust: asset.latestTrustScore,
    confidence: asset.latestConfidenceScore,
    monitored: asset.monitoringStatus === "Active",
  };
}

export function listNodesByWorkspace(db, workspaceId) {
  const workspaces = (db.workspaces || []).filter((workspace) => workspace.id === workspaceId);
  const workspaceNodes = [];
  for (const workspace of workspaces) {
    workspaceNodes.push({ id: `Workspace:${workspace.id}`, type: "Workspace", label: workspace.name });
  }
  for (const asset of db.assets || []) {
    if (asset.workspaceId === workspaceId) {
      workspaceNodes.push({ id: `Asset:${asset.id}`, type: "Asset", label: asset.name, trust: asset.latestTrustScore, confidence: asset.latestConfidenceScore });
    }
  }
  for (const project of db.projects || []) {
    if (project.workspaceId === workspaceId) {
      workspaceNodes.push({ id: `Project:${project.id}`, type: "Project", label: project.name, trust: project.latestTrustScore || 0, confidence: project.latestConfidenceScore || 0 });
    }
  }
  for (const passport of db.passports || []) {
    if (passport.workspaceId === workspaceId) {
      workspaceNodes.push({ id: `Passport:${passport.id}`, type: "Passport", label: `Passport ${passport.version}` });
    }
  }
  return workspaceNodes;
}

export function listEdgesByWorkspace(db, workspaceId) {
  const edges = [];
  const workspaceNodeIds = new Set(listNodesByWorkspace(db, workspaceId).map((node) => node.id));
  for (const projectDependency of db.projectDependencies || []) {
    const projectId = `Project:${projectDependency.projectId}`;
    const dependencyId = `Dependency:${projectDependency.packageName}@${projectDependency.version}`.toLowerCase();
    if (workspaceNodeIds.has(projectId)) {
      edges.push({ source: projectId, target: dependencyId, type: "depends_on" });
    }
  }
  for (const passport of db.passports || []) {
    if (passport.workspaceId === workspaceId) {
      edges.push({ source: `Passport:${passport.id}`, target: `Asset:${passport.assetId}`, type: "passported_by" });
    }
  }
  for (const asset of db.assets || []) {
    if (asset.workspaceId === workspaceId) {
      edges.push({ source: `Asset:${asset.id}`, target: `Workspace:${asset.workspaceId}`, type: "owned_by" });
    }
  }
  for (const project of db.projects || []) {
    if (project.workspaceId === workspaceId) {
      edges.push({ source: `Project:${project.id}`, target: `Workspace:${project.workspaceId}`, type: "owned_by" });
    }
  }
  return edges;
}

export function getNodeMetadata(db, nodeId) {
  if (nodeId.startsWith("Project:")) {
    const projectId = nodeId.replace(/^Project:/, "");
    return (db.projectArtifacts || []).filter((item) => item.projectId === projectId && item.type === "METADATA");
  }
  return [];
}

export function getNodeScanStatus(db, nodeId) {
  if (nodeId.startsWith("Asset:")) {
    const assetId = nodeId.replace(/^Asset:/, "");
    return { scanned: (db.scanRuns || []).some((scan) => scan.assetId === assetId) };
  }
  return { scanned: false };
}

export function getNodePassportStatus(db, nodeId) {
  if (nodeId.startsWith("Asset:")) {
    const assetId = nodeId.replace(/^Asset:/, "");
    return { hasPassport: (db.passports || []).some((passport) => passport.assetId === assetId && passport.isPublic) };
  }
  return { hasPassport: false };
}



