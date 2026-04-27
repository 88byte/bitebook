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
  const [profileRes, guideRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('guide_profiles')
      .select('business_name, state, max_party_size')
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

  return {
    supabase,
    user,
    profile,
    guide: guideRes.data ?? null,
  }
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
