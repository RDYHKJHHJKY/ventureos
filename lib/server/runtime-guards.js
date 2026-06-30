import { evidencePipeline } from "./evidence-pipeline.js";

const activeExecutions = new Set();

function buildHttpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

export function requireWorkspace(ctx, workspaceId) {
  const requestedWorkspaceId = String(workspaceId || "").trim();
  if (!requestedWorkspaceId || ctx.workspaceId !== requestedWorkspaceId) {
    throw buildHttpError(403, "FORBIDDEN", "Workspace access denied.");
  }
  return ctx;
}

export function requireProject(db, ctx, projectId) {
  if (!db || !Array.isArray(db.projects)) {
    throw buildHttpError(500, "SERVER_ERROR", "Project lookup failed due to invalid database state.");
  }
  const project = db.projects.find((item) => item.id === projectId);
  if (!project) {
    throw buildHttpError(404, "NOT_FOUND", "Project not found.");
  }
  if (!ctx.workspaceId || project.workspaceId !== ctx.workspaceId) {
    throw buildHttpError(403, "FORBIDDEN", "Access denied to this project.");
  }
  return project;
}

export function requireEvidenceSchema(evidence, options = {}) {
  if (!evidence || typeof evidence !== "object") {
    throw buildHttpError(400, "VALIDATION_ERROR", "Evidence payload must be a valid object.");
  }
  let normalized;
  try {
    normalized = evidencePipeline.validate(evidence, { workspaceId: options.workspaceId, kind: options.kind || "evidence" });
  } catch (error) {
    const details = error.details || {};
    const wrapped = buildHttpError(400, "VALIDATION_ERROR", error.message || "Evidence validation failed.");
    wrapped.details = details;
    throw wrapped;
  }
  const requiredFields = ["softwareId", "type", "title", "source"];
  for (const field of requiredFields) {
    if (!normalized[field]) {
      throw buildHttpError(400, "VALIDATION_ERROR", `Evidence payload missing required field: ${field}.`);
    }
  }
  return normalized;
}

export function preventCircularExecution(key) {
  if (!key || typeof key !== "string" || !key.trim()) {
    throw buildHttpError(400, "VALIDATION_ERROR", "Execution key is required.");
  }
  const normalizedKey = key.trim();
  if (activeExecutions.has(normalizedKey)) {
    throw buildHttpError(409, "CIRCULAR_EXECUTION", "Circular or duplicate execution detected.");
  }
  activeExecutions.add(normalizedKey);
  return normalizedKey;
}

export function releaseCircularExecution(key) {
  if (!key || typeof key !== "string") return;
  activeExecutions.delete(key.trim());
}

export async function withCircularExecutionGuard(key, fn) {
  const activeKey = preventCircularExecution(key);
  try {
    return await fn();
  } finally {
    releaseCircularExecution(activeKey);
  }
}

export function isExecutionInProgress(key) {
  return activeExecutions.has(String(key || "").trim());
}
