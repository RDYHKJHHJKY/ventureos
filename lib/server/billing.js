import { buildTrustGraph } from "./trust-graph.js";
import { listWorkspacesForMsp, getMspById } from "./data-store.js";

const VALID_BILLING_STATUSES = new Set(["pending", "active", "past_due", "canceled", "trialing", "incomplete"]);
const VALID_BILLING_TRANSITIONS = {
  pending: new Set(["active", "past_due", "canceled", "trialing", "incomplete"]),
  active: new Set(["past_due", "canceled", "trialing"]),
  past_due: new Set(["active", "canceled", "trialing"]),
  canceled: new Set([]),
  trialing: new Set(["active", "past_due", "canceled"]),
  incomplete: new Set(["active", "past_due", "canceled"]),
};

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  return VALID_BILLING_STATUSES.has(value) ? value : "pending";
}

export function getMspBillingState(msp) {
  return {
    billingCustomerId: msp?.billingCustomerId || null,
    subscriptionId: msp?.subscriptionId || null,
    plan: msp?.plan || "starter",
    billingStatus: normalizeStatus(msp?.billingStatus),
    billingUpdatedAt: msp?.billingUpdatedAt || null,
  };
}

export function updateMspBillingState(msp, patch = {}) {
  const nextStatus = normalizeStatus(patch.billingStatus || msp?.billingStatus);
  const currentState = getMspBillingState(msp);
  if (patch.billingStatus && currentState.billingStatus && currentState.billingStatus !== nextStatus) {
    const allowed = VALID_BILLING_TRANSITIONS[currentState.billingStatus] || new Set();
    if (!allowed.has(nextStatus)) {
      throw new Error(`Invalid billing transition from ${currentState.billingStatus} to ${nextStatus}.`);
    }
  }
  if (!patch.billingStatus && currentState.billingStatus) {
    return {
      ...msp,
      billingCustomerId: patch.billingCustomerId ?? msp?.billingCustomerId ?? null,
      subscriptionId: patch.subscriptionId ?? msp?.subscriptionId ?? null,
      plan: patch.plan ?? msp?.plan ?? "starter",
      billingStatus: currentState.billingStatus,
      billingUpdatedAt: patch.billingUpdatedAt ?? msp?.billingUpdatedAt ?? new Date().toISOString(),
    };
  }
  return {
    ...msp,
    billingCustomerId: patch.billingCustomerId ?? msp?.billingCustomerId ?? null,
    subscriptionId: patch.subscriptionId ?? msp?.subscriptionId ?? null,
    plan: patch.plan ?? msp?.plan ?? "starter",
    billingStatus: nextStatus,
    billingUpdatedAt: patch.billingUpdatedAt ?? new Date().toISOString(),
  };
}

export function activateMsp(msp, patch = {}) {
  const nextState = updateMspBillingState(msp, {
    ...patch,
    billingStatus: "active",
    billingUpdatedAt: patch.billingUpdatedAt || new Date().toISOString(),
  });
  return {
    ...nextState,
    lifecycle: {
      workspaceCreationEnabled: true,
      scansEnabled: true,
      passportsEnabled: true,
      timelineEventsEnabled: true,
      riskCoverageEnforcementEnabled: true,
      dashboardActivated: true,
      usageMeteringEnabled: true,
      billingPortalEnabled: true,
    },
  };
}

export function suspendMsp(msp, patch = {}) {
  const nextState = updateMspBillingState(msp, {
    ...patch,
    billingStatus: patch.billingStatus || "past_due",
    billingUpdatedAt: patch.billingUpdatedAt || new Date().toISOString(),
  });
  return {
    ...nextState,
    lifecycle: {
      workspaceCreationEnabled: false,
      newScansDisabled: true,
      newPassportsDisabled: true,
      newAssetsDisabled: true,
      graphReadOnly: true,
      timelineReadOnly: true,
      dashboardBannerVisible: true,
      billingPortalEnabled: true,
      workspaceReadOnly: true,
      scansEnabled: false,
      passportsEnabled: false,
      timelineEventsEnabled: false,
      riskCoverageEnforcementEnabled: false,
    },
  };
}

