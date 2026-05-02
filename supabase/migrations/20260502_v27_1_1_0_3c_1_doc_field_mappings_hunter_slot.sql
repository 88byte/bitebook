-- v27.1.1.0.3c.1 — manual hunter slot picker on doc_field_mappings.
-- Auto-detect via parseFieldName regex (hunter1_*, h1_*, row1_*, _N suffix)
-- only catches PDFs that follow those naming conventions. State forms
-- with arbitrary field names need a manual override. hunter_slot lets
-- the wizard explicitly assign a field to a hunter slot.
--
-- Resolution rule:
--   hunter_slot > 0  → engine uses that slot
--   hunter_slot = 0  → engine falls back to parseFieldName(name)
-- 0 is a sentinel for "use regex". This preserves the auto-detect path
-- for PDFs that already follow the conventions while letting guides
-- override on the rest.

ALTER TABLE public.doc_field_mappings
ADD COLUMN hunter_slot smallint NOT NULL DEFAULT 0
  CHECK (hunter_slot >= 0 AND hunter_slot <= 99);

COMMENT ON COLUMN public.doc_field_mappings.hunter_slot IS
  'Manual slot override. 0 = auto-detect via field-name regex; 1..99 = explicit hunter slot. v27.1.1.0.3c.1.';
