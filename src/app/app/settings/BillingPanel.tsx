// v27.4.1 — native in-app billing UI. Replaces the v27.4.0 Stripe
// Customer Portal redirect with:
//   - Status header (status pill + plan + renewal/trial line +
//     "Canceling on …" hint when cancel_at_period_end is true)
//   - PaymentMethodCard (live card brand + last 4 + Replace via
//     Stripe Elements SetupIntent flow)
//   - InvoicesList (last 10 invoices, Stripe-hosted PDF links)
//   - Conditional callouts for past_due / canceled / incomplete
//
// Plan switch + cancel/reactivate ship in v27.4.2 — until then a
// small "More billing actions" affordance still routes to the
// Stripe Customer Portal so guides aren't blocked. v27.4.0's
// portal action stays in actions.ts as the fallback.

import Link from 'next/link'
import { AlertCircle, ArrowRight, Sparkles } from 'lucide-react'
import {
  loadGuideBillingDetail,
  loadGuideInvoices,
  type BillingDetail,
} from '../_lib/billing-queries'
import PaymentMethodCard from './PaymentMethodCard'
import InvoicesList from './InvoicesList'
import PlanSwitcher from './PlanSwitcher'
import CancelControls from './CancelControls'
import StartCheckoutButton from './StartCheckoutButton'

// v28.1.0e.3 — sanitize return_to to same-origin absolute paths so we
// never bounce the visitor to an arbitrary external host.
function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v.startsWith('/')) return null
  return v
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

