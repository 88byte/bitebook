-- v27.3.8.1 item 2a - allow 'blank' as a third dropdown option for
-- 2nd+ species rows. The guide deliberately wants the field empty
-- on the generated PDF (e.g. multi-species combo permits where the
-- 2nd species's tag # column should stay blank).
ALTER TABLE harvest_log_entry_species
  DROP CONSTRAINT IF EXISTS harvest_log_entry_species_tag_identifier_mode_check;
ALTER TABLE harvest_log_entry_species
  ADD CONSTRAINT harvest_log_entry_species_tag_identifier_mode_check
    CHECK (tag_identifier_mode IS NULL OR tag_identifier_mode IN ('same', 'manual', 'blank'));
ALTER TABLE harvest_log_entry_species
  DROP CONSTRAINT IF EXISTS harvest_log_entry_species_report_card_identifier_mode_check;
ALTER TABLE harvest_log_entry_species
  ADD CONSTRAINT harvest_log_entry_species_report_card_identifier_mode_check
    CHECK (report_card_identifier_mode IS NULL OR report_card_identifier_mode IN ('same', 'manual', 'blank'));
