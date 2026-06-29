function getCookie(name) {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie.split(";").find((item) => item.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split("=")[1] || "") : "";
}

function getCsrfToken() {
  return getCookie("ventureos_csrf");
}

export async function apiJson(path, options = {}) {
  const opts = { ...options };
  const workspaceId = opts.workspaceId !== undefined ? opts.workspaceId : (typeof window !== "undefined" ? window.__VENTUREOS_WORKSPACE_ID__ : null);
  delete opts.workspaceId;
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  const method = (opts.method || "GET").toUpperCase();
  if (method !== "GET") {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
  }
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  if (normalizedWorkspaceId) {
    headers["x-workspace-id"] = normalizedWorkspaceId;
  }
  const response = await fetch(path, {
    credentials: "include",
    ...opts,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || "VentureOS API request failed.");
  return payload;
}

export function normalizeWorkspaceId(workspaceId) {
  if (workspaceId == null) return null;
  if (Array.isArray(workspaceId)) {
    workspaceId = workspaceId[0];
  }
  if (typeof workspaceId !== "string") return null;
  const normalized = workspaceId.trim();
  return normalized === "" ? null : normalized;
}
