import {
  riskForScore,
  applyTimelineDecay,
  applyExpiryPenalties,
  computeDependencyRisk,
  computePropagationRisk,
  computeNodeRiskScore,
  computeNodeConfidence,
  computeWorkspaceRiskScore,
  computeWorkspaceConfidence,
} from "./scoring.js";

const NODE_TYPES = [
  { type: "Asset", description: "A software asset scanned by VentureOS." },
  { type: "Project", description: "A project under evaluation with artifacts, dependencies, and metadata." },
  { type: "Vendor", description: "The owning or supplying organization behind an asset." },
  { type: "Dependency", description: "A discovered dependency extracted from SBOMs or package lists." },
  { type: "Passport", description: "An issued trust passport for an asset." },
  { type: "Workspace", description: "A VentureOS workspace boundary for access and ownership." },
  { type: "EvidenceMarker", description: "A synthesized marker for missing evidence or abstention." },
  { type: "EvidenceArtifact", description: "A computed artifact node representing supporting evidence or stale drift." },
];

const EDGE_TYPES = [
  { type: "owned_by", description: "Ownership relationship from asset/project to workspace." },
  { type: "supplied_by", description: "Relationship from asset to vendor." },
  { type: "depends_on", description: "Dependency relationship from project/asset to dependency." },
  { type: "passported_by", description: "Passport issued for an asset." },
  { type: "supported_by", description: "Evidence support relationship from artifact to a node." },
  { type: "drifted_by", description: "Drift relationship from node to stale evidence." },
  { type: "abstains_from", description: "Explicit abstention relationship when evidence is missing." },
];

export const VALID_NODE_TYPES = NODE_TYPES.map((item) => item.type);

function normalizeId(type, id) {
  const value = String(id || "").trim();
  return `${type}:${value.replace(/[^A-Za-z0-9_\-]/g, "_")}`;
}

function createNode(nodes, index, type, id, label, props = {}) {
  const nodeId = normalizeId(type, id);
  if (index.has(nodeId)) return index.get(nodeId);
  const node = {
    id: nodeId,
    type,
    label: String(label || id || "").trim(),
    ...props,
  };
  nodes.push(node);
  index.set(nodeId, node);
  return node;
}

function createEdge(edges, source, target, relationship, props = {}) {
  const edgeId = `${source.id}:${relationship}:${target.id}`;
  const edge = {
    id: edgeId,
    source: source.id,
    target: target.id,
    type: relationship,
    ...props,
  };
  edges.push(edge);
  return edge;
}

function computeEvidenceCompletenessForAsset(db, asset) {
  const hasScan = db.scanRuns.some((scan) => scan.assetId === asset.id);
  const hasPassport = db.passports.some((passport) => passport.assetId === asset.id && passport.isPublic);
  const hasDependencies = Array.isArray(asset.packages) && asset.packages.length > 0;
  const evidenceCount = Number(hasScan) + Number(hasPassport) + Number(hasDependencies);
  return evidenceCount / 3;
}

function computeEvidenceCompletenessForProject(db, project) {
  const hasSbom = db.projectArtifacts.some((item) => item.projectId === project.id && item.type === "SBOM");
  const hasPackageList = db.projectArtifacts.some((item) => item.projectId === project.id && item.type === "PACKAGE_LIST");
  const hasMetadata = db.projectArtifacts.some((item) => item.projectId === project.id && item.type === "METADATA");
  const hasRepoUrl = Boolean(project.repoUrl);
  const evidenceCount = Number(hasSbom) + Number(hasPackageList) + Number(hasMetadata) + Number(hasRepoUrl);
  return evidenceCount / 4;
}

function computeDrift(timestamp) {
  if (!timestamp) return 1;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 0;
  if (ageDays <= 30) return Number(((ageDays - 7) / 23).toFixed(2));
  return 1;
}

