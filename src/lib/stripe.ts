import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      'Missing STRIPE_SECRET_KEY. Add it (plus STRIPE_WEBHOOK_SECRET and ' +
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) to Vercel Production env vars to enable guide signup.'
    )
  }
  _stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
  return _stripe
}

// v27.0a.22: pricing dropped from $19/$204 to $9/$90. Lookup keys bumped
// to _v2 so existing $19/$204 prices stay active in Stripe (existing
// trialing accounts may reference them) while new signups create + use
// the new $9/$90 prices via the lazy ensure call.
export const PRICE_LOOKUP_KEYS = {
  monthly: 'bitebook_guide_monthly_v2',
  annual: 'bitebook_guide_annual_v2',
} as const

export const PRODUCT_NAME = 'Bite Book Guide'

// v28.1.0a — Outfitter tier prices. Separate product from the guide
// tier; lookup keys keep guide + outfitter price catalogs cleanly
// separable so a re-seed of one doesn't touch the other. Monthly = $39,
// yearly = $390.
//
// v28.1.0b.1 — Trial dropped 14 → 7 days to match the guide tier.
// Live prices in Stripe still have 14 baked into recurring.trial_period_days
// (Stripe prices are immutable), but createOutfitterCheckoutAction passes
// subscription_data.trial_period_days = OUTFITTER_TRIAL_DAYS to override
// per-session, so the effective trial is 7 days regardless of price
// history. A future re-seed via ensure-outfitter-prices.mjs picks up the
// new constant when fresh lookup keys are minted.
export const OUTFITTER_PRICE_LOOKUP_KEYS = {
  monthly: 'bitebook_outfitter_monthly_v1',
  yearly: 'bitebook_outfitter_yearly_v1',
} as const

export const OUTFITTER_PRODUCT_NAME = 'Bite Book Outfitter'
export const OUTFITTER_TRIAL_DAYS = 7

// Lazily ensures the product + the two recurring prices exist on this Stripe account.
// Returns price IDs keyed by interval. Safe to call repeatedly — uses lookup_keys.
export async function ensureBitebookGuidePrices(): Promise<{ monthly: string; annual: string }> {
  const stripe = getStripe()

  const existing = await stripe.prices.list({
    lookup_keys: [PRICE_LOOKUP_KEYS.monthly, PRICE_LOOKUP_KEYS.annual],
    expand: ['data.product'],
    active: true,
  })

  const byKey: Record<string, string> = {}
  for (const p of existing.data) byKey[p.lookup_key!] = p.id

  if (byKey[PRICE_LOOKUP_KEYS.monthly] && byKey[PRICE_LOOKUP_KEYS.annual]) {
    return {
      monthly: byKey[PRICE_LOOKUP_KEYS.monthly],
      annual: byKey[PRICE_LOOKUP_KEYS.annual],
    }
  }

  // Find or create the product
  const products = await stripe.products.list({ active: true, limit: 100 })
  let product = products.data.find((p) => p.name === PRODUCT_NAME)
  if (!product) {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: 'Digital log book for hunting and fishing guides.',
    })
  }

  if (!byKey[PRICE_LOOKUP_KEYS.monthly]) {
    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: 900,
      currency: 'usd',
      recurring: { interval: 'month' },
      lookup_key: PRICE_LOOKUP_KEYS.monthly,
      nickname: 'Monthly',
    })
    byKey[PRICE_LOOKUP_KEYS.monthly] = monthly.id
  }
  if (!byKey[PRICE_LOOKUP_KEYS.annual]) {
    const annual = await stripe.prices.create({
      product: product.id,
      unit_amount: 9000,
      currency: 'usd',
      recurring: { interval: 'year' },
      lookup_key: PRICE_LOOKUP_KEYS.annual,
      nickname: 'Annual',
    })
    byKey[PRICE_LOOKUP_KEYS.annual] = annual.id
  }

  return {
    monthly: byKey[PRICE_LOOKUP_KEYS.monthly],
    annual: byKey[PRICE_LOOKUP_KEYS.annual],
  }
}

