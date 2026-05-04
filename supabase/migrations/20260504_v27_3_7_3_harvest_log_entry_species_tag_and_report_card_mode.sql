-- v27.3.7.3 - 2nd-species mandatory dropdown for Tag # and Report Card #.
-- Pattern: 2nd+ species rows force a choice between
--   'same' = inherit from species[0] / entry-linked wallet item
--   'manual' = type a free-text override
-- 1st species (index 0) keeps the existing auto-fill behavior; this
-- column is null/'same' there.
ALTER TABLE harvest_log_entry_species
  ADD COLUMN tag_identifier_mode TEXT
    CHECK (tag_identifier_mode IS NULL OR tag_identifier_mode IN ('same', 'manual'));
ALTER TABLE harvest_log_entry_species
  ADD COLUMN report_card_identifier TEXT;
ALTER TABLE harvest_log_entry_species
  ADD COLUMN report_card_identifier_mode TEXT
    CHECK (report_card_identifier_mode IS NULL OR report_card_identifier_mode IN ('same', 'manual'));
COMMENT ON COLUMN harvest_log_entry_species.tag_identifier_mode IS
  'Per-row mode for tag_identifier on 2nd+ species rows. same=inherit from species[0]/entry; manual=use tag_identifier text. Null on 1st row (auto-fills). v27.3.7.3.';
COMMENT ON COLUMN harvest_log_entry_species.report_card_identifier IS
  'Per-species harvest report card # override. Mirrors tag_identifier. Used when mode=manual. v27.3.7.3.';
COMMENT ON COLUMN harvest_log_entry_species.report_card_identifier_mode IS
  'Per-row mode for report_card_identifier on 2nd+ species rows. v27.3.7.3.';
