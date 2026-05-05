// v27.4.0 — Billing tab body. Server component.
//
// Reads outfitter_subscriptions for the current guide, renders a
// status header (status pill + plan + renewal/trial date), and a
// single "Manage payment & subscription" CTA that posts to the
// `createBillingPortalAction` server action which redirects to the
// Stripe-hosted Customer Portal. Stripe handles change-card, change-
// plan (between bitebook_guide_monthly_v2 / annual_v2), cancel,
// reactivate, and invoice history. On portal exit, Stripe returns
// the user to /app/settings?tab=billing.
//
// Edge cases drive the rendered copy:
//   - No outfitter_subscriptions row OR no stripe_customer_id →
//     contact-support fallback.
//   - status='past_due' → red "Payment failed" callout above the CTA.
//   - status='canceled' → "Reactivate subscription" CTA copy + a
//     read-only-account banner cue.
//   - status='trialing' → trial end date shown; CTA copy unchanged
//     (portal accepts adding a payment method during trial).
//   - status='incomplete' / 'incomplete_expired' → "Restart signup"
//     pointing back to /signup since the portal can't recover an
//     incomplete subscription cleanly.
//
// All copy normalized to the v27.3.10.5 status-pill colors used
// elsewhere (green / amber / red / gray).

import Link from 'next/link'
import { AlertCircle, CreditCard, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBillingPortalAction } from './actions'

type Sub = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  billing_interval: 'month' | 'year' | null
  current_period_end: string | null
  trial_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusPillStyle(status: Sub['status']): React.CSSProperties {
  const base: React.CSSProperties = {
    flexShrink: 0,
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '0.2rem 0.55rem',
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  }
  if (status === 'active') {
    return { ...base, background: 'rgba(63, 107, 58, 0.14)', color: '#2F5A2A' }
  }
  if (status === 'trialing') {
    return { ...base, background: 'rgba(168, 92, 50, 0.16)', color: 'var(--color-copper)' }
  }
  if (status === 'past_due') {
    return { ...base, background: 'rgba(163, 61, 61, 0.14)', color: '#A33D3D' }
  }
  if (status === 'canceled') {
    return { ...base, background: 'var(--color-card-divider)', color: 'var(--color-ink-muted)' }
  }
  // incomplete
  return { ...base, background: 'rgba(163, 61, 61, 0.14)', color: '#A33D3D' }
}

function statusLabel(status: Sub['status']): string {
  if (status === 'active') return 'Active'
  if (status === 'trialing') return 'Trial'
  if (status === 'past_due') return 'Past due'
  if (status === 'canceled') return 'Canceled'
  return 'Incomplete'
}

function planLabel(interval: Sub['billing_interval']): string {
  if (interval === 'month') return 'Monthly · $9'
  if (interval === 'year') return 'Annual · $90'
  return 'Plan unknown'
}

function billingErrorMessage(code: string | null): string | null {
  if (!code) return null
  switch (code) {
    case 'no_subscription':
      return "We can't find your billing account. Email support@lastbite.pro and we'll fix it."
    case 'lookup_failed':
      return 'Could not look up your subscription. Try again, or contact support@lastbite.pro.'
    case 'stripe_unavailable':
      return 'Billing is temporarily unavailable. Try again in a moment.'
    case 'portal_failed':
      return 'Could not open the billing portal. Try again, or contact support@lastbite.pro.'
    default:
      return 'Could not open the billing portal.'
  }
}

