'use server'

// v28.1.0b — Server actions for the outfitter upgrade wizard.
//
// Flow:
//   1. Wizard collects org info + optional logo (uploaded to a temp
//      path keyed by a client-generated UUID).
//   2. uploadOutfitterLogoAction stores the file under
//      outfitter-logos/{tempId}/{filename}. The webhook moves it to
//      outfitter-logos/{org_id}/ on successful checkout.
//   3. createOutfitterCheckoutAction creates the Stripe Checkout
//      session with all metadata the webhook needs to complete the
//      upgrade (org name, license, address, temp logo path, keep-
//      guide-sub flag, owner profile id). Returns the Checkout URL.
//   4. User pays. Webhook fires → completeOutfitterUpgrade inserts
//      outfitter_orgs + outfitter_org_members(owner) + flips
//      profiles.account_tier + moves logo + (optional) cancels guide
//      sub at period end.

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireUser } from '../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, ensureBitebookOutfitterPrices, OUTFITTER_TRIAL_DAYS } from '@/lib/stripe'

// v28.1.0b.1 — Test-bypass allowlist. flaviod022@gmail.com is the
// default permanent entry; OUTFITTER_TEST_ALLOWLIST env var (comma-
// separated) can extend it. Email match is case-insensitive.
const TEST_BYPASS_BUILTIN: ReadonlyArray<string> = ['flaviod022@gmail.com']
function isTestBypassAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase()
  if (TEST_BYPASS_BUILTIN.includes(e)) return true
  const envList = (process.env.OUTFITTER_TEST_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return envList.includes(e)
}

// Exported so the wizard can render the test-bypass affordance for
// allowlisted users only. Server-side check inside the action below
// is the actual gate; the export is just so the UI doesn't render a
// link for users who'd hit a 403 anyway.
export async function isCurrentUserTestBypassAllowed(): Promise<boolean> {
  const { user } = await requireUser()
  return isTestBypassAllowed(user.email)
}

const ALLOWED_LOGO_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
])

export type UploadLogoResult =
  | { ok: true; temp_id: string; temp_path: string }
  | { error: string }

// Client uploads via FormData (a File). We round-trip through the
// authenticated Supabase client so RLS + bucket constraints enforce
// type + size limits at the storage layer.
export async function uploadOutfitterLogoAction(fd: FormData): Promise<UploadLogoResult> {
  const { user } = await requireUser()
  const file = fd.get('file')
  if (!(file instanceof File)) return { error: 'No file provided.' }
  if (!ALLOWED_LOGO_MIME.has(file.type)) {
    return { error: 'Logo must be PNG, JPEG, WebP, or SVG.' }
  }
  if (file.size > 2 * 1024 * 1024) return { error: 'Logo must be under 2 MB.' }

  // Generate a temp id keyed by the user — webhook will move from
  // {tempId}/ → {orgId}/ on checkout completion.
  const tempId = randomUUID()
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
  const filename = `logo.${ext || 'png'}`
  const path = `${tempId}/${filename}`

  const sb = await createClient()
  const { error } = await sb.storage.from('outfitter-logos').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    console.warn('[upload-outfitter-logo]', { code: (error as { statusCode?: number }).statusCode, message: error.message, user: user.id })
    return { error: error.message || 'Logo upload failed.' }
  }
  return { ok: true, temp_id: tempId, temp_path: path }
}

export type CreateOutfitterCheckoutResult =
  | { ok: true; url: string }
  | { error: string }

