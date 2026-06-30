import { createHash } from "node:crypto";

function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

export const ALLOWED_SIGNAL_TYPES = ['cve','breach','monitoring','telemetry','cpu','memory','latency','availability'];
export const MAX_SIGNAL_PAYLOAD_BYTES = 128 * 1024; // 128KB
export const ALLOWED_MIME_TYPES = ['application/json','text/plain'];

function mapSeverity(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'high' || v === 'critical' || v === '2') return 2;
  if (v === 'medium' || v === 'med' || v === '1') return 1;
  if (v === 'low' || v === 'info' || v === '0' || v === '') return 0;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n <= 2) return Math.trunc(n);
  return null;
}

function mapConfidence(value) {
  if (value === true || String(value) === '1' || String(value).toLowerCase() === 'true') return 1;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.trunc(n)));
  return 0;
}

export function validateSignal(payload = {}, options = {}) {
  if (!isObject(payload)) {
    const err = new Error('Malformed signal payload');
    err.statusCode = 400; err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const type = String(payload.type || '').trim().toLowerCase();
  if (!ALLOWED_SIGNAL_TYPES.includes(type)) {
    const err = new Error(`Invalid signal type: ${type}`);
    err.statusCode = 400; err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (type === 'cve' || type === 'breach') {
    if (!payload.summary || String(payload.summary || '').trim() === '') {
      const err = new Error('Signal summary is required for this signal type');
      err.statusCode = 400; err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }
  if (payload.severity != null) {
    const sev = mapSeverity(payload.severity);
    if (sev == null) {
      const err = new Error('Invalid severity value'); err.statusCode = 400; err.code = 'VALIDATION_ERROR'; throw err;
    }
  }
  if (payload.confidence != null) {
    const conf = mapConfidence(payload.confidence);
    if (conf < 0) { const err = new Error('Invalid confidence value'); err.statusCode = 400; err.code = 'VALIDATION_ERROR'; throw err; }
  }
  if (payload.vendor && typeof payload.vendor !== 'object') {
    const err = new Error('Invalid vendor metadata'); err.statusCode = 400; err.code = 'VALIDATION_ERROR'; throw err;
  }
  return true;
}

export function normalizeSignal(payload = {}, options = {}) {
  const normalized = {};
  normalized.softwareId = String(payload.softwareId || payload.software || '').trim() || null;
  normalized.type = String(payload.type || 'monitoring').trim().toLowerCase();
  normalized.summary = String(payload.summary || payload.title || '').trim() || null;
  normalized.source = String(payload.source || '').trim() || null;
  // timestamps
  const ts = payload.createdAt || payload.timestamp || payload.generatedAt || payload.created_at || null;
  const date = ts ? new Date(ts) : new Date();
  normalized.createdAt = isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  // severity -> numeric
  const sev = mapSeverity(payload.severity);
  normalized.severity = sev != null ? sev : 0;
  // confidence
  const conf = mapConfidence(payload.confidence);
  normalized.confidence = Number.isFinite(conf) ? conf : 0;
  // numericSignals merge
  normalized.numericSignals = Object.assign({}, payload.numericSignals || {});
  normalized.numericSignals.severity = normalized.severity;
  normalized.numericSignals.confidence = normalized.confidence;
  // vendor metadata
  if (payload.vendor && typeof payload.vendor === 'object') {
    normalized.vendor = {
      id: String(payload.vendor.id || payload.vendor.vendorId || payload.vendor.vendor || '').trim() || null,
      name: String(payload.vendor.name || payload.vendor.vendorName || '').trim() || null,
    };
  } else {
    normalized.vendor = null;
  }
  normalized.workspaceId = String(payload.workspaceId || payload.workspace || options.workspaceId || '').trim() || null;
  normalized.payload = payload.payload || payload.data || payload.body || null;
  return normalized;
}

export function sanitizeSignal(payload = {}, options = {}) {
  const allowedKeys = new Set(['softwareId','type','summary','source','createdAt','severity','confidence','numericSignals','vendor','workspaceId','payload','mimeType']);
  // shallow copy only allowed keys
  const out = {};
  for (const key of Object.keys(payload || {})) {
    if (allowedKeys.has(key)) out[key] = payload[key];
  }
  // enforce payload size
  const serialized = typeof out.payload === 'string' ? out.payload : JSON.stringify(out.payload || '');
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SIGNAL_PAYLOAD_BYTES) {
    const err = new Error('Signal payload too large'); err.statusCode = 400; err.code = 'VALIDATION_ERROR'; throw err;
  }
  // reject embedded scripts
  const suspect = /<script\b|javascript:|on\w+=/i;
  if (suspect.test(serialized) || suspect.test(String(out.summary || '')) || suspect.test(String(out.source || ''))) {
    const err = new Error('Signal contains unsafe content'); err.statusCode = 400; err.code = 'VALIDATION_ERROR'; throw err;
  }
  // enforce mime types if provided
  const mime = String(out.mimeType || '').trim() || null;
  if (mime && !ALLOWED_MIME_TYPES.includes(mime)) { const err = new Error('Unsupported MIME type'); err.statusCode = 400; err.code = 'VALIDATION_ERROR'; throw err; }
  // coerce boolean numeric fields
  if (out.confidence === true) out.confidence = 1;
  if (out.confidence === false) out.confidence = 0;
  return out;
}

export function bindToWorkspace(ctx = {}, signal = {}, options = {}) {
  const requestedWorkspaceId = String(signal.workspaceId || '').trim() || null;
  const ctxWorkspace = ctx.workspaceId || null;
  if (ctxWorkspace && requestedWorkspaceId && ctxWorkspace !== requestedWorkspaceId) {
    const err = new Error('Cross-workspace signal not allowed'); err.statusCode = 403; err.code = 'FORBIDDEN'; throw err;
  }
  // attach workspace
  const boundWorkspace = requestedWorkspaceId || ctxWorkspace || null;
  return { workspaceId: boundWorkspace };
}

export const monitoring = {
  validateSignal,
  normalizeSignal,
  sanitizeSignal,
  bindToWorkspace,
  ALLOWED_SIGNAL_TYPES,
  MAX_SIGNAL_PAYLOAD_BYTES,
  ALLOWED_MIME_TYPES,
};
