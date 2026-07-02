export function normalizeSoftware(software = {}) {
  if (!software || typeof software !== "object") return { id: null, repositoryUrl: null, packageName: null };
  return {
    id: String(software.id || software.softwareId || "").trim() || null,
    repositoryUrl: String(software.repositoryUrl || software.repoUrl || "").trim() || null,
    packageName: String(software.packageName || software.name || "").trim() || null,
  };
}

export function normalizeVendor(vendor = {}) {
  if (!vendor || typeof vendor !== "object") return { id: null, complianceClaims: [] };
  const claims = Array.isArray(vendor.complianceClaims)
    ? [...new Set(vendor.complianceClaims.map((item) => String(item || "").trim()).filter(Boolean))].sort()
    : [];
  return {
    id: String(vendor.id || vendor.vendorId || "").trim() || null,
    name: String(vendor.name || "").trim() || null,
    complianceClaims: claims,
  };
}

export function normalizeIdentity({ software = {}, vendor = {} } = {}) {
  return {
    software: normalizeSoftware(software),
    vendor: normalizeVendor(vendor),
  };
}

export function validateIdentity(identity = {}) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be an object.");
  }
  const software = normalizeSoftware(identity.software || {});
  if (!software.id) {
    throw new Error("Software identity must include an id.");
  }
  return { ok: true, software, vendor: normalizeVendor(identity.vendor || {}) };
}
