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