function statusPillStyle(status: BillingDetail['status'], cancelAtPeriodEnd: boolean): React.CSSProperties {
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
  // A subscription that's still 'active' but pending cancellation
  // reads differently from a healthy active one — show the canceling
  // pill in the same gray as canceled so the visual cue matches the
  // intent.
  if (cancelAtPeriodEnd && (status === 'active' || status === 'trialing')) {
    return { ...base, background: 'var(--color-card-divider)', color: 'var(--color-ink-muted)' }
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
  return { ...base, background: 'rgba(163, 61, 61, 0.14)', color: '#A33D3D' }
}

function statusLabel(status: BillingDetail['status'], cancelAtPeriodEnd: boolean): string {
  if (cancelAtPeriodEnd && (status === 'active' || status === 'trialing')) return 'Canceling'
  if (status === 'active') return 'Active'
  if (status === 'trialing') return 'Trial'
  if (status === 'past_due') return 'Past due'
  if (status === 'canceled') return 'Canceled'
  return 'Incomplete'
}

function planLabel(interval: BillingDetail['billing_interval']): string {
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
  returnTo = null,
  networkToken = null,
  checkoutStatus = null,
}: {
  guideId: string
  billingError?: string | null
  returnTo?: string | null
  networkToken?: string | null
  checkoutStatus?: 'success' | 'canceled' | null
}) {
  const safeReturn = safeReturnPath(returnTo)
  // Pull both reads in parallel — billing detail (sub row + live PM)
  // and invoices (live Stripe call). Failures inside each helper are
  // swallowed and return empty / null, so the panel renders even if
  // Stripe is degraded.
  const [detail, invoices] = await Promise.all([
    loadGuideBillingDetail(guideId),
    loadGuideInvoices(guideId, 10),
  ])

  if (!detail) {
    // v28.1.0e.3 — was a dead end ("email support") for any signed-in
    // user without a sub row. Hunters who clicked "Add subscription"
    // from a guide-network invite landed here. Now we surface a real
    // Start your subscription CTA that creates a Stripe Checkout
    // session for the existing user (no new account needed). After
    // checkout the success_url returns them to return_to (the invite
    // link) so they finish accepting in one tap.
    return (
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Billing</h2>

          {safeReturn && (
            <p
              className="bb-form-help"
              role="status"
              style={{
                marginTop: '0.25rem',
                padding: '0.6rem 0.8rem',
                background: 'rgba(168, 92, 50, 0.10)',
                border: '1px solid rgba(168, 92, 50, 0.25)',
                borderRadius: 8,
                color: 'var(--color-ink)',
              }}
            >
              Start your Bite Book Guide subscription to accept your guide-network invite. We will bring you back to the invite as soon as your trial begins.
            </p>
          )}

          <p className="bb-form-help" style={{ marginTop: '0.6rem' }}>
            $9 a month or $90 a year, 7-day free trial, no card required to start. Cancel anytime from this page.
          </p>

          <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <StartCheckoutButton
              plan="annual"
              returnTo={safeReturn}
              networkToken={networkToken ?? null}
              label="Start annual trial ($90 / yr)"
            />
            <StartCheckoutButton
              plan="monthly"
              returnTo={safeReturn}
              networkToken={networkToken ?? null}
              variant="secondary"
              label="Start monthly trial ($9 / mo)"
            />
          </div>

          <p className="bb-form-help" style={{ marginTop: '0.75rem', color: 'var(--color-ink-muted)' }}>
            Trouble starting your subscription? Email{' '}
            <a
              href="mailto:support@lastbite.pro"
              className="bb-text-action bb-text-action-copper"
              style={{ display: 'inline', padding: 0 }}
            >
              support@lastbite.pro
            </a>
            .
          </p>
        </div>
      </section>
    )
  }

  const isIncomplete = detail.status === 'incomplete'
  const isCanceled = detail.status === 'canceled'
  const isPastDue = detail.status === 'past_due'
  const isTrialing = detail.status === 'trialing'

  const renewalLine = isTrialing
    ? `Trial ends ${fmtDate(detail.trial_end)}`
    : isCanceled
      ? `Access ends ${fmtDate(detail.current_period_end)}`
      : detail.cancel_at_period_end
        ? `Canceling on ${fmtDate(detail.current_period_end)}`
        : `Renews ${fmtDate(detail.current_period_end)}`

  return (
    <section className="bb-tile bb-form-section">
      <div className="bb-tile-body">
        <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Billing</h2>

        {/* v28.1.0e.3 — When the user lands here from a guide-network
            invite (return_to set) AND they now have an active sub,
            surface a Continue banner so they can finish accepting in
            one tap. This covers the "they just completed checkout"
            case (checkout=success) and the "they were already active
            but clicked into billing" case in one path. */}
        {safeReturn && (detail.status === 'active' || detail.status === 'trialing') && (
          <Link
            href={safeReturn}
            className="bb-tile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 0.9rem',
              marginTop: '0.5rem',
              textDecoration: 'none',
              background: 'rgba(63, 107, 58, 0.10)',
              borderColor: 'rgba(63, 107, 58, 0.30)',
              color: 'var(--color-ink)',
            }}
          >
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <strong style={{ display: 'block' }}>
                {checkoutStatus === 'success' ? 'Subscription started.' : 'You are subscribed.'} Continue to your invite.
              </strong>
              <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
                Finish accepting your guide-network invite in one tap.
              </span>
            </span>
            <ArrowRight size={16} aria-hidden="true" style={{ flexShrink: 0, color: '#2F5A2A' }} />
          </Link>
        )}

        {checkoutStatus === 'canceled' && (
          <p
            className="bb-form-help"
            role="status"
            style={{
              marginTop: '0.5rem',
              padding: '0.6rem 0.8rem',
              background: 'rgba(168, 92, 50, 0.08)',
              borderRadius: 8,
              color: 'var(--color-ink)',
            }}
          >
            Checkout was canceled. You can start a trial again any time below.
          </p>
        )}

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
          <span style={statusPillStyle(detail.status, detail.cancel_at_period_end)}>
            {statusLabel(detail.status, detail.cancel_at_period_end)}
          </span>
          <strong style={{ color: 'var(--color-ink)' }}>
            {planLabel(detail.billing_interval)}
          </strong>
          <span style={{ color: 'var(--color-ink-soft)', fontSize: '0.9rem' }}>
            · {renewalLine}
          </span>
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

        {/* Canceled callout — fully canceled (period_end has elapsed,
            subscription is in canceled state). cancel_at_period_end
            still-active is rendered by CancelControls below as a
            paper-tint informational banner with a Reactivate CTA. */}
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
            Your subscription is canceled. To resume, restart signup or contact{' '}
            <a
              href="mailto:support@lastbite.pro"
              className="bb-text-action bb-text-action-copper"
              style={{ display: 'inline', padding: 0 }}
            >
              support@lastbite.pro
            </a>
            .
          </p>
        )}

        {/* Incomplete-expired path */}
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
          <>
            {/* v27.4.1 — native card update via Stripe Elements. */}
            <PaymentMethodCard paymentMethod={detail.default_payment_method} />

            {/* v27.4.2 — in-app plan switcher with proration preview.
                Hidden when the subscription is already canceling-but-
                still-active (PlanSwitcher returns null) — guide must
                Reactivate first to switch. */}
            <PlanSwitcher
              currentInterval={detail.billing_interval}
              cancelAtPeriodEnd={detail.cancel_at_period_end}
            />

            {/* v27.4.2 — cancel / reactivate. Only renders for active
                or trialing subs (the canceled state above already
                short-circuits to the Restart Signup affordance). The
                "Canceling" pill in the status header above + the
                informational banner inside CancelControls together
                handle the cancel_at_period_end visual flip. */}
            <CancelControls
              cancelAtPeriodEnd={detail.cancel_at_period_end}
              currentPeriodEndIso={detail.current_period_end}
            />

            {/* v27.4.1 — invoice list with Stripe-hosted PDF links. */}
            <InvoicesList invoices={invoices} />
          </>
        )}
      </div>
    </section>
  )
}
