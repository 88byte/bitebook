-- v27.2.0.3: trip_doc_id anchor on doc_signatures for guide-side
-- waiver signing. Hunter sigs anchor on trip_doc_hunter_action_id
-- (per-hunter); guide sigs anchor on trip_doc_id (per-trip-doc).
ALTER TABLE public.doc_signatures
  ADD COLUMN IF NOT EXISTS trip_doc_id uuid NULL
    REFERENCES public.trip_docs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS doc_signatures_trip_doc_idx
  ON public.doc_signatures(trip_doc_id)
  WHERE trip_doc_id IS NOT NULL;

ALTER TABLE public.doc_signatures
  DROP CONSTRAINT IF EXISTS doc_signatures_anchor_xor;
ALTER TABLE public.doc_signatures
  ADD CONSTRAINT doc_signatures_anchor_xor CHECK (
    (CASE WHEN trip_doc_hunter_action_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN trip_generated_log_id     IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN trip_doc_id               IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

DROP POLICY IF EXISTS doc_signatures_trip_owner_select ON public.doc_signatures;
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
    OR EXISTS (
      SELECT 1
      FROM public.trip_docs td2
      WHERE td2.id = doc_signatures.trip_doc_id
        AND public._is_trip_owner(td2.trip_id, (SELECT auth.uid()))
    )
  );
