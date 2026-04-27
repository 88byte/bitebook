import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Resolves the signed-in user *and* their guide profile in one shot. Used by
// every /app screen so role-gating is consistent and we always have the
// business name / display name for the header without a second round-trip.
//
// Profile + guide_profiles reads use the ADMIN (service-role) client because
// the user-session client hits an RLS recursion (Postgres 42P17) on profiles
// — see queries.ts header for full context. The lookup is keyed by
// auth.getUser().id, which Supabase has just verified, so bypassing RLS for
// this single-row, ownership-based read is safe.
//
// Loop-safety note (v18+):
// Non-auth failures (no profile row / role !== 'guide') redirect to "/" with
// an error param, NOT to "/login". The proxy auto-bounces signed-in users
// from /login back to /app — combined with this gate that creates a
// deterministic redirect loop (Safari hits its 20-redirect cap). Landing is
// public and never bounces signed-in users, so it's a safe terminal.
export async function requireGuide() {
  const supabase = await createClient()
  const { data: { user }, error: getUserErr } = await supabase.auth.getUser()
  console.log('[requireGuide] getUser', {
    hasUser: !!user,
    userId: user?.id ?? null,
    error: getUserErr ? { code: getUserErr.code, status: getUserErr.status, message: getUserErr.message } : null,
  })
  if (!user) {
    console.log('[requireGuide] redirect to /login', { reason: 'no_user' })
    redirect('/login?next=/app')
  }

  const admin = createAdminClient()

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', user.id)
    .maybeSingle()

  console.log('[requireGuide] profile lookup (admin)', {
    userId: user.id,
    found: !!profile,
    role: profile?.role ?? null,
    error: profileErr ? { code: profileErr.code, message: profileErr.message } : null,
  })

  if (profileErr) {
    console.warn('[requireGuide] profiles read failed → /?error=profile_unavailable', { userId: user.id, code: profileErr.code, message: profileErr.message })
    redirect('/?error=profile_unavailable')
  }
  if (!profile) {
    console.warn('[requireGuide] profile missing → /?error=no_profile', { userId: user.id })
    redirect('/?error=no_profile')
  }
  if (profile.role !== 'guide') {
    console.warn('[requireGuide] wrong role → /?error=guide_only', { userId: user.id, role: profile.role })
    redirect('/?error=guide_only')
  }

  const { data: guide } = await admin
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
