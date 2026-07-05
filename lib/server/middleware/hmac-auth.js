import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

function getIngestionSecret() {
  return process.env.INGESTION_WEBHOOK_SECRET || process.env.INGESTION_SECRET || null;
}

function writeJsonResponse(res, statusCode, payload) {
  if (typeof res.status === 'function') {
    res.status(statusCode);
    if (typeof res.json === 'function') {
      res.json(payload);
      return;
    }
  }
  if (typeof res.writeHead === 'function') {
    res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
    return;
  }
  res.statusCode = statusCode;
  if (typeof res.json === 'function') {
    res.json(payload);
  }
}

function getSignatureHeader(req) {
  return req?.headers?.['x-ventureos-signature'] || req?.headers?.['X-VentureOS-Signature'] || null;
}

export function hmacIngestionGate(req, res, next) {
  const ingestionSecret = getIngestionSecret();
  if (!ingestionSecret) {
    console.error('[HMAC_REJECT] INGESTION_WEBHOOK_SECRET / INGESTION_SECRET is not configured.');
    writeJsonResponse(res, 500, {
      error: 'Internal Server Error',
      message: 'HMAC ingestion gate is not configured.',
      incident_id: randomUUID(),
    });
    return false;
  }

  const signatureHeader = getSignatureHeader(req);
  if (!signatureHeader) {
    console.error(`[HMAC_REJECT] Missing X-VentureOS-Signature header from ${req.ip || 'unknown'}`);
    writeJsonResponse(res, 401, {
      error: 'Unauthorized',
      message: 'Missing X-VentureOS-Signature header. Every ingestion must be cryptographically signed.',
      incident_id: randomUUID(),
    });
    return false;
  }

  const [scheme, providedSig] = String(signatureHeader || '').trim().split('=');
  if (scheme !== 'sha256' || !providedSig) {
    console.error(`[HMAC_REJECT] Invalid signature format from ${req.ip || 'unknown'}`);
    writeJsonResponse(res, 401, {
      error: 'Unauthorized',
      message: 'Invalid signature format. Expected: sha256=<hex>',
      incident_id: randomUUID(),
    });
    return false;
  }

  const expectedSig = createHmac('sha256', ingestionSecret)
    .update(req.rawBody || JSON.stringify(req.body || {}))
    .digest('hex');

  try {
    const providedBuf = Buffer.from(providedSig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');

    if (!timingSafeEqual(providedBuf, expectedBuf)) {
      console.error(`[HMAC_REJECT] Signature mismatch from ${req.ip || 'unknown'}. Possible tampering.`);
      writeJsonResponse(res, 403, {
        error: 'Forbidden',
        message: 'Signature verification failed. Request may have been tampered with.',
        incident_id: randomUUID(),
      });
      return false;
    }
  } catch {
    writeJsonResponse(res, 403, {
      error: 'Forbidden',
      message: 'Invalid signature encoding.',
      incident_id: randomUUID(),
    });
    return false;
  }

  req.provenanceVerified = true;
  req.provenanceSource = req.headers['x-ventureos-source'] || 'unknown';
  if (typeof next === 'function') {
    next();
  }
  return true;
}

export function captureRawBody(req, res, next) {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
}
