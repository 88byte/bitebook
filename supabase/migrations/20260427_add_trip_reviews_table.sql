-- v26.0 Batch A: trip_reviews table.
-- Hunters can leave a 1-5 star + comment review on completed trips.
-- Guides see aggregate stats + per-trip reviews on /app/reviews.
--
-- RLS pattern reuses the SECURITY DEFINER `_is_trip_participant` helper
-- from 20260427_fix_rls_recursion.sql so insert authorization can verify
-- "hunter is a participant on this trip" without re-triggering recursion
-- through trip_participants's own policies.
--
-- Edit window: hunters can update their own review for 7 days after
-- creation. After that the review is frozen (no SQL-level archival yet).

CREATE TABLE IF NOT EXISTS public.trip_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  hunter_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  guide_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, hunter_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_reviews_guide ON public.trip_reviews(guide_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_reviews_hunter ON public.trip_reviews(hunter_id);
CREATE INDEX IF NOT EXISTS idx_trip_reviews_trip ON public.trip_reviews(trip_id);

ALTER TABLE public.trip_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_reviews_hunter_select_own ON public.trip_reviews;
CREATE POLICY trip_reviews_hunter_select_own ON public.trip_reviews
  FOR SELECT TO authenticated
  USING (hunter_id = auth.uid());

DROP POLICY IF EXISTS trip_reviews_guide_select ON public.trip_reviews;
CREATE POLICY trip_reviews_guide_select ON public.trip_reviews
  FOR SELECT TO authenticated
  USING (guide_id = auth.uid());

DROP POLICY IF EXISTS trip_reviews_hunter_insert ON public.trip_reviews;
CREATE POLICY trip_reviews_hunter_insert ON public.trip_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    hunter_id = auth.uid()
    AND public._is_trip_participant(trip_id, auth.uid())
    AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.status = 'completed' AND t.guide_id = guide_id)
  );

DROP POLICY IF EXISTS trip_reviews_hunter_update_own ON public.trip_reviews;
CREATE POLICY trip_reviews_hunter_update_own ON public.trip_reviews
  FOR UPDATE TO authenticated
  USING (hunter_id = auth.uid() AND created_at > now() - interval '7 days')
  WITH CHECK (hunter_id = auth.uid());

CREATE OR REPLACE FUNCTION public._touch_trip_reviews_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trip_reviews_touch_updated_at ON public.trip_reviews;
CREATE TRIGGER trip_reviews_touch_updated_at
  BEFORE UPDATE ON public.trip_reviews
  FOR EACH ROW EXECUTE FUNCTION public._touch_trip_reviews_updated_at();
