-- v27.1.0 — Documents Module
-- Spec: 2026-04-29-documents-module-spec.md
-- Three doc kinds (waiver / log / resource) share upload, attach, and visibility infrastructure.
-- The differences live in per-kind mapping behavior. v27.1.0 ships schema + storage RLS only;
-- mapping wizards land in v27.1.1+.

------------------------------------------------------------
-- 1. Enums
------------------------------------------------------------

CREATE TYPE public.doc_kind AS ENUM ('waiver', 'log', 'resource');
CREATE TYPE public.doc_action_type AS ENUM ('sign', 'fill', 'view');
CREATE TYPE public.doc_mapping_kind AS ENUM ('field', 'signature');

------------------------------------------------------------
-- 2. docs — guide-owned library
------------------------------------------------------------

CREATE TABLE public.docs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind                public.doc_kind NOT NULL,
  label               text NOT NULL,
  state               text,
  file_path           text NOT NULL,
  file_mime           text NOT NULL,
  form_template_hash  text,
  mapping_status      text NOT NULL DEFAULT 'unmapped'
    CHECK (mapping_status IN ('unmapped', 'partial', 'complete', 'not_applicable')),
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_docs_guide_kind ON public.docs(guide_id, kind);
CREATE INDEX idx_docs_active     ON public.docs(guide_id) WHERE archived_at IS NULL;

ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY docs_guide_self_all ON public.docs
  FOR ALL TO authenticated
  USING (guide_id = auth.uid())
  WITH CHECK (guide_id = auth.uid());

-- Hunter read path activated below once trip_docs exists.

------------------------------------------------------------
-- 3. trip_docs — many-to-many with per-attachment hunter_visible
------------------------------------------------------------

CREATE TABLE public.trip_docs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  doc_id          uuid NOT NULL REFERENCES public.docs(id)  ON DELETE CASCADE,
  hunter_visible  boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, doc_id)
);

CREATE INDEX idx_trip_docs_trip ON public.trip_docs(trip_id);
CREATE INDEX idx_trip_docs_doc  ON public.trip_docs(doc_id);

ALTER TABLE public.trip_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_docs_guide_all ON public.trip_docs
  FOR ALL TO authenticated
  USING (public._is_trip_owner(trip_id, auth.uid()))
  WITH CHECK (public._is_trip_owner(trip_id, auth.uid()));

CREATE POLICY trip_docs_hunter_select ON public.trip_docs
  FOR SELECT TO authenticated
  USING (
    hunter_visible = true
    AND public._is_trip_participant(trip_id, auth.uid())
  );

-- Now that trip_docs exists, add the hunter-read path on docs.
CREATE POLICY docs_hunter_select_via_trip ON public.docs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trip_docs td
      WHERE td.doc_id = docs.id
        AND td.hunter_visible = true
        AND public._is_trip_participant(td.trip_id, auth.uid())
    )
  );

------------------------------------------------------------
-- 4. trip_doc_hunter_actions — per-hunter assignment + completion
------------------------------------------------------------

CREATE TABLE public.trip_doc_hunter_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_doc_id     uuid NOT NULL REFERENCES public.trip_docs(id) ON DELETE CASCADE,
  hunter_id       uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  action_type     public.doc_action_type NOT NULL,
  required        boolean NOT NULL DEFAULT true,
  completed_at    timestamptz,
  completed_data  jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_doc_id, hunter_id, action_type)
);

CREATE INDEX idx_tdha_trip_doc       ON public.trip_doc_hunter_actions(trip_doc_id);
CREATE INDEX idx_tdha_hunter_pending ON public.trip_doc_hunter_actions(hunter_id, completed_at)
  WHERE completed_at IS NULL;

ALTER TABLE public.trip_doc_hunter_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tdha_guide_all ON public.trip_doc_hunter_actions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_docs td
      WHERE td.id = trip_doc_hunter_actions.trip_doc_id
        AND public._is_trip_owner(td.trip_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trip_docs td
      WHERE td.id = trip_doc_hunter_actions.trip_doc_id
        AND public._is_trip_owner(td.trip_id, auth.uid())
    )
  );

CREATE POLICY tdha_hunter_self_select ON public.trip_doc_hunter_actions
  FOR SELECT TO authenticated
  USING (hunter_id = auth.uid());

CREATE POLICY tdha_hunter_self_update ON public.trip_doc_hunter_actions
  FOR UPDATE TO authenticated
  USING (hunter_id = auth.uid())
  WITH CHECK (hunter_id = auth.uid());

------------------------------------------------------------
-- 5. doc_field_mappings — unified field + signature mappings
-- Per-guide private (mapping ownership locked, see sequencing §7.4).
------------------------------------------------------------

CREATE TABLE public.doc_field_mappings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id            uuid NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  mapping_kind      public.doc_mapping_kind NOT NULL,
  field_name        text NOT NULL,
  data_source_path  text,
  signature_role    text CHECK (signature_role IS NULL OR signature_role IN ('hunter', 'guide')),
  page_index        int,
  bbox              jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_id, field_name, mapping_kind)
);

CREATE INDEX idx_dfm_doc ON public.doc_field_mappings(doc_id);

ALTER TABLE public.doc_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY dfm_doc_owner_all ON public.doc_field_mappings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.docs d
      WHERE d.id = doc_field_mappings.doc_id
        AND d.guide_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.docs d
      WHERE d.id = doc_field_mappings.doc_id
        AND d.guide_id = auth.uid()
    )
  );

CREATE POLICY dfm_hunter_select ON public.doc_field_mappings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.docs d
      JOIN public.trip_docs td ON td.doc_id = d.id
      WHERE d.id = doc_field_mappings.doc_id
        AND td.hunter_visible = true
        AND public._is_trip_participant(td.trip_id, auth.uid())
    )
  );

------------------------------------------------------------
-- 6. updated_at triggers
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._docs_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_docs_updated_at
  BEFORE UPDATE ON public.docs
  FOR EACH ROW EXECUTE FUNCTION public._docs_set_updated_at();

CREATE TRIGGER trg_dfm_updated_at
  BEFORE UPDATE ON public.doc_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public._docs_set_updated_at();

------------------------------------------------------------
-- 7. Storage RLS — docs/{guide_id}/... prefix in bb-private
-- Mirrors the wallet/{user_id}/... pattern from v27.0a.15.
------------------------------------------------------------

CREATE POLICY docs_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'docs'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );

CREATE POLICY docs_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'docs'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );

CREATE POLICY docs_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'docs'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );

CREATE POLICY docs_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'docs'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );

-- Hunter read path on storage: doc must be attached to a trip the hunter
-- participates in AND the attachment must be hunter-visible.
CREATE POLICY docs_hunter_select_via_trip ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'docs'
    AND EXISTS (
      SELECT 1
      FROM public.docs d
      JOIN public.trip_docs td ON td.doc_id = d.id
      WHERE d.file_path = storage.objects.name
        AND td.hunter_visible = true
        AND public._is_trip_participant(td.trip_id, auth.uid())
    )
  );
