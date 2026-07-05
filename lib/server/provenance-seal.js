import { createHash } from 'node:crypto';

/**
 * Computes the canonical SHA-256 hash for provenance data.
 * The seal is deterministic and stored in the database for verification.
 */
export function computeProvenanceSeal(provenance = {}) {
  const canonical = JSON.stringify(
    {
      discovered_by: provenance.discovered_by,
      source_url: provenance.source_url,
      timestamp: provenance.timestamp || new Date().toISOString(),
    },
    Object.keys({ discovered_by: 1, source_url: 1, timestamp: 1 }).sort()
  );

  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verifies that a stored hash matches the recomputed provenance seal.
 */
export function verifySeal(storedHash, provenance = {}) {
  return Boolean(storedHash) && storedHash === computeProvenanceSeal(provenance);
}
