function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateDemoWorkspace(seed = {}) {
  const id = `demo-ws-${Math.random().toString(36).slice(2, 9)}`;
  const assetCount = seed.assetCount ?? randInt(5, 120);
  const scanCount = seed.scanCount ?? randInt(1, assetCount);
  const passportCount = seed.passportCount ?? randInt(0, assetCount);
  const nodeCount = seed.nodeCount ?? randInt(10, 500);
  const edgeCount = seed.edgeCount ?? randInt(10, 1200);
  const riskEvents = seed.riskEvents ?? randInt(0, 8);
  const timelineEvents = seed.timelineEvents ?? randInt(0, 30);
  const coverageScore = seed.coverageScore ?? randInt(30, 95);
  const stalenessScore = seed.stalenessScore ?? randInt(10, 95);
  const health = seed.health ?? (riskEvents > 0 || passportCount === 0 ? "critical" : stalenessScore < 40 ? "warning" : "healthy");
  const name = seed.name || `Demo Client ${id.slice(-4)}`;
  const now = new Date().toISOString();
  return {
    id,
    name,
    assetCount,
    scanCount,
    passportCount,
    nodeCount,
    edgeCount,
    riskEvents,
    timelineEvents,
    coverageScore,
    stalenessScore,
    health,
    lastScan: new Date(Date.now() - randInt(1, 90) * 24 * 60 * 60 * 1000).toISOString(),
    lastPassport: new Date(Date.now() - randInt(1, 120) * 24 * 60 * 60 * 1000).toISOString(),
    lastTimelineEvent: new Date(Date.now() - randInt(0, 60) * 24 * 60 * 60 * 1000).toISOString(),
    generatedAt: now,
  };
}

export function generateDemoMsp({ workspaceCount = null, name = "Demo MSP", seed = {} } = {}) {
  const count = workspaceCount ?? randInt(3, 8);
  const workspaces = [];
  for (let i = 0; i < count; i++) workspaces.push(generateDemoWorkspace(seed));
  const billingStatuses = ["active", "pending", "past_due", "canceled", "trialing"];
  const billingStatus = billingStatuses[randInt(0, billingStatuses.length - 1)];
  const modes = ["active", "past_due", "trialing", "canceled"];
  const mode = modes[randInt(0, modes.length - 1)];
  const riskTotals = workspaces.reduce((s, w) => ({ total: s.total + w.riskEvents, high: s.high + (w.riskEvents > 0 ? 1 : 0) }), { total: 0, high: 0 });
  const coverageAvg = Math.round(workspaces.reduce((sum, w) => sum + w.coverageScore, 0) / workspaces.length);
  const stalenessAvg = Math.round(workspaces.reduce((sum, w) => sum + w.stalenessScore, 0) / workspaces.length);
  const healthScore = Math.max(0, Math.min(100, Math.round(80 - riskTotals.total * 5 - (100 - coverageAvg) * 0.2 - (100 - stalenessAvg) * 0.1)));
  const topIssues = {
    criticalWorkspaces: workspaces.filter((w) => w.health === "critical").slice(0, 5),
    staleWorkspaces: workspaces.filter((w) => w.stalenessScore < 50).slice(0, 5),
    coverageGaps: workspaces.filter((w) => w.coverageScore < 60).slice(0, 5),
  };
  return {
    id: `demo-msp-${Math.random().toString(36).slice(2, 8)}`,
    name,
    billingStatus,
    mode,
    workspaces,
    healthScore,
    intelligence: {
      risk: { totalRiskEvents: riskTotals.total, high: riskTotals.high },
      staleness: { average: stalenessAvg },
      coverage: { average: coverageAvg },
    },
    topIssues,
    generatedAt: new Date().toISOString(),
  };
}

export function generateDemoIntelligence({ msp }) {
  if (!msp) return { ok: false };
  return {
    ok: true,
    mspId: msp.id,
    risk: {
      totalRiskEvents: msp.intelligence.risk.totalRiskEvents,
      riskBySeverity: { high: msp.intelligence.risk.high, medium: 0, low: 0 },
      riskByWorkspace: msp.workspaces.map((w) => ({ workspaceId: w.id, workspaceName: w.name, riskEvents: w.riskEvents, severity: w.health === "critical" ? "high" : "low" })),
    },
    staleness: {
      numberOfStaleWorkspaces: msp.workspaces.filter((w) => w.stalenessScore < 50).length,
      averageStaleness: Math.round(msp.workspaces.reduce((s, w) => s + w.stalenessScore, 0) / msp.workspaces.length),
      worstOffenders: msp.workspaces.slice(0, 5),
    },
    coverage: {
      averageCoverage: Math.round(msp.workspaces.reduce((s, w) => s + w.coverageScore, 0) / msp.workspaces.length),
      coverageDistribution: { good: msp.workspaces.filter((w) => w.coverageScore >= 80).length, partial: msp.workspaces.filter((w) => w.coverageScore >= 60 && w.coverageScore < 80).length, poor: msp.workspaces.filter((w) => w.coverageScore < 60).length },
    },
    meta: { generatedAt: new Date().toISOString() },
  };
}

export function generateDemoExport({ msp }) {
  if (!msp) return { ok: false };
  return {
    ok: true,
    mspId: msp.id,
    executive: {
      healthScore: msp.healthScore,
      workspaceHealthDistribution: { healthy: msp.workspaces.filter((w) => w.health === "healthy").length, warning: msp.workspaces.filter((w) => w.health === "warning").length, critical: msp.workspaces.filter((w) => w.health === "critical").length },
      riskOverview: msp.intelligence.risk,
      stalenessOverview: { distribution: { fresh: msp.workspaces.filter((w) => w.stalenessScore >= 80).length, aging: msp.workspaces.filter((w) => w.stalenessScore >= 50 && w.stalenessScore < 80).length, stale: msp.workspaces.filter((w) => w.stalenessScore < 50).length } },
      coverageOverview: { distribution: { good: msp.workspaces.filter((w) => w.coverageScore >= 80).length, partial: msp.workspaces.filter((w) => w.coverageScore >= 60 && w.coverageScore < 80).length, poor: msp.workspaces.filter((w) => w.coverageScore < 60).length } },
      billingStatus: msp.billingStatus,
      topIssues: msp.topIssues,
    },
    workspaces: msp.workspaces,
    meta: { generatedAt: new Date().toISOString() },
  };
}

export default { generateDemoWorkspace, generateDemoMsp, generateDemoIntelligence, generateDemoExport };