export function cancelMsp(msp, patch = {}) {
  const nextState = updateMspBillingState(msp, {
    ...patch,
    billingStatus: patch.billingStatus || "canceled",
    billingUpdatedAt: patch.billingUpdatedAt || new Date().toISOString(),
  });
  return {
    ...nextState,
    lifecycle: {
      workspaceFrozen: true,
      workspaceCreationEnabled: false,
      scansEnabled: false,
      passportsEnabled: false,
      timelineEventsEnabled: false,
      riskCoverageEnforcementEnabled: false,
      billingPortalEnabled: true,
      dataExportEnabled: true,
      graphReadOnly: true,
      timelineReadOnly: true,
      dashboardBannerVisible: true,
    },
  };
}

export function applyBillingLifecycleEvent(msp, eventType, payload = {}) {
  const statusMap = {
    "invoice.paid": "active",
    "invoice.paymentfailed": "past_due",
    "customer.subscription.deleted": "canceled",
    "customer.subscription.trialwillend": "trialing",
    "customer.subscription.updated": payload.billingStatus || msp?.billingStatus || "active",
  };
  const nextStatus = statusMap[eventType];
  if (!nextStatus) return { msp, applied: false };
  const updated = updateMspBillingState(msp, {
    billingStatus: nextStatus,
    plan: payload.plan || msp?.plan || "starter",
    billingUpdatedAt: new Date().toISOString(),
  });
  if (nextStatus === "active") return { msp: activateMsp(updated), applied: true, eventType };
  if (nextStatus === "past_due") return { msp: suspendMsp(updated, { billingStatus: nextStatus }), applied: true, eventType };
  if (nextStatus === "canceled") return { msp: cancelMsp(updated, { billingStatus: nextStatus }), applied: true, eventType };
  return { msp: updated, applied: true, eventType };
}

export function createMspCustomer(msp) {
  const now = new Date().toISOString();
  return {
    id: `cust_${msp.id}_${Date.now()}`,
    mspId: msp.id,
    customerName: msp.name,
    billingEmail: msp.billingEmail,
    createdAt: now,
    updatedAt: now,
    status: "active",
  };
}

export function createSubscriptionForMsp(msp, plan = "starter") {
  const now = new Date().toISOString();
  return {
    id: `sub_${msp.id}_${Date.now()}`,
    mspId: msp.id,
    plan,
    status: "active",
    startedAt: now,
    renewalAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    currency: "USD",
    amountCents: plan === "starter" ? 9900 : 19900,
    createdAt: now,
    updatedAt: now,
  };
}

export function getBillingPortalUrl(msp) {
  return `https://billing.ventureos.local/portal/${encodeURIComponent(msp.id)}`;
}

