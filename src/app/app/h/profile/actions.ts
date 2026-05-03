'use server'

import { revalidatePath } from 'next/cache'
import { requireHunter } from '../../_lib/auth'
import { markStepDone } from '../../_lib/onboarding'
import { createClient } from '@/lib/supabase/server'

export type HunterProfileActionResult =
  | { ok: true }
  | { error: string }

// v25.1: server action for /app/h/profile.
// v26.0 Batch A: expanded to capture address (street/city/state/zip) and
// state hunter license number. RLS gates writes to auth.uid()'s own row;
// .eq('id', user.id) is defense-in-depth.
//
// v27.1.1.0.3e.4: license_doc_id removed from form. License now lives
// exclusively on the wallet (trip_wallet_items → wallet_items) and the
// fill engine reads it from there. The DB column is preserved for back-
// compat, but no path captures or surfaces it.
//
// Onboarding: marks `profile_set` done only when ALL required hunter fields
// are populated (display_name, first_name, last_name, all 4 address parts).
// Partial writes leave the step undone — the welcome checklist will still
// show "Set up your profile" as the current step.
export async function updateHunterProfileAction(formData: FormData): Promise<HunterProfileActionResult> {
  const { user } = await requireHunter()

  // Identity
  const display_name = String(formData.get('display_name') ?? '').trim()
  if (!display_name) return { error: 'Display name is required.' }
  if (display_name.length > 80) return { error: 'Display name is too long.' }
  const first_name = String(formData.get('first_name') ?? '').trim().slice(0, 80)
  const last_name = String(formData.get('last_name') ?? '').trim().slice(0, 80)
  if (!first_name) return { error: 'First name is required.' }
  if (!last_name) return { error: 'Last name is required.' }

  const phoneRaw = String(formData.get('phone') ?? '').trim()
  const phone = phoneRaw ? phoneRaw.slice(0, 32) : null

  // Address — all optional at the field level (we don't reject partials),
  // but the onboarding step requires all four to flip done.
  const address_street = String(formData.get('address_street') ?? '').trim().slice(0, 160) || null
  // v27.1.1.0.2: optional second line; doesn't gate profile_set.
  const address_street2 = String(formData.get('address_street2') ?? '').trim().slice(0, 80) || null
  const address_city = String(formData.get('address_city') ?? '').trim().slice(0, 80) || null
  const addrStateRaw = String(formData.get('address_state') ?? '').trim().toUpperCase()
  const address_state = addrStateRaw && addrStateRaw.length === 2 ? addrStateRaw : null
  const address_zip = String(formData.get('address_zip') ?? '').trim().slice(0, 10) || null

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      display_name,
      first_name,
      last_name,
      phone,
      address_street,
      address_street2,
      address_city,
      address_state,
      address_zip,
    })
    .eq('id', user.id)

  if (error) {
    console.warn('[hunter.updateHunterProfileAction]', { code: error.code, message: error.message })
    return { error: error.message || 'Could not save profile.' }
  }

  // v26.0: profile_set step is "done" iff every required hunter onboarding
  // field is populated. Don't half-mark — the welcome checklist won't
  // advance until the hunter has the full kit ready for a state log.
  // v27.1.1.0.3e.4: license_doc_id dropped from the gate — license lives
  // on the wallet now, not the profile.
  const allRequired =
    !!display_name &&
    !!first_name &&
    !!last_name &&
    !!address_street &&
    !!address_city &&
    !!address_state &&
    !!address_zip

  if (allRequired) {
    try {
      await markStepDone(supabase, user.id, 'profile_set')
    } catch (e) {
      console.warn('[hunter.profile] onboarding mark failed', e)
    }
  }

  revalidatePath('/app/h')
  revalidatePath('/app/h/profile')
  revalidatePath('/app/h/welcome')
  return { ok: true }
}
