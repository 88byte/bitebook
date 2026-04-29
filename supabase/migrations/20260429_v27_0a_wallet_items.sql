-- v27.0a — Wallet (hunter + guide), foundation migration.
--
-- Single shared `wallet_items` table keyed by user_id (role-agnostic).
-- Hunter types: license / tag / permit / stamp / harvest_report_card
-- Guide types:  guide_license / insurance / business_credential
--
-- Renewals = NEW ENTRIES, not edits. When a hunter renews their 2026 CA
-- license, they create a new row for the 2027 one and archive the old.
-- Status (active / used / expired / archived) is derived in queries from
-- valid_to + harvests.consumed_wallet_item_id (added in v27.0b) + archived_at,
-- not stored on the row.
--
-- Renewal reminders are IN-APP ONLY (banner + tab badge derived live from
-- valid_to). No last_reminder_sent_at column.

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_item_type') THEN
    CREATE TYPE public.wallet_item_type AS ENUM (
      'license',
      'tag',
      'permit',
      'stamp',
      'harvest_report_card',
      'guide_license',
      'insurance',
      'business_credential'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_jurisdiction') THEN
    CREATE TYPE public.wallet_jurisdiction AS ENUM ('federal', 'state');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wallet_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            public.wallet_item_type NOT NULL,
  jurisdiction    public.wallet_jurisdiction NOT NULL,

  -- Identity
  identifier      text NOT NULL,                            -- license / tag / permit number; "FED-DUCK-2026" etc.
  state           text,                                     -- 2-letter US state, NULL or 'ALL' for federal items
  species         text,                                     -- "Black bear", "Mule deer A1", null for licenses
  zone            text,                                     -- "D6", "Unit 22", null when not zone-restricted
  season_year     smallint,                                 -- required for tags, optional for licenses

  -- Validity
  issue_date      date,                                     -- separate from valid_from on some states
  valid_from      date NOT NULL,
  valid_to        date NOT NULL,
  CHECK (valid_to >= valid_from),
  CHECK (
    jurisdiction = 'state'
    OR (jurisdiction = 'federal' AND (state IS NULL OR state = 'ALL'))
  ),

  -- Lifecycle
  archived_at     timestamptz,                              -- NULL = not archived

  -- Document image (uploaded to bb-private bucket at wallet/{user_id}/{id}.{ext})
  document_url    text,
  document_mime   text,

  -- Free text
  notes           text,

  -- Type-specific extras (e.g. insurance carrier, policy number, coverage limits)
  -- Kept as jsonb so insurance / business_credential fields can flex without migrations.
  extras          jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_user            ON public.wallet_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_user_validto    ON public.wallet_items(user_id, valid_to DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_user_type       ON public.wallet_items(user_id, type);
CREATE INDEX IF NOT EXISTS idx_wallet_active          ON public.wallet_items(user_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_identifier ON public.wallet_items(user_id, state, type, identifier);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._touch_wallet_items_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS wallet_items_touch_updated_at ON public.wallet_items;
CREATE TRIGGER wallet_items_touch_updated_at
  BEFORE UPDATE ON public.wallet_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_wallet_items_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.wallet_items ENABLE ROW LEVEL SECURITY;

-- Owner (hunter or guide) manages their own wallet end-to-end.
DROP POLICY IF EXISTS wallet_self_all ON public.wallet_items;
CREATE POLICY wallet_self_all ON public.wallet_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Stub for v27.0b: guide reads a hunter's wallet items via trip_wallet_items.
-- v27.0a installs this policy as a no-op (false). v27.0b drops + recreates
-- with the real EXISTS clause once trip_wallet_items exists.
DROP POLICY IF EXISTS wallet_guide_select_via_trip ON public.wallet_items;
CREATE POLICY wallet_guide_select_via_trip ON public.wallet_items
  FOR SELECT TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- Guide license: add expiration column + backfill from existing data
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.guide_profiles
  ADD COLUMN IF NOT EXISTS guide_license_expires_at date;

-- Backfill: every existing guide whose guide_profiles row has BOTH a license
-- number AND an expiration becomes a wallet_items row of type 'guide_license'.
-- Requires guide_profiles.license_number to exist; if the column name differs,
-- the INSERT is wrapped in a DO block so the migration tolerates schema
-- variation (commit log shows guide_license_number was the v25.9.x naming).
DO $$
DECLARE
  has_license_number boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guide_profiles' AND column_name = 'license_number'
  ) INTO has_license_number;

  IF has_license_number THEN
    INSERT INTO public.wallet_items (user_id, type, jurisdiction, identifier, state, valid_from, valid_to)
    SELECT
      gp.user_id,
      'guide_license'::public.wallet_item_type,
      'state'::public.wallet_jurisdiction,
      gp.license_number,
      gp.state,
      COALESCE(gp.guide_license_expires_at, CURRENT_DATE) - INTERVAL '1 year', -- best-effort valid_from when not stored
      gp.guide_license_expires_at
    FROM public.guide_profiles gp
    WHERE gp.license_number IS NOT NULL
      AND gp.guide_license_expires_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_items wi
        WHERE wi.user_id = gp.user_id
          AND wi.type = 'guide_license'
          AND wi.identifier = gp.license_number
          AND COALESCE(wi.state, '') = COALESCE(gp.state, '')
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Notes for v27.0b (next migration in this chain):
--   1. CREATE TABLE trip_wallet_items (trip_id, user_id, wallet_item_id, ...)
--   2. ALTER TABLE harvests ADD COLUMN consumed_wallet_item_id uuid REFERENCES wallet_items(id) ON DELETE SET NULL
--   3. DROP POLICY wallet_guide_select_via_trip; recreate with real EXISTS clause joining trip_wallet_items.
--   4. Drop deprecated guide_profiles.guide_license_expires_at column once
--      all read paths have migrated to wallet_items (per sequencing doc §7.1).
-- ─────────────────────────────────────────────────────────────────────────────
