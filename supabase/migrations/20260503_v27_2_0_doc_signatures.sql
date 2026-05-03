-- v27.2.0 -- e-signature engine foundation.
--
-- doc_signatures captures every signing event: which trip-doc action
-- (or generated log) was signed, by whom, with what signature image
-- (PNG data URL or SVG path), when, and the IP/UA at the time. The
-- table is append-only -- corrections are new rows, not edits -- so
-- the audit trail stays honest.

CREATE TABLE IF NOT EXISTS public.doc_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_doc_hunter_action_id uuid NULL
    REFERENCES public.trip_doc_hunter_actions(id) ON DELETE CASCADE,
  trip_generated_log_id uuid NULL
    REFERENCES public.trip_generated_logs(id) ON DELETE CASCADE,
  signer_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  signature_field_index integer NULL,
  signature_data text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text NULL,
  user_agent text NULL,
  CONSTRAINT doc_signatures_anchor_xor CHECK (
    (trip_doc_hunter_action_id IS NULL) <> (trip_generated_log_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS doc_signatures_action_idx
  ON public.doc_signatures(trip_doc_hunter_action_id)
  WHERE trip_doc_hunter_action_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_signatures_log_idx
  ON public.doc_signatures(trip_generated_log_id)
  WHERE trip_generated_log_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_signatures_signer_idx
  ON public.doc_signatures(signer_id);

ALTER TABLE public.doc_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_signatures_signer_self_select ON public.doc_signatures
  FOR SELECT TO authenticated
  USING (signer_id = (SELECT auth.uid()));
CREATE POLICY doc_signatures_signer_self_insert ON public.doc_signatures
  FOR INSERT TO authenticated
  WITH CHECK (signer_id = (SELECT auth.uid()));

CREATE POLICY doc_signatures_trip_owner_select ON public.doc_signatures
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trip_doc_hunter_actions a
      JOIN public.trip_docs td ON td.id = a.trip_doc_id
      WHERE a.id = doc_signatures.trip_doc_hunter_action_id
        AND public._is_trip_owner(td.trip_id, (SELECT auth.uid()))
    )
    OR EXISTS (
      SELECT 1
      FROM public.trip_generated_logs g
      WHERE g.id = doc_signatures.trip_generated_log_id
        AND public._is_trip_owner(g.trip_id, (SELECT auth.uid()))
    )
  );