function buildGraphSummary(nodes, edges) {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const trustValues = nodes.map((node) => Math.max(0, Number(node.trust) || 0));
  const evidenceValues = nodes.map((node) => Number(node.evidenceCompleteness) || 0);
  const averageTrust = nodeCount ? trustValues.reduce((sum, value) => sum + value, 0) / nodeCount : 0;
  const averageCompleteness = nodeCount ? evidenceValues.reduce((sum, value) => sum + value, 0) / nodeCount : 0;
  const evidenceSupport = edgeCount ? edges.filter((edge) => edge.evidence === true).length / edgeCount : 0;
  const score = Math.round((averageTrust * 0.55) + (evidenceSupport * 100 * 0.25) + (averageCompleteness * 100 * 0.2));
  const confidence = Math.round(averageCompleteness * 100);
  return {
    nodeCount,
    edgeCount,
    score,
    confidence,
    averageTrust: Math.round(averageTrust),
    averageEvidenceSupport: Math.round(evidenceSupport * 100),
    averageEvidenceCompleteness: Math.round(averageCompleteness * 100),
  };
}

function buildGraphNarrative(summary, driftCount, abstentionCount) {
  const lines = [];
  lines.push(`The VentureOS Trust Graph currently maps ${summary.nodeCount} nodes and ${summary.edgeCount} edges.`);
  lines.push(`Graph trust score is ${summary.score}/100 with ${summary.confidence}% evidence confidence.`);
  if (driftCount > 0) {
    lines.push(`${driftCount} nodes are flagged for drift because their latest evidence is stale.`);
  }
  if (abstentionCount > 0) {
    lines.push(`${abstentionCount} explicit abstentions exist where evidence is missing and relationships cannot be proven.`);
  } else {
    lines.push("All graph relationships are evidence-backed and no abstentions were required.");
  }
  lines.push("Trust propagation is only applied where direct evidence exists, and unproven relationships are excluded.");
  return lines.join(" ");
}

function resolveNodeId(graph, rawId) {
  const normalized = String(rawId || "").trim();
  if (!normalized) return null;
  const exact = graph.nodes.find((node) => node.id === normalized);
  if (exact) return exact.id;
  const lower = normalized.toLowerCase();
  const matches = graph.nodes.filter(
    (node) =>
      node.id.toLowerCase() === lower ||
      node.label.toLowerCase() === lower ||
      node.id.toLowerCase().endsWith(`:${lower}`)
  );
  return matches.length === 1 ? matches[0].id : null;
}

function findNode(graph, rawId) {
  const nodeId = resolveNodeId(graph, rawId);
  if (!nodeId) return null;
  return graph.nodes.find((node) => node.id === nodeId) || null;
}

function getEdgesForNode(graph, node, direction = "both") {
  return graph.edges.filter((edge) => {
    if (direction === "outgoing") return edge.source === node.id;
    if (direction === "incoming") return edge.target === node.id;
    return edge.source === node.id || edge.target === node.id;
  });
}

function getNeighborNodeIds(graph, node) {
  const edges = getEdgesForNode(graph, node, "both");
  const ids = new Set();
  for (const edge of edges) {
    if (edge.source !== node.id) ids.add(edge.source);
    if (edge.target !== node.id) ids.add(edge.target);
  }
  return ids;
}

function getDependencyEdges(graph, node) {
  return graph.edges.filter((edge) => edge.source === node.id && edge.type === "depends_on");
}

function getDependentEdges(graph, node) {
  return graph.edges.filter((edge) => edge.target === node.id && edge.type === "depends_on");
}

function getDependencyNodes(graph, node) {
  const edges = getDependencyEdges(graph, node);
  return edges.map((edge) => graph.nodes.find((item) => item.id === edge.target)).filter(Boolean);
}

function getDependentNodes(graph, node) {
  const edges = getDependentEdges(graph, node);
  return edges.map((edge) => graph.nodes.find((item) => item.id === edge.source)).filter(Boolean);
}

function parseNodeAge(db, node) {
  if (node.type === "Asset") {
    const assetId = String(node.id).replace(/^Asset:/, "");
    const asset = (db.assets || []).find((item) => item.id === assetId);
    return asset ? asset.lastScannedAt || asset.updatedAt || asset.createdAt : null;
  }
  if (node.type === "Project") {
    const projectId = String(node.id).replace(/^Project:/, "");
    const project = (db.projects || []).find((item) => item.id === projectId);
    if (!project) return null;
    const latestScore = (db.projectScores || [])
      .filter((item) => item.projectId === projectId)
      .sort((a, b) => String(b.computedAt || "").localeCompare(String(a.computedAt || "")))[0] || null;
    return latestScore?.computedAt || project.updatedAt || project.createdAt;
  }
  return null;
}

