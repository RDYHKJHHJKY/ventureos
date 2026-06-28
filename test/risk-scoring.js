import assert from "node:assert";
import { buildTrustGraph, getNodeRisk, getWorkspaceRiskData } from "../lib/server/trust-graph.js";

function makeDb() {
  const now = new Date();
  const oneDay = 1000 * 60 * 60 * 24;
  const scanOld = new Date(now.getTime() - 120 * oneDay).toISOString();
  const projectScoreDate = new Date(now.getTime() - 10 * oneDay).toISOString();

  return {
    workspaces: [{ id: "workspace_a", name: "Workspace A" }],
    assets: [
      {
        id: "asset_a",
        workspaceId: "workspace_a",
        name: "Asset A",
        type: "Library",
        company: "Acme",
        latestTrustScore: 65,
        latestConfidenceScore: 60,
        packages: ["lodash"],
        lastScannedAt: scanOld,
        createdAt: scanOld,
        updatedAt: scanOld,
      },
    ],
    projects: [
      {
        id: "project_a",
        workspaceId: "workspace_a",
        name: "Project A",
        repoUrl: "https://github.com/acme/a",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
    projectDependencies: [
      {
        projectId: "project_a",
        packageName: "lodash",
        version: "4.17.21",
        ecosystem: "npm",
      },
    ],
    passports: [],
    projectArtifacts: [
      {
        id: "metadata_project_a",
        projectId: "project_a",
        type: "METADATA",
      },
    ],
    projectScores: [
      {
        projectId: "project_a",
        score: 75,
        confidence: 70,
        computedAt: projectScoreDate,
      },
    ],
    scanRuns: [],
    scanFindings: [],
    evidenceItems: [],
    projectMetadata: [],
    projectSignals: [],
    projectEvents: [],
    users: [],
    workspaceMembers: [],
    sessions: [],
  };
}

const db = makeDb();
const graph = buildTrustGraph(db, "workspace_a");

assert.ok(graph.nodes.length > 0, "Workspace graph should build successfully.");
assert.ok(graph.edges.length > 0, "Workspace graph should contain edges.");

const assetRisk = getNodeRisk(graph, "Asset:asset_a", db);
assert.ok(assetRisk, "Asset risk data should be returned.");
assert.strictEqual(assetRisk.nodeId, "Asset:asset_a", "Asset risk response should preserve node ID.");
assert.strictEqual(assetRisk.type, "Asset", "Asset risk response should preserve node type.");
assert.strictEqual(assetRisk.trust, 65, "Asset trust should map from latest trust score.");
assert.ok(assetRisk.expiry > 0, "Asset risk should include expiry penalty for stale scans.");
assert.strictEqual(assetRisk.timeline.scanAgeDays > 90, true, "Asset timeline should reflect stale scan age.");

const projectRisk = getNodeRisk(graph, "Project:project_a", db);
assert.ok(projectRisk, "Project risk data should be returned.");
assert.strictEqual(projectRisk.nodeId, "Project:project_a", "Project risk response should preserve node ID.");
assert.strictEqual(projectRisk.type, "Project", "Project risk response should preserve node type.");
assert.strictEqual(projectRisk.trust, 75, "Project trust should map from latest project score.");
assert.strictEqual(projectRisk.dependencies.length, 1, "Project risk should include one dependency entry.");
assert.strictEqual(projectRisk.propagation, 100, "Project propagation risk should reflect low dependency trust.");

const workspaceRisk = getWorkspaceRiskData(db, "workspace_a");
assert.ok(workspaceRisk, "Workspace risk data should be returned.");
assert.strictEqual(typeof workspaceRisk.riskScore, "number", "Workspace risk score should be numeric.");
assert.strictEqual(typeof workspaceRisk.confidence, "number", "Workspace risk confidence should be numeric.");
assert.strictEqual(workspaceRisk.timeline.eventCount, graph.timelineEvents.length, "Workspace timeline event count should match graph timeline.");
assert.ok(Array.isArray(workspaceRisk.dependencies), "Workspace risk data should include dependencies.");
assert.ok(Array.isArray(workspaceRisk.dependents), "Workspace risk data should include dependents.");

console.log("All risk scoring integration tests passed.");
