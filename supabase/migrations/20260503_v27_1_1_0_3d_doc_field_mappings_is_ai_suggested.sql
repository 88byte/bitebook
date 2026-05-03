-- v27.1.1.0.3d — AI-suggested mappings tracker.
-- Set true when suggestMappingsAction inserts a row from Claude's
-- output. Cleared to false when the guide saves an explicit choice
-- (confirmation or edit) so the wizard knows whether to render the
-- "AI suggestion" badge.

ALTER TABLE public.doc_field_mappings
ADD COLUMN is_ai_suggested boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.doc_field_mappings.is_ai_suggested IS
  'true = row was inserted by suggestMappingsAction (Claude Haiku 4.5) and not yet confirmed/edited by the guide. v27.1.1.0.3d.';
