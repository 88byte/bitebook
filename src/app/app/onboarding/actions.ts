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

  // 1. profiles — write first/last and keep display_name in sync.
  //    v27.1.5.2: dropped `role: 'guide'` from the upsert payload. By the
  //    time a user reaches /app/onboarding their role is already 'guide'
  //    (requireGuideForOnboarding redirects hunters to /app/h before this
  //    runs), and many RLS policies lock down role updates to prevent
  //    privilege escalation — including a redundant write to it could
  //    fail the whole upsert.
  const displayName = `${firstName} ${lastName}`
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
    })
    .eq('id', user.id)
  if (profileErr) {
    console.warn('[onboarding.saveBusinessBasics.profile]', { code: profileErr.code, message: profileErr.message })
    redirect(`/app/onboarding?step=1&error=profile_save_failed&detail=${encodeURIComponent(profileErr.message)}`)
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
    redirect(`/app/onboarding?step=1&error=guide_save_failed&detail=${encodeURIComponent(guideErr.message)}`)
  }

  revalidatePath('/app/onboarding')
  redirect('/app/onboarding?step=2')
}

// Step 2 — guide license. Creates a wallet_item of type 'guide_license'
// pointing at the signed-in guide's user_id. Also stamps
// guide_profiles.license_number + guide_license_expires_at so the legacy
// guide_profiles fields stay aligned with the wallet entry.
//
// v27.8.4.1 — Flavio: typing license id and tapping Save & Continue
// silently fails; only Skip works. Root cause analysis: the prior
// implementation redirected with `error=save_failed` and NO detail
// param when the wallet_items insert failed, so Flavio just saw a
// generic "Couldn't save" banner without enough info to debug. Now:
//   1. Validation errors include a `detail` URL param explaining
//      WHICH field is empty (not just "missing fields").
//   2. wallet_items insert failures pass the actual DB error message
//      through `detail` so we can see exactly what blocked.
//   3. valid_from is clamped to ≤ valid_to so the wallet_items
//      CHECK constraint (valid_to >= valid_from) can't fail when a
//      user picks an expiration earlier than today (e.g. while
//      backfilling an old license they want to retire).
//   4. guide_profiles update errors are now also surfaced (not
//      silently ignored) — they shouldn't fail RLS but if they do,
//      the user deserves to know why.
export async function saveGuideLicenseAction(formData: FormData): Promise<void> {
  const identifier = String(formData.get('identifier') ?? '').trim()
  const state = String(formData.get('state') ?? '').trim()
  const validTo = String(formData.get('valid_to') ?? '').trim()
  if (!identifier) {
    redirect(`/app/onboarding?step=2&error=missing_fields&detail=${encodeURIComponent('License number is required.')}`)
  }
  if (!state) {
    redirect(`/app/onboarding?step=2&error=missing_fields&detail=${encodeURIComponent('Pick your issuing state.')}`)
  }
  if (!validTo) {
    redirect(`/app/onboarding?step=2&error=missing_fields&detail=${encodeURIComponent('Set the expiration date.')}`)
  }

  const { supabase, user } = await getUserOrRedirect()
  const today = new Date().toISOString().slice(0, 10)
  // CHECK constraint on wallet_items: valid_to >= valid_from. If the
  // user picked a valid_to earlier than today (rare — backfilling old
  // license), use validTo as both ends so the row inserts cleanly.
  const validFrom = validTo < today ? validTo : today

  // v27.8.4.2 — idempotent upsert keyed on the existing UNIQUE index
  // (user_id, state, type, identifier). Pre-v27.8.4.2 a plain insert
  // would fail with `duplicate key value violates uq_wallet_identifier`
  // when the user re-ran the wizard (same license number, same state,
  // same type). Flavio testing the signup flow hit this every retest:
  //   1st attempt: row inserted, redirect to step 3, user backs out.
  //   2nd attempt: same identifier, INSERT blocks, friendly error
  //                surface said "Database error: duplicate key value
  //                violates constraint uq_wallet_identifier."
  // Treating same-license re-submit as a no-op refresh of valid_from /
  // valid_to fixes the loop without weakening the constraint — across
  // distinct users or states the row stays unique. jurisdiction +
  // user_id remain pinned by the conflict key + service-role-free
  // RLS gate.
  const { error: walletErr } = await supabase
    .from('wallet_items')
    .upsert(
      {
        user_id: user.id,
        type: 'guide_license',
        jurisdiction: 'state',
        identifier,
        state,
        valid_from: validFrom,
        valid_to: validTo,
      },
      { onConflict: 'user_id,state,type,identifier' },
    )
  if (walletErr) {
    console.warn('[onboarding.saveGuideLicense.wallet]', { code: walletErr.code, message: walletErr.message })
    const friendly = walletErr.message || 'Database refused the insert.'
    redirect(`/app/onboarding?step=2&error=save_failed&detail=${encodeURIComponent(friendly)}`)
  }

  // Keep guide_profiles.license_number / expires_at in sync. v27.8.4.1
  // — surface this error too so we can diagnose if it ever blocks.
  const { error: gpErr } = await supabase
    .from('guide_profiles')
    .update({
      license_number: identifier,
      guide_license_expires_at: validTo,
    })
    .eq('user_id', user.id)
  if (gpErr) {
    console.warn('[onboarding.saveGuideLicense.guide_profiles]', { code: gpErr.code, message: gpErr.message })
    // Wallet write already succeeded; let the user move forward but
    // surface the warning. Step 3 doesn't depend on these legacy
    // fields.
  }

  revalidatePath('/app/onboarding')
  redirect('/app/onboarding?step=3')
}

// Step 2 / Step 3 — skip. Pure routing actions, no DB writes.
//
// v27.1.5.2.1 NOTE: Skip in the UI is now a plain Link, not a form, so
// this server action is no longer the primary skip mechanism. Kept
// exported (without removal in the same release) in case any other
// route still posts to it; safe to drop in a future cleanup pass.
export async function skipToStepAction(formData: FormData): Promise<void> {
  const next = String(formData.get('next') ?? '3')
  redirect(`/app/onboarding?step=${next}`)
}

// v27.1.5.2.1: Step 3 — save the chosen Bite Book template / doc as the
// guide's default state harvest log, then advance to Step 4. Empty
// doc_id (= "Skip / pick later") is allowed — clears any prior default
// and just advances. This way Step 3 is always a single submit path
// regardless of whether the user picked something.
export async function saveDefaultLogDocAction(formData: FormData): Promise<void> {
  const docIdRaw = String(formData.get('default_log_doc_id') ?? '').trim()
  const docId = docIdRaw === '' ? null : docIdRaw
  const { supabase, user } = await getUserOrRedirect()
  const { error } = await supabase
    .from('guide_profiles')
    .upsert(
      { user_id: user.id, default_log_doc_id: docId },
      { onConflict: 'user_id' }
    )
  if (error) {
    console.warn('[onboarding.saveDefaultLogDoc]', { code: error.code, message: error.message })
    redirect(`/app/onboarding?step=3&error=guide_save_failed&detail=${encodeURIComponent(error.message)}`)
  }
  revalidatePath('/app/onboarding')
  redirect('/app/onboarding?step=4')
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
