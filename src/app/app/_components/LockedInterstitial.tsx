// v27.4.3 — full-page interstitial shown to guides whose subscription is
// 'incomplete' or has no outfitter_subscriptions row at all. Renders in
// place of /app/* page children, except inside /app/settings (so they can
// fix billing) and /app/support (so they can email us).
//
// The "Restart subscription" CTA points at the existing /signup flow,
// which routes through Stripe Checkout. For 'incomplete' that re-runs the
// initial subscription. For 'no_row' it spins up a fresh customer + sub.

import Link from 'next/link'
import { Lock, Sparkles, LifeBuoy } from 'lucide-react'
import type { TierResult } from '../_lib/billing-tier'

export default function LockedInterstitial({
  reason,
}: {
  reason: TierResult['reason']
}) {
  const headline =
    reason === 'incomplete'
      ? 'Finish setting up your subscription'
      : reason === 'no_row'
        ? "We can't find your billing account"
        : 'Your subscription is locked'
  const body =
    reason === 'incomplete'
      ? "Your initial signup didn't finish. Restart subscription to start using Bite Book — your account picks up from where you left off."
      : reason === 'no_row'
        ? "We don't have a billing record for this account. Email support@lastbite.pro and we'll get you set up."
        : 'Restart your subscription to keep using Bite Book.'

  return (
    <main className="bb-app-main">
      <div
        className="bb-tile"
        style={{
          maxWidth: '36rem',
          margin: '4rem auto',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
            background: 'rgba(168, 92, 50, 0.14)',
            color: 'var(--color-copper)',
          }}
        >
          <Lock size={24} aria-hidden="true" />
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '1.4rem',
            fontFamily: 'var(--font-barlow-condensed), sans-serif',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            color: 'var(--color-ink)',
          }}
        >
          {headline}
        </h1>
        <p
          style={{
            margin: '0.75rem 0 1.5rem',
            color: 'var(--color-ink-soft)',
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
          {reason === 'no_row' ? (
            <a
              href="mailto:support@lastbite.pro"
              className="bb-cta-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <LifeBuoy size={14} aria-hidden="true" />
              Email support
            </a>
          ) : (
            <Link
              href="/signup"
              className="bb-cta-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Sparkles size={14} aria-hidden="true" />
              Restart subscription
            </Link>
          )}
          <Link
            href="/app/settings?tab=billing"
            className="bb-text-action"
            style={{ alignSelf: 'center' }}
          >
            Go to billing settings
          </Link>
        </div>
      </div>
    </main>
  )
}
