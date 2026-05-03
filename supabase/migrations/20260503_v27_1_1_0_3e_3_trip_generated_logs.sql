-- v27.1.1.0.3e.3 — trip_generated_logs.
-- Dedicated table for fill-engine PDF outputs. Replaces the prior
-- behavior of auto-creating docs + trip_docs rows for generated PDFs,
-- which polluted the guide's /app/docs library with one row per fill.
-- Generated logs live separately, surface only on the trip's log page,
-- and have their own delete + RLS policies.

CREATE TABLE IF NOT EXISTS public.trip_generated_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  log_id uuid REFERENCES public.harvest_logs(id) ON DELETE SET NULL,
  source_doc_id uuid REFERENCES public.docs(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  page_count int,
  pass_index int NOT NULL DEFAULT 1,
  pass_total int NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trip_generated_logs IS
  'v27.1.1.0.3e.3: PDF outputs from the harvest-log fill engine. One row per generated PDF (with overflow passes counted separately). Decoupled from docs/trip_docs so generated PDFs do not pollute the doc library.';
COMMENT ON COLUMN public.trip_generated_logs.trip_id IS 'Parent trip. Cascade-deletes when trip is deleted.';
COMMENT ON COLUMN public.trip_generated_logs.log_id IS 'Source harvest_log row. SET NULL on log delete to preserve archived PDFs.';
COMMENT ON COLUMN public.trip_generated_logs.source_doc_id IS 'Mapped log doc that was used as the fill template. SET NULL on doc delete.';
COMMENT ON COLUMN public.trip_generated_logs.file_path IS 'bb-private storage path (logs/{guide_id}/{trip_id}/{filename}.pdf).';
COMMENT ON COLUMN public.trip_generated_logs.pass_index IS '1-indexed overflow pass within a multi-PDF set.';
COMMENT ON COLUMN public.trip_generated_logs.pass_total IS 'Total overflow passes for the same generation.';

CREATE INDEX IF NOT EXISTS trip_generated_logs_trip_id_created_at_idx
  ON public.trip_generated_logs (trip_id, created_at DESC);

ALTER TABLE public.trip_generated_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tgl_guide_owner_all ON public.trip_generated_logs;
CREATE POLICY tgl_guide_owner_all
  ON public.trip_generated_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_generated_logs.trip_id
        AND t.guide_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_generated_logs.trip_id
        AND t.guide_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tgl_hunter_select ON public.trip_generated_logs;
CREATE POLICY tgl_hunter_select
  ON public.trip_generated_logs
  FOR SELECT
  TO authenticated
  USING (
    public._is_trip_participant(trip_id, auth.uid())
  );
