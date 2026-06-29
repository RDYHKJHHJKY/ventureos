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
  name text not null,
  canonical_url text not null unique,
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
  updated_at timestamptz not null default now()
);

create table scan_runs (
  id text primary key,
  asset_id text not null references assets(id) on delete cascade,
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
  asset_id text not null references assets(id) on delete cascade,
  scan_run_id text references scan_runs(id) on delete set null,
  asset_name text not null,
  company text,
  version text not null,
  trust_score integer not null,
  confidence_score integer not null,
  verdict text not null,
  status text not null,
  issued_at date not null,
  expires_at date not null,
  evidence_summary text not null,
  badge_embed text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

create index idx_assets_updated_at on assets(updated_at desc);
create index idx_scan_runs_asset_id on scan_runs(asset_id);
create index idx_scan_findings_scan_run_id on scan_findings(scan_run_id);
create index idx_evidence_items_scan_run_id on evidence_items(scan_run_id);
create index idx_passports_asset_id on passports(asset_id);

