export async function apiJson(path, options = {}) {
  const opts = { ...options };
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  const response = await fetch(path, {
    credentials: "include",
    ...opts,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "API request failed.");
  }
  return payload;
}

export async function issuePassport(softwareId) {
  return apiJson("/api/spr/passports/issue", {
    method: "POST",
    body: JSON.stringify({ softwareId }),
  });
}

export async function getPassport(softwareId) {
  return apiJson(`/api/spr/passports/${encodeURIComponent(softwareId)}`);
}
