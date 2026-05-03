-- v27.1.5.1: guide first-time onboarding wizard.
--
-- Adds guide_profiles.onboarded_at to gate the new /app/onboarding wizard.
-- NULL = guide hasn't completed setup yet -> /app/onboarding intercepts first
-- /app load. Non-NULL = onboarded -> wizard never re-shown.
--
-- Backfill: every existing guide profile that already has a business_name
-- is treated as already onboarded -- they manually filled the equivalent
-- of step 1 some time ago, so we don't want to bounce them through the
-- wizard. We stamp their created_at as the onboarded_at so the value is
-- truthful (they completed setup whenever they wrote that row, even if
-- the wizard didn't exist yet). Guides with NULL business_name get NULL
-- onboarded_at -- they'll see the wizard on next /app load.
ALTER TABLE public.guide_profiles
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz NULL;

UPDATE public.guide_profiles
SET onboarded_at = COALESCE(onboarded_at, created_at)
WHERE business_name IS NOT NULL AND onboarded_at IS NULL;