export function recordBillingEvent(event) {
  const now = new Date().toISOString();
  return {
    id: `event_${event.type}_${Date.now()}`,
    type: event.type,
    mspId: event.mspId || null,
    data: event.data || null,
    receivedAt: event.receivedAt || now,
    createdAt: now,
  };
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMostRecentTimestamp(...values) {
  const timestamps = values
    .map((value) => parseTimestamp(value))
    .filter(Boolean)
    .map((date) => date.getTime());
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function getDaysSince(value) {
  const date = parseTimestamp(value);
  if (!date) return Number.POSITIVE_INFINITY;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

export function getWorkspaceUsageSummary(db, workspaceId) {
  const assets = (db.assets || []).filter((item) => item.workspaceId === workspaceId).length;
  const scans = (db.scanRuns || []).filter((item) => item.workspaceId === workspaceId).length;
  const passports = (db.passports || []).filter((item) => item.workspaceId === workspaceId).length;
  let nodes = 0;
  let edges = 0;
  let timelineEvents = 0;
  let riskEvents = 0;
  let riskHighCount = 0;
  let riskMediumCount = 0;

  const workspaceScans = (db.scanRuns || []).filter((item) => item.workspaceId === workspaceId);
  for (const scan of workspaceScans) {
    const risk = Number(scan.risk || 0);
    if (risk >= 50) riskHighCount += 1;
    else if (risk >= 30) riskMediumCount += 1;
  }

  try {
    const graph = buildTrustGraph(db, workspaceId);
    nodes = graph.nodes.length;
    edges = graph.edges.length;
    timelineEvents = graph.timelineEvents.length;
    riskEvents = workspaceScans.length;
  } catch {
    timelineEvents = (db.projectEvents || []).filter((item) => item.workspaceId === workspaceId).length;
    riskEvents = workspaceScans.length;
  }

  return {
    workspaceId,
    assetCount: assets,
    scanCount: scans,
    passportCount: passports,
    nodeCount: nodes,
    edgeCount: edges,
    timelineEvents,
    riskEvents,
    riskHighCount,
    riskMediumCount,
    latestScan: workspaceScans
      .map((item) => item.completedAt || item.createdAt)
      .map(parseTimestamp)
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0] || null,
    // Backwards-compatible aliases expected by some tests
    assets: assets,
    scans: scans,
    passports: passports,
    nodes: nodes,
    edges: edges,
  };
}

export function classifyWorkspaceHealth(workspace) {
  const mode = String(workspace?.mode || "active").trim().toLowerCase();
  if (mode === "past_due" || mode === "suspended" || mode === "canceled") return "suspended";

  const lastActivity = getMostRecentTimestamp(workspace?.lastScan, workspace?.lastPassport, workspace?.lastTimelineEvent);
  const daysSinceActivity = lastActivity ? getDaysSince(lastActivity) : Number.POSITIVE_INFINITY;
  if (daysSinceActivity > 30) return "inactive";

  const hasNoPassports = (workspace?.passportCount || 0) === 0;
  const hasCriticalRisk = (workspace?.riskHighCount || 0) > 0;
  const hasMediumRisk = (workspace?.riskMediumCount || 0) > 0;
  const hasNoScans = (workspace?.scanCount || 0) === 0;
  const hasNoTimeline = (workspace?.timelineEvents || 0) === 0;

  if (hasCriticalRisk || hasNoPassports || hasNoScans || hasNoTimeline) return "critical";
  if (hasMediumRisk) return "warning";
  return "healthy";
}

export function getWorkspaceOverview({ db, mspId, workspaces = listWorkspacesForMsp(db, mspId) }) {
  return workspaces.map((workspace) => {
    const usage = getWorkspaceUsageSummary(db, workspace.id);
    const scans = (db.scanRuns || [])
      .filter((scan) => scan.workspaceId === workspace.id)
      .sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0));
    const passports = (db.passports || [])
      .filter((passport) => passport.workspaceId === workspace.id)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    const timeline = (db.projectEvents || [])
      .filter((event) => event.workspaceId === workspace.id)
      .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));
    const msp = (db.msps || []).find((item) => item.id === mspId) || null;
    const workspaceMode = String(msp?.billingStatus || "active").trim().toLowerCase();
    const lastScan = scans[0]?.completedAt || scans[0]?.createdAt || null;
    const lastPassport = passports[0]?.updatedAt || passports[0]?.createdAt || null;
    const lastTimelineEvent = timeline[0]?.timestamp || timeline[0]?.createdAt || null;
    const health = classifyWorkspaceHealth({
      ...usage,
      mode: workspaceMode,
      lastScan,
      lastPassport,
      lastTimelineEvent,
    });

    return {
      id: workspace.id,
      name: workspace.name,
      assetCount: usage.assetCount,
      scanCount: usage.scanCount,
      passportCount: usage.passportCount,
      nodeCount: usage.nodeCount,
      edgeCount: usage.edgeCount,
      riskEvents: usage.riskEvents,
      riskHighCount: usage.riskHighCount,
      riskMediumCount: usage.riskMediumCount,
      timelineEvents: usage.timelineEvents,
      lastScan,
      lastPassport,
      lastTimelineEvent,
      workspaceMode,
      mode: workspaceMode,
      health,
    };
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toDaysAgo(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
}

export function getMspRiskOverview({ db, mspId, workspaces = listWorkspacesForMsp(db, mspId) }) {
  const perWorkspace = workspaces.map((workspace) => {
    const usage = getWorkspaceUsageSummary(db, workspace.id);
    const runs = (db.scanRuns || []).filter((item) => item.workspaceId === workspace.id);
    const highCount = runs.filter((r) => Number(r.risk || 0) >= 50).length;
    const mediumCount = runs.filter((r) => Number(r.risk || 0) >= 30 && Number(r.risk || 0) < 50).length;
    const lowCount = runs.length - highCount - mediumCount;
    const findings = (db.scanFindings || []).filter((item) => item.workspaceId === workspace.id).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const severity = highCount > 0 ? "high" : mediumCount > 0 ? "medium" : lowCount > 0 ? "low" : "low";
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      totalRiskEvents: runs.length,
      highRiskCount: highCount,
      mediumRiskCount: mediumCount,
      lowRiskCount: lowCount,
      lastRiskEvent: findings[0]?.createdAt || null,
      severity,
    };
  });
  const totals = perWorkspace.reduce(
    (summary, item) => {
      summary.totalRiskEvents += item.totalRiskEvents;
      summary.highRiskCount += item.highRiskCount;
      summary.mediumRiskCount += item.mediumRiskCount;
      summary.lowRiskCount += item.lowRiskCount;
      return summary;
    },
    { totalRiskEvents: 0, highRiskCount: 0, mediumRiskCount: 0, lowRiskCount: 0 }
  );
  return {
    mspId,
    perWorkspace,
    totalRiskEvents: totals.totalRiskEvents,
    riskBySeverity: {
      high: totals.highRiskCount,
      medium: totals.mediumRiskCount,
      low: totals.lowRiskCount,
    },
    riskByWorkspace: perWorkspace.map((item) => ({ workspaceId: item.workspaceId, workspaceName: item.workspaceName, riskEvents: item.totalRiskEvents, severity: item.severity })),
  };
}

