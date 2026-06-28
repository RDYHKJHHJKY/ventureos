import { mutateDb, createId, createWorkspaceForMsp as dsCreateWorkspaceForMsp, readDb } from "./data-store.js";

export async function initializeWorkspacePack(workspaceId, { name = "New Workspace", description = "", industry = "", size = "small" } = {}) {
  return mutateDb((db) => {
    db.assetCategories ||= [];
    db.passportTemplates ||= [];
    db.scanTemplates ||= [];
    db.coverageRules ||= [];
    db.enforcementRules ||= [];
    db.coverageBaselines ||= [];
    db.riskBaselines ||= [];
    db.timelineEvents ||= [];

    const now = new Date().toISOString();

    // Default asset categories
    const categories = ["Web Application", "Database", "Service", "Library"].map((c) => ({ id: createId("assetcat", `${workspaceId}-${c}`), workspaceId, name: c, createdAt: now }));
    for (const cat of categories) db.assetCategories.push(cat);

    // Default passport template
    const passportTemplate = {
      id: createId("passporttmpl", workspaceId),
      workspaceId,
      name: "Default Software Passport",
      fields: ["version", "license", "maintainer", "lastScannedAt"],
      validation: { version: "required", license: "optional" },
      issuance: { autoIssue: false },
      expiresInDays: 90,
      createdAt: now,
    };
    db.passportTemplates.push(passportTemplate);

    // Default scan template
    const scanTemplate = {
      id: createId("scantmpl", workspaceId),
      workspaceId,
      name: "Default Vulnerability Scan",
      scanType: "vuln_scan",
      rules: { severityThreshold: "medium" },
      coverageRules: [{ appliesTo: ["Web Application", "Service"] }],
      createdAt: now,
    };
    db.scanTemplates.push(scanTemplate);

    // Default coverage rule
    const coverageRule = {
      id: createId("coverule", workspaceId),
      workspaceId,
      name: "Default Coverage",
      appliesTo: ["Web Application", "Service"],
      requiredFields: ["version"],
      requiredPassports: [passportTemplate.id],
      requiredScans: [scanTemplate.id],
      requiredRelationships: [],
      createdAt: now,
    };
    db.coverageRules.push(coverageRule);

    // Default enforcement rule (informational)
    const enforcementRule = {
      id: createId("enforce", workspaceId),
      workspaceId,
      name: "Warn on missing passport",
      condition: { missingPassport: true },
      action: { notify: true },
      createdAt: now,
    };
    db.enforcementRules.push(enforcementRule);

    // Initialize empty coverage/risk baselines
    db.coverageBaselines.push({ id: createId("coveragebase", workspaceId), workspaceId, score: 0, distribution: { good: 0, partial: 0, poor: 0 }, gaps: [], critical: [], generatedAt: now });
    db.riskBaselines.push({ id: createId("riskbase", workspaceId), workspaceId, riskScore: 0, issues: [], generatedAt: now });

    // Add a timeline event for initialization
    db.timelineEvents.push({ id: createId("timeline", workspaceId), workspaceId, type: "ONBOARDING_INITIALIZED", message: `Initialization pack installed: ${name}`, createdAt: now });

    return { ok: true, workspaceId, counts: { categories: categories.length, passportTemplates: 1, scanTemplates: 1, coverageRules: 1 } };
  });
}

export async function createWorkspaceForMspAndInitialize(mspId, { name, description, industry, size } = {}, ownerUserId) {
  // create workspace and then initialize defaults
  const workspace = await mutateDb((db) => dsCreateWorkspaceForMsp(db, { mspId, name, ownerUserId }));
  await initializeWorkspacePack(workspace.id, { name, description, industry, size });
  const db = await readDb();
  const created = db.workspaces.find((w) => w.id === workspace.id);
  return created;
}

export default { initializeWorkspacePack, createWorkspaceForMspAndInitialize };
