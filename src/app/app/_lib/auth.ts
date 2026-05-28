import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Resolves the signed-in user *and* their guide profile in one shot. Used by
// every /app screen so role-gating is consistent and we always have the
// business name / display name for the header without a second round-trip.
//
// Profile and guide_profile reads run in parallel (both keyed on user.id) to
// shave a Supabase round-trip from every /app render. We can't drop role-gate
// short-circuiting entirely, but we can fire both queries concurrently and
// only inspect guide if profile.role === 'guide' below.
//
// Loop-safety note (v18+):
// Non-auth failures (no profile row / role !== 'guide') redirect to "/" with
// an error param, NOT to "/login". The proxy auto-bounces signed-in users
// from /login back to /app — combined with this gate that creates a
// deterministic redirect loop (Safari hits its 20-redirect cap). Landing is
// public and never bounces signed-in users, so it's a safe terminal.
//
// v25.1: hunters who land on a /app/* (guide) URL get bounced into their own
// /app/h dashboard instead of the landing-page error. Other non-guide roles
// (admin, etc.) still land on "/" with ?error=guide_only.
export async function requireGuide() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/app')

  // Fire both reads in parallel — they're independent, both keyed on user.id.
  // v27.1.5.1: also pull onboarded_at so the wizard can intercept the first
  // /app load when it's NULL.
  // v28.1.0b: include account_tier + current_outfitter_org_id so /app
  // can branch on the outfitter dashboard variant without a second query.
  const [profileRes, guideRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, role, account_tier, current_outfitter_org_id')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('guide_profiles')
      .select('business_name, state, max_party_size, onboarded_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const { data: profile, error: profileErr } = profileRes

  if (profileErr) {
    console.warn('[requireGuide] profiles read failed', { userId: user.id, code: profileErr.code, message: profileErr.message })
    redirect('/?error=profile_unavailable')
  }
  if (!profile) redirect('/?error=no_profile')

  // v28.1.0c.3 — Outfitter owners + admins get into /app regardless of
  // their legacy profiles.role (which may be 'hunter' for accept-flow
  // admins who never had a guide identity, or 'guide' for owners who
  // upgraded from a guide sub). The org-membership row + account_tier
  // is the source of truth for outfitter access.
  //
  // Without this bypass, /app/page.tsx never reaches its outfitter
  // branch — requireGuide would redirect role='hunter' admins to
  // /app/h before the dashboard variant could render. We also skip
  // the guide-onboarding wizard since outfitter admins don't need a
  // guide_profiles row.
  const isOutfitterMember =
    (profile.account_tier === 'outfitter_owner' || profile.account_tier === 'outfitter_admin') &&
    !!profile.current_outfitter_org_id
  if (isOutfitterMember) {
    // v28.1.0d.0 — Resolve the org-context guide id. For owners this
    // equals profile.id (they ARE the guide producing trips). For
    // admins this is the org's owner_profile_id — the only guide
    // producing the org's data today. Sprint 3.3 will broaden this
    // to a multi-id set when network guides land; for now a single
    // id keeps every existing query (eq('guide_id', ...)) working
    // unchanged for both owner + admin visibility.
    let contextGuideId = profile.id
    if (profile.account_tier === 'outfitter_admin' && profile.current_outfitter_org_id) {
      const { data: org } = await supabase
        .from('outfitter_orgs')
        .select('owner_profile_id')
        .eq('id', profile.current_outfitter_org_id)
        .maybeSingle()
      if (org?.owner_profile_id) contextGuideId = org.owner_profile_id
    }
    return {
      supabase,
      user,
      profile,
      guide: guideRes.data ?? null,
      contextGuideId,
    }
  }

  // v25.1: route hunters to their own dashboard rather than dumping them on
  // the landing page with a guide_only error.
  if (profile.role === 'hunter') redirect('/app/h')
  if (profile.role !== 'guide') redirect('/?error=guide_only')

  // v27.1.5.1: first-time guide onboarding wizard. If onboarded_at is NULL
  // bounce into /app/onboarding before rendering any /app screen. The wizard
  // page itself uses requireGuideForOnboarding() which does NOT redirect, so
  // there's no loop. Once the wizard completes (server action stamps
  // onboarded_at), this gate falls through and /app renders normally.
  const onboardedAt = guideRes.data?.onboarded_at ?? null
  if (!onboardedAt) redirect('/app/onboarding')

  return {
    supabase,
    user,
    profile,
    guide: guideRes.data ?? null,
    // v28.1.0d.0 — Pure guides see only their own data. The field is
    // present for callers so they can pass it uniformly without
    // branching on tier.
    contextGuideId: profile.id,
  }
}

// v27.1.5.1: variant of requireGuide() used by the onboarding wizard itself
// to avoid the bounce-back loop. Same auth + role checks but skips the
// onboarded_at redirect. Returns the (possibly-null) guide row so the wizard
// can pre-fill business_name + state from any earlier draft.
export async function requireGuideForOnboarding() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/app/onboarding')

  const [profileRes, guideRes] = await Promise.all([
    supabase
      // v27.1.5.1.1: also pull first_name + last_name so the wizard can
      // pre-fill those fields in Step 1.
      .from('profiles')
      .select('id, display_name, first_name, last_name, role')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('guide_profiles')
      // v27.1.5.2.1: also pull default_log_doc_id so Step 3 can mark
      // the guide's previous selection as the active radio.
      // v27.5.0: pull default_signature_path so Step 4 can detect
      // whether the guide has already saved a signature and show the
      // Continue affordance once they have.
      .select('business_name, state, license_number, guide_license_expires_at, onboarded_at, default_log_doc_id, default_signature_path')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const { data: profile, error: profileErr } = profileRes
  if (profileErr) {
    console.warn('[requireGuideForOnboarding] profiles read failed', { userId: user.id, code: profileErr.code, message: profileErr.message })
    redirect('/?error=profile_unavailable')
  }
  if (!profile) redirect('/?error=no_profile')
  if (profile.role === 'hunter') redirect('/app/h')
  if (profile.role !== 'guide') redirect('/?error=guide_only')

  // If they've already onboarded, kick them to the dashboard — no value
  // re-running the wizard.
  if (guideRes.data?.onboarded_at) redirect('/app')

  return { supabase, user, profile, guide: guideRes.data ?? null }
}

// v27.8.3 — permissive variant of requireGuide() for actions that may run
// during the first-time onboarding wizard. Same auth + role checks but
// SKIPS the onboarded_at redirect, so an un-onboarded guide who's
// mid-wizard can still trigger writes (e.g. saveDefaultSignatureAction
// from Step 4) without getting bounced back to /app/onboarding (which
// would default to ?step=1, looping the user).
//
// Use this in any action that's reachable from BOTH /app/onboarding and
// /app/settings — actions reachable only from /app/settings should keep
// using requireGuide() so the onboarded_at gate stays enforced.
export async function requireGuideAllowOnboarding() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/app')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    console.warn('[requireGuideAllowOnboarding] profiles read failed', { userId: user.id, code: profileErr.code, message: profileErr.message })
    redirect('/?error=profile_unavailable')
  }
  if (!profile) redirect('/?error=no_profile')
  if (profile.role === 'hunter') redirect('/app/h')
  if (profile.role !== 'guide') redirect('/?error=guide_only')

  return { supabase, user, profile }
}

