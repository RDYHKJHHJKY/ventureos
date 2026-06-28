import { getNodeMetadata, getNodePassportStatus, getNodeScanStatus } from "./data-store.js";
import { getProjectDependencies, getRiskPropagation, getDriftPropagation, getAbstentionPropagation } from "./trust-graph.js";

const RISK_THRESHOLD = 40;
const DRIFT_THRESHOLD = 0.4;

function evaluateProjectDependencies(graph, nodeId) {
  const dependencyData = getProjectDependencies(graph, nodeId);
  if (!dependencyData) return [];
  return dependencyData.nodes.filter((node) => node.type === "Dependency");
}

function isDependencyUnscanned(db, node) {
  const scanStatus = getNodeScanStatus(db, node.id);
  return !scanStatus.scanned;
}

export function evaluateNodeTrust(graph, nodeId, db) {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) return null;

  const scanStatus = getNodeScanStatus(db, node.id);
  const passportStatus = getNodePassportStatus(db, node.id);
  const metadata = getNodeMetadata(db, node.id) || [];
  const dependencyNodes = evaluateProjectDependencies(graph, node.id);
  const risk = getRiskPropagation(graph, node.id);
  const drift = getDriftPropagation(graph, node.id);
  const abstention = getAbstentionPropagation(graph, node.id);

  const hasMissingMetadata = node.type === "Project" && metadata.length === 0;
  const hasUnscannedDependency = dependencyNodes.some((dependency) => isDependencyUnscanned(db, dependency) || Number(dependency.trust || 0) <= RISK_THRESHOLD);
  const hasHighRiskPropagation = risk?.edges.some((edge) => ["High", "Critical"].includes(edge.riskBand));
  const hasStale = Number(node.drift) > DRIFT_THRESHOLD;
  const hasDependencyDrift = drift?.edges.length > 0;
  const hasAbstention = abstention?.edges.length > 0;

  const trusted = node.type === "Project" ? !hasUnscannedDependency && Number(node.trust || 0) >= 60 : Number(node.trust || 0) >= 60;
  const complete = !hasMissingMetadata;
  const healthy = !hasHighRiskPropagation && !hasStale;
  const dependencyHealthy = !hasDependencyDrift && Number(node.trust || 0) > 0;

  const reasons = [];
  if (hasMissingMetadata) reasons.push("Metadata is incomplete.");
  if (hasUnscannedDependency) reasons.push("A dependency is unscanned or has low trust.");
  if (hasHighRiskPropagation) reasons.push("Risk propagation exceeds acceptable thresholds.");
  if (hasStale) reasons.push("Node is stale.");
  if (hasDependencyDrift) reasons.push("Dependency drift propagation is unresolved.");
  if (hasAbstention) reasons.push("Abstention propagation is present.");
  if (node.type === "Asset" && !scanStatus.scanned) reasons.push("Asset scan is missing.");
  if (node.type === "Asset" && !passportStatus.hasPassport) reasons.push("Asset passport is missing.");

  return {
    nodeId: node.id,
    type: node.type,
    trusted,
    complete,
    healthy,
    dependencyHealthy,
    stale: hasStale,
    reasons,
  };
}

export function evaluateWorkspaceTrust(graph, db, workspaceId) {
  const evaluations = (graph.nodes || []).map((node) => evaluateNodeTrust(graph, node.id, db));
  const staleNodes = evaluations.filter((item) => item?.stale);
  const unhealthyNodes = evaluations.filter((item) => item && !item.healthy);
  const unhappyDependencies = evaluations.filter((item) => item && !item.dependencyHealthy && item.type === "Dependency");
  const workspaceGreen = staleNodes.length === 0 && unhealthyNodes.length === 0;

  return {
    workspace: workspaceId,
    generatedAt: new Date().toISOString(),
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    green: workspaceGreen,
    staleNodeCount: staleNodes.length,
    unhealthyNodeCount: unhealthyNodes.length,
    unhappyDependencyCount: unhappyDependencies.length,
    evaluations,
  };
}

export function evaluateDependencyHealth(graph, nodeId, db) {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const drift = getDriftPropagation(graph, nodeId);
  const dependencyDrift = drift?.edges.length > 0;
  const healthy = !dependencyDrift && Number(node.trust || 0) > 0;
  return {
    nodeId: node.id,
    type: node.type,
    healthy,
    dependencyDrift,
    trust: Number(node.trust || 0),
  };
}

export function evaluatePropagationHealth(graph, nodeId, db) {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const risk = getRiskPropagation(graph, nodeId);
  const drift = getDriftPropagation(graph, nodeId);
  const abstention = getAbstentionPropagation(graph, nodeId);

  const unresolvedRiskPropagation = risk?.edges.some((edge) => ["High", "Critical"].includes(edge.riskBand));
  const unresolvedDriftPropagation = drift?.edges.length > 0;
  const unresolvedAbstentionPropagation = abstention?.edges.length > 0;

  return {
    nodeId: node.id,
    type: node.type,
    unresolvedRiskPropagation,
    unresolvedDriftPropagation,
    unresolvedAbstentionPropagation,
    riskEdges: risk?.edges || [],
    driftEdges: drift?.edges || [],
    abstentionEdges: abstention?.edges || [],
  };
}
