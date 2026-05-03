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

// Step 1 — business basics. Writes guide_profiles.business_name + state.
// Upserts so the row exists for new guides whose Stripe-created profile
// row hadn't been written yet.
export async function saveBusinessBasicsAction(formData: FormData): Promise<void> {
  const businessName = String(formData.get('business_name') ?? '').trim()
  const state = String(formData.get('state') ?? '').trim()
  if (!businessName) {
    redirect('/app/onboarding?step=1&error=missing_business_name')
  }
  if (!state || !US_STATES.includes(state as (typeof US_STATES)[number])) {
    redirect('/app/onboarding?step=1&error=missing_state')
  }

  const { supabase, user } = await getUserOrRedirect()
  const { error } = await supabase
    .from('guide_profiles')
    .upsert(
      { user_id: user.id, business_name: businessName, state },
      { onConflict: 'user_id' }
    )
  if (error) {
    console.warn('[onboarding.saveBusinessBasics]', { code: error.code, message: error.message })
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
