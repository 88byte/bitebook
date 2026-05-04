-- v27.3.9 - "Fill during log entry" mapping option.
-- A guide can map any PDF form field to source = 'user_input.log_time'.
-- The harvest log UI then surfaces a per-hunter input for that field
-- (labeled with the user_label) above "Total hours" on the entry
-- accordion. At fill time the engine pulls the value from
-- harvest_log_entry_user_inputs[entry_id, mapping_field_name].

ALTER TABLE doc_field_mappings
  ADD COLUMN user_label TEXT;
COMMENT ON COLUMN doc_field_mappings.user_label IS
  'User-facing label rendered on the harvest log entry row when data_source_path = user_input.log_time. AI-rewritten plain-English version of the PDF field name. v27.3.9.';

CREATE TABLE harvest_log_entry_user_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES harvest_log_entries(id) ON DELETE CASCADE,
  mapping_field_name TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, mapping_field_name)
);
CREATE INDEX harvest_log_entry_user_inputs_entry_id_idx
  ON harvest_log_entry_user_inputs (entry_id);
COMMENT ON TABLE harvest_log_entry_user_inputs IS
  'v27.3.9 - per-entry values for fields the guide marked "Filled at log time" in the doc field mapping. mapping_field_name = doc_field_mappings.field_name on the doc the trip generates against.';

ALTER TABLE harvest_log_entry_user_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY harvest_log_entry_user_inputs_guide_all
  ON harvest_log_entry_user_inputs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM harvest_log_entries e
      JOIN harvest_logs l ON l.id = e.log_id
      JOIN trips t ON t.id = l.trip_id
      WHERE e.id = harvest_log_entry_user_inputs.entry_id
        AND t.guide_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM harvest_log_entries e
      JOIN harvest_logs l ON l.id = e.log_id
      JOIN trips t ON t.id = l.trip_id
      WHERE e.id = harvest_log_entry_user_inputs.entry_id
        AND t.guide_id = auth.uid()
    )
  );

CREATE POLICY harvest_log_entry_user_inputs_hunter_select
  ON harvest_log_entry_user_inputs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM harvest_log_entries e
      WHERE e.id = harvest_log_entry_user_inputs.entry_id
        AND e.hunter_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION set_updated_at_harvest_log_entry_user_inputs()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER harvest_log_entry_user_inputs_updated_at
  BEFORE UPDATE ON harvest_log_entry_user_inputs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_harvest_log_entry_user_inputs();