export async function createOutfitterCheckoutAction(
  payload: {
    org_name: string
    state?: string | null
    commercial_license_number?: string | null
    business_address?: string | null
    temp_logo_path?: string | null
    interval: 'month' | 'year'
    keep_guide_sub: boolean
  },
): Promise<CreateOutfitterCheckoutResult> {
  const { user, profile } = await requireUser()
  if (profile.account_tier === 'outfitter_owner' || profile.account_tier === 'outfitter_admin') {
    return { error: 'You already belong to an outfitter org.' }
  }

  const orgName = (payload.org_name || '').trim()
  if (!orgName) return { error: 'Org name is required.' }
  if (orgName.length < 2) return { error: 'Org name must be at least 2 characters.' }
  if (orgName.length > 80) return { error: 'Org name must be 80 characters or fewer.' }

  const prices = await ensureBitebookOutfitterPrices()
  const priceId = payload.interval === 'year' ? prices.yearly : prices.monthly

  const stripe = getStripe()

  // Reuse the existing Stripe customer id from the user's guide sub if
  // present, so the outfitter sub attaches to the same customer (one
  // customer, multiple subscriptions — clean billing portal UX).
  let customerId: string | null = null
  {
    const admin = createAdminClient()
    const { data } = await admin
      .from('outfitter_subscriptions')
      .select('stripe_customer_id')
      .eq('guide_id', profile.id)
      .maybeSingle()
    customerId = data?.stripe_customer_id ?? null
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://bitebook.lastbite.pro'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer: customerId ?? undefined,
    customer_email: customerId ? undefined : user.email,
    metadata: {
      upgrade_target: 'outfitter',
      owner_profile_id: profile.id,
      supabase_user_id: profile.id,
      org_name: orgName,
      state: (payload.state || '').toUpperCase().slice(0, 2),
      commercial_license_number: (payload.commercial_license_number || '').slice(0, 120),
      business_address: (payload.business_address || '').slice(0, 240),
      temp_logo_path: payload.temp_logo_path || '',
      keep_guide_sub: payload.keep_guide_sub ? 'true' : 'false',
    },
    subscription_data: {
      // v28.1.0b.1 — Override the price-level trial. Existing live
      // prices in Stripe still have 14 days baked in (Stripe prices
      // are immutable), so we override per-session to guarantee the
      // effective trial matches OUTFITTER_TRIAL_DAYS (7).
      trial_period_days: OUTFITTER_TRIAL_DAYS,
      metadata: {
        upgrade_target: 'outfitter',
        owner_profile_id: profile.id,
        supabase_user_id: profile.id,
      },
    },
    success_url: `${origin}/app/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/app/upgrade-to-outfitter?canceled=true`,
    allow_promotion_codes: false,
  })

  if (!session.url) return { error: 'Stripe did not return a Checkout URL.' }
  return { ok: true, url: session.url }
}

// v28.1.0b — Fallback completion. Called from /app/upgrade-success if
// the page loads before the webhook has had time to run. Idempotent
// with the webhook path. Reuses completeOutfitterUpgrade.
export async function completeUpgradeFromSessionAction(
  sessionId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!sessionId) return { error: 'Missing session id.' }
  const { profile } = await requireUser()

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (!session) return { error: 'Checkout session not found.' }
  if (session.metadata?.owner_profile_id !== profile.id) {
    // Defense: prevent another user from completing a session that
    // wasn't theirs.
    return { error: 'Session does not belong to this user.' }
  }
  if (!session.subscription) return { error: 'No subscription on this session yet.' }
  const sub = await stripe.subscriptions.retrieve(session.subscription as string)

  const admin = createAdminClient()
  const { completeOutfitterUpgrade } = await import('@/app/api/stripe/webhook/route')
  await completeOutfitterUpgrade(admin, sub, session)
  revalidatePath('/app')
  return { ok: true }
}

// v28.1.0b.1 — Admin test-bypass. Allowlisted users (Flavio +
// anything in OUTFITTER_TEST_ALLOWLIST) can stand up an outfitter
// org without touching Stripe. The resulting org is flagged with
// is_test=true and subscription_status='comp' so we can wipe these
// rows before public launch. Mirrors what the webhook does for the
// real path: creates org row, owner member, flips profile tier,
// moves logo from temp path to {orgId}/. Stripe customer + sub IDs
// stay null.
export type BypassOutfitterCheckoutResult =
  | { ok: true; org_id: string }
  | { error: string }