export function getMspStalenessOverview({ db, mspId, workspaces = listWorkspacesForMsp(db, mspId) }) {
  const perWorkspace = workspaces.map((workspace) => {
    const overview = getWorkspaceOverview({ db, mspId, workspaces: [workspace] })[0];
    const ages = [overview.lastScan, overview.lastPassport, overview.lastTimelineEvent].filter(Boolean).map(toDaysAgo);
    const worstAge = ages.length ? Math.max(...ages) : 0;
    const stalenessScore = clamp(100 - Math.min(99, Math.round(worstAge * 1.5)), 0, 100);
    const bucket = stalenessScore >= 80 ? "fresh" : stalenessScore >= 50 ? "aging" : "stale";
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      lastScan: overview.lastScan,
      lastPassport: overview.lastPassport,
      lastTimelineEvent: overview.lastTimelineEvent,
      stalenessScore,
      bucket,
    };
  });
  const distribution = perWorkspace.reduce(
    (summary, item) => {
      summary[item.bucket] = (summary[item.bucket] || 0) + 1;
      return summary;
    },
    { fresh: 0, aging: 0, stale: 0 }
  );
  const averageStaleness = perWorkspace.length ? Math.round(perWorkspace.reduce((sum, item) => sum + item.stalenessScore, 0) / perWorkspace.length) : 0;
  const worstOffenders = [...perWorkspace].sort((a, b) => a.stalenessScore - b.stalenessScore).slice(0, 5);
  return {
    mspId,
    perWorkspace,
    numberOfStaleWorkspaces: distribution.stale,
    averageStaleness,
    worstOffenders,
    stalenessDistribution: distribution,
  };
}

export function getMspCoverageOverview({ db, mspId, workspaces = listWorkspacesForMsp(db, mspId) }) {
  const perWorkspace = workspaces.map((workspace) => {
    const usage = getWorkspaceUsageSummary(db, workspace.id);
    const missingPassports = usage.passportCount > 0 ? 0 : 1;
    const missingAssets = usage.assetCount > 0 ? 0 : 1;
    const missingScans = usage.scanCount > 0 ? 0 : 1;
    const coverageScore = clamp(100 - missingPassports * 30 - missingAssets * 15 - missingScans * 20, 0, 100);
    const bucket = coverageScore >= 80 ? "good" : coverageScore >= 60 ? "partial" : "poor";
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      coverageScore,
      missingPassports,
      missingAssets,
      missingScans,
      bucket,
    };
  });
  const distribution = perWorkspace.reduce(
    (summary, item) => {
      summary[item.bucket] = (summary[item.bucket] || 0) + 1;
      return summary;
    },
    { good: 0, partial: 0, poor: 0 }
  );
  const averageCoverage = perWorkspace.length ? Math.round(perWorkspace.reduce((sum, item) => sum + item.coverageScore, 0) / perWorkspace.length) : 0;
  const coverageGaps = [...perWorkspace].filter((item) => item.missingPassports || item.missingAssets || item.missingScans).sort((a, b) => a.coverageScore - b.coverageScore).slice(0, 5);
  return {
    mspId,
    perWorkspace,
    averageCoverage,
    coverageDistribution: distribution,
    coverageGaps,
  };
}

