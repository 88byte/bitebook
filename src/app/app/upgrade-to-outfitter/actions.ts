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
import { getStripe, ensureBitebookOutfitterPrices } from '@/lib/stripe'

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
