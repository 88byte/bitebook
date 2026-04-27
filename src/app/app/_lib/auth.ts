import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Resolves the signed-in user *and* their guide profile in one shot. Used by
// every /app screen so role-gating is consistent and we always have the
// business name / display name for the header without a second round-trip.
export async function requireGuide() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/app')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) redirect('/login?error=no_profile')
  if (profile.role !== 'guide') {
    // Hunter / admin landing on /app — drop them at /login for now. Sprint 2
    // slice 1 only ships guide screens; a hunter shell is on the roadmap.
    redirect('/login?error=guide_only')
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
