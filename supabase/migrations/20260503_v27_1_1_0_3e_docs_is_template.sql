-- v27.1.1.0.3e — Bite Book templates.
-- A template is a doc that any guide can VIEW + reference for filling
-- their own trips. Original guide retains ownership for edit/archive/
-- delete; everyone else gets read-only access to:
--   1) the docs row,
--   2) its doc_field_mappings rows,
--   3) the underlying PDF in bb-private storage.

ALTER TABLE public.docs
  ADD COLUMN is_template boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS docs_is_template_idx
  ON public.docs (is_template) WHERE is_template = true;

COMMENT ON COLUMN public.docs.is_template IS
  'true = this doc is published as a Bite Book template visible to all authenticated guides. v27.1.1.0.3e.';

CREATE POLICY docs_template_select
  ON public.docs FOR SELECT
  USING (is_template = true);

CREATE POLICY dfm_template_select
  ON public.doc_field_mappings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM docs d
      WHERE d.id = doc_field_mappings.doc_id
        AND d.is_template = true
    )
  );

CREATE POLICY docs_template_select
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'docs'
    AND EXISTS (
      SELECT 1 FROM public.docs d
      WHERE d.file_path = objects.name
        AND d.is_template = true
    )
  );
