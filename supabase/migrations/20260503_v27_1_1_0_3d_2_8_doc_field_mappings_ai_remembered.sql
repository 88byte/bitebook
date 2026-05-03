-- v27.1.1.0.3d.2.8 — remember the AI's original suggestion alongside
-- the guide's manual edits so the wizard can offer a "Use AI suggestion"
-- restore affordance without re-running AI over the whole form.
--
-- ai_suggested_path / ai_suggested_slot are SET when suggestMappingsAction
-- inserts a row. They stay UNTOUCHED on subsequent guide saves so manual
-- overrides don't lose the memory of what AI proposed. is_ai_suggested
-- still flips false on first save (the badge clears), but the original
-- suggestion is preserved in these two columns for one-tap restore.

ALTER TABLE public.doc_field_mappings
  ADD COLUMN ai_suggested_path text,
  ADD COLUMN ai_suggested_slot smallint;

UPDATE public.doc_field_mappings
   SET ai_suggested_path = data_source_path,
       ai_suggested_slot = hunter_slot
 WHERE is_ai_suggested = true;

COMMENT ON COLUMN public.doc_field_mappings.ai_suggested_path IS
  'AI''s original data_source_path suggestion. Preserved on guide edits so the wizard can offer a one-tap restore. v27.1.1.0.3d.2.8.';
COMMENT ON COLUMN public.doc_field_mappings.ai_suggested_slot IS
  'AI''s original hunter_slot suggestion. Same lifecycle as ai_suggested_path. v27.1.1.0.3d.2.8.';
