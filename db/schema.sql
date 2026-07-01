-- VentureOS PostgreSQL Database Schema
-- Production-ready schema with authentication, workspaces, and multi-tenant support
-- Deploy with: psql $DATABASE_URL -f db/schema.sql

-- ============================================================================
-- Users & Authentication
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- Workspaces & Memberships
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) DEFAULT 'starter',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- ============================================================================
-- Sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================================================
-- Assets & Analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS assets (
  id text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  canonical_url text not null,
  type text not null,
  company text,
  industry text,
  domains jsonb not null default '[]',
  repos jsonb not null default '[]',
  packages jsonb not null default '[]',
  latest_trust_score integer not null default 0,
  latest_confidence_score integer not null default 0,
  risk text not null default 'Unscanned',
  passport_status text not null default 'None',
  monitoring_status text not null default 'Off',
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  UNIQUE (workspace_id, canonical_url)
);

create table scan_runs (
  id text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  asset_id text not null references assets(id) on delete cascade,
  created_by uuid,
  status text not null,
  trust_score integer not null,
  confidence_score integer not null,
  verdict text not null,
  risk text not null,
  scores jsonb not null,
  explanation text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table scan_findings (
  id text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  scan_run_id text not null references scan_runs(id) on delete cascade,
  asset_id text not null references assets(id) on delete cascade,
  severity text not null,
  title text not null,
  detail text not null,
  engine text not null,
  created_at timestamptz not null default now()
);

create table evidence_items (
  id text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  scan_run_id text not null references scan_runs(id) on delete cascade,
  asset_id text not null references assets(id) on delete cascade,
  label text not null,
  value text not null,
  status text not null,
  source text,
  created_at timestamptz not null default now()
);

create table passports (
  id text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  asset_id text not null references assets(id) on delete cascade,
  scan_run_id text references scan_runs(id) on delete set null,
  asset_name text not null,
  company text,
  version integer not null,
  trust_score integer not null,
  confidence_score integer not null,
  verdict text not null,
  status text not null,
  is_public boolean not null default false,
  revoked boolean not null default false,
  revoked_at timestamptz,
  issued_at date not null,
  expires_at date not null,
  evidence_summary text not null,
  badge_embed text not null,
  public_url text not null,
  issued_by uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_assets_updated_at on assets(updated_at desc);
create index idx_scan_runs_asset_id on scan_runs(asset_id);
create index idx_scan_findings_scan_run_id on scan_findings(scan_run_id);
create index idx_evidence_items_scan_run_id on evidence_items(scan_run_id);
create index idx_passports_asset_id on passports(asset_id);
create index idx_scan_runs_workspace_id on scan_runs(workspace_id);
create index idx_passports_workspace_id on passports(workspace_id);

CREATE TABLE IF NOT EXISTS spr_vendors (
  id text PRIMARY KEY,
  name text NOT NULL,
  domain text,
  email text,
  country text,
  compliance_claims jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spr_software (
  id text PRIMARY KEY,
  name text NOT NULL,
  vendor_id text,
  repository_url text,
  package_name text,
  version text,
  ecosystem text,
  identity_verification jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spr_evidence (
  id text PRIMARY KEY,
  software_id text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  summary text,
  source text,
  uri text,
  strength numeric,
  freshness_days integer,
  verified boolean DEFAULT false,
  visibility text NOT NULL DEFAULT 'public',
  access_token text,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  vendor_id text,
  trust_score numeric,
  numeric_signals jsonb,
  payload text,
  mime_type text,
  verification_method text,
  verification_status text,
  verification_details text,
  bundle jsonb,
  zk_proof jsonb,
  scanned_at timestamptz,
  evidence_age_days integer,
  freshness_score numeric,
  is_stale boolean DEFAULT false,
  is_low_activity boolean DEFAULT false,
  is_unmaintained boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spr_signals (
  id text PRIMARY KEY,
  software_id text NOT NULL,
  type text NOT NULL,
  severity text,
  summary text,
  source text,
  numeric_signals jsonb,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  vendor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spr_passports (
  id text PRIMARY KEY,
  software_id text,
  vendor_id text,
  software_name text,
  vendor_name text,
  visibility text NOT NULL DEFAULT 'public',
  access_token text,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  scoring_profile text,
  evidence_ids jsonb,
  trust_graph_hash text,
  evidence_freshness_hash text,
  evidence_bundle_hash text,
  evidence_summary text,
  passport_envelope_version integer DEFAULT 1,
  trust_score numeric,
  confidence_score numeric,
  verdict text,
  risk_category text,
  status text,
  issued_at date,
  expires_at date,
  issued_by text,
  passport_envelope_hash text,
  trust_score_hash text,
  version integer NOT NULL DEFAULT 1,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spr_vendors_name ON spr_vendors(name);
CREATE INDEX IF NOT EXISTS idx_spr_software_vendor_id ON spr_software(vendor_id);
CREATE INDEX IF NOT EXISTS idx_spr_evidence_software_id ON spr_evidence(software_id);
CREATE INDEX IF NOT EXISTS idx_spr_evidence_workspace_id ON spr_evidence(workspace_id);
CREATE INDEX IF NOT EXISTS idx_spr_signals_software_id ON spr_signals(software_id);
CREATE INDEX IF NOT EXISTS idx_spr_passports_software_id ON spr_passports(software_id);
CREATE INDEX IF NOT EXISTS idx_spr_passports_workspace_id ON spr_passports(workspace_id);

CREATE TABLE IF NOT EXISTS spr_audit_logs (
  id text PRIMARY KEY,
  type text NOT NULL,
  target_id text,
  payload jsonb NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  payload_hash text NOT NULL,
  previous_audit_hash text,
  audit_hash text NOT NULL,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_spr_audit_logs_target_id ON spr_audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_spr_audit_logs_workspace_id ON spr_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_spr_audit_logs_created_at ON spr_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS spr_restricted_tokens (
  id text PRIMARY KEY,
  token text UNIQUE NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  project_id text,
  evidence_type text,
  ttl_days integer NOT NULL,
  issued_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spr_restricted_tokens_token ON spr_restricted_tokens(token);
CREATE INDEX IF NOT EXISTS idx_spr_restricted_tokens_workspace_id ON spr_restricted_tokens(workspace_id);

