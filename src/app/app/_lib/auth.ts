import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Resolves the signed-in user *and* their guide profile in one shot. Used by
// every /app screen so role-gating is consistent and we always have the
// business name / display name for the header without a second round-trip.
//
// Loop-safety note (v18):
// Non-auth failures (no profile row / role !== 'guide') redirect to "/" with
// an error param, NOT to "/login". The proxy auto-bounces signed-in users
// from /login back to /app — combined with this gate that creates a
// deterministic redirect loop (Safari hits its 20-redirect cap). Landing is
// public and never bounces signed-in users, so it's a safe terminal.
export async function requireGuide() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/app')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    // Surfaced to Vercel logs so we can debug RLS / schema issues without
    // changing UX. The user gets a non-looping redirect to landing.
    console.warn('requireGuide profiles read failed', { userId: user.id, code: profileErr.code, message: profileErr.message })
    redirect('/?error=profile_unavailable')
  }
  if (!profile) {
    console.warn('requireGuide profile missing for signed-in user', { userId: user.id })
    redirect('/?error=no_profile')
  }
  if (profile.role !== 'guide') {
    // Hunter / admin landing on /app. Slice 1 only ships guide screens.
    redirect('/?error=guide_only')
  }

  const { data: guide } = await supabase
    .from('guide_profiles')
    .select('business_name, state, max_party_size')
    .eq('user_id', user.id)
    .maybeSingle()

  return {
    supabase,
    user,
    profile,
    guide: guide ?? null,
  }
}
