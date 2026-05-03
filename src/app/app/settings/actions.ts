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

export type EmailChangeResult =
  | { ok: true; pending_email: string }
  | { error: string }

// Server action for /app/settings. RLS gates write to the row owned by
// auth.uid(); .eq('user_id', user.id) is defense-in-depth.
export async function updateGuideProfileAction(formData: FormData): Promise<SettingsActionResult> {
  const { user } = await requireGuide()

  // Identity (profiles.*)
  const first_name = String(formData.get('first_name') ?? '').trim().slice(0, 80)
  const last_name = String(formData.get('last_name') ?? '').trim().slice(0, 80)
  if (!first_name) return { error: 'First name is required.' }
  if (!last_name) return { error: 'Last name is required.' }
  const phoneRaw = String(formData.get('phone') ?? '').trim()
  const phone = phoneRaw ? phoneRaw.slice(0, 32) : null

  // Address (profiles.*)
  const address_street = String(formData.get('address_street') ?? '').trim().slice(0, 160) || null
  // v27.1.1.0.2: optional second line (apt / suite / unit), nullable.
  const address_street2 = String(formData.get('address_street2') ?? '').trim().slice(0, 80) || null
  const address_city = String(formData.get('address_city') ?? '').trim().slice(0, 80) || null
  const addrStateRaw = String(formData.get('address_state') ?? '').trim().toUpperCase()
  const address_state = addrStateRaw && addrStateRaw.length === 2 ? addrStateRaw : null
  const address_zip = String(formData.get('address_zip') ?? '').trim().slice(0, 10) || null

  // Outfitter details (guide_profiles.*)
  const business_name = String(formData.get('business_name') ?? '').trim() || null
  // v27.1.1.0.3e.5: license_number no longer captured here. Guide license
  // lives on the wallet (wallet_items.type='guide_license'). The
  // guide_profiles.license_number column is left untouched on update so
  // existing values are preserved.
  // v25.9.2: outfitter `state` field removed from the form per UX feedback —
  // residential address state on profiles already captures where the guide is
  // based. Existing guide_profiles.state values are preserved by NOT writing
  // the field below. If we need to track operating regions distinct from
  // residence later, add a multi-select rather than a single state.

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

  // display_name keeps in sync with the canonical first/last so existing UI
  // (avatars, header, hunter-sees-guide-name, etc.) keeps working without a
  // sweep of every consumer in this patch.
  const display_name = `${first_name} ${last_name}`.trim()

  const profileUpdate = await supabase
    .from('profiles')
    .update({
      first_name,
      last_name,
      display_name,
      phone,
      address_street,
      address_street2,
      address_city,
      address_state,
      address_zip,
    })
    .eq('id', user.id)

  if (profileUpdate.error) {
    console.warn('[settings.updateGuideProfileAction:profiles]', { code: profileUpdate.error.code, message: profileUpdate.error.message })
    return { error: profileUpdate.error.message || 'Could not save profile.' }
  }

  const guideUpdate = await supabase
    .from('guide_profiles')
    .update({
      business_name,
      max_party_size,
      specialties: specialties.length ? specialties : null,
      bio,
    })
    .eq('user_id', user.id)

  if (guideUpdate.error) {
    console.warn('[settings.updateGuideProfileAction:guide_profiles]', { code: guideUpdate.error.code, message: guideUpdate.error.message })
    return { error: guideUpdate.error.message || 'Could not save outfitter details.' }
  }

  // v25.9.1: profile_set onboarding step now keys on first_name + last_name
  // (replaces the old business_name + state heuristic, which only fired for
  // guides who'd set up the outfitter half).
  if (first_name && last_name) {
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

// v25.9.1: change-email flow. Calls supabase.auth.updateUser({ email }) — Supabase
// emails a confirmation link to the NEW address. Until the user clicks that
// link the existing email keeps working.
export async function requestEmailChangeAction(formData: FormData): Promise<EmailChangeResult> {
  await requireGuide()

  const newEmail = String(formData.get('new_email') ?? '').trim().toLowerCase()
  const confirmEmail = String(formData.get('confirm_email') ?? '').trim().toLowerCase()

  if (!newEmail || !confirmEmail) return { error: 'Both email fields are required.' }
  if (newEmail !== confirmEmail) return { error: 'Emails do not match.' }
  // Minimal format check; Supabase will reject malformed values too but we
  // catch the common typo case here for a friendlier message.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return { error: 'Enter a valid email address.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ email: newEmail })
  if (error) {
    console.warn('[settings.requestEmailChangeAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not start email change.' }
  }

  return { ok: true, pending_email: newEmail }
}
