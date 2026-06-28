import assert from "node:assert";
import { computeWorkspaceCoverage, computeNodeCoverage } from "../lib/server/coverage.js";
import { checkCycles, checkOrphans, checkDuplicateEdges, checkInvalidNodes, checkCrossWorkspaceLeaks } from "../lib/server/integrity.js";
import { evaluateNodeTrust, evaluateDependencyHealth, evaluatePropagationHealth, evaluateWorkspaceTrust } from "../lib/server/enforcement.js";
import { buildTrustGraph } from "../lib/server/trust-graph.js";

function makeDb() {
  const now = Date.now();
  const staleDate = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
  return {
    workspaces: [
      { id: "workspace_a", name: "Workspace A" },
      { id: "workspace_b", name: "Workspace B" },
    ],
    assets: [
      {
        id: "asset_a",
        workspaceId: "workspace_a",
        name: "Asset A",
        latestTrustScore: 90,
        latestConfidenceScore: 90,
        packages: ["lodash"],
        lastScannedAt: staleDate,
        createdAt: staleDate,
        updatedAt: staleDate,
      },
    ],
    projects: [
      {
        id: "project_a",
        workspaceId: "workspace_a",
        name: "Project A",
        repoUrl: "https://github.com/example/a",
      },
      {
        id: "project_b",
        workspaceId: "workspace_b",
        name: "Project B",
      },
    ],
    passports: [
      {
        id: "passport_asset_a",
        assetId: "asset_a",
        assetName: "Asset A",
        company: "Acme",
        version: 1,
        trustScore: 90,
        confidenceScore: 90,
        isPublic: true,
        workspaceId: "workspace_a",
      },
    ],
    scanRuns: [
      {
        id: "scan_asset_a_1",
        assetId: "asset_a",
        workspaceId: "workspace_a",
      },
    ],
    projectArtifacts: [
      {
        id: "metadata_project_a",
        projectId: "project_a",
        type: "METADATA",
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
    projectScores: [
      {
        projectId: "project_a",
        score: 70,
        confidence: 80,
        computedAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    projectEvents: [],
    projectMetadata: [],
    projectSignals: [],
    evidenceItems: [],
    scanFindings: [],
    users: [],
    workspaceMembers: [],
    sessions: [],
  };
}

function runCoverageTests() {
  const db = makeDb();
  const graph = buildTrustGraph(db, "workspace_a");
  const coverage = computeWorkspaceCoverage(graph, db, "workspace_a");

  assert.strictEqual(coverage.workspace, "workspace_a");
  assert.strictEqual(coverage.nodeCount > 0, true, "Workspace graph should contain nodes.");
  assert.strictEqual(typeof coverage.metrics.scanCoverage, "number", "Scan coverage should be a numeric percentage.");
  assert.strictEqual(typeof coverage.metrics.passportCoverage, "number", "Passport coverage should be a numeric percentage.");
  assert.strictEqual(typeof coverage.metrics.metadataCompletenessCoverage, "number", "Metadata completeness should be a numeric percentage.");
  assert.strictEqual(coverage.metrics.staleNodeCoverage > 0, true, "Stale nodes should be counted.");

  const nodeCoverage = coverage.nodeCoverage.find((item) => item.nodeId === "Asset:asset_a");
  assert.ok(nodeCoverage, "Coverage should include Asset:asset_a.");
  assert.strictEqual(nodeCoverage.hasScan, true, "Asset should be marked scanned.");
  assert.strictEqual(nodeCoverage.hasPassport, true, "Asset should be marked with a passport.");
  assert.strictEqual(nodeCoverage.stale, true, "Asset should be marked stale from the old timestamp.");

  const projectCoverage = coverage.nodeCoverage.find((item) => item.nodeId === "Project:project_a");
  assert.ok(projectCoverage, "Coverage should include Project:project_a.");
  assert.strictEqual(projectCoverage.metadataComplete, true, "Project metadata completeness should be true when metadata exists.");
  assert.strictEqual(projectCoverage.dependenciesResolved, true, "Project dependencies should be resolved when dependency nodes exist.");
}

function runIntegrityTests() {
  const simpleGraph = {
    nodes: [
      { id: "Project:one", type: "Project", label: "One" },
      { id: "Project:two", type: "Project", label: "Two" },
    ],
    edges: [
      { id: "e1", source: "Project:one", target: "Project:two", type: "depends_on" },
      { id: "e2", source: "Project:two", target: "Project:one", type: "depends_on" },
    ],
  };

  const cycles = checkCycles(simpleGraph);
  assert.strictEqual(cycles.ok, false, "Graph with a cycle should fail cycle check.");
  assert.strictEqual(cycles.violations.length, 1, "One cycle violation should be reported.");

  const orphanGraph = { nodes: [{ id: "Asset:orphan", type: "Asset", label: "Orphan" }], edges: [] };
  const orphans = checkOrphans(orphanGraph);
  assert.strictEqual(orphans.ok, false, "Graph with orphan nodes should fail orphans check.");
  assert.strictEqual(orphans.orphans.length, 1, "One orphan should be detected.");

  const duplicateGraph = {
    nodes: [{ id: "Dependency:dep", type: "Dependency", label: "dep" }],
    edges: [
      { id: "e1", source: "Dependency:dep", target: "Dependency:dep", type: "depends_on" },
      { id: "e2", source: "Dependency:dep", target: "Dependency:dep", type: "depends_on" },
    ],
  };
  const duplicates = checkDuplicateEdges(duplicateGraph);
  assert.strictEqual(duplicates.ok, false, "Duplicate edges should fail duplicate edge check.");
  assert.strictEqual(duplicates.duplicates.length, 1, "One duplicate edge should be identified.");

  const invalidGraph = {
    nodes: [{ id: "Alien:123", type: "Alien", label: "Alien" }],
    edges: [],
  };
  const invalidNodes = checkInvalidNodes(invalidGraph);
  assert.strictEqual(invalidNodes.ok, false, "Invalid node types should be reported.");
  assert.strictEqual(invalidNodes.invalidNodes.length, 1, "One invalid node should be detected.");

  const crossWorkspaceGraph = {
    nodes: [
      { id: "Workspace:workspace_a", type: "Workspace", label: "Workspace A" },
      { id: "Workspace:workspace_b", type: "Workspace", label: "Workspace B" },
    ],
    edges: [
      { id: "w1", source: "Asset:asset_a", target: "Workspace:workspace_b", type: "owned_by" },
    ],
  };
  const leaks = checkCrossWorkspaceLeaks(crossWorkspaceGraph, "workspace_a");
  assert.strictEqual(leaks.ok, false, "Cross-workspace leaks should be reported.");
  assert.strictEqual(leaks.leakedWorkspaces.length, 1, "One leaked workspace node should be found.");
}

function runEnforcementTests() {
  const db = makeDb();
  const graph = buildTrustGraph(db, "workspace_a");
  const evaluation = evaluateNodeTrust(graph, "Project:project_a", db);
  assert.ok(evaluation, "Project evaluation should return a result.");
  assert.strictEqual(evaluation.trusted, false, "Project should not be trusted when its dependency is unscanned or low trust.");
  assert.strictEqual(evaluation.complete, true, "Project should be complete when metadata is present.");

  const assetEval = evaluateNodeTrust(graph, "Asset:asset_a", db);
  assert.ok(assetEval, "Asset evaluation should return a result.");
  assert.strictEqual(assetEval.trusted, true, "Asset should be trusted when scanned and passported.");

  const dependencyHealth = evaluateDependencyHealth(graph, "Dependency:lodash_4_17_21", db);
  assert.ok(dependencyHealth, "Dependency health should return a result.");
  assert.strictEqual(dependencyHealth.healthy, false, "Dependency should be unhealthy when its trust is zero and drift may exist.");

  const propagationHealth = evaluatePropagationHealth(graph, "Project:project_a", db);
  assert.ok(propagationHealth, "Propagation health should return a result.");
  assert.strictEqual(typeof propagationHealth.unresolvedRiskPropagation, "boolean", "Propagation health should include risk propagation state.");

  const workspaceTrust = evaluateWorkspaceTrust(graph, db, "workspace_a");
  assert.ok(workspaceTrust, "Workspace trust evaluation should return a result.");
  assert.strictEqual(workspaceTrust.green, false, "Workspace should not be green when stale nodes exist.");
}

runCoverageTests();
runIntegrityTests();
runEnforcementTests();
console.log("All graph coverage and enforcement tests passed.");