export function computeMspHealthScore({ riskOverview, stalenessOverview, coverageOverview, workspaceHealthDistribution, billingStatus, mode }) {
  const normalizedBillingStatus = String(billingStatus || mode || "active").trim().toLowerCase();
  const normalizedMode = String(mode || normalizedBillingStatus || "active").trim().toLowerCase();
  const riskPenalty = (riskOverview?.riskBySeverity?.high || 0) * 20 + (riskOverview?.riskBySeverity?.medium || 0) * 10 + (riskOverview?.riskBySeverity?.low || 0) * 5;
  const stalenessPenalty = (stalenessOverview?.stalenessDistribution?.stale || 0) * 8 + (stalenessOverview?.stalenessDistribution?.aging || 0) * 4;
  const coveragePenalty = (coverageOverview?.coverageDistribution?.poor || 0) * 8 + (coverageOverview?.coverageDistribution?.partial || 0) * 4;
  const workspacePenalty = (workspaceHealthDistribution?.critical || 0) * 6 + (workspaceHealthDistribution?.warning || 0) * 3 + (workspaceHealthDistribution?.suspended || 0) * 10;
  const billingPenalty = normalizedBillingStatus === "past_due" ? 8 : normalizedBillingStatus === "canceled" ? 22 : 0;
  const modePenalty = normalizedMode === "past_due" ? 8 : normalizedMode === "canceled" ? 22 : 0;
  const score = 100 - riskPenalty - stalenessPenalty - coveragePenalty - workspacePenalty - billingPenalty - modePenalty;
  return clamp(score + ((workspaceHealthDistribution?.healthy || 0) > 0 ? 5 : 0), 0, 100);
}

export function getMspExecutiveSummary({ db, mspId, msp = getMspById(db, mspId), workspaces = listWorkspacesForMsp(db, mspId) }) {
  const workspaceOverview = getWorkspaceOverview({ db, mspId, workspaces });
  const workspaceHealthDistribution = workspaceOverview.reduce(
    (summary, workspace) => {
      summary[workspace.health] = (summary[workspace.health] || 0) + 1;
      return summary;
    },
    { healthy: 0, warning: 0, critical: 0, suspended: 0 }
  );
  const riskOverview = getMspRiskOverview({ db, mspId, workspaces });
  const stalenessOverview = getMspStalenessOverview({ db, mspId, workspaces });
  const coverageOverview = getMspCoverageOverview({ db, mspId, workspaces });
  const billingStatus = String(msp?.billingStatus || "active").trim().toLowerCase();
  const mode = String(msp?.billingStatus || "active").trim().toLowerCase();
  const healthScore = computeMspHealthScore({
    riskOverview,
    stalenessOverview,
    coverageOverview,
    workspaceHealthDistribution,
    billingStatus,
    mode,
  });
  const criticalWorkspaces = workspaceOverview.filter((workspace) => workspace.health === "critical").sort((a, b) => a.riskEvents - b.riskEvents).slice(0, 5).map((workspace) => ({ id: workspace.id, name: workspace.name, health: workspace.health, riskEvents: workspace.riskEvents, coverageScore: coverageOverview.perWorkspace.find((item) => item.workspaceId === workspace.id)?.coverageScore || 0, stalenessScore: stalenessOverview.perWorkspace.find((item) => item.workspaceId === workspace.id)?.stalenessScore || 0 }));
  const staleWorkspaces = stalenessOverview.worstOffenders.map((workspace) => ({ id: workspace.workspaceId, name: workspace.workspaceName, stalenessScore: workspace.stalenessScore, lastScan: workspace.lastScan, lastPassport: workspace.lastPassport, lastTimelineEvent: workspace.lastTimelineEvent }));
  const coverageGaps = coverageOverview.coverageGaps.map((workspace) => ({ id: workspace.workspaceId, name: workspace.workspaceName, coverageScore: workspace.coverageScore, missingPassports: workspace.missingPassports, missingAssets: workspace.missingAssets, missingScans: workspace.missingScans }));
  return {
    mspId,
    healthScore,
    billingStatus,
    mode,
    workspaceHealth: workspaceHealthDistribution,
    risk: riskOverview.riskBySeverity,
    staleness: stalenessOverview.stalenessDistribution,
    coverage: coverageOverview.coverageDistribution,
    topIssues: {
      criticalWorkspaces,
      staleWorkspaces,
      coverageGaps,
    },
    meta: { generatedAt: new Date().toISOString() },
  };
}