// v25.1: hunter-side gate. Mirrors requireGuide() but enforces 'hunter'.
// Same loop-safety approach: redirect to "/" with ?error= rather than /login.
// Guides who somehow hit /app/h get sent back to their own dashboard.
export async function requireHunter() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/app/h')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, phone, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    console.warn('[requireHunter] profiles read failed', { userId: user.id, code: profileErr.code, message: profileErr.message })
    redirect('/?error=profile_unavailable')
  }
  if (!profile) redirect('/?error=no_profile')
  if (profile.role === 'guide') redirect('/app')
  if (profile.role !== 'hunter') redirect('/?error=hunter_only')

  return { supabase, user, profile }
}

// v27.6.0 / v27.6.0.2 — Mission Control admin gate. Email-match ONLY.
//
// Originally we tried profile.role === 'admin' as the canonical
// signal, with email-match as belt-and-suspenders. That approach
// broke /app access for the admin: requireGuide() rejects role
// !== 'guide' on every guide page, so flipping Flavio to role=admin
// silently locked him out of his own dashboard. The role flip is
// reverted in migration v27_6_0_2_revert_admin_role_flip.sql, and
// admin determination is now SOLELY email-match. This means the
// admin can also be a guide (or hunter, in theory) without losing
// app access — the two states are independent.
//
// The list is hardcoded today because there's exactly one admin.
// When we need more admins, switch to an `admin_emails` table or a
// boolean column on profiles — but the gate stays email-keyed so
// we never repeat the requireGuide vs role=admin collision.
//
// Non-admins land on 404 via notFound() so we don't leak the
// route's existence — the proxy middleware does the same on the
// edge as a redundant gate.
export const ADMIN_EMAILS: ReadonlyArray<string> = [
  'flaviod022@gmail.com',
]

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin')

  if (!isAdminEmail(user.email)) notFound()

  // Profile read is best-effort — the admin gate already passed via
  // email match. We surface display_name + role for the page UI but
  // don't gate on them.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  return { supabase, user, profile }
}

// v25.1: lightweight helper used by /app/page.tsx to pick a destination
// without enforcing a role. Returns null-safe values; callers decide what
// to do with the role.
export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/app')

  // v28.1.0b: pull tier columns so callers can dispatch on
  // account_tier without a second query.
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, display_name, role, account_tier, current_outfitter_org_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    console.warn('[requireUser] profiles read failed', { userId: user.id, code: profileErr.code, message: profileErr.message })
    redirect('/?error=profile_unavailable')
  }
  if (!profile) redirect('/?error=no_profile')

  return { supabase, user, profile }
}
