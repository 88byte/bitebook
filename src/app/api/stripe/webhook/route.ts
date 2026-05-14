import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, isOutfitterPriceId, OUTFITTER_PRICE_LOOKUP_KEYS } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DbStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
type DbInterval = 'month' | 'year'

function mapStripeStatusToDb(s: Stripe.Subscription.Status): DbStatus {
  switch (s) {
    case 'trialing': return 'trialing'
    case 'active': return 'active'
    case 'past_due': return 'past_due'
    case 'unpaid': return 'past_due'
    case 'canceled': return 'canceled'
    case 'paused': return 'past_due'
    case 'incomplete':
    case 'incomplete_expired':
    default:
      return 'incomplete'
  }
}

export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !secret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret.' }, { status: 400 })
  }

  let stripe
  try {
    stripe = getStripe()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const raw = await request.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (err) {
    console.error('Stripe webhook signature failed:', (err as Error).message)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (!session.subscription) break
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
        // v28.1.0a — route to outfitter or guide based on price id.
        const priceId = sub.items.data[0]?.price?.id ?? null
        const priceLookupKey = sub.items.data[0]?.price?.lookup_key ?? null
        const isOutfitter =
          isOutfitterPriceId(priceId) ||
          priceLookupKey === OUTFITTER_PRICE_LOOKUP_KEYS.monthly ||
          priceLookupKey === OUTFITTER_PRICE_LOOKUP_KEYS.yearly
        if (isOutfitter) {
          // v28.1.0b — if this checkout was initiated by the upgrade
          // wizard, the session.metadata carries upgrade_target +
          // org details. Complete the org create + member insert +
          // profile flip here. Idempotent: re-running with the same
          // sub_id finds the existing org and updates its sub status
          // instead of inserting a duplicate.
          if (session.metadata?.upgrade_target === 'outfitter') {
            await completeOutfitterUpgrade(admin, sub, session)
          } else {
            await upsertOutfitterOrgSubscription(admin, sub)
          }
          break
        }
        const userId = session.metadata?.supabase_user_id
        if (!userId) break
        await upsertSubscription(admin, userId, sub)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription
        // v28.1.0a — route to outfitter_orgs vs guide outfitter_subscriptions
        // based on the subscription's price id. Guide-tier prices keep the
        // existing handler path; outfitter-tier prices update outfitter_orgs.
        // Lookup priority: env-configured price IDs (fast path) → recurring
        // lookup-key fallback (handles first webhook after seed, before
        // env propagation to Vercel).
        const priceId = sub.items.data[0]?.price?.id ?? null
        const priceLookupKey = sub.items.data[0]?.price?.lookup_key ?? null
        const isOutfitter =
          isOutfitterPriceId(priceId) ||
          priceLookupKey === OUTFITTER_PRICE_LOOKUP_KEYS.monthly ||
          priceLookupKey === OUTFITTER_PRICE_LOOKUP_KEYS.yearly
        if (isOutfitter) {
          await upsertOutfitterOrgSubscription(admin, sub)
          break
        }
        const userId =
          sub.metadata?.supabase_user_id ||
          (await lookupUserIdByCustomer(admin, sub.customer as string))
        if (!userId) break
        await upsertSubscription(admin, userId, sub)
        break
      }
      default:
        // Ignore other events for now
        break
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', err)
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function upsertSubscription(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  sub: Stripe.Subscription
) {
  const item = sub.items.data[0]
  const interval: DbInterval = item?.price?.recurring?.interval === 'year' ? 'year' : 'month'
  const periodEnd = (item?.current_period_end ?? null) as number | null
  const trialEnd = sub.trial_end ?? null

  await admin
    .from('outfitter_subscriptions')
    .upsert(
      {
        guide_id: userId,
        status: mapStripeStatusToDb(sub.status),
        billing_interval: interval,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        trial_end: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
      },
      { onConflict: 'guide_id' }
    )
}

// v28.1.0a — outfitter org subscription sync. Looks the org up by
// stripe_subscription_id first (returning customer flow), falls back
// to stripe_customer_id (first-event flow), and finally to the
// supabase_user_id metadata on the subscription which the 3.2b
// Checkout session creator stamps onto the sub so the very first
// event can locate the freshly-inserted org via owner_profile_id.
// If no org match is found (event landed before the upgrade flow
// completed its DB write), silently no-op and log — the next event
// in the lifecycle (subscription.updated within seconds) will catch
// up once the org row exists.
async function upsertOutfitterOrgSubscription(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription
) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const ownerProfileId = sub.metadata?.supabase_user_id ?? null

  // Find the target org. Priority: existing stripe_subscription_id link →
  // stripe_customer_id link → owner_profile_id (first-event path during
  // the upgrade flow before the sub id has been written back).
  let orgId: string | null = null
  {
    const { data } = await admin
      .from('outfitter_orgs')
      .select('id')
      .eq('stripe_subscription_id', sub.id)
      .maybeSingle()
    if (data?.id) orgId = data.id
  }
  if (!orgId) {
    const { data } = await admin
      .from('outfitter_orgs')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .is('archived_at', null)
      .maybeSingle()
    if (data?.id) orgId = data.id
  }
  if (!orgId && ownerProfileId) {
    const { data } = await admin
      .from('outfitter_orgs')
      .select('id')
      .eq('owner_profile_id', ownerProfileId)
      .is('archived_at', null)
      .is('stripe_subscription_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.id) orgId = data.id
  }

  if (!orgId) {
    console.warn('[stripe-webhook:outfitter] No org found for sub %s (customer %s, owner %s) — likely event arrived before upgrade flow committed; next event will reconcile.',
      sub.id, customerId, ownerProfileId)
    return
  }

  // Map Stripe status to the column's text default ('inactive' / 'trialing'
  // / 'active' / 'past_due' / 'canceled' / 'incomplete'). outfitter_orgs.
  // subscription_status is plain text — no DB-side enum — so we don't
  // need a fixed mapper, just pass the canonical Stripe value through
  // with the unpaid → past_due collapse the guide path already uses.
  const mapped = mapStripeStatusToDb(sub.status)

  await admin
    .from('outfitter_orgs')
    .update({
      subscription_status: mapped,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
    })
    .eq('id', orgId)
}

// v28.1.0b — full org-create completion. Runs from
// checkout.session.completed when the wizard's metadata.upgrade_target
// is 'outfitter'. Idempotent: re-running with the same sub_id finds
// the existing org and patches its sub status without duplicating.
// Also called from the /app/upgrade-success server page as a fallback
// for the case where the user lands before Stripe's webhook fires.
export async function completeOutfitterUpgrade(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription,
  session: Stripe.Checkout.Session,
) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const meta = session.metadata ?? {}
  const ownerProfileId = meta.owner_profile_id || meta.supabase_user_id || null
  if (!ownerProfileId) {
    console.warn('[stripe-webhook:complete-upgrade] No owner_profile_id in checkout metadata for sub', sub.id)
    return
  }

  const orgName = (meta.org_name || '').trim()
  if (!orgName) {
    console.warn('[stripe-webhook:complete-upgrade] No org_name in checkout metadata for sub', sub.id)
    return
  }
  const state = (meta.state || '').trim().toUpperCase() || null
  // v28.1.0b.2 — Stripe metadata key was renamed
  // commercial_license_number → outfitter_license_number to match the
  // DB column rename. Older Checkout sessions (none in production yet
  // — v28.1.0b shipped today and no real outfitter rows exist) would
  // be stamped with the old key, so we fall back to it defensively.
  const licenseNumber = (
    meta.outfitter_license_number || meta.commercial_license_number || ''
  ).trim() || null
  const businessAddress = (meta.business_address || '').trim() || null
  const tempLogoPath = (meta.temp_logo_path || '').trim() || null
  const keepGuideSub = meta.keep_guide_sub !== 'false'

  const mappedStatus = mapStripeStatusToDb(sub.status)

  // Idempotent: existing org by sub id → update only.
  const { data: existing } = await admin
    .from('outfitter_orgs')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle()

  let orgId: string
  if (existing?.id) {
    orgId = existing.id
    await admin.from('outfitter_orgs').update({
      subscription_status: mappedStatus,
      stripe_customer_id: customerId,
    }).eq('id', orgId)
  } else {
    const { data: created, error: insErr } = await admin
      .from('outfitter_orgs')
      .insert({
        name: orgName,
        owner_profile_id: ownerProfileId,
        state,
        outfitter_license_number: licenseNumber,
        business_address: businessAddress,
        logo_url: null,
        subscription_status: mappedStatus,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customerId,
      })
      .select('id')
      .single()
    if (insErr || !created) {
      console.error('[stripe-webhook:complete-upgrade] Could not insert org:', insErr?.message)
      return
    }
    orgId = created.id

    // Insert owner member row. Trigger enforces max 3; this is the first
    // (owner), so it always fits.
    const { error: memErr } = await admin.from('outfitter_org_members').insert({
      org_id: orgId,
      profile_id: ownerProfileId,
      role: 'owner',
      invited_by: ownerProfileId,
      joined_at: new Date().toISOString(),
    })
    if (memErr) {
      console.error('[stripe-webhook:complete-upgrade] Could not insert owner member:', memErr.message)
    }

    // Flip profile tier so the dashboard variant renders + downstream
    // server actions see the new tier on next request.
    const { error: profErr } = await admin.from('profiles').update({
      account_tier: 'outfitter_owner',
      current_outfitter_org_id: orgId,
    }).eq('id', ownerProfileId)
    if (profErr) {
      console.error('[stripe-webhook:complete-upgrade] Could not flip profile tier:', profErr.message)
    }

    // Logo move: temp upload was at outfitter-logos/{tempId}/...
    // Now move to outfitter-logos/{orgId}/... and stamp the public URL.
    if (tempLogoPath && tempLogoPath.includes('/')) {
      try {
        const filename = tempLogoPath.split('/').pop()!
        const newPath = `${orgId}/${filename}`
        const { error: moveErr } = await admin.storage
          .from('outfitter-logos')
          .move(tempLogoPath, newPath)
        if (moveErr) {
          console.warn('[stripe-webhook:complete-upgrade] Logo move failed:', moveErr.message)
        } else {
          const { data: pub } = admin.storage.from('outfitter-logos').getPublicUrl(newPath)
          if (pub?.publicUrl) {
            await admin.from('outfitter_orgs').update({ logo_url: pub.publicUrl }).eq('id', orgId)
          }
        }
      } catch (e) {
        console.warn('[stripe-webhook:complete-upgrade] Logo move exception:', (e as Error).message)
      }
    }

    // Keep-guide-sub=false → flag the guide sub to cancel at period end.
    if (!keepGuideSub) {
      try {
        const { data: gSub } = await admin
          .from('outfitter_subscriptions')
          .select('stripe_subscription_id')
          .eq('guide_id', ownerProfileId)
          .maybeSingle()
        if (gSub?.stripe_subscription_id) {
          const stripe = getStripe()
          await stripe.subscriptions.update(gSub.stripe_subscription_id, { cancel_at_period_end: true })
        }
      } catch (e) {
        console.warn('[stripe-webhook:complete-upgrade] cancel-at-period-end on guide sub failed:', (e as Error).message)
      }
    }
  }
}

async function lookupUserIdByCustomer(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string
): Promise<string | null> {
  const { data } = await admin
    .from('outfitter_subscriptions')
    .select('guide_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return data?.guide_id ?? null
}
