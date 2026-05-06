import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ensureBitebookGuidePrices, getStripe } from '@/lib/stripe'

type Plan = 'monthly' | 'annual'

// Guide signup → creates the auth user + provisional profile + Stripe Customer up
// front, then redirects to Checkout. The Stripe webhook only has to attach the
// subscription on completion. If the user abandons checkout, they end up with an
// account but no subscription row; the app shows a "complete signup" banner.
//
// v27.8.3 — three changes here:
//   1. firstName + lastName captured (was just a single displayName field).
//      Persisted on profiles so the onboarding wizard can skip Step 1's
//      name fields when they're already set.
//   2. businessName is OPTIONAL (Flavio: many guides are solo, no LLC).
//      Empty string is stored as NULL on guide_profiles.business_name.
//   3. After admin.auth.admin.createUser, we ALSO sign the user in via
//      the cookie-aware server client (createClient()) so a session
//      cookie lands in the browser. Without this, Stripe's success_url
//      to /app sees no auth and the proxy bounces them to /login. Now
//      they drop straight into /app/onboarding from Stripe.
export async function POST(request: Request) {
  let body: {
    email?: string
    password?: string
    firstName?: string
    lastName?: string
    displayName?: string
    businessName?: string
    plan?: Plan
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { email, password, firstName, lastName, displayName, businessName, plan } = body
  // businessName intentionally omitted from required-fields check — it's
  // optional per v27.8.3. firstName/lastName are required so we can stamp
  // them on profiles and skip onboarding step 1 name fields.
  if (!email || !password || !firstName || !lastName || !displayName || !plan) {
    return NextResponse.json({ error: 'Missing fields.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  // Normalize businessName: blank → NULL on guide_profiles.
  const trimmedBusinessName = businessName?.trim() ?? ''
  const businessNameOrNull = trimmedBusinessName === '' ? null : trimmedBusinessName

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
    user_metadata: {
      display_name: displayName,
      first_name: firstName,
      last_name: lastName,
      business_name: businessNameOrNull,
      plan,
      source: 'guide_signup',
    },
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

  // 2) Profile (role=guide) + guide_profiles row.
  //    v27.8.3 — first_name + last_name persisted so the onboarding
  //    wizard's Step 1 can skip the name fields when present.
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        role: 'guide',
      },
      { onConflict: 'id' }
    )
  if (profileErr) {
    return NextResponse.json({ error: `Profile creation failed: ${profileErr.message}` }, { status: 500 })
  }
  await admin
    .from('guide_profiles')
    .upsert(
      { user_id: userId, business_name: businessNameOrNull },
      { onConflict: 'user_id' }
    )

  // 3) v27.8.3 — sign the user in BEFORE redirecting to Stripe so a
  //    session cookie is set on the browser. Otherwise the success_url
  //    redirect lands on /app with no auth and the proxy bounces to
  //    /login. createClient() is the cookie-aware server client; the
  //    signInWithPassword call sets sb-* cookies on the response chain
  //    that flow back through to the browser.
  try {
    const supabase = await createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      console.warn('[checkout.signInWithPassword]', { code: signInErr.code, message: signInErr.message })
      // Soft-fail: account is created. Worst case the user lands on
      // /login post-Stripe and signs in manually. Better than blocking
      // the checkout flow on a transient auth error.
    }
  } catch (e) {
    console.warn('[checkout.signInWithPassword:throw]', { error: (e as Error).message })
  }

  // 4) Stripe Customer
  const customer = await stripe.customers.create({
    email,
    name: displayName,
    metadata: { business_name: businessNameOrNull ?? '', supabase_user_id: userId },
  })

  // 5) Checkout session (7-day no-card trial).
  //    v27.8.3 — success_url goes straight to /app/onboarding so the
  //    user lands directly in the wizard. The cookie set in step 3
  //    means the proxy doesn't bounce to /login.
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
    success_url: `${origin}/app/onboarding?welcome=1`,
    cancel_url: `${origin}/signup?canceled=1`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
