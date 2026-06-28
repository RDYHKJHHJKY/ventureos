import { VALID_NODE_TYPES } from "./trust-graph.js";

function buildAdjacency(graph) {
  const adjacency = new Map();
  for (const node of graph.nodes || []) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges || []) {
    if (edge.type === "depends_on") {
      adjacency.get(edge.source)?.push(edge.target);
    }
  }
  return adjacency;
}

export function checkCycles(graph) {
  const adjacency = buildAdjacency(graph);
  const visited = new Set();
  const stack = new Set();
  const violations = [];

  function dfs(nodeId, path = []) {
    if (stack.has(nodeId)) {
      const cycleStartIndex = path.indexOf(nodeId);
      const cyclePath = cycleStartIndex >= 0 ? path.slice(cycleStartIndex).concat(nodeId) : [...path, nodeId];
      violations.push({ type: "cycle", path: cyclePath });
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    stack.add(nodeId);
    for (const nextId of adjacency.get(nodeId) || []) {
      dfs(nextId, [...path, nodeId]);
    }
    stack.delete(nodeId);
  }

  for (const nodeId of adjacency.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, []);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

export function checkOrphans(graph) {
  const orphans = [];
  for (const node of graph.nodes || []) {
    const edges = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
    if (edges.length === 0) {
      orphans.push({ nodeId: node.id, type: node.type, label: node.label });
    }
  }
  return {
    ok: orphans.length === 0,
    orphans,
  };
}

export function checkDuplicateEdges(graph) {
  const seen = new Map();
  const duplicates = [];
  for (const edge of graph.edges || []) {
    const key = `${edge.source}:${edge.type}:${edge.target}`;
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    if (count > 0) {
      duplicates.push({ edgeId: edge.id, source: edge.source, target: edge.target, type: edge.type });
    }
  }
  return {
    ok: duplicates.length === 0,
    duplicates,
  };
}

export function checkInvalidNodes(graph) {
  const invalidNodes = [];
  for (const node of graph.nodes || []) {
    if (!VALID_NODE_TYPES.includes(node.type)) {
      invalidNodes.push({ nodeId: node.id, type: node.type, label: node.label });
    }
  }
  return {
    ok: invalidNodes.length === 0,
    invalidNodes,
  };
}

export function checkCrossWorkspaceLeaks(graph, workspaceId) {
  const expectedWorkspaceId = `Workspace:${workspaceId}`;
  const leakedWorkspaces = (graph.nodes || []).filter(
    (node) => node.type === "Workspace" && node.id !== expectedWorkspaceId
  );
  const leakedEdges = (graph.edges || []).filter(
    (edge) =>
      (edge.source.startsWith("Workspace:") && edge.source !== expectedWorkspaceId) ||
      (edge.target.startsWith("Workspace:") && edge.target !== expectedWorkspaceId)
  );
  return {
    ok: leakedWorkspaces.length === 0 && leakedEdges.length === 0,
    leakedWorkspaces,
    leakedEdges,
  };
}
