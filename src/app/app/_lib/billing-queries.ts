// v27.4.1 — server-side billing reads for the in-app billing UI.
//
// loadGuideBillingDetail() pulls the outfitter_subscriptions row +
// the customer's default payment method (card brand + last 4) +
// trial / period_end timestamps in one call. Used by BillingPanel
// to render the status header and PaymentMethodCard.
//
// loadGuideInvoices() returns the most recent N invoices for the
// customer with status, amount, paid date, and the Stripe-hosted
// invoice_pdf URL the InvoicesList renders as Download links.
//
// Both functions read the customer ID from outfitter_subscriptions
// (mirrored by the existing checkout.session.completed +
// customer.subscription.* webhooks). RLS blocks cross-guide reads
// at the DB layer; Stripe-side calls use the server-only secret
// key, so customer-scoped queries are safe.

import 'server-only'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export type CardBrand =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'diners'
  | 'jcb'
  | 'unionpay'
  | 'unknown'

export type PaymentMethodSummary = {
  id: string
  brand: CardBrand
  last4: string
  exp_month: number
  exp_year: number
}

export type BillingDetail = {
  // Mirrored DB row.
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  billing_interval: 'month' | 'year' | null
  current_period_end: string | null
  trial_end: string | null
  stripe_customer_id: string
  stripe_subscription_id: string | null
  cancel_at_period_end: boolean
  // Live Stripe lookups.
  default_payment_method: PaymentMethodSummary | null
}

function brandOf(raw: string | null | undefined): CardBrand {
  switch ((raw ?? '').toLowerCase()) {
    case 'visa': return 'visa'
    case 'mastercard': return 'mastercard'
    case 'amex':
    case 'american_express':
    case 'american-express': return 'amex'
    case 'discover': return 'discover'
    case 'diners':
    case 'diners_club': return 'diners'
    case 'jcb': return 'jcb'
    case 'unionpay': return 'unionpay'
    default: return 'unknown'
  }
}

function pmSummary(pm: Stripe.PaymentMethod): PaymentMethodSummary | null {
  const card = pm.card
  if (!card) return null
  return {
    id: pm.id,
    brand: brandOf(card.brand),
    last4: card.last4 ?? '••••',
    exp_month: card.exp_month ?? 0,
    exp_year: card.exp_year ?? 0,
  }
}

export async function loadGuideBillingDetail(guideId: string): Promise<BillingDetail | null> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('outfitter_subscriptions')
    .select('status, billing_interval, current_period_end, trial_end, stripe_customer_id, stripe_subscription_id')
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!row || !row.stripe_customer_id) return null

  let stripe
  try {
    stripe = getStripe()
  } catch {
    // Missing env; let the caller render a degraded state from the
    // DB row alone.
    return {
      status: row.status as BillingDetail['status'],
      billing_interval: row.billing_interval as BillingDetail['billing_interval'],
      current_period_end: row.current_period_end,
      trial_end: row.trial_end,
      stripe_customer_id: row.stripe_customer_id,
      stripe_subscription_id: row.stripe_subscription_id,
      cancel_at_period_end: false,
      default_payment_method: null,
    }
  }

  // Resolve the default payment method via the subscription first
  // (subscription-level default takes priority for billing) then
  // fall back to the customer's invoice_settings.default_payment_method.
  // Also pull cancel_at_period_end here so the UI can show a
  // "Canceling on …" pill even before the webhook delivers the
  // updated event.
  let defaultPmId: string | null = null
  let cancelAtPeriodEnd = false
  if (row.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {
        expand: ['default_payment_method'],
      })
      cancelAtPeriodEnd = sub.cancel_at_period_end === true
      const subPm = sub.default_payment_method
      if (subPm && typeof subPm === 'object' && 'id' in subPm) {
        defaultPmId = (subPm as Stripe.PaymentMethod).id
      } else if (typeof subPm === 'string') {
        defaultPmId = subPm
      }
    } catch (e) {
      console.warn('[billing-queries:subscription]', (e as Error).message)
    }
  }
  if (!defaultPmId) {
    try {
      const customer = await stripe.customers.retrieve(row.stripe_customer_id)
      if (customer && !customer.deleted) {
        const pm = (customer as Stripe.Customer).invoice_settings?.default_payment_method
        if (pm && typeof pm === 'object' && 'id' in pm) {
          defaultPmId = (pm as Stripe.PaymentMethod).id
        } else if (typeof pm === 'string') {
          defaultPmId = pm
        }
      }
    } catch (e) {
      console.warn('[billing-queries:customer]', (e as Error).message)
    }
  }

  let pm: PaymentMethodSummary | null = null
  if (defaultPmId) {
    try {
      const fetched = await stripe.paymentMethods.retrieve(defaultPmId)
      pm = pmSummary(fetched)
    } catch (e) {
      console.warn('[billing-queries:pm]', (e as Error).message)
    }
  }

  return {
    status: row.status as BillingDetail['status'],
    billing_interval: row.billing_interval as BillingDetail['billing_interval'],
    current_period_end: row.current_period_end,
    trial_end: row.trial_end,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    cancel_at_period_end: cancelAtPeriodEnd,
    default_payment_method: pm,
  }
}

export type InvoiceSummary = {
  id: string
  number: string | null
  amount_paid_cents: number
  amount_due_cents: number
  currency: string
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  created: number  // unix seconds
  invoice_pdf: string | null
  hosted_invoice_url: string | null
}

export async function loadGuideInvoices(
  guideId: string,
  limit = 10,
): Promise<InvoiceSummary[]> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('outfitter_subscriptions')
    .select('stripe_customer_id')
    .eq('guide_id', guideId)
    .maybeSingle()
  if (!row?.stripe_customer_id) return []

  let stripe
  try {
    stripe = getStripe()
  } catch {
    return []
  }

  try {
    const invoices = await stripe.invoices.list({
      customer: row.stripe_customer_id,
      limit,
    })
    return invoices.data.map<InvoiceSummary>((inv) => ({
      id: inv.id ?? '',
      number: inv.number ?? null,
      amount_paid_cents: inv.amount_paid ?? 0,
      amount_due_cents: inv.amount_due ?? 0,
      currency: inv.currency ?? 'usd',
      status: (inv.status ?? 'open') as InvoiceSummary['status'],
      created: inv.created ?? 0,
      invoice_pdf: inv.invoice_pdf ?? null,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
    }))
  } catch (e) {
    console.warn('[billing-queries:invoices]', (e as Error).message)
    return []
  }
}