function getPassportInfo(db, node) {
  if (node.type !== "Asset") return { expiresInDays: null, revoked: false, passportId: null };
  const assetId = String(node.id).replace(/^Asset:/, "");
  const passport = (db.passports || []).find((item) => item.assetId === assetId && item.isPublic);
  if (!passport) return { expiresInDays: null, revoked: false, passportId: null };
  const expiresAt = parseDate(passport.expiresAt);
  const daysRemaining = expiresAt ? (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24) : null;
  return { expiresInDays: daysRemaining, revoked: passport.revoked === true, passportId: passport.id };
}

function hasMissingMetadata(db, node) {
  if (node.type !== "Project") return false;
  const projectId = String(node.id).replace(/^Project:/, "");
  return !(db.projectArtifacts || []).some((item) => item.projectId === projectId && item.type === "METADATA");
}

function sortQueryResult({ nodes, edges, metadata }) {
  return {
    nodes: nodes.slice().sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.slice().sort((a, b) => a.id.localeCompare(b.id)),
    metadata,
  };
}

function buildQueryMetadata(nodes, edges, contextNode) {
  const evidenceCompleteness = nodes.length
    ? Math.round(
        (nodes.reduce((sum, node) => sum + (Number(node.evidenceCompleteness) || 0), 0) / nodes.length) * 100
      )
    : 0;
  const abstentionCount = edges.filter((edge) => edge.type === "abstains_from").length;
  const driftCount = nodes.filter((node) => Number(node.drift) > 0).length;
  const confidence = nodes.length
    ? Math.round(
        nodes.reduce((sum, node) => sum + (Number(node.confidence) || 0), 0) / nodes.length
      )
    : 0;
  const riskBand = contextNode ? riskForScore(Number(contextNode.trust || 0)) : null;
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    evidenceCompleteness,
    abstentionCount,
    driftCount,
    confidence,
    riskBand,
  };
}

export function getNode(graph, rawId) {
  const node = findNode(graph, rawId);
  if (!node) return null;
  const edges = getEdgesForNode(graph, node, "both");
  const neighborIds = getNeighborNodeIds(graph, node);
  const neighbors = graph.nodes.filter((item) => neighborIds.has(item.id));
  return sortQueryResult({
    nodes: [node, ...neighbors],
    edges,
    metadata: buildQueryMetadata([node, ...neighbors], edges, node),
  });
}

export function getNeighbors(graph, rawId) {
  return getNode(graph, rawId);
}

export function getProjectDependencies(graph, projectId) {
  const project = findNode(graph, projectId);
  if (!project || project.type !== "Project") return null;
  const edges = graph.edges.filter((edge) => edge.source === project.id && edge.type === "depends_on");
  const nodes = [project, ...graph.nodes.filter((node) => edges.some((edge) => edge.target === node.id))];
  return sortQueryResult({
    nodes,
    edges,
    metadata: buildQueryMetadata(nodes, edges, project),
  });
}

export function getProjectDependents(graph, projectId) {
  const project = findNode(graph, projectId);
  if (!project || project.type !== "Project") return null;
  const edges = graph.edges.filter((edge) => edge.target === project.id && edge.type === "depends_on");
  const nodes = [project, ...graph.nodes.filter((node) => edges.some((edge) => edge.source === node.id))];
  return sortQueryResult({
    nodes,
    edges,
    metadata: buildQueryMetadata(nodes, edges, project),
  });
}

export function getRiskPropagation(graph, projectId) {
  const result = getProjectDependencies(graph, projectId);
  if (!result) return null;
  const edges = result.edges.map((edge) => ({
    ...edge,
    riskBand: riskForScore(Number(graph.nodes.find((node) => node.id === edge.target)?.trust || 0)),
    riskScore: Number(graph.nodes.find((node) => node.id === edge.target)?.trust || 0),
  }));
  return sortQueryResult({
    nodes: result.nodes,
    edges,
    metadata: {
      ...result.metadata,
      propagationType: "risk",
      riskBand: result.metadata.riskBand,
    },
  });
}

