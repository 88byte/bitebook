import { redirect } from 'next/navigation'
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
  const [profileRes, guideRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, role')
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
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('guide_profiles')
      .select('business_name, state, license_number, guide_license_expires_at, onboarded_at')
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

// v25.1: lightweight helper used by /app/page.tsx to pick a destination
// without enforcing a role. Returns null-safe values; callers decide what
// to do with the role.
export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/app')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    console.warn('[requireUser] profiles read failed', { userId: user.id, code: profileErr.code, message: profileErr.message })
    redirect('/?error=profile_unavailable')
  }
  if (!profile) redirect('/?error=no_profile')

  return { supabase, user, profile }
}
