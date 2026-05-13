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
          await upsertOutfitterOrgSubscription(admin, sub)
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
