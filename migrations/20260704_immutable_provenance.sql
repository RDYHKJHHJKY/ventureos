-- Blocks ANY mutation to provenance fields after creation
CREATE OR REPLACE FUNCTION prevent_provenance_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.provenance_hash IS DISTINCT FROM NEW.provenance_hash THEN
    RAISE EXCEPTION 'FATAL: provenance_hash is immutable and cannot be modified after creation. incident_id=%', gen_random_uuid();
  END IF;

  IF OLD.discovered_by IS DISTINCT FROM NEW.discovered_by THEN
    RAISE EXCEPTION 'FATAL: discovered_by is immutable and cannot be modified after creation.';
  END IF;

  IF OLD.source_url IS DISTINCT FROM NEW.source_url THEN
    RAISE EXCEPTION 'FATAL: source_url is immutable and cannot be modified after creation.';
  END IF;

  IF OLD.canonical_snapshot IS DISTINCT FROM NEW.canonical_snapshot THEN
    RAISE EXCEPTION 'FATAL: canonical_snapshot is immutable and cannot be modified after creation.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_provenance ON evidence_items;
CREATE TRIGGER trg_immutable_provenance
  BEFORE UPDATE ON evidence_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_provenance_mutation();

DROP TRIGGER IF EXISTS trg_immutable_provenance_software ON spr_software;
CREATE TRIGGER trg_immutable_provenance_software
  BEFORE UPDATE ON spr_software
  FOR EACH ROW
  EXECUTE FUNCTION prevent_provenance_mutation();

DROP TRIGGER IF EXISTS trg_immutable_provenance_vendors ON spr_vendors;
CREATE TRIGGER trg_immutable_provenance_vendors
  BEFORE UPDATE ON spr_vendors
  FOR EACH ROW
  EXECUTE FUNCTION prevent_provenance_mutation();
