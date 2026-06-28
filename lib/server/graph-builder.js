import { mutateDb, createId, readDb } from "./data-store.js";
import { buildTrustGraph } from "./trust-graph.js";

export async function constructWorkspaceGraph(workspaceId) {
  // Build the authoritative trust graph from current DB state
  const db = await readDb();
  const graph = buildTrustGraph(db, workspaceId);

  // Persist a snapshot of the graph for the workspace
  const record = await mutateDb((db) => {
    db.workspaceGraphs = db.workspaceGraphs || [];
    const now = new Date().toISOString();
    const rec = {
      id: createId("workspacegraph", workspaceId),
      workspaceId,
      generatedAt: now,
      nodes: graph.nodes,
      edges: graph.edges,
      summary: graph.summary,
      narrative: graph.narrative,
      timelineSummary: graph.timelineSummary,
    };
    db.workspaceGraphs.push(rec);
    return rec;
  });

  return { graph, record };
}

export async function getLatestWorkspaceGraph(workspaceId) {
  const db = await readDb();
  const list = (db.workspaceGraphs || []).filter((g) => g.workspaceId === workspaceId).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  return list[0] || null;
}
