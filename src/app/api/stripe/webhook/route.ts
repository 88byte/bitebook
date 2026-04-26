import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
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
        const userId = session.metadata?.supabase_user_id
        if (!userId || !session.subscription) break
        const sub = await stripe.subscriptions.retrieve(session.subscription as string)
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
