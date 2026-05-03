'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { US_STATES } from '@/lib/us-states'

// v27.1.5.1 — guide first-time onboarding wizard server actions.
//
// Each step is its own action and redirects to the next step on success.
// We pin the schema writes to the user-session client + .eq('user_id', ...)
// for defense-in-depth so a misconfigured RLS policy can't let one guide
// write another's profile via these actions.

async function getUserOrRedirect() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/app/onboarding')
  return { supabase, user }
}

// Step 1 — guide identity + state. Required: first_name, last_name, state.
// Optional: business_name (many guides operate as individuals, no LLC).
//
// Writes profiles (first_name, last_name, display_name = "first last")
// and upserts guide_profiles (state + nullable business_name). Two writes
// run sequentially; if the guide_profiles upsert fails after profiles
// already updated, the error path bounces back to step 1 with retry — the
// next attempt is idempotent on profiles.
export async function saveBusinessBasicsAction(formData: FormData): Promise<void> {
  const firstName = String(formData.get('first_name') ?? '').trim()
  const lastName = String(formData.get('last_name') ?? '').trim()
  const state = String(formData.get('state') ?? '').trim()
  // Empty business_name is fine — stored as NULL on guide_profiles.
  const businessNameRaw = String(formData.get('business_name') ?? '').trim()
  const businessName = businessNameRaw === '' ? null : businessNameRaw

  if (!firstName) {
    redirect('/app/onboarding?step=1&error=missing_first_name')
  }
  if (!lastName) {
    redirect('/app/onboarding?step=1&error=missing_last_name')
  }
  if (!state || !US_STATES.includes(state as (typeof US_STATES)[number])) {
    redirect('/app/onboarding?step=1&error=missing_state')
  }

  const { supabase, user } = await getUserOrRedirect()

  // 1. profiles — write first/last and keep display_name in sync. Upsert
  //    on id with role=guide so a freshly-created guide whose row didn't
  //    yet exist gets one.
  const displayName = `${firstName} ${lastName}`
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        first_name: firstName,
        last_name: lastName,
        display_name: displayName,
        role: 'guide',
      },
      { onConflict: 'id' }
    )
  if (profileErr) {
    console.warn('[onboarding.saveBusinessBasics.profile]', { code: profileErr.code, message: profileErr.message })
    redirect('/app/onboarding?step=1&error=save_failed')
  }

  // 2. guide_profiles — state + optional business_name. NULL business_name
  //    is the correct default for independent operators.
  const { error: guideErr } = await supabase
    .from('guide_profiles')
    .upsert(
      { user_id: user.id, state, business_name: businessName },
      { onConflict: 'user_id' }
    )
  if (guideErr) {
    console.warn('[onboarding.saveBusinessBasics.guide]', { code: guideErr.code, message: guideErr.message })
    redirect('/app/onboarding?step=1&error=save_failed')
  }

  revalidatePath('/app/onboarding')
  redirect('/app/onboarding?step=2')
}

// Step 2 — guide license. Creates a wallet_item of type 'guide_license'
// pointing at the signed-in guide's user_id. Also stamps
// guide_profiles.license_number + guide_license_expires_at so the legacy
// guide_profiles fields stay aligned with the wallet entry.
export async function saveGuideLicenseAction(formData: FormData): Promise<void> {
  const identifier = String(formData.get('identifier') ?? '').trim()
  const state = String(formData.get('state') ?? '').trim()
  const validTo = String(formData.get('valid_to') ?? '').trim()
  if (!identifier || !state || !validTo) {
    redirect('/app/onboarding?step=2&error=missing_fields')
  }

  const { supabase, user } = await getUserOrRedirect()
  const today = new Date().toISOString().slice(0, 10)

  const { error: walletErr } = await supabase
    .from('wallet_items')
    .insert({
      user_id: user.id,
      type: 'guide_license',
      jurisdiction: 'state',
      identifier,
      state,
      valid_from: today,
      valid_to: validTo,
    })
  if (walletErr) {
    console.warn('[onboarding.saveGuideLicense.wallet]', { code: walletErr.code, message: walletErr.message })
    redirect('/app/onboarding?step=2&error=save_failed')
  }

  // Best-effort: keep guide_profiles.license_number / expires_at in sync.
  // If this update fails the wallet item still exists — surface the wallet
  // entry as the source of truth and continue.
  await supabase
    .from('guide_profiles')
    .update({
      license_number: identifier,
      guide_license_expires_at: validTo,
    })
    .eq('user_id', user.id)

  revalidatePath('/app/onboarding')
  redirect('/app/onboarding?step=3')
}

// Step 2 / Step 3 — skip. Pure routing actions, no DB writes.
export async function skipToStepAction(formData: FormData): Promise<void> {
  const next = String(formData.get('next') ?? '3')
  redirect(`/app/onboarding?step=${next}`)
}

// Step 4 — finish. Stamps guide_profiles.onboarded_at = now() so future
// /app loads bypass the wizard (requireGuide() falls through). Bounces
// to /app on success.
export async function finishOnboardingAction(): Promise<void> {
  const { supabase, user } = await getUserOrRedirect()
  const { error } = await supabase
    .from('guide_profiles')
    .upsert(
      { user_id: user.id, onboarded_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) {
    console.warn('[onboarding.finish]', { code: error.code, message: error.message })
    redirect('/app/onboarding?step=4&error=finish_failed')
  }
  revalidatePath('/app')
  redirect('/app')
}
