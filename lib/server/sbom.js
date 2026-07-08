import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function parseSbomContent(content) {
  const text = typeof content === 'string' ? content : Buffer.isBuffer(content) ? content.toString('utf8') : null;
  if (!text) return null;
  try {
    const json = JSON.parse(text);
    // CycloneDX (v1/v1.4/v1.5) uses "bomFormat": "CycloneDX" or root "components"
    if (json.bomFormat && String(json.bomFormat).toLowerCase().includes('cyclonedx')) {
      return {
        format: 'cyclonedx',
        version: json.specVersion || json.version || null,
        components: Array.isArray(json.components) ? json.components.length : (Array.isArray(json.dependencies) ? json.dependencies.length : 0),
        raw: json,
      };
    }
    // SPDX JSON has "spdxVersion" or top-level "SPDXID" fields
    if (json.spdxVersion || json.SPDXID || json['spdxVersion']) {
      return {
        format: 'spdx',
        version: json.spdxVersion || null,
        documentName: json.name || json.documentName || null,
        raw: json,
      };
    }
    // heuristic: CycloneDX may present as object with metadata and components
    if (json.metadata && (json.components || json.bomFormat)) {
      return {
        format: 'cyclonedx',
        version: json.specVersion || null,
        components: Array.isArray(json.components) ? json.components.length : 0,
        raw: json,
      };
    }
  } catch (err) {
    // not JSON, ignore
  }
  return null;
}

export async function downloadAndParseSbom(url) {
  if (!globalThis.fetch) throw new Error('fetch not available for downloading SBOM');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download SBOM ${url}: ${res.status}`);
  const text = await res.text();
  return parseSbomContent(text);
}

export default { parseSbomContent, downloadAndParseSbom };
