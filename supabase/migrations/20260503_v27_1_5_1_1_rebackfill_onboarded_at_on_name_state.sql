-- v27.1.5.1.1: re-backfill guide_profiles.onboarded_at on the corrected
-- "name + state" criteria.
--
-- v27.1.5.1 stamped onboarded_at where business_name IS NOT NULL. That was
-- wrong: not every guide has a business name (many are independent
-- operators), so the bar should be "do we know who they are and where
-- they operate?" -- first_name + last_name + state.
--
-- This migration re-evaluates every guide_profiles row:
--   * If profiles.first_name + profiles.last_name + guide_profiles.state are
--     all non-empty -> onboarded_at = COALESCE(existing, profiles.created_at).
--   * Otherwise -> onboarded_at = NULL (clears any v27.1.5.1 false-positive
--     so those guides see the wizard on next /app load).
--
-- Wizard-completed guides (onboarded_at set by finishOnboardingAction) are
-- safe because the wizard now writes first/last/state itself, so they meet
-- the new criteria and the COALESCE keeps their stamp.
UPDATE public.guide_profiles gp
SET onboarded_at = CASE
  WHEN COALESCE(p.first_name, '') <> ''
   AND COALESCE(p.last_name,  '') <> ''
   AND COALESCE(gp.state,     '') <> ''
    THEN COALESCE(gp.onboarded_at, p.created_at)
  ELSE NULL
END
FROM public.profiles p
WHERE p.id = gp.user_id;
