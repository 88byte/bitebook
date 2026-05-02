-- v27.1.1.0.3c.2 — auto-mirror Hunter 1 mappings across slots 2..N.
-- When a guide maps a slot-1 field, sibling fields that share the same
-- base name (after stripping the slot pattern) get their data_source_path
-- mirrored automatically. is_override=true breaks the mirror so the guide
-- can pick a different source for that specific slot.

ALTER TABLE public.doc_field_mappings
ADD COLUMN is_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.doc_field_mappings.is_override IS
  'true = guide explicitly broke this slot away from auto-mirroring its slot-1 sibling. v27.1.1.0.3c.2.';
