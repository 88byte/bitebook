import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ensureBitebookGuidePrices, getStripe } from '@/lib/stripe'

type Plan = 'monthly' | 'annual'

// v28.1.0e.3 — Stripe Checkout for an existing signed-in user who has
// no personal guide subscription yet. The /signup → /api/checkout flow
// only works for brand-new emails (it creates the auth user). This
// route is the analog for someone who already has a Bite Book account
// (a hunter accepting a guide-network invite, for example) and just
// needs to add a subscription.
//
// Inputs:
//   plan          — 'monthly' | 'annual'
//   return_to     — URL to land on after successful checkout. Most
//                   common case: a /accept-guide-network-invite link
//                   so the user finishes accepting after subscribing.
//   network_token — Optional. Stamped on Stripe metadata so the
//                   webhook auto-accepts the guide-network invite the
//                   moment the subscription row exists. Defense in
//                   depth alongside the return_to redirect.
//
// Output: { url } where url is the Stripe Checkout session URL.
//
// Idempotent: if the user already has an active sub we return a 409
// so the caller surfaces a friendly "already subscribed" message.
export async function POST(request: Request) {
  let body: { plan?: Plan; return_to?: string; network_token?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const plan: Plan = body.plan === 'monthly' ? 'monthly' : 'annual'
  const returnToRaw = (body.return_to ?? '').trim()
  const cleanedNetworkToken = (body.network_token ?? '').trim() || null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  const userId = user.id
  const email = user.email ?? ''
  if (!email) {
    return NextResponse.json({ error: 'Account missing email.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: existingSub } = await admin
    .from('outfitter_subscriptions')
    .select('status')
    .eq('guide_id', userId)
    .maybeSingle()
  if (
    existingSub &&
    (existingSub.status === 'active' || existingSub.status === 'trialing')
  ) {
    return NextResponse.json(
      { error: 'You already have an active subscription.' },
      { status: 409 },
    )
  }

  let stripe, prices
  try {
    stripe = getStripe()
    prices = await ensureBitebookGuidePrices()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Re-use an existing Stripe customer if we have one on the sub row,
  // otherwise mint a new one. Customers are created lazily here so a
  // hunter who never had a sub doesn't have a dangling Stripe record.
  const { data: existingCustomerRow } = await admin
    .from('outfitter_subscriptions')
    .select('stripe_customer_id')
    .eq('guide_id', userId)
    .maybeSingle()
  let customerId = existingCustomerRow?.stripe_customer_id ?? null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId },
    })
    customerId = customer.id
  }

  const priceId = plan === 'monthly' ? prices.monthly : prices.annual
  const origin = new URL(request.url).origin

  // Resolve safe success/cancel URLs. return_to is sanitized to same-
  // origin paths so we cannot bounce the user to an arbitrary site.
  function safeReturnPath(raw: string): string | null {
    if (!raw) return null
    if (!raw.startsWith('/')) return null
    return raw
  }
  const safeReturnTo = safeReturnPath(returnToRaw)
  const successPath = safeReturnTo ?? '/app/settings?tab=billing&checkout=success'
  const successUrl = `${origin}${successPath}${successPath.includes('?') ? '&' : '?'}checkout=success`
  const cancelUrl = `${origin}/app/settings?tab=billing&checkout=canceled`

  // v28.1.0e.2 — Stamp the network invite token on session +
  // subscription_data metadata so the webhook's upsertSubscription
  // helper auto-accepts the invite once Stripe creates the sub row.
  // This is what makes the return_to → "invite already accepted"
  // redirect feel instantaneous in the common case.
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: 'if_required',
    subscription_data: {
      trial_period_days: 7,
      trial_settings: {
        end_behavior: { missing_payment_method: 'pause' },
      },
      metadata: {
        plan,
        supabase_user_id: userId,
        ...(cleanedNetworkToken ? { guide_network_invite_token: cleanedNetworkToken } : {}),
      },
    },
    metadata: {
      supabase_user_id: userId,
      plan,
      ...(cleanedNetworkToken ? { guide_network_invite_token: cleanedNetworkToken } : {}),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
