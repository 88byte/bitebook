-- v27.3.7.2 item 1 (Option C) - manual per-species tag # override.
-- Real-world: hunter takes multiple species in one trip, each species
-- needs its own tag (e.g. CDFW issues different tags per species).
-- Current model is one linked tag per hunter per trip via
-- harvest_log_entries.tag_wallet_item_id, which only fills the FIRST
-- species's tag # in the generated PDF. Adding tag_identifier (TEXT
-- nullable) to the species row lets the guide type a per-row tag
-- number that the fill engine resolves via
-- harvest_log_entry_species[N].tag_identifier. Multi-tag wallet
-- linking (Option A) is the long-term fix and ships in a follow-up.
ALTER TABLE harvest_log_entry_species
  ADD COLUMN tag_identifier TEXT;
COMMENT ON COLUMN harvest_log_entry_species.tag_identifier IS
  'Per-species tag number override. Free text. Used when a hunter takes multiple species on one trip and the entry-level tag_wallet_item_id only covers one. v27.3.7.2.';
