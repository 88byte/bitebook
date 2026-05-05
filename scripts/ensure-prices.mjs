// One-shot: idempotently create the two Bite Book Guide products + prices
// in the connected Stripe account so the Customer Portal "Switch plan"
// configuration can reference them. Mirrors src/lib/stripe.ts exactly.
//
// Usage: node --env-file=.env.production scripts/ensure-prices.mjs
import Stripe from 'stripe'

const PRICE_LOOKUP_KEYS = {
  monthly: 'bitebook_guide_monthly_v2',
  annual: 'bitebook_guide_annual_v2',
}
const PRODUCT_NAME = 'Bite Book Guide'

const key = process.env.STRIPE_SECRET_KEY
if (!key) throw new Error('Missing STRIPE_SECRET_KEY in env.')

const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' })

const existing = await stripe.prices.list({
  lookup_keys: [PRICE_LOOKUP_KEYS.monthly, PRICE_LOOKUP_KEYS.annual],
  expand: ['data.product'],
  active: true,
})

const byKey = {}
for (const p of existing.data) byKey[p.lookup_key] = p

if (byKey[PRICE_LOOKUP_KEYS.monthly] && byKey[PRICE_LOOKUP_KEYS.annual]) {
  console.log('Both prices already exist:')
  console.log(JSON.stringify({
    product_id: byKey[PRICE_LOOKUP_KEYS.monthly].product?.id ?? byKey[PRICE_LOOKUP_KEYS.monthly].product,
    monthly_price_id: byKey[PRICE_LOOKUP_KEYS.monthly].id,
    annual_price_id: byKey[PRICE_LOOKUP_KEYS.annual].id,
  }, null, 2))
  process.exit(0)
}

const products = await stripe.products.list({ active: true, limit: 100 })
let product = products.data.find((p) => p.name === PRODUCT_NAME)
if (!product) {
  product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: 'Digital log book for hunting and fishing guides.',
  })
  console.log('Created product', product.id)
} else {
  console.log('Reusing product', product.id)
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
  byKey[PRICE_LOOKUP_KEYS.monthly] = monthly
  console.log('Created monthly price', monthly.id)
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
  byKey[PRICE_LOOKUP_KEYS.annual] = annual
  console.log('Created annual price', annual.id)
}

console.log('\nResult:')
console.log(JSON.stringify({
  product_id: product.id,
  product_name: product.name,
  monthly_price_id: byKey[PRICE_LOOKUP_KEYS.monthly].id,
  monthly_amount_cents: 900,
  annual_price_id: byKey[PRICE_LOOKUP_KEYS.annual].id,
  annual_amount_cents: 9000,
  monthly_lookup_key: PRICE_LOOKUP_KEYS.monthly,
  annual_lookup_key: PRICE_LOOKUP_KEYS.annual,
}, null, 2))
