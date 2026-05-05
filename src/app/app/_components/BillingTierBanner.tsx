// v27.4.3 — top-of-app banner for guides whose subscription is past_due
// or canceled (read_only tier). Renders inside the guide shell only.
// Hunters never see it; locked guides see the LockedInterstitial in
// place of children, not this banner.
//
// The banner is informational + a single "Update billing" CTA pointing
// at /app/settings?tab=billing. Action-level errors (returned by
// assertWriteAllowed) carry the same copy from tierMessage(reason), so
// the banner and any blocked-write toast read identically.

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import type { TierResult } from '../_lib/billing-tier'

export default function BillingTierBanner({
  reason,
}: {
  reason: TierResult['reason']
}) {
  if (reason === 'ok') return null

  // Past_due / canceled → red. no_row → red (defensive). incomplete is
  // handled by the locked interstitial, not here.
  const isCancelable = reason === 'past_due' || reason === 'canceled' || reason === 'no_row'
  const headline =
    reason === 'past_due'
      ? 'Payment failed. Your account is read-only.'
      : reason === 'canceled'
        ? 'Your subscription ended. Your account is read-only.'
        : reason === 'no_row'
          ? "We can't find your billing account."
          : ''

  const ctaLabel =
    reason === 'past_due' ? 'Update card'
    : reason === 'canceled' ? 'Restart subscription'
    : 'Contact support'

  const ctaHref =
    reason === 'no_row'
      ? 'mailto:support@lastbite.pro'
      : '/app/settings?tab=billing'

  if (!isCancelable) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.7rem 1rem',
        background: 'rgba(163, 61, 61, 0.08)',
        borderBottom: '1px solid rgba(163, 61, 61, 0.18)',
        color: '#A33D3D',
        fontSize: '0.9rem',
        flexWrap: 'wrap',
      }}
    >
      <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
        <strong>{headline}</strong>{' '}
        Existing trips and reports stay visible, but new edits and uploads are paused until billing is current.
      </span>
      <Link
        href={ctaHref}
        className="bb-cta-sm"
        style={{
          flexShrink: 0,
          background: '#A33D3D',
          color: 'var(--color-paper)',
          borderColor: '#A33D3D',
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  )
}
