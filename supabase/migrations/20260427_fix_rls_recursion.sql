-- Fixes Postgres error 42P17: "infinite recursion detected in policy for
-- relation trip_participants" that v17 surfaced.
--
-- ROOT CAUSE
-- ----------
-- The original RLS policies on profiles / trips / trip_participants /
-- harvests reference each other in a way Postgres cannot plan: reading
-- profiles checks a policy that reads trip_participants, whose policy
-- reads trips, whose policy reads trip_participants again. Postgres
-- detects the cycle and errors out — every user-session read of any of
-- those tables fails, breaking sign-in into /app entirely.
--
-- Concretely, the diagnostic curl showed:
--   GET /rest/v1/profiles          → 42P17 (recursion in trip_participants)
--   GET /rest/v1/trips             → 42P17 (recursion in trips)
--   GET /rest/v1/trip_participants → 42P17 (recursion in trip_participants)
--   GET /rest/v1/harvests          → 42P17 (recursion in trips)
-- guide_profiles and invitations are RLS-clean.
--
-- FIX STRATEGY
-- ------------
-- Replace cross-table EXISTS clauses with SECURITY DEFINER helper
-- functions. SD functions run with the function-owner's privileges and
-- bypass RLS for their internal SELECT, so they can answer "is hunter X
-- a participant on trip Y?" without re-triggering RLS recursion.
--
-- Each helper is STABLE so the planner can cache the result inside a query.
-- They take the smallest necessary input (trip_id, user_id) — no row
-- pointers — so the planner can't substitute back into the recursive plan.
--
-- WHAT THIS REPLACES
-- ------------------
-- This script doesn't know the names of your existing policies (those
-- aren't in the codebase), so it DROPS POLICY IF EXISTS for the canonical
-- names and recreates a clean set. If your dashboard shows a different
-- policy name, drop it manually first or rename below.

BEGIN;

-- ─── 1. SECURITY DEFINER helpers (break the recursion) ────────────────────

CREATE OR REPLACE FUNCTION public._is_trip_participant(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_participants
    WHERE trip_id = _trip_id AND hunter_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public._is_trip_owner(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trips
    WHERE id = _trip_id AND guide_id = _user_id
  );
$$;

-- Lock down execute privileges. authenticated role only — anon shouldn't
-- be probing trip ownership for arbitrary IDs.
REVOKE ALL ON FUNCTION public._is_trip_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._is_trip_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_trip_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._is_trip_owner(uuid, uuid) TO authenticated;

-- ─── 2. profiles ──────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop any prior recursive policies. Add the names you actually have here.
DROP POLICY IF EXISTS "profiles_select"                 ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by users"  ON public.profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "guide can see hunter profiles"   ON public.profiles;

-- Self-read.
CREATE POLICY profiles_self_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Guides can see profiles of hunters they've actually traveled with — uses
-- the SECURITY DEFINER helper so we don't recurse through trip_participants.
CREATE POLICY profiles_guide_sees_participants ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_participants tp
      WHERE tp.hunter_id = profiles.id
        AND public._is_trip_owner(tp.trip_id, auth.uid())
    )
  );

CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─── 3. trips ─────────────────────────────────────────────────────────────

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trips_select"             ON public.trips;
DROP POLICY IF EXISTS "trips_insert"             ON public.trips;
DROP POLICY IF EXISTS "trips_update"             ON public.trips;
DROP POLICY IF EXISTS "trips_delete"             ON public.trips;
DROP POLICY IF EXISTS "guides see own trips"     ON public.trips;
DROP POLICY IF EXISTS "participants see trips"   ON public.trips;

-- Owner (guide) full access.
CREATE POLICY trips_owner_all ON public.trips
  FOR ALL TO authenticated
  USING (guide_id = auth.uid())
  WITH CHECK (guide_id = auth.uid());

-- Participants can see (only) trips they're on. Helper avoids recursion.
CREATE POLICY trips_participant_select ON public.trips
  FOR SELECT TO authenticated
  USING (public._is_trip_participant(id, auth.uid()));

-- ─── 4. trip_participants ────────────────────────────────────────────────

ALTER TABLE public.trip_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_participants_select" ON public.trip_participants;
DROP POLICY IF EXISTS "trip_participants_insert" ON public.trip_participants;
DROP POLICY IF EXISTS "trip_participants_update" ON public.trip_participants;
DROP POLICY IF EXISTS "trip_participants_delete" ON public.trip_participants;

-- Trip owner (guide) full access.
CREATE POLICY trip_participants_owner_all ON public.trip_participants
  FOR ALL TO authenticated
  USING (public._is_trip_owner(trip_id, auth.uid()))
  WITH CHECK (public._is_trip_owner(trip_id, auth.uid()));

-- The hunter referenced by the row sees their own participation.
CREATE POLICY trip_participants_self_select ON public.trip_participants
  FOR SELECT TO authenticated
  USING (hunter_id = auth.uid());

-- ─── 5. harvests ──────────────────────────────────────────────────────────

ALTER TABLE public.harvests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "harvests_select" ON public.harvests;
DROP POLICY IF EXISTS "harvests_insert" ON public.harvests;
DROP POLICY IF EXISTS "harvests_update" ON public.harvests;
DROP POLICY IF EXISTS "harvests_delete" ON public.harvests;

-- Trip owner (guide) full access via the helper.
CREATE POLICY harvests_owner_all ON public.harvests
  FOR ALL TO authenticated
  USING (public._is_trip_owner(trip_id, auth.uid()))
  WITH CHECK (public._is_trip_owner(trip_id, auth.uid()));

-- Hunter sees their own harvests.
CREATE POLICY harvests_hunter_select ON public.harvests
  FOR SELECT TO authenticated
  USING (hunter_id = auth.uid());

COMMIT;

-- VERIFY (run after applying):
--   SELECT 1 FROM public.profiles LIMIT 1;
--   SELECT 1 FROM public.trips LIMIT 1;
--   SELECT 1 FROM public.trip_participants LIMIT 1;
--   SELECT 1 FROM public.harvests LIMIT 1;
-- All four should succeed (return zero or more rows, no 42P17 error) under
-- both anon and authenticated roles.
--
-- AFTER APPLYING:
--   1. The /app code-level workaround in src/app/app/_lib/queries.ts
--      (admin-client reads with explicit guide_id filtering) can be reverted
--      to use the user-session client. The workaround is correct but defeats
--      RLS, and once the policies above are in place RLS handles it natively.
--   2. The diagnostic console.log lines in proxy.ts and requireGuide can be
--      removed in the same revert.
