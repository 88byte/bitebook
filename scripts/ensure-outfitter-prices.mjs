// One-shot: idempotently create the Bite Book Outfitter product + two
// recurring prices ($39/mo + $390/yr) in the connected Stripe account.
// Mirrors src/lib/stripe.ts ensureBitebookOutfitterPrices exactly.
//
// 14-day trial baked into the price's recurring config so subscriptions
// using these prices default to a 14-day trial unless trial_period_days
// is overridden at subscription/checkout time.
//
// Usage:
//   node --env-file=.env.production scripts/ensure-outfitter-prices.mjs
//
// After this prints the price IDs, set them as Vercel env vars in
// both Production and Preview:
//   STRIPE_OUTFITTER_MONTHLY_PRICE_ID = <monthly_price_id>
//   STRIPE_OUTFITTER_YEARLY_PRICE_ID  = <yearly_price_id>
import Stripe from 'stripe'

const PRICE_LOOKUP_KEYS = {
  monthly: 'bitebook_outfitter_monthly_v1',
  yearly: 'bitebook_outfitter_yearly_v1',
}
const PRODUCT_NAME = 'Bite Book Outfitter'
const PRODUCT_DESCRIPTION =
  'Outfitter tier for Bite Book — multi-guide org, 3 admin seats, ' +
  'unlimited network guides + hunters, calendar + multi-guide trip ' +
  'assignment + reviews.'
const TRIAL_DAYS = 14
const MONTHLY_CENTS = 3900
const YEARLY_CENTS = 39000

const key = process.env.STRIPE_SECRET_KEY
if (!key) throw new Error('Missing STRIPE_SECRET_KEY in env.')

const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' })

const existing = await stripe.prices.list({
  lookup_keys: [PRICE_LOOKUP_KEYS.monthly, PRICE_LOOKUP_KEYS.yearly],
  expand: ['data.product'],
  active: true,
})

const byKey = {}
for (const p of existing.data) byKey[p.lookup_key] = p

if (byKey[PRICE_LOOKUP_KEYS.monthly] && byKey[PRICE_LOOKUP_KEYS.yearly]) {
  console.log('Outfitter product already exists, no changes.')
  console.log(JSON.stringify({
    product_id: byKey[PRICE_LOOKUP_KEYS.monthly].product?.id ?? byKey[PRICE_LOOKUP_KEYS.monthly].product,
    monthly_price_id: byKey[PRICE_LOOKUP_KEYS.monthly].id,
    yearly_price_id: byKey[PRICE_LOOKUP_KEYS.yearly].id,
  }, null, 2))
  process.exit(0)
}

const products = await stripe.products.list({ active: true, limit: 100 })
let product = products.data.find((p) => p.name === PRODUCT_NAME)
if (!product) {
  product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: PRODUCT_DESCRIPTION,
  })
  console.log('Created product', product.id)
} else {
  console.log('Reusing product', product.id)
}

if (!byKey[PRICE_LOOKUP_KEYS.monthly]) {
  const monthly = await stripe.prices.create({
    product: product.id,
    unit_amount: MONTHLY_CENTS,
    currency: 'usd',
    recurring: { interval: 'month', trial_period_days: TRIAL_DAYS },
    lookup_key: PRICE_LOOKUP_KEYS.monthly,
    nickname: 'Monthly',
  })
  byKey[PRICE_LOOKUP_KEYS.monthly] = monthly
  console.log('Created monthly price', monthly.id)
}
if (!byKey[PRICE_LOOKUP_KEYS.yearly]) {
  const yearly = await stripe.prices.create({
    product: product.id,
    unit_amount: YEARLY_CENTS,
    currency: 'usd',
    recurring: { interval: 'year', trial_period_days: TRIAL_DAYS },
    lookup_key: PRICE_LOOKUP_KEYS.yearly,
    nickname: 'Yearly',
  })
  byKey[PRICE_LOOKUP_KEYS.yearly] = yearly
  console.log('Created yearly price', yearly.id)
}

console.log('\nResult:')
console.log(JSON.stringify({
  product_id: product.id,
  product_name: product.name,
  monthly_price_id: byKey[PRICE_LOOKUP_KEYS.monthly].id,
  monthly_amount_cents: MONTHLY_CENTS,
  yearly_price_id: byKey[PRICE_LOOKUP_KEYS.yearly].id,
  yearly_amount_cents: YEARLY_CENTS,
  trial_days: TRIAL_DAYS,
  monthly_lookup_key: PRICE_LOOKUP_KEYS.monthly,
  yearly_lookup_key: PRICE_LOOKUP_KEYS.yearly,
}, null, 2))

console.log('\nNext: set these as Vercel env vars on Production + Preview:')
console.log('  STRIPE_OUTFITTER_MONTHLY_PRICE_ID=' + byKey[PRICE_LOOKUP_KEYS.monthly].id)
console.log('  STRIPE_OUTFITTER_YEARLY_PRICE_ID=' + byKey[PRICE_LOOKUP_KEYS.yearly].id)