export function getDriftPropagation(graph, projectId) {
  const project = findNode(graph, projectId);
  if (!project || project.type !== "Project") return null;
  const edges = graph.edges.filter(
    (edge) =>
      (edge.source === project.id || edge.target === project.id) &&
      edge.type === "drifted_by"
  );
  const nodes = [project, ...graph.nodes.filter((node) => edges.some((edge) => edge.source === node.id || edge.target === node.id))];
  return sortQueryResult({
    nodes,
    edges,
    metadata: {
      ...buildQueryMetadata(nodes, edges, project),
      propagationType: "drift",
    },
  });
}

export function getAbstentionPropagation(graph, projectId) {
  const project = findNode(graph, projectId);
  if (!project || project.type !== "Project") return null;
  const edges = graph.edges.filter((edge) => edge.source === project.id && edge.type === "abstains_from");
  const nodes = [project, ...graph.nodes.filter((node) => edges.some((edge) => edge.target === node.id))];
  return sortQueryResult({
    nodes,
    edges,
    metadata: {
      ...buildQueryMetadata(nodes, edges, project),
      propagationType: "abstention",
    },
  });
}

export function searchGraph(graph, query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return null;
  const nodes = graph.nodes.filter(
    (node) => node.id.toLowerCase().includes(normalized) || node.label.toLowerCase().includes(normalized) || node.type.toLowerCase().includes(normalized)
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  return sortQueryResult({
    nodes,
    edges,
    metadata: {
      ...buildQueryMetadata(nodes, edges, null),
      query,
    },
  });
}

export function getWorkspaceGraph(db, workspaceId) {
  return buildTrustGraph(db, workspaceId);
}

export function getWorkspaceNodes(db, workspaceId) {
  const graph = buildTrustGraph(db, workspaceId);
  return graph.nodes;
}

export function getWorkspaceEdges(db, workspaceId) {
  const graph = buildTrustGraph(db, workspaceId);
  return graph.edges;
}

export function getNodeRisk(graph, rawId, db) {
  const node = findNode(graph, rawId);
  if (!node) return null;
  const dependencyNodes = getDependencyNodes(graph, node);
  const dependentNodes = getDependentNodes(graph, node);
  const dependencyRisks = dependencyNodes.map((item) => computeDependencyRisk(item));
  const propagationRisk = computePropagationRisk(dependencyRisks);
  const scanAge = parseNodeAge(db, node);
  const scanAgeDays = computeAgeDays(scanAge) ?? 0;
  const passport = getPassportInfo(db, node);
  const expiryPenalty = applyExpiryPenalties({ scanAgeDays, passportExpiresInDays: passport.expiresInDays, passportRevoked: passport.revoked });
  const decayValue = applyTimelineDecay(Number(node.drift || 0));
  const riskScore = computeNodeRiskScore(node, {
    propagationRisk,
    scanAgeDays,
    passportExpiresInDays: passport.expiresInDays,
    passportRevoked: passport.revoked,
    missingMetadata: hasMissingMetadata(db, node),
  });
  const confidence = computeNodeConfidence(node);
  return {
    nodeId: node.id,
    type: node.type,
    label: node.label,
    trust: Number(node.trust || 0),
    riskScore,
    confidence,
    decay: decayValue,
    expiry: expiryPenalty,
    propagation: propagationRisk,
    dependencies: dependencyNodes.map((item, index) => ({
      nodeId: item.id,
      type: item.type,
      riskScore: dependencyRisks[index],
      trust: Number(item.trust || 0),
      evidenceCompleteness: Number(item.evidenceCompleteness || 0),
    })),
    dependents: dependentNodes.map((item) => ({
      nodeId: item.id,
      type: item.type,
      trust: Number(item.trust || 0),
      evidenceCompleteness: Number(item.evidenceCompleteness || 0),
    })),
    timeline: {
      decay: decayValue,
      expiry: expiryPenalty,
      propagation: propagationRisk,
      scanAgeDays,
      passportExpiresInDays: passport.expiresInDays,
      passportRevoked: passport.revoked,
      missingMetadata: hasMissingMetadata(db, node),
    },
  };
}

export function getWorkspaceRiskData(db, workspaceId) {
  const graph = buildTrustGraph(db, workspaceId);
  const nodeRisks = graph.nodes.map((node) => getNodeRisk(graph, node.id, db)).filter(Boolean);
  const riskScore = computeWorkspaceRiskScore(nodeRisks);
  const confidence = computeWorkspaceConfidence(nodeRisks.map((item) => item.confidence));
  const averageDecay = nodeRisks.length
    ? Math.round(nodeRisks.reduce((sum, item) => sum + Number(item.decay || 0), 0) / nodeRisks.length)
    : 0;
  const averageExpiry = nodeRisks.length
    ? Math.round(nodeRisks.reduce((sum, item) => sum + Number(item.expiry || 0), 0) / nodeRisks.length)
    : 0;
  const propagation = computePropagationRisk(nodeRisks.map((item) => item.propagation));
  const dependencies = nodeRisks.filter((item) => item.type === "Dependency");
  const dependents = nodeRisks.filter((item) => ["Project", "Asset"].includes(item.type));
  return {
    riskScore,
    confidence,
    decay: averageDecay,
    expiry: averageExpiry,
    propagation,
    dependencies,
    dependents,
    timeline: {
      ...graph.timelineSummary,
      eventCount: graph.timelineEvents.length,
    },
  };
}

export function getWorkspaceTimelineEvents(db, workspaceId) {
  return buildTrustGraph(db, workspaceId).timelineEvents;
}

export function getWorkspaceStalenessSummary(db, workspaceId) {
  return buildTrustGraph(db, workspaceId).timelineSummary;
}

function buildStalenessEvent(node, drift) {
  return {
    id: `${node.id}:drift`,
    type: "GRAPH_DRIFT_FLAGGED",
    node: node.id,
    nodeType: node.type,
    drift,
    timestamp: new Date().toISOString(),
    message: `Node ${node.label} (${node.type}) is stale and drifting with score ${Math.round(drift * 100)}/100.`,
  };
}

function buildAbstentionEvent(marker) {
  return {
    id: `${marker.id}:abstention`,
    type: "GRAPH_ABSTENTION_FLAGGED",
    marker: marker.id,
    timestamp: new Date().toISOString(),
    message: `Explicit abstention recorded for missing evidence marker ${marker.label}.`,
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeAgeDays(value) {
  const date = parseDate(value);
  if (!date) return null;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function buildScanExpiryEvent(node, ageDays) {
  return {
    id: `${node.id}:scan_expiry:${Date.now()}`,
    type: "GRAPH_SCAN_EXPIRED",
    node: node.id,
    nodeType: node.type,
    ageDays: Number(ageDays.toFixed(1)),
    timestamp: new Date().toISOString(),
    message: `Scan data for ${node.label} is ${Math.round(ageDays)} days old and should be refreshed.`,
  };
}

function buildPassportEvent(passport, assetNode, eventType, daysRemaining = null) {
  return {
    id: `passport:${passport.id}:${eventType}:${Date.now()}`,
    type: eventType,
    passportId: passport.id,
    asset: assetNode.id,
    nodeType: assetNode.type,
    status: passport.status,
    expiresAt: passport.expiresAt || null,
    daysRemaining: daysRemaining != null ? Math.round(daysRemaining) : null,
    revoked: passport.revoked === true,
    timestamp: new Date().toISOString(),
    message:
      eventType === "GRAPH_PASSPORT_EXPIRED"
        ? `Passport ${passport.id} for ${assetNode.label} has expired.`
        : eventType === "GRAPH_PASSPORT_EXPIRING_SOON"
        ? `Passport ${passport.id} for ${assetNode.label} expires in ${Math.round(daysRemaining)} days.`
        : `Passport ${passport.id} for ${assetNode.label} has been revoked.`,
  };
}

function buildTrustDecayEvent(node, drift) {
  return {
    id: `${node.id}:trust_decay:${Date.now()}`,
    type: "GRAPH_TRUST_DECAY",
    node: node.id,
    nodeType: node.type,
    drift,
    timestamp: new Date().toISOString(),
    message: `Trust for ${node.label} is decaying because evidence is stale and drifting.`,
  };
}

function buildTimelineSummary(nodeEvents) {
  const scanExpired = nodeEvents.filter((event) => event.type === "GRAPH_SCAN_EXPIRED").length;
  const passportsExpiring = nodeEvents.filter((event) => event.type === "GRAPH_PASSPORT_EXPIRING_SOON").length;
  const passportsExpired = nodeEvents.filter((event) => event.type === "GRAPH_PASSPORT_EXPIRED").length;
  const revokedPassports = nodeEvents.filter((event) => event.type === "GRAPH_PASSPORT_REVOKED").length;
  const driftFlags = nodeEvents.filter((event) => event.type === "GRAPH_DRIFT_FLAGGED").length;
  const decayFlags = nodeEvents.filter((event) => event.type === "GRAPH_TRUST_DECAY").length;
  const abstentions = nodeEvents.filter((event) => event.type === "GRAPH_ABSTENTION_FLAGGED").length;
  const totalEvents = nodeEvents.length;

  const stalenessScore = Math.max(
    0,
    100 - driftFlags * 8 - decayFlags * 10 - scanExpired * 6 - passportsExpiring * 5 - passportsExpired * 15 - revokedPassports * 12 - abstentions * 4
  );

  return {
    generatedAt: new Date().toISOString(),
    totalEvents,
    driftFlags,
    decayFlags,
    scanExpired,
    passportsExpiring,
    passportsExpired,
    revokedPassports,
    abstentions,
    stalenessScore,
    message: `Timeline summary generated with ${totalEvents} event${totalEvents === 1 ? "" : "s"}.`,
  };
}

export function buildTrustGraph(db, workspaceId) {
  const nodes = [];
  const edges = [];
  const nodeIndex = new Map();
  const nodeEvents = [];
  const now = new Date();

  const workspacesData = workspaceId ? (db.workspaces || []).filter((workspace) => workspace.id === workspaceId) : db.workspaces || [];
  const assetsData = workspaceId ? (db.assets || []).filter((asset) => asset.workspaceId === workspaceId) : db.assets || [];
  const projectsData = workspaceId ? (db.projects || []).filter((project) => project.workspaceId === workspaceId) : db.projects || [];
  const passportsData = workspaceId ? (db.passports || []).filter((passport) => passport.workspaceId === workspaceId) : db.passports || [];

  function addGraphNode(type, id, label, props = {}) {
    return createNode(nodes, nodeIndex, type, id, label, props);
  }

  function addGraphEdge(source, target, relationship, props = {}) {
    return createEdge(edges, source, target, relationship, props);
  }

  const workspaces = new Map();
  for (const workspace of workspacesData) {
    const node = addGraphNode("Workspace", workspace.id, workspace.name, {
      trust: 100,
      confidence: 100,
      evidenceCompleteness: 1,
    });
    workspaces.set(workspace.id, node);
  }

  const vendors = new Map();
  const assetNodeMap = new Map();
  for (const asset of assetsData) {
    const evidenceCompleteness = computeEvidenceCompletenessForAsset(db, asset);
    const drift = computeDrift(asset.lastScannedAt || asset.updatedAt || asset.createdAt);
    const node = addGraphNode("Asset", asset.id, asset.name, {
      assetType: asset.type,
      trust: Number(asset.latestTrustScore || 0),
      confidence: Number(asset.latestConfidenceScore || 0),
      evidenceCompleteness,
      drift,
      risk: asset.risk || "Unknown",
      source: "asset",
    });
    assetNodeMap.set(asset.id, node);

    if (asset.company) {
      const vendorId = normalizeId("Vendor", asset.company);
      const vendorNode = vendors.get(vendorId) || addGraphNode("Vendor", vendorId, asset.company, {
        trust: 80,
        confidence: 80,
        evidenceCompleteness: 0.8,
      });
      vendors.set(vendorId, vendorNode);
      addGraphEdge(node, vendorNode, "supplied_by", { evidence: true, description: "Vendor relationship inferred from asset metadata." });
    }

    if (asset.workspaceId && workspaces.has(asset.workspaceId)) {
      addGraphEdge(node, workspaces.get(asset.workspaceId), "owned_by", { evidence: true });
    }

    const passport = passportsData.find((item) => item.assetId === asset.id && item.isPublic);
    if (passport) {
      const passportNode = addGraphNode("Passport", passport.id, `Passport ${passport.version}`, {
        trust: Number(passport.trustScore || 0),
        confidence: Number(passport.confidenceScore || 0),
        evidenceCompleteness: 1,
        status: passport.status,
        public: passport.isPublic,
      });
      addGraphEdge(passportNode, node, "passported_by", { evidence: true, description: "Public passport proves asset trust." });

      const expiresAt = parseDate(passport.expiresAt);
      if (passport.revoked) {
        nodeEvents.push(buildPassportEvent(passport, node, "GRAPH_PASSPORT_REVOKED"));
      }
      if (expiresAt) {
        const daysUntil = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysUntil < 0) {
          nodeEvents.push(buildPassportEvent(passport, node, "GRAPH_PASSPORT_EXPIRED", daysUntil));
        } else if (daysUntil <= 30) {
          nodeEvents.push(buildPassportEvent(passport, node, "GRAPH_PASSPORT_EXPIRING_SOON", daysUntil));
        }
      }
    }

    const scanAgeDays = computeAgeDays(asset.lastScannedAt || asset.updatedAt || asset.createdAt);
    if (scanAgeDays != null && scanAgeDays > 30) {
      nodeEvents.push(buildScanExpiryEvent(node, scanAgeDays));
    }

    if (drift > 0.4) {
      nodeEvents.push(buildStalenessEvent(node, drift));
      if (drift > 0.65) {
        nodeEvents.push(buildTrustDecayEvent(node, drift));
      }
      const driftEvidence = addGraphNode("EvidenceArtifact", `${asset.id}:drift`, `Stale evidence for ${asset.name}`, {
        trust: 0,
        confidence: 0,
        evidenceCompleteness: 0,
        staleSince: asset.lastScannedAt || asset.updatedAt || asset.createdAt,
      });
      addGraphEdge(node, driftEvidence, "drifted_by", {
        evidence: true,
        drift,
        description: "Evidence drift is derived from stale scan or update timestamp.",
      });
    }

    if (Array.isArray(asset.packages) && asset.packages.length > 0) {
      for (const packageName of asset.packages) {
        const dependencyKey = `${packageName}`;
        const dependencyNode = addGraphNode("Dependency", dependencyKey, packageName, {
          trust: 0,
          confidence: 0,
          evidenceCompleteness: 1,
          source: "asset-package",
        });
        addGraphEdge(node, dependencyNode, "depends_on", {
          evidence: true,
          trustPropagation: Math.round((node.trust || 0) * 0.35),
          description: "Declared package dependency captured from asset package list.",
        });
      }
    }
  }

  for (const project of projectsData) {
    const evidenceCompleteness = computeEvidenceCompletenessForProject(db, project);
    const latestScore = (db.projectScores || [])
      .filter((item) => item.projectId === project.id)
      .sort((a, b) => String(b.computedAt || "").localeCompare(String(a.computedAt || "")))[0] || null;
    const trust = latestScore ? Number(latestScore.score || 0) : 0;
    const confidence = latestScore ? Number(latestScore.confidence || 0) : 0;
    const drift = computeDrift(latestScore?.computedAt || project.updatedAt || project.createdAt);
    const projectNode = addGraphNode("Project", project.id, project.name, {
      trust,
      confidence,
      evidenceCompleteness,
      drift,
      source: "project",
      repoUrl: project.repoUrl || null,
    });

    if (project.workspaceId && workspaces.has(project.workspaceId)) {
      addGraphEdge(projectNode, workspaces.get(project.workspaceId), "owned_by", { evidence: true });
    }

    if (project.repoUrl) {
      const repoNode = addGraphNode("EvidenceArtifact", `${project.id}:repo`, `Repo ${project.repoUrl}`, {
        trust: 0,
        confidence: 0,
        evidenceCompleteness: 1,
        source: "repo-url",
      });
      addGraphEdge(projectNode, repoNode, "supported_by", { evidence: true, description: "Repository URL provides relationship evidence." });
    }

    const dependencies = (db.projectDependencies || []).filter((item) => item.projectId === project.id);
    if (dependencies.length > 0) {
      for (const dep of dependencies) {
        const dependencyNode = addGraphNode("Dependency", `${dep.packageName}@${dep.version}`.toLowerCase(), `${dep.packageName}@${dep.version}`, {
          trust: 0,
          confidence: 0,
          evidenceCompleteness: 1,
          ecosystem: dep.ecosystem,
          source: "project-dependency",
        });
        addGraphEdge(projectNode, dependencyNode, "depends_on", {
          evidence: true,
          trustPropagation: Math.round(trust * 0.3),
          description: "Project dependency extracted from uploaded SBOM or package list.",
        });
      }
    } else {
      const abstentionMarker = addGraphNode("EvidenceMarker", `${project.id}:missing-dependency`, "Missing dependency evidence", {
        trust: 0,
        confidence: 0,
        evidenceCompleteness: 0,
        abstention: true,
      });
      addGraphEdge(projectNode, abstentionMarker, "abstains_from", {
        evidence: false,
        description: "No dependency evidence exists for this project, so the relationship is abstained.",
      });
      nodeEvents.push(buildAbstentionEvent(abstentionMarker));
    }

    if (!project.repoUrl) {
      const abstentionNode = addGraphNode("EvidenceMarker", `${project.id}:missing-repo`, "Missing repository evidence", {
        trust: 0,
        confidence: 0,
        evidenceCompleteness: 0,
        abstention: true,
      });
      addGraphEdge(projectNode, abstentionNode, "abstains_from", {
        evidence: false,
        description: "Repository evidence is absent for this project.",
      });
      nodeEvents.push(buildAbstentionEvent(abstentionNode));
    }

    if (!db.projectArtifacts.some((item) => item.projectId === project.id && item.type === "METADATA")) {
      const abstentionNode = addGraphNode("EvidenceMarker", `${project.id}:missing-metadata`, "Missing metadata evidence", {
        trust: 0,
        confidence: 0,
        evidenceCompleteness: 0,
        abstention: true,
      });
      addGraphEdge(projectNode, abstentionNode, "abstains_from", {
        evidence: false,
        description: "Governance and policy metadata is missing for this project.",
      });
      nodeEvents.push(buildAbstentionEvent(abstentionNode));
    }

    if (drift > 0.4) {
      nodeEvents.push(buildStalenessEvent(projectNode, drift));
      if (drift > 0.65) {
        nodeEvents.push(buildTrustDecayEvent(projectNode, drift));
      }
      const driftEvidence = addGraphNode("EvidenceArtifact", `${project.id}:drift`, `Stale project evidence for ${project.name}`, {
        trust: 0,
        confidence: 0,
        evidenceCompleteness: 0,
        staleSince: latestScore?.computedAt || project.updatedAt || project.createdAt,
      });
      addGraphEdge(projectNode, driftEvidence, "drifted_by", {
        evidence: true,
        drift,
        description: "Project scoring or evidence is stale and should be refreshed.",
      });
    }
  }

  const summary = buildGraphSummary(nodes, edges);
  const driftCount = nodes.filter((node) => Number(node.drift) > 0.4).length;
  const abstentionCount = edges.filter((edge) => edge.type === "abstains_from").length;
  const narrative = buildGraphNarrative(summary, driftCount, abstentionCount);
  const timelineSummary = buildTimelineSummary(nodeEvents);
  const timelineEvents = [
    {
      id: `graph:recompute:${Date.now()}`,
      type: "GRAPH_RECOMPUTED",
      timestamp: new Date().toISOString(),
      nodeCount: summary.nodeCount,
      edgeCount: summary.edgeCount,
      score: summary.score,
      confidence: summary.confidence,
      message: "The Trust Graph was recomputed from available evidence and deterministic relationships.",
    },
    ...nodeEvents,
    {
      id: `graph:timeline-summary:${Date.now()}`,
      type: "GRAPH_TIMELINE_SUMMARY",
      timestamp: timelineSummary.generatedAt,
      summary: timelineSummary,
      message: timelineSummary.message,
    },
  ];

  return {
    schema: {
      nodeTypes: NODE_TYPES,
      edgeTypes: EDGE_TYPES,
    },
    summary,
    narrative,
    nodes,
    edges,
    timelineSummary,
    timelineEvents,
  };
}