export function generateWorkspaceExport({ db, workspace, mspId = workspace?.mspId || null, workspaceOverview = getWorkspaceOverview({ db, mspId, workspaces: [workspace] })[0] }) {
  const coverage = getMspCoverageOverview({ db, mspId, workspaces: [workspace] });
  const staleness = getMspStalenessOverview({ db, mspId, workspaces: [workspace] });
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    assetCount: workspaceOverview.assetCount,
    scanCount: workspaceOverview.scanCount,
    passportCount: workspaceOverview.passportCount,
    nodeCount: workspaceOverview.nodeCount,
    edgeCount: workspaceOverview.edgeCount,
    riskEvents: workspaceOverview.riskEvents,
    timelineEvents: workspaceOverview.timelineEvents,
    coverageScore: coverage.perWorkspace[0]?.coverageScore || 0,
    stalenessScore: staleness.perWorkspace[0]?.stalenessScore || 0,
    health: workspaceOverview.health,
    deltas: {
      assetDelta: 0,
      scanDelta: 0,
      passportDelta: 0,
      riskDelta: 0,
    },
    topIssues: {
      critical: workspaceOverview.health === "critical",
      stale: staleness.perWorkspace[0]?.bucket === "stale",
      coverageGap: coverage.perWorkspace[0]?.coverageScore < 60,
    },
  };
}

export function generateMspExecutiveExport({ db, mspId, msp = getMspById(db, mspId), workspaces = listWorkspacesForMsp(db, mspId) }) {
  const executiveSummary = getMspExecutiveSummary({ db, mspId, msp, workspaces });
  const workspaceExports = workspaces.map((workspace) => generateWorkspaceExport({ db, workspace, mspId, workspaceOverview: getWorkspaceOverview({ db, mspId, workspaces: [workspace] })[0] }));
  return {
    mspId,
    healthScore: executiveSummary.healthScore,
    workspaceHealthDistribution: executiveSummary.workspaceHealth,
    riskOverview: executiveSummary.risk,
    stalenessOverview: executiveSummary.staleness,
    coverageOverview: executiveSummary.coverage,
    billingStatus: executiveSummary.billingStatus,
    topIssues: executiveSummary.topIssues,
    workspaceSummaries: workspaceExports,
    monthOverMonthDeltas: {
      healthScoreDelta: 0,
      riskDelta: 0,
      coverageDelta: 0,
    },
  };
}

export function getMspUsageSummary(db, mspId) {
  const workspaces = listWorkspacesForMsp(db, mspId);
  const perWorkspace = Object.fromEntries(workspaces.map((workspace) => {
    const usage = getWorkspaceUsageSummary(db, workspace.id);
    return [workspace.id, {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      ...usage,
    }];
  }));
  const totals = Object.values(perWorkspace).reduce(
    (summary, item) => {
      summary.assetCount += item.assetCount;
      summary.scanCount += item.scanCount;
      summary.passportCount += item.passportCount;
      summary.nodeCount += item.nodeCount;
      summary.edgeCount += item.edgeCount;
      summary.timelineEvents += item.timelineEvents;
      summary.riskEvents += item.riskEvents;
      return summary;
    },
    { assetCount: 0, scanCount: 0, passportCount: 0, nodeCount: 0, edgeCount: 0, timelineEvents: 0, riskEvents: 0 }
  );
  return {
    mspId,
    totalWorkspaces: workspaces.length,
    totals,
    perWorkspace,
  };
}
