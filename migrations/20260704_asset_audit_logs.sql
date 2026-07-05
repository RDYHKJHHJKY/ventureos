CREATE TABLE IF NOT EXISTS asset_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  changed_by VARCHAR(255) NOT NULL,
  change_reason TEXT NOT NULL,
  provenance_hash VARCHAR(64) NOT NULL,
  session_id UUID
);

CREATE INDEX IF NOT EXISTS idx_audit_record ON asset_audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON asset_audit_logs(changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_changed_by ON asset_audit_logs(changed_by);

CREATE OR REPLACE FUNCTION log_status_delta()
RETURNS TRIGGER AS $$
DECLARE
  col_name TEXT;
  old_val JSONB;
  new_val JSONB;
  reason TEXT;
  prov_hash VARCHAR(64);
BEGIN
  reason := COALESCE(current_setting('app.change_reason', true), 'System update');
  prov_hash := COALESCE(NEW.provenance_hash, 'no-hash');

  FOR col_name IN
    SELECT unnest(ARRAY['status', 'legal_badge_status', 'security_scan_status', 'is_deleted'])
  LOOP
    EXECUTE format('SELECT to_jsonb($1.%I), to_jsonb($2.%I)', col_name, col_name)
    INTO old_val, new_val
    USING OLD, NEW;

    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO asset_audit_logs (
        table_name, record_id, field_name, old_value, new_value,
        changed_by, change_reason, provenance_hash
      ) VALUES (
        TG_TABLE_NAME,
        NEW.id,
        col_name,
        old_val,
        new_val,
        COALESCE(current_setting('app.changed_by', true), 'system'),
        reason,
        prov_hash
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_evidence ON evidence_items;
CREATE TRIGGER trg_audit_evidence
  AFTER UPDATE ON evidence_items
  FOR EACH ROW
  EXECUTE FUNCTION log_status_delta();

DROP TRIGGER IF EXISTS trg_audit_software ON spr_software;
CREATE TRIGGER trg_audit_software
  AFTER UPDATE ON spr_software
  FOR EACH ROW
  EXECUTE FUNCTION log_status_delta();

DROP TRIGGER IF EXISTS trg_audit_vendors ON spr_vendors;
CREATE TRIGGER trg_audit_vendors
  AFTER UPDATE ON spr_vendors
  FOR EACH ROW
  EXECUTE FUNCTION log_status_delta();
