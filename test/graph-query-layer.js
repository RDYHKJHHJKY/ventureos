import assert from "node:assert";
import { createId } from "../lib/server/data-store.js";
import {
  buildTrustGraph,
  getNode,
  getNeighbors,
  getProjectDependencies,
  getProjectDependents,
  getRiskPropagation,
  getDriftPropagation,
  getAbstentionPropagation,
  searchGraph,
} from "../lib/server/trust-graph.js";

function makeWorkspaceDb() {
  const workspaceA = { id: "workspace_a", name: "Workspace A" };
  const workspaceB = { id: "workspace_b", name: "Workspace B" };
  const projectA = { id: "project_a", workspaceId: workspaceA.id, name: "Project A", repoUrl: "https://github.com/acme/a" };
  const projectB = { id: "project_b", workspaceId: workspaceB.id, name: "Project B", repoUrl: "https://github.com/acme/b" };
  const assetA = { id: "asset_a", workspaceId: workspaceA.id, name: "Asset A", type: "Library", company: "Acme", latestTrustScore: 90, latestConfidenceScore: 92, packages: ["lodash"], risk: "Low", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const assetB = { id: "asset_b", workspaceId: workspaceB.id, name: "Asset B", type: "Library", company: "Acme", latestTrustScore: 55, latestConfidenceScore: 60, packages: ["express"], risk: "Medium", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const dependencyA = { id: "project_a:lodash@4.17.21", projectId: projectA.id, packageName: "lodash", version: "4.17.21", ecosystem: "npm", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  return {
    workspaces: [workspaceA, workspaceB],
    projects: [projectA, projectB],
    assets: [assetA, assetB],
    projectDependencies: [dependencyA],
    projectArtifacts: [],
    passports: [],
    scanRuns: [],
    scanFindings: [],
    evidenceItems: [],
    projectMetadata: [],
    projectSignals: [],
    projectScores: [],
    projectEvents: [],
  };
}

const db = makeWorkspaceDb();
const workspaceAGraph = buildTrustGraph(db, "workspace_a");
const workspaceBGraph = buildTrustGraph(db, "workspace_b");

// Workspace-scoped graph traversal
assert.strictEqual(workspaceAGraph.nodes.some((node) => node.id === "Workspace:workspace_a"), true, "Workspace A must be included in graph A");
assert.strictEqual(workspaceAGraph.nodes.some((node) => node.id === "Workspace:workspace_b"), false, "Workspace B must not be included in graph A");
assert.strictEqual(workspaceAGraph.nodes.some((node) => node.id === "Project:project_a"), true, "Project A must exist in graph A");
assert.strictEqual(workspaceAGraph.nodes.some((node) => node.id === "Asset:asset_a"), true, "Asset A must exist in graph A");
assert.strictEqual(getNode(workspaceAGraph, "Project:project_b"), null, "Graph query must reject nodes outside the workspace");

// Dependency chain correctness
const projectDependencies = getProjectDependencies(workspaceAGraph, "Project:project_a");
assert.ok(projectDependencies, "Project dependencies response should exist");
assert.strictEqual(projectDependencies.edges.length, 1, "Project A should have one dependency edge");
assert.strictEqual(projectDependencies.nodes.length, 2, "Project dependencies response should include project and dependency node");
assert.strictEqual(projectDependencies.edges[0].source, "Project:project_a", "Dependency edge should originate from the project");
assert.strictEqual(projectDependencies.edges[0].type, "depends_on", "Dependency edge should use depends_on relationship");

// Dependents correctness
const dependentGraph = {
  nodes: [
    { id: "Project:project_a", type: "Project", label: "Project A", trust: 70, confidence: 85, evidenceCompleteness: 90 },
    { id: "Project:project_b", type: "Project", label: "Project B", trust: 65, confidence: 80, evidenceCompleteness: 85 },
  ],
  edges: [
    { id: "Project:project_b:depends_on:Project:project_a", source: "Project:project_b", target: "Project:project_a", type: "depends_on", evidence: true },
  ],
};
const projectDependents = getProjectDependents(dependentGraph, "Project:project_a");
assert.ok(projectDependents, "Project dependents response should exist");
assert.strictEqual(projectDependents.edges.length, 1, "Project A should have one dependent edge");
assert.strictEqual(projectDependents.nodes.length, 2, "Project dependents response should include project and dependent node");
assert.strictEqual(projectDependents.edges[0].target, "Project:project_a", "Dependent edge should target the project");

// Risk propagation correctness
const riskGraph = {
  nodes: [
    { id: "Project:project_a", type: "Project", label: "Project A", trust: 80, confidence: 80, evidenceCompleteness: 100 },
    { id: "Dependency:lodash@4.17.21", type: "Dependency", label: "lodash@4.17.21", trust: 20, confidence: 20, evidenceCompleteness: 100 },
  ],
  edges: [
    { id: "Project:project_a:depends_on:Dependency:lodash@4.17.21", source: "Project:project_a", target: "Dependency:lodash@4.17.21", type: "depends_on", evidence: true },
  ],
};
const riskPropagation = getRiskPropagation(riskGraph, "Project:project_a");
assert.ok(riskPropagation, "Risk propagation response should exist");
assert.strictEqual(riskPropagation.edges[0].riskScore, 20, "Risk propagation should include target trust score");
assert.strictEqual(riskPropagation.edges[0].riskBand, "Critical", "Risk propagation should compute risk band from dependency trust score");
assert.strictEqual(riskPropagation.metadata.propagationType, "risk", "Metadata should indicate risk propagation type");

// Drift propagation correctness
const driftGraph = {
  nodes: [
    { id: "Project:project_a", type: "Project", label: "Project A", trust: 70, confidence: 75, evidenceCompleteness: 90 },
    { id: "EvidenceArtifact:project_a:drift", type: "EvidenceArtifact", label: "Drift marker", trust: 0, confidence: 0, evidenceCompleteness: 0, drift: 0.8 },
  ],
  edges: [
    { id: "Project:project_a:drifted_by:EvidenceArtifact:project_a:drift", source: "Project:project_a", target: "EvidenceArtifact:project_a:drift", type: "drifted_by", evidence: true },
  ],
};
const driftPropagation = getDriftPropagation(driftGraph, "Project:project_a");
assert.ok(driftPropagation, "Drift propagation response should exist");
assert.strictEqual(driftPropagation.edges.length, 1, "Drift propagation should include drift edge");
assert.strictEqual(driftPropagation.metadata.propagationType, "drift", "Metadata should indicate drift propagation type");
const driftNode = driftPropagation.nodes.find((node) => node.id === "EvidenceArtifact:project_a:drift");
assert.ok(driftNode, "Drift propagation should include the evidence artifact node");
assert.strictEqual(driftNode.drift, 0.8, "Drift node should preserve drift indicator");

// Abstention propagation correctness
const abstentionGraph = {
  nodes: [
    { id: "Project:project_a", type: "Project", label: "Project A", trust: 70, confidence: 80, evidenceCompleteness: 85 },
    { id: "EvidenceMarker:project_a:missing-dependency", type: "EvidenceMarker", label: "Missing dependency evidence", trust: 0, confidence: 0, evidenceCompleteness: 0, abstention: true },
  ],
  edges: [
    { id: "Project:project_a:abstains_from:EvidenceMarker:project_a:missing-dependency", source: "Project:project_a", target: "EvidenceMarker:project_a:missing-dependency", type: "abstains_from", evidence: false },
  ],
};
const abstentionPropagation = getAbstentionPropagation(abstentionGraph, "Project:project_a");
assert.ok(abstentionPropagation, "Abstention propagation response should exist");
assert.strictEqual(abstentionPropagation.edges.length, 1, "Abstention propagation should include abstention edge");
assert.strictEqual(abstentionPropagation.metadata.propagationType, "abstention", "Metadata should indicate abstention propagation type");
const abstentionNode = abstentionPropagation.nodes.find((node) => node.id === "EvidenceMarker:project_a:missing-dependency");
assert.ok(abstentionNode, "Abstention propagation should include the evidence marker node");
assert.strictEqual(abstentionNode.abstention, true, "Abstention node should preserve abstention flag");

// Search correctness
const searchResult = searchGraph(workspaceAGraph, "project a");
assert.ok(searchResult, "Search response should exist");
assert.ok(searchResult.nodes.some((node) => node.id === "Project:project_a"), "Search should find project nodes by label");
assert.strictEqual(searchResult.metadata.query, "project a", "Search metadata should echo the raw query");

console.log("All graph query layer tests passed.");