export default async function BillingPanel({
  guideId,
  billingError = null,
}: {
  guideId: string
  billingError?: string | null
}) {
  // Use admin client to mirror the webhook + portal action — the
  // outfitter_subscriptions row is the canonical source of truth and
  // its RLS isn't gated on the same auth context as user reads.
  const admin = createAdminClient()
  const { data: sub } = await admin
    .from('outfitter_subscriptions')
    .select('status, billing_interval, current_period_end, trial_end, stripe_customer_id, stripe_subscription_id')
    .eq('guide_id', guideId)
    .maybeSingle<Sub>()

  if (!sub || !sub.stripe_customer_id) {
    return (
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Billing</h2>
          <p
            className="bb-form-help"
            role="status"
            style={{
              margin: 0,
              padding: '0.75rem 1rem',
              background: 'rgba(163, 61, 61, 0.08)',
              borderRadius: 8,
              color: '#A33D3D',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              We can&rsquo;t find a subscription for this account. Email{' '}
              <a
                href="mailto:support@lastbite.pro"
                className="bb-text-action bb-text-action-copper"
                style={{ display: 'inline', padding: 0 }}
              >
                support@lastbite.pro
              </a>{' '}
              and we&rsquo;ll get you set up.
            </span>
          </p>
        </div>
      </section>
    )
  }

  const isIncomplete = sub.status === 'incomplete'
  const isCanceled = sub.status === 'canceled'
  const isPastDue = sub.status === 'past_due'
  const isTrialing = sub.status === 'trialing'

  const renewalLine = isTrialing
    ? `Trial ends ${fmtDate(sub.trial_end)}`
    : isCanceled
      ? `Access ends ${fmtDate(sub.current_period_end)}`
      : `Renews ${fmtDate(sub.current_period_end)}`

  const ctaLabel = isCanceled
    ? 'Reactivate subscription'
    : isPastDue
      ? 'Update payment method'
      : isTrialing
        ? 'Add payment method'
        : 'Manage payment & subscription'

  return (
    <section className="bb-tile bb-form-section">
      <div className="bb-tile-body">
        <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Billing</h2>

        {/* v27.4.0 — error banner from ?billing_error= query param.
            Set by createBillingPortalAction when the portal session
            create fails. */}
        {billingErrorMessage(billingError) && (
          <p
            className="bb-form-help"
            role="alert"
            style={{
              marginTop: '0.5rem',
              padding: '0.6rem 0.8rem',
              background: 'rgba(163, 61, 61, 0.08)',
              borderRadius: 8,
              color: '#A33D3D',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{billingErrorMessage(billingError)}</span>
          </p>
        )}

        {/* Status header */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.4rem',
          }}
        >
          <span style={statusPillStyle(sub.status)}>{statusLabel(sub.status)}</span>
          <strong style={{ color: 'var(--color-ink)' }}>{planLabel(sub.billing_interval)}</strong>
          <span style={{ color: 'var(--color-ink-soft)', fontSize: '0.9rem' }}>· {renewalLine}</span>
        </div>

        {/* Past-due callout */}
        {isPastDue && (
          <p
            className="bb-form-help"
            role="status"
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'rgba(163, 61, 61, 0.08)',
              borderRadius: 8,
              color: '#A33D3D',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <strong>Payment failed.</strong> Update your card below to keep using Bite Book.
            </span>
          </p>
        )}

        {/* Canceled callout */}
        {isCanceled && (
          <p
            className="bb-form-help"
            role="status"
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'var(--color-paper-tint)',
              borderRadius: 8,
              color: 'var(--color-ink-muted)',
            }}
          >
            Your subscription is canceled. You&rsquo;ll keep access until the date above. Reactivate
            anytime to resume.
          </p>
        )}

        {/* Incomplete-expired path: portal can't recover, send to signup. */}
        {isIncomplete ? (
          <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Link
              href="/signup"
              className="bb-cta-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Sparkles size={14} aria-hidden="true" />
              Restart signup
            </Link>
            <p className="bb-form-help" style={{ margin: 0, alignSelf: 'center', color: 'var(--color-ink-soft)' }}>
              Your initial signup didn&rsquo;t finish. Restart to pick up where you left off.
            </p>
          </div>
        ) : (
          <form action={createBillingPortalAction} style={{ marginTop: '1rem' }}>
            <button
              type="submit"
              className="bb-cta"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                width: '100%',
                maxWidth: '24rem',
              }}
            >
              <CreditCard size={16} aria-hidden="true" />
              {ctaLabel}
            </button>
            <p
              className="bb-form-help"
              style={{ marginTop: '0.5rem', color: 'var(--color-ink-soft)' }}
            >
              You&rsquo;ll be redirected to Stripe&rsquo;s secure billing portal to change your card,
              switch plans, view invoices, or cancel.
            </p>
          </form>
        )}
      </div>
    </section>
  )
}
