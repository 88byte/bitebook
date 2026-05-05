// v27.6.0 — Mission Control queries.
//
// Every read uses the service-role admin client so we can pull
// across-guide data without hitting the per-user RLS policies that
// gate /app. Writes are channeled through admin-actions.ts (which
// also enforces the audit-row-first invariant).
//
// React cache() dedupes per-request reads so multiple call sites in
// the same /admin page don't multiply Supabase or Stripe round-trips.

import 'server-only'
import { cache } from 'react'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { isAdminEmail } from '../../app/_lib/auth'
import type { Database } from '@/lib/supabase/types'

export type SubscriptionRow = {
  status: Database['public']['Enums']['subscription_status']
  billing_interval: Database['public']['Enums']['subscription_interval'] | null
  trial_end: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  comp_until: string | null
}

export type AccountTier = 'full' | 'read_only' | 'locked'
export type PlanLabel = 'monthly' | 'annual' | 'comp' | 'none'

// v27.6.0 — accounts list row. Mirrors the shape the table renders so
// the page component is mostly markup. `tier` is computed in JS using
// the same rules as billing-tier.ts (we can't share the helper directly
// because the helper is keyed on user_id and we want the bulk read in
// one DB query rather than N+1).
//
// v27.6.0.2 — `is_admin` flagged via email-match against ADMIN_EMAILS
// (auth.ts). Lets the table render an ADMIN pill on Flavio's row
// without requiring a profile.role flip (which broke /app access in
// v27.6.0).
export type AdminAccountRow = {
  guide_id: string
  display_name: string
  first_name: string
  last_name: string
  email: string
  is_admin: boolean
  business_name: string | null
  phone: string | null
  signup_date: string
  hunters_count: number
  // Subscription mirror (NULL when no subscription row exists).
  status: SubscriptionRow['status'] | null
  billing_interval: SubscriptionRow['billing_interval']
  trial_end: string | null
  current_period_end: string | null
  comp_until: string | null
  // Derived.
  tier: AccountTier
  plan: PlanLabel
}

function tierFor(row: {
  status: SubscriptionRow['status'] | null
  comp_until: string | null
}): AccountTier {
  if (row.comp_until) {
    const today = new Date().toISOString().slice(0, 10)
    if (row.comp_until >= today) return 'full'
  }
  switch (row.status) {
    case 'trialing':
    case 'active':
      return 'full'
    case 'past_due':
    case 'canceled':
      return 'read_only'
    case 'incomplete':
    case null:
    case undefined:
    default:
      return 'locked'
  }
}

function planFor(row: {
  billing_interval: SubscriptionRow['billing_interval']
  comp_until: string | null
}): PlanLabel {
  if (row.comp_until) {
    const today = new Date().toISOString().slice(0, 10)
    if (row.comp_until >= today) return 'comp'
  }
  if (row.billing_interval === 'month') return 'monthly'
  if (row.billing_interval === 'year') return 'annual'
  return 'none'
}

