'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireGuide } from '../_lib/auth'
import { markStepDone } from '../_lib/onboarding'
import { US_STATES } from '@/lib/us-states'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, ensureBitebookGuidePrices } from '@/lib/stripe'

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

  // v27.4.0 — Guide license fieldset, written into the columns the
  // schema already had reserved (state, license_number,
  // guide_license_expires_at). This is the guide's professional
  // outfitter/master-guide license, separate from the hunter wallet
  // entries. Optional — guides who don't carry a state-issued license
  // can leave all three blank. Empty strings normalize to NULL.
  const licenseStateRaw = String(formData.get('license_state') ?? '').trim().toUpperCase()
  const license_state =
    licenseStateRaw && licenseStateRaw.length === 2 && (US_STATES as readonly string[]).includes(licenseStateRaw)
      ? licenseStateRaw
      : null
  const license_number = String(formData.get('license_number') ?? '').trim().slice(0, 64) || null
  const licenseExpiresRaw = String(formData.get('license_expires_at') ?? '').trim()
  // ISO yyyy-mm-dd or empty. Postgres date column will reject malformed
  // values; we let it bubble up as a save error rather than try to parse.
  const license_expires_at =
    licenseExpiresRaw && /^\d{4}-\d{2}-\d{2}$/.test(licenseExpiresRaw) ? licenseExpiresRaw : null

  // v27.4.0 — Defaults fieldset. default_log_doc_id ties the trip's
  // "Generate harvest log" flow to a specific log doc by default.
  // Empty string clears the default (writes NULL). Validated against
  // the guide's own non-archived log docs below.
  const defaultLogDocIdRaw = String(formData.get('default_log_doc_id') ?? '').trim()
  let default_log_doc_id: string | null = null
  if (defaultLogDocIdRaw) {
    // Defense-in-depth: confirm the doc exists, belongs to this guide,
    // and is a kind=log non-archived row before we trust the value.
    const { data: docCheck } = await (await createClient())
      .from('docs')
      .select('id')
      .eq('id', defaultLogDocIdRaw)
      .eq('guide_id', user.id)
      .eq('kind', 'log')
      .is('archived_at', null)
      .maybeSingle()
    default_log_doc_id = docCheck?.id ?? null
  }

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
      // v27.4.0 — guide license fieldset.
      state: license_state,
      license_number,
      guide_license_expires_at: license_expires_at,
      // v27.4.0 — defaults fieldset.
      default_log_doc_id,
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

// ── v27.4.0 — Signature defaults ───────────────────────────────────────────
//
// Saves the guide's drawn signature to bb-private at
// `signatures/{user_id}/signature.png` and writes the path to
// `guide_profiles.default_signature_path`. Sign modals read this path
// at sign time and pre-fill the canvas — guides can accept or
// re-draw per-event without retyping their signature on every doc.
//
// Storage RLS (signatures_owner_all) gates writes to the matching
// `auth.uid()` folder. Path is stable so we overwrite in place
// instead of generating a new filename on each save.

export type SignatureDefaultResult = { ok: true; path: string } | { error: string }

const SIGNATURE_BUCKET = 'bb-private' as const

function signaturePathFor(userId: string): string {
  return `signatures/${userId}/signature.png`
}

export async function saveDefaultSignatureAction(dataUrl: string): Promise<SignatureDefaultResult> {
  const { user } = await requireGuide()
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
    return { error: 'Signature image must be a PNG data URL.' }
  }
  // Cap raw size at 1 MB to keep storage cost bounded — typical
  // bbox-cropped signatures land at 30–80 KB.
  const base64 = dataUrl.slice('data:image/png;base64,'.length)
  if (base64.length > 1_500_000) {
    return { error: 'Signature image is too large. Try clearing and signing again.' }
  }
  const buf = Buffer.from(base64, 'base64')
  if (buf.length === 0) return { error: 'Signature image is empty.' }

  const supabase = await createClient()
  const path = signaturePathFor(user.id)
  const upload = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, buf, { contentType: 'image/png', upsert: true })
  if (upload.error) {
    console.warn('[settings.saveDefaultSignatureAction:upload]', {
      message: upload.error.message,
    })
    return { error: upload.error.message || 'Could not save signature.' }
  }

  const updated = await supabase
    .from('guide_profiles')
    .update({ default_signature_path: path })
    .eq('user_id', user.id)
  if (updated.error) {
    console.warn('[settings.saveDefaultSignatureAction:db]', {
      code: updated.error.code,
      message: updated.error.message,
    })
    return { error: updated.error.message || 'Saved the file but couldn\'t link it to your profile.' }
  }

  revalidatePath('/app/settings')
  return { ok: true, path }
}

