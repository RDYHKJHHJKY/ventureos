import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { computeProvenanceSeal, verifySeal } from '../lib/server/provenance-seal.js';
import { captureRawBody, hmacIngestionGate } from '../lib/server/middleware/hmac-auth.js';

function createMockReq(rawBody = '') {
  const listeners = {};
  const req = {
    headers: {},
    rawBody,
    on(event, handler) {
      listeners[event] = handler;
      return this;
    },
    emit(event, payload) {
      if (event === 'data' && typeof listeners.data === 'function') listeners.data(payload);
      if (event === 'end' && typeof listeners.end === 'function') listeners.end();
      return true;
    },
  };
  return req;
}

test('computeProvenanceSeal is deterministic and verifiable', () => {
  const provenance = { discovered_by: 'scanner-a', source_url: 'https://example.com/pkg', timestamp: '2026-07-04T00:00:00.000Z' };
  const first = computeProvenanceSeal(provenance);
  const second = computeProvenanceSeal({ ...provenance, timestamp: provenance.timestamp });
  assert.equal(first, second);
  assert.equal(verifySeal(first, provenance), true);
  assert.equal(verifySeal('deadbeef', provenance), false);
});

test('captureRawBody preserves payload for HMAC verification', async () => {
  const req = createMockReq();
  let finished = false;
  captureRawBody(req, {}, () => {
    finished = true;
  });
  req.emit('data', '{"ok":true}');
  req.emit('end');
  assert.equal(req.rawBody, '{"ok":true}');
  assert.equal(finished, true);
});

test('hmacIngestionGate rejects invalid signatures and accepts valid ones', () => {
  process.env.INGESTION_SECRET = 'test-secret';

  const invalid = (() => {
    const req = createMockReq('{"ok":true}');
    const res = { statusCode: 200, json(payload) { this.body = payload; } };
    const result = hmacIngestionGate(req, res, () => {});
    return { result, body: res.body };
  })();

  assert.equal(invalid.result, false);
  assert.equal(invalid.body.error, 'Unauthorized');

  const body = '{"ok":true}';
  const expectedSignature = createHmac('sha256', 'test-secret').update(body).digest('hex');
  const accepted = (() => {
    const req = createMockReq(body);
    req.headers = { 'x-ventureos-signature': `sha256=${expectedSignature}` };
    let nextCalled = false;
    const res = { statusCode: 200, json(payload) { this.body = payload; } };
    const result = hmacIngestionGate(req, res, () => {
      nextCalled = true;
    });
    return { result, nextCalled, provenanceVerified: req.provenanceVerified };
  })();

  assert.equal(accepted.result, true);
  assert.equal(accepted.nextCalled, true);
  assert.equal(accepted.provenanceVerified, true);
});

test('hmacIngestionGate accepts secret from INGESTION_WEBHOOK_SECRET alias', () => {
  process.env.INGESTION_WEBHOOK_SECRET = 'alias-secret';
  const body = '{"ok":true}';
  const expectedSignature = createHmac('sha256', 'alias-secret').update(body).digest('hex');
  const req = createMockReq(body);
  req.headers = { 'x-ventureos-signature': `sha256=${expectedSignature}` };
  let nextCalled = false;
  const res = { statusCode: 200, json(payload) { this.body = payload; } };
  const result = hmacIngestionGate(req, res, () => {
    nextCalled = true;
  });

  assert.equal(result, true);
  assert.equal(nextCalled, true);
  assert.equal(req.provenanceVerified, true);
});
