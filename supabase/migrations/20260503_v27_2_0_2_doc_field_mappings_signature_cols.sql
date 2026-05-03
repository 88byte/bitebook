-- v27.2.0.2: signature-placement columns on doc_field_mappings.
--
-- placement_coords : { x, y, w, h, page } in PDF points + 0-indexed
--                    page number for mapping_kind='signature' rows.
--                    NULL for non-signature mappings AND for any
--                    signature mapping that hasn't been placed via
--                    the v27.2.0.3 wizard yet -- the engine falls
--                    back to a default placement when NULL.
--
-- signature_role (pre-existing column) gets a CHECK constraint added
-- so it can only be 'hunter' or 'guide' (or NULL for non-signature
-- rows).
ALTER TABLE public.doc_field_mappings
  ADD COLUMN IF NOT EXISTS placement_coords jsonb NULL;

ALTER TABLE public.doc_field_mappings
  DROP CONSTRAINT IF EXISTS doc_field_mappings_signature_role_chk;
ALTER TABLE public.doc_field_mappings
  ADD  CONSTRAINT doc_field_mappings_signature_role_chk
       CHECK (signature_role IS NULL OR signature_role IN ('hunter', 'guide'));
