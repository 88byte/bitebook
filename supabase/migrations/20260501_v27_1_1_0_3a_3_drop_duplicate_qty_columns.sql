-- v27.1.1.0.3a.3 — qty consolidation.
-- Entry-level qty fields duplicated species-row qty fields, so the entry-
-- level qtys lose meaning the moment a hunter has any species rows. Drop
-- them. State PDFs that need a single entry-total derive it as a SUM
-- across the entry's species rows.
-- Also drop species_rows.qty_kept since per Flavio "kept and harvested
-- are the same" — what's harvested IS what's kept; releases are the
-- distinct count.

ALTER TABLE public.harvest_log_entries
  DROP COLUMN qty_harvested,
  DROP COLUMN qty_kept,
  DROP COLUMN qty_released;

ALTER TABLE public.harvest_log_entry_species
  DROP COLUMN qty_kept;
