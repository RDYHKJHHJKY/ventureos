-- Add SLSA mapping columns to spr_evidence
BEGIN;

ALTER TABLE IF EXISTS spr_evidence
  ADD COLUMN IF NOT EXISTS slsa_level integer,
  ADD COLUMN IF NOT EXISTS slsa_citations jsonb,
  ADD COLUMN IF NOT EXISTS slsa_derived text,
  ADD COLUMN IF NOT EXISTS slsa_confidence integer;

-- optional index for quick filtering by level
CREATE INDEX IF NOT EXISTS idx_spr_evidence_slsa_level ON spr_evidence (slsa_level);

COMMIT;

-- Down migration (manual):
-- BEGIN; ALTER TABLE spr_evidence DROP COLUMN IF EXISTS slsa_level; ALTER TABLE spr_evidence DROP COLUMN IF EXISTS slsa_citations; ALTER TABLE spr_evidence DROP COLUMN IF EXISTS slsa_derived; ALTER TABLE spr_evidence DROP COLUMN IF EXISTS slsa_confidence; DROP INDEX IF EXISTS idx_spr_evidence_slsa_level; COMMIT;
