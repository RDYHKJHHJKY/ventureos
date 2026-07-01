function getCookie(name) {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie.split(";").find((item) => item.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split("=")[1] || "") : "";
}

function getCsrfToken() {
  return getCookie("ventureos_csrf");
}

function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (!envUrl) return "";
  return envUrl.replace(/\/$/, "");
}

function buildApiUrl(path) {
  if (typeof path !== "string") return path;
  if (/^https?:\/\//i.test(path)) return path;
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return path;
  return path.startsWith("/") ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
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
  const url = buildApiUrl(path);
  const response = await fetch(url, {
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