// v27.6.0 — accounts list. Single query per data source, joined in JS
// so we don't have to maintain a Postgres view. Sources:
//   1. profiles WHERE role = 'guide' — admins manage themselves via
//      Settings; they don't belong in the guide-management table
//      (v27.6.0.1).
//   2. outfitter_subscriptions — keyed by guide_id (1:1).
//   3. invitations COUNT WHERE status='accepted' — hunters per guide.
//   4. auth.users — to surface email next to display_name.
export const fetchAdminAccounts = cache(async (): Promise<AdminAccountRow[]> => {
  const admin = createAdminClient()

  const [profilesRes, subsRes, invitesRes, authRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, first_name, last_name, phone, role, created_at')
      .eq('role', 'guide')
      .order('created_at', { ascending: false }),
    admin
      .from('outfitter_subscriptions')
      .select('guide_id, status, billing_interval, trial_end, current_period_end, stripe_customer_id, stripe_subscription_id, comp_until'),
    admin
      .from('invitations')
      .select('guide_id, status'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  if (profilesRes.error) {
    console.warn('[admin-queries.fetchAdminAccounts:profiles]', profilesRes.error)
    return []
  }
  if (subsRes.error) {
    console.warn('[admin-queries.fetchAdminAccounts:subs]', subsRes.error)
  }
  if (invitesRes.error) {
    console.warn('[admin-queries.fetchAdminAccounts:invites]', invitesRes.error)
  }

  const subByGuide = new Map<string, SubscriptionRow>()
  for (const s of subsRes.data ?? []) {
    subByGuide.set(s.guide_id, s as SubscriptionRow)
  }

  const guideRes = await admin
    .from('guide_profiles')
    .select('user_id, business_name')
  const businessByGuide = new Map<string, string | null>()
  for (const g of guideRes.data ?? []) {
    businessByGuide.set(g.user_id, g.business_name ?? null)
  }

  const huntersByGuide = new Map<string, number>()
  for (const inv of invitesRes.data ?? []) {
    if (inv.status !== 'accepted') continue
    huntersByGuide.set(inv.guide_id, (huntersByGuide.get(inv.guide_id) ?? 0) + 1)
  }

  const emailById = new Map<string, string>()
  for (const u of authRes.data?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email)
  }

  return (profilesRes.data ?? []).map<AdminAccountRow>((p) => {
    const sub = subByGuide.get(p.id) ?? null
    const baseRow = {
      status: sub?.status ?? null,
      billing_interval: sub?.billing_interval ?? null,
      comp_until: sub?.comp_until ?? null,
    }
    const email = emailById.get(p.id) ?? ''
    return {
      guide_id: p.id,
      display_name: p.display_name,
      first_name: p.first_name ?? '',
      last_name: p.last_name ?? '',
      email,
      is_admin: isAdminEmail(email),
      business_name: businessByGuide.get(p.id) ?? null,
      phone: p.phone ?? null,
      signup_date: p.created_at,
      hunters_count: huntersByGuide.get(p.id) ?? 0,
      status: sub?.status ?? null,
      billing_interval: sub?.billing_interval ?? null,
      trial_end: sub?.trial_end ?? null,
      current_period_end: sub?.current_period_end ?? null,
      comp_until: sub?.comp_until ?? null,
      tier: tierFor(baseRow),
      plan: planFor({
        billing_interval: sub?.billing_interval ?? null,
        comp_until: sub?.comp_until ?? null,
      }),
    }
  })
})

// v27.6.0 — single account detail. Pulls profile + guide_profile +
// subscription + email in one shot, then layers live Stripe state on
// top. Stripe lookups are best-effort — if they fail we still render
// the DB-mirrored slice so the admin can still flip status / comp /
// reactivate without the page falling over.
export type AdminAccountDetail = {
  guide_id: string
  display_name: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  signup_date: string
  business_name: string | null
  state: string | null
  license_number: string | null
  guide_license_expires_at: string | null
  // Address
  address_street: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  // Subscription mirror
  subscription: SubscriptionRow | null
  // Live Stripe state (if available)
  stripe_subscription: {
    id: string
    status: string
    cancel_at_period_end: boolean
    current_period_end: number | null
    trial_end: number | null
    interval: 'month' | 'year' | null
    has_default_payment_method: boolean
  } | null
  // Stripe invoices
  invoices: Array<{
    id: string
    number: string | null
    amount_paid_cents: number
    currency: string
    status: string
    created_unix: number
    hosted_invoice_url: string | null
  }>
  // Derived
  tier: AccountTier
  plan: PlanLabel
  // Last activity heuristic — most recent of (subscription.updated_at,
  // last trip created, last harvest log entry).
  last_activity_at: string | null
}

export const fetchAdminAccountDetail = cache(
  async (guideId: string): Promise<AdminAccountDetail | null> => {
    const admin = createAdminClient()

    const [profileRes, guideRes, subRes, authRes] = await Promise.all([
      admin
        .from('profiles')
        .select('id, display_name, first_name, last_name, phone, address_street, address_city, address_state, address_zip, created_at')
        .eq('id', guideId)
        .maybeSingle(),
      admin
        .from('guide_profiles')
        .select('user_id, business_name, state, license_number, guide_license_expires_at')
        .eq('user_id', guideId)
        .maybeSingle(),
      admin
        .from('outfitter_subscriptions')
        .select('status, billing_interval, trial_end, current_period_end, stripe_customer_id, stripe_subscription_id, comp_until, updated_at')
        .eq('guide_id', guideId)
        .maybeSingle(),
      admin.auth.admin.getUserById(guideId),
    ])

    if (profileRes.error || !profileRes.data) return null
    const p = profileRes.data
    const g = guideRes.data
    const sub = subRes.data as (SubscriptionRow & { updated_at?: string }) | null
    const email = authRes.data?.user?.email ?? ''

    // Stripe live lookups (best-effort).
    let stripeSubSummary: AdminAccountDetail['stripe_subscription'] = null
    let invoices: AdminAccountDetail['invoices'] = []
    if (sub?.stripe_customer_id) {
      let stripe: Stripe | null = null
      try {
        stripe = getStripe()
      } catch {
        stripe = null
      }
      if (stripe) {
        if (sub.stripe_subscription_id) {
          try {
            const live = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
              expand: ['default_payment_method'],
            })
            const item = live.items.data[0]
            const interval = item?.price?.recurring?.interval === 'year' ? 'year' : item?.price?.recurring?.interval === 'month' ? 'month' : null
            // current_period_end lives on the subscription item in
            // modern Stripe API versions.
            const liveItem = item as unknown as { current_period_end?: number }
            const cpe = liveItem?.current_period_end ?? null
            stripeSubSummary = {
              id: live.id,
              status: live.status,
              cancel_at_period_end: live.cancel_at_period_end === true,
              current_period_end: cpe,
              trial_end: live.trial_end ?? null,
              interval: interval as 'month' | 'year' | null,
              has_default_payment_method: !!live.default_payment_method,
            }
          } catch (e) {
            console.warn('[admin-queries.detail:stripe-sub]', (e as Error).message)
          }
        }
        try {
          const list = await stripe.invoices.list({ customer: sub.stripe_customer_id, limit: 25 })
          invoices = list.data.map((inv) => ({
            id: inv.id ?? '',
            number: inv.number ?? null,
            amount_paid_cents: inv.amount_paid ?? 0,
            currency: inv.currency ?? 'usd',
            status: inv.status ?? 'open',
            created_unix: inv.created ?? 0,
            hosted_invoice_url: inv.hosted_invoice_url ?? null,
          }))
        } catch (e) {
          console.warn('[admin-queries.detail:stripe-invoices]', (e as Error).message)
        }
      }
    }

    // Last activity: max of subscription.updated_at, latest trip,
    // latest log entry.
    let lastActivity: string | null = sub?.updated_at ?? null
    try {
      const { data: latestTrip } = await admin
        .from('trips')
        .select('updated_at')
        .eq('guide_id', guideId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const t = latestTrip?.updated_at ?? null
      if (t && (!lastActivity || t > lastActivity)) lastActivity = t
    } catch (e) {
      console.warn('[admin-queries.detail:trip-activity]', (e as Error).message)
    }

    const baseRow = {
      status: sub?.status ?? null,
      comp_until: sub?.comp_until ?? null,
      billing_interval: sub?.billing_interval ?? null,
    }

    return {
      guide_id: p.id,
      display_name: p.display_name,
      first_name: p.first_name ?? '',
      last_name: p.last_name ?? '',
      email,
      phone: p.phone ?? null,
      signup_date: p.created_at,
      business_name: g?.business_name ?? null,
      state: g?.state ?? null,
      license_number: g?.license_number ?? null,
      guide_license_expires_at: g?.guide_license_expires_at ?? null,
      address_street: p.address_street ?? null,
      address_city: p.address_city ?? null,
      address_state: p.address_state ?? null,
      address_zip: p.address_zip ?? null,
      subscription: sub,
      stripe_subscription: stripeSubSummary,
      invoices,
      tier: tierFor(baseRow),
      plan: planFor({ billing_interval: sub?.billing_interval ?? null, comp_until: sub?.comp_until ?? null }),
      last_activity_at: lastActivity,
    }
  },
)

