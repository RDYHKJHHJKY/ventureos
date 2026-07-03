-- db/schema-spr-self.sql
-- Database Schema for SPR Self-Integration and Trust Verification
-- Run this after your main schema.sql

-- Self-audit records table
CREATE TABLE IF NOT EXISTS self_audits (
  id SERIAL PRIMARY KEY,
  audit_date TIMESTAMP DEFAULT NOW(),
  audit_type VARCHAR(50) NOT NULL, -- 'code', 'performance', 'security', 'compliance', 'complete'
  status VARCHAR(20) NOT NULL, -- 'passed', 'warning', 'failed'
  trust_score_impact INTEGER CHECK (trust_score_impact >= 0 AND trust_score_impact <= 100),
  findings JSONB,
  evidence_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Platform credentials and certificates
CREATE TABLE IF NOT EXISTS platform_credentials (
  id SERIAL PRIMARY KEY,
  credential_type VARCHAR(50) NOT NULL, -- 'ssl', 'signing_key', 'api_key'
  credential_name VARCHAR(255),
  credential_value TEXT NOT NULL,
  issuer_id UUID,
  issue_date TIMESTAMP DEFAULT NOW(),
  expiration_date TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Trust chain records (self-verification chain)
CREATE TABLE IF NOT EXISTS trust_chain (
  id SERIAL PRIMARY KEY,
  entity_id UUID NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'platform', 'asset', 'vendor'
  entity_name VARCHAR(255),
  trust_score DECIMAL(5,2) CHECK (trust_score >= 0 AND trust_score <= 100),
  confidence DECIMAL(5,2) CHECK (confidence >= 0 AND confidence <= 100),
  evidence_count INTEGER DEFAULT 0,
  last_verified TIMESTAMP,
  verification_hash VARCHAR(256),
  chain_level INTEGER DEFAULT 0,
  parent_entity_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Compliance audit log
CREATE TABLE IF NOT EXISTS compliance_audits (
  id SERIAL PRIMARY KEY,
  audit_date TIMESTAMP DEFAULT NOW(),
  standard VARCHAR(50) NOT NULL, -- 'ISO27001', 'SOC2', 'GDPR', 'NIST'
  requirement_id VARCHAR(100),
  requirement_name VARCHAR(255),
  status VARCHAR(20) NOT NULL, -- 'compliant', 'non_compliant', 'partial', 'not_applicable'
  evidence JSONB,
  remediation_plan TEXT,
  remediation_deadline TIMESTAMP,
  remediation_status VARCHAR(20), -- 'pending', 'in_progress', 'completed'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Self-issued passports
CREATE TABLE IF NOT EXISTS platform_passports (
  id UUID PRIMARY KEY,
  passport_type VARCHAR(50) NOT NULL, -- 'platform_integrity', 'security_posture', 'compliance_status'
  version INTEGER DEFAULT 1,
  trust_score DECIMAL(5,2) CHECK (trust_score >= 0 AND trust_score <= 100),
  confidence DECIMAL(5,2) CHECK (confidence >= 0 AND confidence <= 100),
  issued_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  signature VARCHAR(1024), -- Cryptographic signature (RSA)
  signature_algorithm VARCHAR(50) DEFAULT 'RSA-SHA256',
  audit_trail JSONB,
  is_revoked BOOLEAN DEFAULT FALSE,
  revocation_reason TEXT,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Verification events (audit log of all verification activities)
CREATE TABLE IF NOT EXISTS verification_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL, -- 'badge_viewed', 'passport_verified', 'audit_completed', 'trust_queried'
  entity_id UUID,
  verified_by_entity_id UUID,
  verification_result VARCHAR(20) NOT NULL, -- 'verified', 'failed', 'pending', 'revoked'
  verification_method VARCHAR(100) NOT NULL, -- 'cryptographic', 'api', 'manual', 'automated'
  evidence JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trust score history (for trend analysis)
CREATE TABLE IF NOT EXISTS trust_score_history (
  id SERIAL PRIMARY KEY,
  entity_id UUID NOT NULL,
  entity_type VARCHAR(50),
  trust_score DECIMAL(5,2),
  confidence DECIMAL(5,2),
  score_components JSONB, -- Breakdown of score by component
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Evidence registry (all evidence used in trust calculations)
CREATE TABLE IF NOT EXISTS evidence_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  evidence_type VARCHAR(50) NOT NULL, -- 'code_scan', 'test_result', 'audit_report', 'certificate'
  evidence_source VARCHAR(255),
  evidence_data JSONB,
  confidence_score DECIMAL(5,2),
  is_verified BOOLEAN DEFAULT FALSE,
  verification_timestamp TIMESTAMP,
  expiration_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Badge embeddings (for public verification)
CREATE TABLE IF NOT EXISTS badge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  badge_type VARCHAR(50), -- 'trust_score', 'compliant', 'verified', 'secure'
  badge_code TEXT NOT NULL, -- SVG or HTML code
  badge_url TEXT,
  view_count INTEGER DEFAULT 0,
  last_viewed TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_self_audits_date ON self_audits(audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_self_audits_type ON self_audits(audit_type);
CREATE INDEX IF NOT EXISTS idx_passports_expiry ON platform_passports(expires_at);
CREATE INDEX IF NOT EXISTS idx_passports_revoked ON platform_passports(is_revoked);
CREATE INDEX IF NOT EXISTS idx_verification_entity ON verification_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_verification_date ON verification_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_chain_entity ON trust_chain(entity_id);
CREATE INDEX IF NOT EXISTS idx_trust_chain_parent ON trust_chain(parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_compliance_standard ON compliance_audits(standard);
CREATE INDEX IF NOT EXISTS idx_compliance_date ON compliance_audits(audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence_registry(entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence_registry(evidence_type);
CREATE INDEX IF NOT EXISTS idx_trust_history_entity ON trust_score_history(entity_id);
CREATE INDEX IF NOT EXISTS idx_trust_history_date ON trust_score_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_badge_entity ON badge_embeddings(entity_id);

-- Create a view for current platform trust status
CREATE OR REPLACE VIEW platform_trust_status AS
SELECT 
  'VentureOS Platform' as entity_name,
  (SELECT trust_score_impact FROM self_audits 
   WHERE audit_type = 'complete' 
   ORDER BY audit_date DESC LIMIT 1) as current_trust_score,
  (SELECT COUNT(*) FROM self_audits 
   WHERE audit_date > NOW() - INTERVAL '30 days') as audits_last_30_days,
  (SELECT COUNT(*) FROM platform_passports 
   WHERE is_revoked = FALSE 
   AND expires_at > NOW()) as active_passports,
  NOW() as last_updated;

-- Create a view for compliance status summary
CREATE OR REPLACE VIEW compliance_status_summary AS
SELECT 
  standard,
  COUNT(*) as total_requirements,
  COUNT(*) FILTER (WHERE status = 'compliant') as compliant_count,
  ROUND(COUNT(*) FILTER (WHERE status = 'compliant')::numeric / COUNT(*) * 100, 2) as compliance_percentage,
  MAX(audit_date) as last_audit_date
FROM compliance_audits
WHERE audit_date > NOW() - INTERVAL '90 days'
GROUP BY standard;

-- Comments for documentation
COMMENT ON TABLE self_audits IS 'Records of automated platform self-audits for code quality, performance, security, and compliance';
COMMENT ON TABLE platform_credentials IS 'Storage for platform cryptographic credentials and certificates';
COMMENT ON TABLE trust_chain IS 'Tracks the chain of trust for entities verified by the platform';
COMMENT ON TABLE compliance_audits IS 'Compliance audit results against various standards (ISO, SOC2, GDPR, NIST)';
COMMENT ON TABLE platform_passports IS 'Self-issued, cryptographically signed platform trust passports';
COMMENT ON TABLE verification_events IS 'Immutable audit log of all verification activities';
COMMENT ON TABLE evidence_registry IS 'Registry of all evidence used in trust calculations';
COMMENT ON TABLE badge_embeddings IS 'Public verification badges that can be embedded on websites';
