import { createId, mutateDb, readDb } from "./data-store.js";
import crypto from "node:crypto";

export async function listIntegrationsForWorkspace(workspaceId) {
  const db = await readDb();
  return (db.integrations || []).filter((i) => String(i.workspaceId) === String(workspaceId));
}

export async function createIntegrationForWorkspace({ workspaceId, type = "generic", config = {} } = {}) {
  const rec = {
    id: createId("integration", workspaceId),
    workspaceId: String(workspaceId),
    type: String(type),
    config: config || {},
    apiKey: crypto.randomBytes(24).toString("base64url"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await mutateDb((db) => {
    db.integrations ||= [];
    db.integrations.push(rec);
  });
  return rec;
}

export async function rotateIntegrationKeyForWorkspace(workspaceId) {
  const newKey = crypto.randomBytes(24).toString("base64url");
  await mutateDb((db) => {
    db.integrations ||= [];
    for (const i of db.integrations) {
      if (String(i.workspaceId) === String(workspaceId)) {
        i.apiKey = newKey;
        i.updatedAt = new Date().toISOString();
      }
    }
  });
  return newKey;
}

export async function removeIntegrationById(id) {
  await mutateDb((db) => {
    db.integrations ||= [];
    db.integrations = db.integrations.filter((i) => String(i.id) !== String(id));
  });
  return true;
}
