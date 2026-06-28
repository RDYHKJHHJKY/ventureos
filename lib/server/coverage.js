import { getNodeMetadata, getNodePassportStatus, getNodeScanStatus } from "./data-store.js";
import { getProjectDependencies, getRiskPropagation, getDriftPropagation, getAbstentionPropagation, getWorkspaceEdges } from "./trust-graph.js";

const RISK_THRESHOLD = 40;
const DRIFT_THRESHOLD = 0.4;

function getOutgoingEdges(graph, nodeId, edgeType) {
  return graph.edges.filter((edge) => edge.source === nodeId && (!edgeType || edge.type === edgeType));
}

export function computeNodeCoverage(node, graph, db) {
  const scanStatus = getNodeScanStatus(db, node.id);
  const passportStatus = getNodePassportStatus(db, node.id);
  const metadata = getNodeMetadata(db, node.id) || [];
  const dependencies = getOutgoingEdges(graph, node.id, "depends_on");
  const dependencyTargets = dependencies.map((edge) => graph.nodes.find((target) => target.id === edge.target));
  const hasResolvedDependencies = dependencies.length > 0 && dependencyTargets.every((target) => target && target.type === "Dependency");
  const metadataComplete = node.type === "Project" ? metadata.length > 0 : true;
  const stale = Number(node.drift) > DRIFT_THRESHOLD;
  const unresolvedRiskPropagation = dependencies.some((edge) => {
    const target = graph.nodes.find((item) => item.id === edge.target);
    return !target || Number(target.trust || 0) <= RISK_THRESHOLD;
  });
  const unresolvedDriftPropagation = graph.edges.some((edge) => edge.source === node.id && edge.type === "drifted_by");
  const abstentionPropagation = graph.edges.some((edge) => edge.source === node.id && edge.type === "abstains_from");

  return {
    nodeId: node.id,
    type: node.type,
    hasPassport: Boolean(passportStatus?.hasPassport),
    hasScan: Boolean(scanStatus?.scanned),
    dependenciesResolved: node.type === "Project" || node.type === "Asset" ? hasResolvedDependencies : true,
    metadataComplete,
    stale,
    unresolvedRiskPropagation,
    unresolvedDriftPropagation,
    abstentionPropagation,
  };
}

function percent(count, total) {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

export function computeCoverage(graph, db, workspaceId) {
  const nodes = graph.nodes || [];
  const nodeCoverage = nodes.map((node) => computeNodeCoverage(node, graph, db));
  const totals = {
    nodesWithPassport: nodeCoverage.filter((item) => item.hasPassport).length,
    nodesWithScans: nodeCoverage.filter((item) => item.hasScan).length,
    nodesWithDependenciesResolved: nodeCoverage.filter((item) => item.dependenciesResolved).length,
    nodesWithMetadataCompleteness: nodeCoverage.filter((item) => item.metadataComplete).length,
    nodesWithStaleTimestamps: nodeCoverage.filter((item) => item.stale).length,
    nodesWithUnresolvedRiskPropagation: nodeCoverage.filter((item) => item.unresolvedRiskPropagation).length,
    nodesWithUnresolvedDriftPropagation: nodeCoverage.filter((item) => item.unresolvedDriftPropagation).length,
    nodesWithAbstentionPropagation: nodeCoverage.filter((item) => item.abstentionPropagation).length,
  };

  return {
    workspace: workspaceId,
    generatedAt: new Date().toISOString(),
    nodeCount: nodes.length,
    edgeCount: getWorkspaceEdges ? getWorkspaceEdges(db, workspaceId).length : (graph.edges || []).length,
    metrics: {
      passportCoverage: percent(totals.nodesWithPassport, nodes.length),
      scanCoverage: percent(totals.nodesWithScans, nodes.length),
      dependenciesResolvedCoverage: percent(totals.nodesWithDependenciesResolved, nodes.length),
      metadataCompletenessCoverage: percent(totals.nodesWithMetadataCompleteness, nodes.length),
      staleNodeCoverage: percent(totals.nodesWithStaleTimestamps, nodes.length),
      unresolvedRiskPropagationCoverage: percent(totals.nodesWithUnresolvedRiskPropagation, nodes.length),
      unresolvedDriftPropagationCoverage: percent(totals.nodesWithUnresolvedDriftPropagation, nodes.length),
      abstentionPropagationCoverage: percent(totals.nodesWithAbstentionPropagation, nodes.length),
    },
    nodeCoverage,
  };
}

export function computeWorkspaceCoverage(graph, db, workspaceId) {
  const coverage = computeCoverage(graph, db, workspaceId);
  return {
    workspace: workspaceId,
    generatedAt: coverage.generatedAt,
    nodeCount: coverage.nodeCount,
    edgeCount: coverage.edgeCount,
    metrics: coverage.metrics,
    nodeCoverage: coverage.nodeCoverage,
  };
}
