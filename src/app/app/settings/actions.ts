'use server'

import { revalidatePath } from 'next/cache'
import { requireGuide } from '../_lib/auth'
import { markStepDone } from '../_lib/onboarding'
import { createClient } from '@/lib/supabase/server'

const SPECIALTY_OPTIONS = new Set([
  'Big game',
  'Waterfowl',
  'Upland',
  'Saltwater fish',
  'Freshwater fish',
  'Bow only',
  'Rifle',
  'Muzzleloader',
])

export type SettingsActionResult =
  | { ok: true }
  | { error: string }

// Server action for /app/settings. RLS gates write to the row owned by
// auth.uid(); .eq('user_id', user.id) is defense-in-depth.
export async function updateGuideProfileAction(formData: FormData): Promise<SettingsActionResult> {
  const { user } = await requireGuide()

  const business_name = String(formData.get('business_name') ?? '').trim() || null
  const stateRaw = String(formData.get('state') ?? '').trim().toUpperCase()
  const state = stateRaw && stateRaw.length === 2 ? stateRaw : null
  const license_number = String(formData.get('license_number') ?? '').trim() || null

  const partyRaw = Number(formData.get('max_party_size') ?? 6)
  const max_party_size = Number.isFinite(partyRaw)
    ? Math.min(12, Math.max(1, Math.round(partyRaw)))
    : 6

  const bioRaw = String(formData.get('bio') ?? '').trim()
  const bio = bioRaw ? bioRaw.slice(0, 280) : null

  const specialties = formData.getAll('specialties')
    .map((v) => String(v))
    .filter((v) => SPECIALTY_OPTIONS.has(v))

  const supabase = await createClient()
  const { error } = await supabase
    .from('guide_profiles')
    .update({
      business_name,
      state,
      license_number,
      max_party_size,
      specialties: specialties.length ? specialties : null,
      bio,
    })
    .eq('user_id', user.id)

  if (error) {
    console.warn('[settings.updateGuideProfileAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not save settings.' }
  }

  // v24: mark profile_set onboarding step done if business_name + state are set.
  if (business_name && state) {
    try {
      await markStepDone(supabase, user.id, 'profile_set')
    } catch (e) {
      console.warn('[settings] onboarding mark failed', e)
    }
  }

  revalidatePath('/app')
  revalidatePath('/app/settings')
  return { ok: true }
}