export async function clearDefaultSignatureAction(): Promise<SettingsActionResult> {
  const { user } = await requireGuide()
  const supabase = await createClient()
  const path = signaturePathFor(user.id)
  // Best-effort delete — RLS already gates by auth.uid(), no user_id
  // check needed.
  await supabase.storage.from(SIGNATURE_BUCKET).remove([path])
  const updated = await supabase
    .from('guide_profiles')
    .update({ default_signature_path: null })
    .eq('user_id', user.id)
  if (updated.error) {
    console.warn('[settings.clearDefaultSignatureAction]', {
      code: updated.error.code,
      message: updated.error.message,
    })
    return { error: updated.error.message || 'Could not clear default signature.' }
  }
  revalidatePath('/app/settings')
  return { ok: true }
}

// ── v27.4.0 — Billing (Stripe Customer Portal) ─────────────────────────────
//
// `createBillingPortalAction` looks up the guide's stripe_customer_id,
// creates a one-time portal session, and `redirect()`s the browser to
// the Stripe-hosted portal. The portal handles change-card,
// change-plan (between bitebook_guide_monthly_v2 / annual_v2),
// cancel/reactivate, and invoice history. On portal exit, Stripe
// returns the user to /app/settings?tab=billing.
//
// Edge cases:
//   - No outfitter_subscriptions row → return error so the UI shows
//     "contact support" instead of attempting the portal.
//   - Row exists but stripe_customer_id is NULL → same.
//   - status='incomplete' → portal can't recover an incomplete sub
//     cleanly; the UI surfaces a "Restart signup" CTA in that case
//     (handled in BillingPanel rendering, not here).
// Form-action compatible: accepts FormData (ignored), returns Promise<void>.
// Redirects throw the Next.js redirect signal — they don't return. Any
// real failure path redirects back to the settings billing tab with a
// `?billing_error=` query param so the BillingPanel can surface the
// message inline. The BillingPanel pre-gates rendering on a present
// subscription row, so the error path is mostly defensive.
export async function createBillingPortalAction(_formData?: FormData): Promise<void> {
  const { user } = await requireGuide()

  const admin = createAdminClient()
  const { data: sub, error: subErr } = await admin
    .from('outfitter_subscriptions')
    .select('stripe_customer_id, status')
    .eq('guide_id', user.id)
    .maybeSingle()

  const origin = process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://bitebook.lastbite.pro'

  if (subErr) {
    console.warn('[settings.createBillingPortalAction:lookup]', {
      code: subErr.code,
      message: subErr.message,
    })
    redirect(`${origin}/app/settings?tab=billing&billing_error=lookup_failed`)
  }
  if (!sub || !sub.stripe_customer_id) {
    redirect(`${origin}/app/settings?tab=billing&billing_error=no_subscription`)
  }

  let stripe
  try {
    stripe = getStripe()
  } catch (e) {
    console.warn('[settings.createBillingPortalAction:stripe-init]', {
      message: (e as Error).message,
    })
    redirect(`${origin}/app/settings?tab=billing&billing_error=stripe_unavailable`)
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/app/settings?tab=billing`,
    })
    redirect(session.url)
  } catch (e) {
    // Re-throw redirect signals — Next.js uses thrown errors for
    // redirect/notFound. Anything else is a real failure.
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
    if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e
    console.warn('[settings.createBillingPortalAction:portal]', {
      message: (e as Error).message,
    })
    redirect(`${origin}/app/settings?tab=billing&billing_error=portal_failed`)
  }
}

// ── v27.4.1 — Native billing UI: card update via Stripe Elements ──────────
//
// Two-step flow keeps card data Stripe-direct:
//   1. createSetupIntentAction — server creates a SetupIntent for the
//      guide's customer, returns the client secret. Client mounts
//      Stripe Elements with the secret and confirms via stripe.js
//      (card data never touches our servers; Stripe returns a
//      PaymentMethod id).
//   2. replacePaymentMethodAction(paymentMethodId) — server attaches
//      the PaymentMethod to the customer, sets it as the customer's
//      invoice_settings.default_payment_method AND the subscription's
//      default_payment_method, then detaches the old PM (best-effort).
//
// outfitter_subscriptions doesn't track PM details — the source of
// truth lives Stripe-side and the BillingPanel re-reads on each
// render. Card update doesn't need a webhook handler; the existing
// customer.subscription.updated webhook still fires and our row
// stays in sync if anything else changes alongside.

export type CreateSetupIntentResult =
  | { ok: true; client_secret: string; customer_id: string }
  | { error: string }

export async function createSetupIntentAction(): Promise<CreateSetupIntentResult> {
  const { user } = await requireGuide()

  const admin = createAdminClient()
  const { data: sub } = await admin
    .from('outfitter_subscriptions')
    .select('stripe_customer_id')
    .eq('guide_id', user.id)
    .maybeSingle()
  if (!sub?.stripe_customer_id) {
    return {
      error: 'We can\'t find your billing account. Email support@lastbite.pro and we\'ll fix it.',
    }
  }

  let stripe
  try {
    stripe = getStripe()
  } catch (e) {
    return { error: (e as Error).message }
  }

  try {
    const intent = await stripe.setupIntents.create({
      customer: sub.stripe_customer_id,
      payment_method_types: ['card'],
      // Off-session usage so future renewals can charge without a
      // re-auth challenge. Stripe will still 3DS-verify the initial
      // setup if the issuer requires it.
      usage: 'off_session',
      metadata: { supabase_user_id: user.id },
    })
    if (!intent.client_secret) {
      return { error: 'Stripe did not return a setup secret. Try again.' }
    }
    return {
      ok: true,
      client_secret: intent.client_secret,
      customer_id: sub.stripe_customer_id,
    }
  } catch (e) {
    console.warn('[settings.createSetupIntentAction]', { message: (e as Error).message })
    return { error: 'Could not start the card update. Try again.' }
  }
}

export type ReplacePaymentMethodResult = { ok: true } | { error: string }

export async function replacePaymentMethodAction(
  paymentMethodId: string,
): Promise<ReplacePaymentMethodResult> {
  const { user } = await requireGuide()

  if (!paymentMethodId || !paymentMethodId.startsWith('pm_')) {
    return { error: 'Invalid payment method.' }
  }

  const admin = createAdminClient()
  const { data: sub } = await admin
    .from('outfitter_subscriptions')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('guide_id', user.id)
    .maybeSingle()
  if (!sub?.stripe_customer_id) {
    return { error: 'We can\'t find your billing account. Email support@lastbite.pro.' }
  }

  let stripe
  try {
    stripe = getStripe()
  } catch (e) {
    return { error: (e as Error).message }
  }

  try {
    // 1. Attach the new PM to the customer (idempotent if already attached).
    await stripe.paymentMethods.attach(paymentMethodId, { customer: sub.stripe_customer_id })

    // 2. Set as customer-level default — drives invoice billing on
    //    new subscriptions and is the fallback when subscription-level
    //    default isn't set.
    await stripe.customers.update(sub.stripe_customer_id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })

    // 3. Set as subscription-level default — guarantees the active
    //    subscription's next invoice charges this PM. Also pull the
    //    previous default so we can detach it (cleanup).
    let previousPmId: string | null = null
    if (sub.stripe_subscription_id) {
      try {
        const existing = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
        const pm = existing.default_payment_method
        if (pm && typeof pm === 'object' && 'id' in pm) {
          previousPmId = (pm as { id: string }).id
        } else if (typeof pm === 'string') {
          previousPmId = pm
        }
      } catch {
        // Non-fatal; we'll still update.
      }
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        default_payment_method: paymentMethodId,
      })
    }

    // 4. Best-effort detach old PM. Don't fail the action if this errors —
    //    the new PM is already in place.
    if (previousPmId && previousPmId !== paymentMethodId) {
      try {
        await stripe.paymentMethods.detach(previousPmId)
      } catch (e) {
        console.warn('[settings.replacePaymentMethodAction:detach]', {
          message: (e as Error).message,
        })
      }
    }

    revalidatePath('/app/settings')
    return { ok: true }
  } catch (e) {
    console.warn('[settings.replacePaymentMethodAction]', { message: (e as Error).message })
    return { error: 'Could not save the new card. Try again.' }
  }
}

// ── v27.4.2 — Plan switch + cancel/reactivate (native) ───────────────────
//
// All three actions resolve the active subscription_item from the
// stored stripe_subscription_id so we never have to track item IDs in
// our DB. Webhook flow is unchanged — Stripe fires
// customer.subscription.updated on every change and the existing
// handler reconciles outfitter_subscriptions in the same shape as
// before. revalidatePath('/app/settings') refreshes the BillingPanel
// after each action.

type PlanInterval = 'month' | 'year'

async function loadActiveSubscriptionItem(
  guideId: string,
): Promise<
  | { ok: true; subscriptionId: string; itemId: string; currentPriceId: string; currentInterval: PlanInterval; customerId: string }
  | { error: string }
> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('outfitter_subscriptions')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!row?.stripe_subscription_id || !row.stripe_customer_id) {
    return { error: 'We can\'t find your subscription. Email support@lastbite.pro.' }
  }
  let stripe
  try {
    stripe = getStripe()
  } catch (e) {
    return { error: (e as Error).message }
  }
  try {
    const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
    const item = sub.items.data[0]
    if (!item) return { error: 'Subscription has no plan attached. Contact support.' }
    const priceId = item.price?.id
    const interval = item.price?.recurring?.interval === 'year' ? 'year' : 'month'
    if (!priceId) return { error: 'Could not read your current plan. Try again.' }
    return {
      ok: true,
      subscriptionId: sub.id,
      itemId: item.id,
      currentPriceId: priceId,
      currentInterval: interval as PlanInterval,
      customerId: row.stripe_customer_id,
    }
  } catch (e) {
    console.warn('[settings.loadActiveSubscriptionItem]', { message: (e as Error).message })
    return { error: 'Could not load your subscription. Try again.' }
  }
}

export type PlanSwitchPreview = {
  ok: true
  current_interval: PlanInterval
  target_interval: PlanInterval
  // Net amount due immediately, in the smallest currency unit.
  // POSITIVE = guide pays today. NEGATIVE = credit applied to future
  // invoices (Stripe doesn't refund cards on plan switches by default).
  amount_due_cents: number
  currency: string
  next_period_end_unix: number | null
}

export type PlanSwitchPreviewResult =
  | PlanSwitchPreview
  | { error: string }

// Stripe SDK 2026-04-22.dahlia exposes `invoices.createPreview` as the
// successor to the deprecated `retrieveUpcoming`. The shape of the
// request body and response are identical except for the method name
// and the `subscription_details` nesting. We use ad-hoc typing for
// the request body since the SDK's types haven't fully migrated.
//
// `subscription_proration_date` is intentionally omitted so Stripe
// uses "now" as the proration boundary, matching the actual switch.
type CreatePreviewBody = {
  customer: string
  subscription: string
  subscription_details: {
    items: Array<{ id: string; price: string }>
    proration_behavior: 'create_prorations'
  }
}

export async function previewPlanSwitchAction(
  targetInterval: PlanInterval,
): Promise<PlanSwitchPreviewResult> {
  const { user } = await requireGuide()
  if (targetInterval !== 'month' && targetInterval !== 'year') {
    return { error: 'Pick monthly or annual.' }
  }
  const ctx = await loadActiveSubscriptionItem(user.id)
  if ('error' in ctx) return ctx
  if (ctx.currentInterval === targetInterval) {
    return { error: 'You\'re already on that plan.' }
  }

  let stripe, prices
  try {
    stripe = getStripe()
    prices = await ensureBitebookGuidePrices()
  } catch (e) {
    return { error: (e as Error).message }
  }
  const targetPriceId = targetInterval === 'month' ? prices.monthly : prices.annual

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripeAny = stripe as any
    const body: CreatePreviewBody = {
      customer: ctx.customerId,
      subscription: ctx.subscriptionId,
      subscription_details: {
        items: [{ id: ctx.itemId, price: targetPriceId }],
        proration_behavior: 'create_prorations',
      },
    }
    const preview = stripeAny.invoices?.createPreview
      ? await stripeAny.invoices.createPreview(body)
      : // Fallback to the older endpoint if the SDK build doesn't
        // expose createPreview yet — same call shape minus the
        // subscription_details nesting.
        await stripeAny.invoices.retrieveUpcoming({
          customer: ctx.customerId,
          subscription: ctx.subscriptionId,
          subscription_items: [{ id: ctx.itemId, price: targetPriceId }],
          subscription_proration_behavior: 'create_prorations',
        })
    return {
      ok: true,
      current_interval: ctx.currentInterval,
      target_interval: targetInterval,
      amount_due_cents: typeof preview.amount_due === 'number' ? preview.amount_due : 0,
      currency: typeof preview.currency === 'string' ? preview.currency : 'usd',
      next_period_end_unix:
        typeof preview.period_end === 'number'
          ? preview.period_end
          : typeof preview.lines?.data?.[0]?.period?.end === 'number'
            ? preview.lines.data[0].period.end
            : null,
    }
  } catch (e) {
    console.warn('[settings.previewPlanSwitchAction]', { message: (e as Error).message })
    return { error: 'Could not preview the plan switch. Try again.' }
  }
}

export type PlanSwitchResult = { ok: true } | { error: string }

export async function confirmPlanSwitchAction(
  targetInterval: PlanInterval,
): Promise<PlanSwitchResult> {
  const { user } = await requireGuide()
  if (targetInterval !== 'month' && targetInterval !== 'year') {
    return { error: 'Pick monthly or annual.' }
  }
  const ctx = await loadActiveSubscriptionItem(user.id)
  if ('error' in ctx) return ctx
  if (ctx.currentInterval === targetInterval) {
    return { error: 'You\'re already on that plan.' }
  }

  let stripe, prices
  try {
    stripe = getStripe()
    prices = await ensureBitebookGuidePrices()
  } catch (e) {
    return { error: (e as Error).message }
  }
  const targetPriceId = targetInterval === 'month' ? prices.monthly : prices.annual

  try {
    await stripe.subscriptions.update(ctx.subscriptionId, {
      items: [{ id: ctx.itemId, price: targetPriceId }],
      proration_behavior: 'create_prorations',
    })
    revalidatePath('/app/settings')
    return { ok: true }
  } catch (e) {
    console.warn('[settings.confirmPlanSwitchAction]', { message: (e as Error).message })
    return { error: 'Could not switch plan. Try again.' }
  }
}

// ── Cancel + reactivate ─────────────────────────────────────────────────

export type CancelResult = { ok: true } | { error: string }

export async function cancelSubscriptionAction(): Promise<CancelResult> {
  const { user } = await requireGuide()
  const ctx = await loadActiveSubscriptionItem(user.id)
  if ('error' in ctx) return ctx

  let stripe
  try {
    stripe = getStripe()
  } catch (e) {
    return { error: (e as Error).message }
  }
  try {
    await stripe.subscriptions.update(ctx.subscriptionId, {
      cancel_at_period_end: true,
    })
    revalidatePath('/app/settings')
    return { ok: true }
  } catch (e) {
    console.warn('[settings.cancelSubscriptionAction]', { message: (e as Error).message })
    return { error: 'Could not cancel. Try again.' }
  }
}

export async function reactivateSubscriptionAction(): Promise<CancelResult> {
  const { user } = await requireGuide()
  const ctx = await loadActiveSubscriptionItem(user.id)
  if ('error' in ctx) return ctx

  let stripe
  try {
    stripe = getStripe()
  } catch (e) {
    return { error: (e as Error).message }
  }
  try {
    await stripe.subscriptions.update(ctx.subscriptionId, {
      cancel_at_period_end: false,
    })
    revalidatePath('/app/settings')
    return { ok: true }
  } catch (e) {
    console.warn('[settings.reactivateSubscriptionAction]', { message: (e as Error).message })
    return { error: 'Could not reactivate. Try again.' }
  }
}