// v27.6.0 — revenue snapshot. Pulls every active subscription row +
// every trial in one query, then aggregates in JS so we don't pay for
// a server-side view. Cached by React cache() per-request.
//
// MRR rule: monthly subs contribute their nominal monthly amount;
// annual subs contribute (annual_amount / 12). We don't know prices
// at query time without hitting Stripe, so we hardcode the v2 lookup
// keys ($9 monthly, $90 annual) — this matches stripe.ts. If pricing
// ever drifts, that's the single edit point.
export type RevenueSnapshot = {
  active_paid_count: number
  comp_count: number
  trialing_count: number
  past_due_count: number
  canceled_this_month_count: number
  mrr_cents: number
  arr_cents: number
  trial_expected_mrr_cents: number
  generated_at: string
}

const PRICE_MONTHLY_CENTS = 900 // $9
const PRICE_ANNUAL_CENTS = 9000 // $90, MRR = $7.50

export const fetchRevenueSnapshot = cache(async (): Promise<RevenueSnapshot> => {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('outfitter_subscriptions')
    .select('status, billing_interval, comp_until, current_period_end, updated_at')

  const today = new Date().toISOString().slice(0, 10)
  const startOfMonth = today.slice(0, 7) + '-01'

  let active_paid = 0
  let comp = 0
  let trialing = 0
  let past_due = 0
  let canceled_this_month = 0
  let mrrCents = 0
  let trialMrrCents = 0

  for (const r of rows ?? []) {
    const isComp = r.comp_until && r.comp_until >= today
    if (isComp) {
      comp++
      continue
    }
    if (r.status === 'trialing') {
      trialing++
      const cents = r.billing_interval === 'year'
        ? Math.round(PRICE_ANNUAL_CENTS / 12)
        : PRICE_MONTHLY_CENTS
      trialMrrCents += cents
      continue
    }
    if (r.status === 'active') {
      active_paid++
      const cents = r.billing_interval === 'year'
        ? Math.round(PRICE_ANNUAL_CENTS / 12)
        : PRICE_MONTHLY_CENTS
      mrrCents += cents
      continue
    }
    if (r.status === 'past_due') {
      past_due++
      continue
    }
    if (r.status === 'canceled') {
      const ts = r.updated_at ?? ''
      if (ts && ts.slice(0, 10) >= startOfMonth) canceled_this_month++
      continue
    }
  }

  return {
    active_paid_count: active_paid,
    comp_count: comp,
    trialing_count: trialing,
    past_due_count: past_due,
    canceled_this_month_count: canceled_this_month,
    mrr_cents: mrrCents,
    arr_cents: mrrCents * 12,
    trial_expected_mrr_cents: trialMrrCents,
    generated_at: new Date().toISOString(),
  }
})
