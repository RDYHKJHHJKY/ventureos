-- VentureOS SPR Audit Logs and Access Control Migration
-- Migration ID: 002
-- Description: Create detailed SPR audit logs table and access control tables with full audit chain support
-- Run after: 001_initial_schema.sql

-- ============================================================================
-- SPR Audit Logs - Enhanced with full audit chain
-- ============================================================================

-- Drop and recreate with correct schema
DROP TABLE IF EXISTS spr_audit_logs CASCADE;

CREATE TABLE spr_audit_logs (
  id text PRIMARY KEY,
  type text NOT NULL,
  target_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  payload_hash text,
  previous_audit_hash text,
  audit_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spr_audit_logs_type ON spr_audit_logs(type);
CREATE INDEX IF NOT EXISTS idx_spr_audit_logs_target_id ON spr_audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_spr_audit_logs_workspace_id ON spr_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_spr_audit_logs_created_at ON spr_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spr_audit_logs_audit_hash ON spr_audit_logs(audit_hash);

-- ============================================================================
-- SPR Access Control - Restricted tokens for controlled evidence access
-- ============================================================================

CREATE TABLE IF NOT EXISTS spr_restricted_tokens (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id text,
  evidence_type text,
  ttl_days integer DEFAULT 90,
  issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spr_restricted_tokens_token ON spr_restricted_tokens(token);
CREATE INDEX IF NOT EXISTS idx_spr_restricted_tokens_workspace_id ON spr_restricted_tokens(workspace_id);
CREATE INDEX IF NOT EXISTS idx_spr_restricted_tokens_expires_at ON spr_restricted_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_spr_restricted_tokens_issued_by ON spr_restricted_tokens(issued_by);