export async function bypassOutfitterCheckoutForTesting(
  payload: {
    org_name: string
    state?: string | null
    commercial_license_number?: string | null
    business_address?: string | null
    temp_logo_path?: string | null
  },
): Promise<BypassOutfitterCheckoutResult> {
  const { user, profile } = await requireUser()
  // Server-side gate. UI link only renders for allowlisted users
  // but a curious caller hitting the action directly gets 403.
  if (!isTestBypassAllowed(user.email)) {
    return { error: 'Not authorized for test bypass.' }
  }
  if (profile.account_tier === 'outfitter_owner' || profile.account_tier === 'outfitter_admin') {
    return { error: 'You already belong to an outfitter org.' }
  }

  const orgName = (payload.org_name || '').trim()
  if (!orgName) return { error: 'Org name is required.' }
  if (orgName.length < 2) return { error: 'Org name must be at least 2 characters.' }
  if (orgName.length > 80) return { error: 'Org name must be 80 characters or fewer.' }

  const state = (payload.state || '').trim().toUpperCase().slice(0, 2) || null
  const licenseNumber = (payload.commercial_license_number || '').trim().slice(0, 120) || null
  const businessAddress = (payload.business_address || '').trim().slice(0, 240) || null
  const tempLogoPath = (payload.temp_logo_path || '').trim() || null

  const admin = createAdminClient()
  // Idempotent: if a comp org already exists for this owner, return
  // it rather than spawning a second.
  const { data: existing } = await admin
    .from('outfitter_orgs')
    .select('id')
    .eq('owner_profile_id', profile.id)
    .eq('is_test', true)
    .is('archived_at', null)
    .maybeSingle()
  if (existing?.id) {
    await admin.from('profiles').update({
      account_tier: 'outfitter_owner',
      current_outfitter_org_id: existing.id,
    }).eq('id', profile.id)
    revalidatePath('/app')
    return { ok: true, org_id: existing.id }
  }

  const { data: created, error: insErr } = await admin
    .from('outfitter_orgs')
    .insert({
      name: orgName,
      owner_profile_id: profile.id,
      state,
      commercial_license_number: licenseNumber,
      business_address: businessAddress,
      logo_url: null,
      subscription_status: 'comp',
      stripe_subscription_id: null,
      stripe_customer_id: null,
      is_test: true,
    })
    .select('id')
    .single()
  if (insErr || !created) {
    console.error('[bypass-outfitter] insert org failed:', insErr?.message)
    return { error: insErr?.message || 'Could not create org.' }
  }
  const orgId = created.id

  // Owner member row (3-seat trigger never trips on the first insert).
  const { error: memErr } = await admin.from('outfitter_org_members').insert({
    org_id: orgId,
    profile_id: profile.id,
    role: 'owner',
    invited_by: profile.id,
    joined_at: new Date().toISOString(),
  })
  if (memErr) {
    console.error('[bypass-outfitter] owner-member insert failed:', memErr.message)
  }

  const { error: profErr } = await admin.from('profiles').update({
    account_tier: 'outfitter_owner',
    current_outfitter_org_id: orgId,
  }).eq('id', profile.id)
  if (profErr) {
    console.error('[bypass-outfitter] profile tier flip failed:', profErr.message)
  }

  // Move temp logo into {orgId}/ same as the real path.
  if (tempLogoPath && tempLogoPath.includes('/')) {
    try {
      const filename = tempLogoPath.split('/').pop()!
      const newPath = `${orgId}/${filename}`
      const { error: moveErr } = await admin.storage
        .from('outfitter-logos')
        .move(tempLogoPath, newPath)
      if (moveErr) {
        console.warn('[bypass-outfitter] logo move failed:', moveErr.message)
      } else {
        const { data: pub } = admin.storage.from('outfitter-logos').getPublicUrl(newPath)
        if (pub?.publicUrl) {
          await admin.from('outfitter_orgs').update({ logo_url: pub.publicUrl }).eq('id', orgId)
        }
      }
    } catch (e) {
      console.warn('[bypass-outfitter] logo move exception:', (e as Error).message)
    }
  }

  revalidatePath('/app')
  return { ok: true, org_id: orgId }
}
