-- Migration 003: Convert spr_audit_logs.id and spr_restricted_tokens.id from text to UUID
-- Safe, in-place conversion that preserves existing UUID-like values and generates new UUIDs otherwise.
-- Run with: psql $DATABASE_URL -f db/migrations/003_convert_spr_ids_to_uuid.sql

BEGIN;

-- Ensure gen_random_uuid() is available (pgcrypto). This may require superuser privileges; if not available,
-- you should run the extension install manually on the DB server.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN
    RAISE NOTICE 'gen_random_uuid not found; ensure pgcrypto or equivalent is installed before running this migration.';
  END IF;
END$$;

-- 1) spr_audit_logs: add new UUID column, populate it, swap
ALTER TABLE IF EXISTS spr_audit_logs ADD COLUMN IF NOT EXISTS id_new UUID DEFAULT gen_random_uuid();
-- If existing id looks like a UUID, cast it. Otherwise, generate a new UUID.
UPDATE spr_audit_logs SET id_new = (CASE WHEN id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN id::uuid ELSE gen_random_uuid() END) WHERE id_new IS NULL;

-- Drop PK if present and recreate using id_new
ALTER TABLE spr_audit_logs DROP CONSTRAINT IF EXISTS spr_audit_logs_pkey;
ALTER TABLE spr_audit_logs DROP COLUMN IF EXISTS id;
ALTER TABLE spr_audit_logs RENAME COLUMN id_new TO id;
ALTER TABLE spr_audit_logs ALTER COLUMN id SET NOT NULL;
ALTER TABLE spr_audit_logs ADD PRIMARY KEY (id);

-- 2) spr_restricted_tokens: same pattern
ALTER TABLE IF EXISTS spr_restricted_tokens ADD COLUMN IF NOT EXISTS id_new UUID DEFAULT gen_random_uuid();
UPDATE spr_restricted_tokens SET id_new = (CASE WHEN id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN id::uuid ELSE gen_random_uuid() END) WHERE id_new IS NULL;
ALTER TABLE spr_restricted_tokens DROP CONSTRAINT IF EXISTS spr_restricted_tokens_pkey;
ALTER TABLE spr_restricted_tokens DROP COLUMN IF EXISTS id;
ALTER TABLE spr_restricted_tokens RENAME COLUMN id_new TO id;
ALTER TABLE spr_restricted_tokens ALTER COLUMN id SET NOT NULL;
ALTER TABLE spr_restricted_tokens ADD PRIMARY KEY (id);

COMMIT;

-- Note: If other tables reference these ids as foreign keys using text columns, those FKs must be adjusted separately.
-- This migration focuses on converting the primary key columns in-place. If your environment disallows dropping/renaming
-- columns because of live FK constraints, run a more elaborate migration that creates new tables and swaps them.
