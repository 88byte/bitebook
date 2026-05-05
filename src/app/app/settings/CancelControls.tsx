'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, X } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { cancelSubscriptionAction, reactivateSubscriptionAction } from './actions'

// v27.4.2 — cancel + reactivate. Cancel sets cancel_at_period_end=true
// on the Stripe subscription via the existing helper; the visual flip
// to a "Canceling" pill + "Account becomes read-only on …" line is
// already wired in BillingPanel for that field. Reactivate only
// renders when the subscription is currently canceling.
//
// The webhook reconciles outfitter_subscriptions in both directions
// (we don't store cancel_at_period_end ourselves — it lives Stripe-
// side and the BillingPanel reads it live).

function fmtDate(iso: string | null): string {
  if (!iso) return 'the next renewal date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'the next renewal date'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function CancelControls({
  cancelAtPeriodEnd,
  currentPeriodEndIso,
}: {
  cancelAtPeriodEnd: boolean
  currentPeriodEndIso: string | null
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function runCancel() {
    setError(null)
    startTransition(async () => {
      const res = await cancelSubscriptionAction()
      if ('error' in res) {
        setError(res.error)
        return
      }
      setConfirmOpen(false)
      router.refresh()
    })
  }

  function runReactivate() {
    setError(null)
    startTransition(async () => {
      const res = await reactivateSubscriptionAction()
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '1rem' }}>
      {cancelAtPeriodEnd ? (
        <>
          <p
            className="bb-form-help"
            role="status"
            style={{
              margin: 0,
              padding: '0.6rem 0.8rem',
              background: 'var(--color-paper-tint)',
              borderRadius: 8,
              color: 'var(--color-ink-muted)',
            }}
          >
            Your subscription is set to cancel on{' '}
            <strong>{fmtDate(currentPeriodEndIso)}</strong>. Account becomes read-only after that
            date. Reactivate to keep your subscription active.
          </p>
          <div>
            <button
              type="button"
              className="bb-cta-sm"
              onClick={runReactivate}
              disabled={pending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <ArrowUpRight size={14} aria-hidden="true" />
              {pending ? 'Reactivating…' : 'Reactivate subscription'}
            </button>
          </div>
        </>
      ) : (
        <div>
          <button
            type="button"
            className="bb-text-action"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.85rem',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: '#A33D3D',
            }}
          >
            <X size={13} aria-hidden="true" />
            Cancel subscription
          </button>
        </div>
      )}

      {error && (
        <p className="bb-form-help" role="alert" style={{ margin: 0, color: '#8C3C2A' }}>
          {error}
        </p>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Cancel subscription?"
        body={`Your subscription stays active until ${fmtDate(currentPeriodEndIso)}, then your account becomes read-only. You can reactivate anytime before that date with one tap. After that date, you'll need to start a new subscription to keep using Bite Book.`}
        confirmLabel="Cancel subscription"
        destructive
        isPending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runCancel}
      />
    </div>
  )
}
