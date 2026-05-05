-- v27.6.0 — Mission Control foundation.
--
-- Three changes, all idempotent enough to re-run safely (CREATE
-- IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING):
--
-- 1. admin_actions audit table — every admin write logs a row here
--    BEFORE the underlying mutation fires, with enough detail that
--    "what did Flavio do, when, to which guide" is reconstructible
--    months later without diff'ing Stripe history.
--
-- 2. outfitter_subscriptions.comp_until — nullable date column for
--    "free until X" comp accounts. NULL means not comped. Set when
--    the admin runs comp this account; cleared when comp expires
--    (today's job is data-only, no automated reconciliation yet).
--
-- 3. profile role flip — promote Flavio's profile.role from 'guide'
--    to 'admin'. The user_role enum already has 'admin' (added in
--    earlier schema work; see types.ts:1817). With the role flipped,
--    requireAdmin() can drop the email-fallback path in a future
--    cleanup pass — for now we keep the email check as belt-and-
--    suspenders so a stale role read never locks Flavio out of the
--    admin module.
--
-- RLS: admin_actions is service-role-only. Every write goes through
-- a server action that reads admin_id from the authenticated session
-- (already validated by requireAdmin()) and inserts via the admin
-- supabase client. No anon/authenticated read or insert is allowed
-- from app code, so we don't need to write a RLS policy that
-- references is-admin — there's no path from the app to this table
-- except the trusted server-action pipeline.

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action_type text NOT NULL,
  target_guide_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_target_guide_idx
  ON public.admin_actions (target_guide_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_created_idx
  ON public.admin_actions (created_at DESC);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- No policies → only service-role inserts/reads. Defensive: drop any
-- accidentally-permissive existing policies to keep the surface clean.
DROP POLICY IF EXISTS admin_actions_self_read ON public.admin_actions;
DROP POLICY IF EXISTS admin_actions_self_write ON public.admin_actions;

-- 2. comp_until on outfitter_subscriptions
ALTER TABLE public.outfitter_subscriptions
  ADD COLUMN IF NOT EXISTS comp_until date;

COMMENT ON COLUMN public.outfitter_subscriptions.comp_until IS
  'v27.6.0 — Comp account expiry. NULL when account is paying or unpaid; set when admin marks the account comp via Mission Control. Until this date, billing-tier treats the account as full-tier without consulting Stripe.';

-- 3. Promote Flavio's profile role to admin. Idempotent — only flips
-- a row currently set to 'guide' (so re-running won't clobber a later
-- explicit 'hunter' or 'admin' edit). The email match is the canonical
-- identifier; user_id resolution would be brittle to env swaps.
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users
  WHERE lower(email) = 'flaviod022@gmail.com'
  LIMIT 1
)
AND role = 'guide';