// v28.1.0a — Outfitter equivalent. Same lookup-keys idempotency
// pattern as guide. Re-running returns the existing IDs without
// duplicating. v28.1.0b.1: trial dropped 14 → 7 days; fresh prices
// minted by this helper bake 7 days into recurring config. Existing
// live prices keep their original trial duration (Stripe prices are
// immutable); the checkout session overrides per-call so the
// effective trial always matches OUTFITTER_TRIAL_DAYS.
export async function ensureBitebookOutfitterPrices(): Promise<{ monthly: string; yearly: string }> {
  const stripe = getStripe()

  const existing = await stripe.prices.list({
    lookup_keys: [OUTFITTER_PRICE_LOOKUP_KEYS.monthly, OUTFITTER_PRICE_LOOKUP_KEYS.yearly],
    expand: ['data.product'],
    active: true,
  })

  const byKey: Record<string, string> = {}
  for (const p of existing.data) byKey[p.lookup_key!] = p.id

  if (
    byKey[OUTFITTER_PRICE_LOOKUP_KEYS.monthly] &&
    byKey[OUTFITTER_PRICE_LOOKUP_KEYS.yearly]
  ) {
    return {
      monthly: byKey[OUTFITTER_PRICE_LOOKUP_KEYS.monthly],
      yearly: byKey[OUTFITTER_PRICE_LOOKUP_KEYS.yearly],
    }
  }

  // Find or create the outfitter product. Listed by name match because
  // Stripe doesn't expose lookup keys on products.
  const products = await stripe.products.list({ active: true, limit: 100 })
  let product = products.data.find((p) => p.name === OUTFITTER_PRODUCT_NAME)
  if (!product) {
    product = await stripe.products.create({
      name: OUTFITTER_PRODUCT_NAME,
      description:
        'Outfitter tier for Bite Book — multi-guide org, 3 admin seats, ' +
        'unlimited network guides + hunters, calendar + multi-guide trip ' +
        'assignment + reviews.',
    })
  }

  if (!byKey[OUTFITTER_PRICE_LOOKUP_KEYS.monthly]) {
    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: 3900, // $39
      currency: 'usd',
      recurring: { interval: 'month', trial_period_days: OUTFITTER_TRIAL_DAYS },
      lookup_key: OUTFITTER_PRICE_LOOKUP_KEYS.monthly,
      nickname: 'Monthly',
    })
    byKey[OUTFITTER_PRICE_LOOKUP_KEYS.monthly] = monthly.id
  }
  if (!byKey[OUTFITTER_PRICE_LOOKUP_KEYS.yearly]) {
    const yearly = await stripe.prices.create({
      product: product.id,
      unit_amount: 39000, // $390
      currency: 'usd',
      recurring: { interval: 'year', trial_period_days: OUTFITTER_TRIAL_DAYS },
      lookup_key: OUTFITTER_PRICE_LOOKUP_KEYS.yearly,
      nickname: 'Yearly',
    })
    byKey[OUTFITTER_PRICE_LOOKUP_KEYS.yearly] = yearly.id
  }

  return {
    monthly: byKey[OUTFITTER_PRICE_LOOKUP_KEYS.monthly],
    yearly: byKey[OUTFITTER_PRICE_LOOKUP_KEYS.yearly],
  }
}

// v28.1.0a — runtime check whether a price id is in the outfitter
// catalog. Used by the webhook handler to route customer.subscription
// events to outfitter_orgs vs the legacy outfitter_subscriptions
// (guide-tier) table. STRIPE_OUTFITTER_*_PRICE_ID env vars are the
// fast path; the lookup-key fallback handles the case where env
// vars haven't been deployed yet (e.g. first webhook arriving
// before Vercel env propagation).
export function isOutfitterPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false
  const monthly = process.env.STRIPE_OUTFITTER_MONTHLY_PRICE_ID
  const yearly = process.env.STRIPE_OUTFITTER_YEARLY_PRICE_ID
  if (monthly && priceId === monthly) return true
  if (yearly && priceId === yearly) return true
  return false
}
