import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureBitebookGuidePrices, getStripe } from '@/lib/stripe'

type Plan = 'monthly' | 'annual'

// Guide signup → creates the auth user + provisional profile + Stripe Customer up
// front, then redirects to Checkout. The Stripe webhook only has to attach the
// subscription on completion. If the user abandons checkout, they end up with an
// account but no subscription row; the app shows a "complete signup" banner.
export async function POST(request: Request) {
  let body: { email?: string; password?: string; displayName?: string; businessName?: string; plan?: Plan }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { email, password, displayName, businessName, plan } = body
  if (!email || !password || !displayName || !businessName || !plan) {
    return NextResponse.json({ error: 'Missing fields.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  let stripe, prices, admin
  try {
    stripe = getStripe()
    admin = createAdminClient()
    prices = await ensureBitebookGuidePrices()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // 1) Create the auth user (email pre-confirmed; we trust this signup flow).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, business_name: businessName, plan, source: 'guide_signup' },
  })
  if (createErr || !created.user) {
    if (/already.*registered|already.*exists/i.test(createErr?.message ?? '')) {
      return NextResponse.json(
        { error: 'An account with that email already exists. Sign in instead.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: createErr?.message ?? 'Could not create account.' }, { status: 500 })
  }
  const userId = created.user.id

  // 2) Profile (role=guide) + guide_profiles row
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: userId, display_name: displayName, role: 'guide' }, { onConflict: 'id' })
  if (profileErr) {
    return NextResponse.json({ error: `Profile creation failed: ${profileErr.message}` }, { status: 500 })
  }
  await admin
    .from('guide_profiles')
    .upsert({ user_id: userId, business_name: businessName }, { onConflict: 'user_id' })

  // 3) Stripe Customer
  const customer = await stripe.customers.create({
    email,
    name: displayName,
    metadata: { business_name: businessName, supabase_user_id: userId },
  })

  // 4) Checkout session (7-day no-card trial)
  const priceId = plan === 'monthly' ? prices.monthly : prices.annual
  const origin = new URL(request.url).origin
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: 'if_required',
    subscription_data: {
      trial_period_days: 7,
      trial_settings: {
        end_behavior: { missing_payment_method: 'pause' },
      },
      metadata: { plan, supabase_user_id: userId },
    },
    metadata: { supabase_user_id: userId, plan },
    success_url: `${origin}/app?welcome=1`,
    cancel_url: `${origin}/signup?canceled=1`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
