'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, Check, Loader2 } from 'lucide-react'
import {
  previewPlanSwitchAction,
  confirmPlanSwitchAction,
  type PlanSwitchPreview,
} from './actions'

// v27.4.2 — in-app plan switcher. The current plan is highlighted as
// a chip; tapping the other chip pre-fetches Stripe's prorated
// invoice preview and renders a confirm panel with the exact amount
// the guide will be charged or credited today. Confirming calls
// stripe.subscriptions.update with proration_behavior=create_prorations
// — the existing customer.subscription.updated webhook reconciles
// outfitter_subscriptions.

type Interval = 'month' | 'year'

function fmtMoney(cents: number, currency: string): string {
  const dollars = cents / 100
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase() || 'USD',
    }).format(dollars)
  } catch {
    return `$${dollars.toFixed(2)}`
  }
}

function fmtDate(unixSec: number | null): string {
  if (!unixSec) return ''
  const d = new Date(unixSec * 1000)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function PlanSwitcher({
  currentInterval,
  // v27.4.2 — when the subscription is canceling-but-still-active,
  // hide the switcher. Forcing a plan switch on a canceling sub
  // would re-activate billing in confusing ways. Reactivate first.
  cancelAtPeriodEnd,
}: {
  currentInterval: Interval | null
  cancelAtPeriodEnd: boolean
}) {
  const router = useRouter()
  const [previewPending, startPreviewTransition] = useTransition()
  const [confirmPending, startConfirmTransition] = useTransition()
  const [target, setTarget] = useState<Interval | null>(null)
  const [preview, setPreview] = useState<PlanSwitchPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (cancelAtPeriodEnd) return null
  if (!currentInterval) return null

  const otherInterval: Interval = currentInterval === 'month' ? 'year' : 'month'

  function startSwitch(next: Interval) {
    setError(null)
    setPreview(null)
    setTarget(next)
    startPreviewTransition(async () => {
      const res = await previewPlanSwitchAction(next)
      if ('error' in res) {
        setError(res.error)
        setTarget(null)
        return
      }
      setPreview(res)
    })
  }

  function cancel() {
    setTarget(null)
    setPreview(null)
    setError(null)
  }

  function confirm() {
    if (!target) return
    setError(null)
    startConfirmTransition(async () => {
      const res = await confirmPlanSwitchAction(target)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setTarget(null)
      setPreview(null)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
      <h3
        className="bb-form-section-head"
        style={{
          marginTop: 0,
          marginBottom: 0,
          fontSize: '0.85rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-ink-soft)',
        }}
      >
        Plan
      </h3>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <PlanChip
          label="Monthly"
          subLabel="$9 / mo"
          active={currentInterval === 'month'}
          disabled={previewPending || confirmPending}
          onClick={() => currentInterval !== 'month' && startSwitch('month')}
        />
        <PlanChip
          label="Annual"
          subLabel="$90 / yr"
          subSubLabel="Save 17%"
          active={currentInterval === 'year'}
          disabled={previewPending || confirmPending}
          onClick={() => currentInterval !== 'year' && startSwitch('year')}
        />
      </div>

      {previewPending && target && (
        <p
          className="bb-form-help"
          role="status"
          aria-live="polite"
          style={{
            margin: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            color: 'var(--color-ink-soft)',
          }}
        >
          <Loader2
            size={14}
            aria-hidden="true"
            style={{ animation: 'bb-spin 1s linear infinite', color: 'var(--color-copper)' }}
          />
          Calculating proration…
        </p>
      )}

      {preview && target && (
        <div
          style={{
            marginTop: '0.4rem',
            padding: '0.75rem 0.85rem',
            border: '1px solid var(--color-card-divider)',
            borderRadius: 10,
            background: 'var(--color-paper-tint)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: 'var(--color-ink)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <ArrowRightLeft size={14} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
            Switch to {target === 'month' ? 'Monthly · $9 / mo' : 'Annual · $90 / yr'}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--color-ink-muted)' }}>
            {preview.amount_due_cents > 0 && (
              <>
                You&rsquo;ll be charged <strong>{fmtMoney(preview.amount_due_cents, preview.currency)}</strong> today.
              </>
            )}
            {preview.amount_due_cents < 0 && (
              <>
                You&rsquo;ll receive <strong>{fmtMoney(Math.abs(preview.amount_due_cents), preview.currency)}</strong> credit applied to future invoices.
              </>
            )}
            {preview.amount_due_cents === 0 && (
              <>No charge today. The new plan starts immediately and renews on your next cycle.</>
            )}
            {preview.next_period_end_unix && (
              <>
                {' '}
                Next renewal: <strong>{fmtDate(preview.next_period_end_unix)}</strong>.
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="bb-cta-sm"
              onClick={confirm}
              disabled={confirmPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Check size={14} aria-hidden="true" />
              {confirmPending ? 'Switching…' : 'Confirm switch'}
            </button>
            <button
              type="button"
              className="bb-btn-secondary"
              onClick={cancel}
              disabled={confirmPending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="bb-form-help" role="alert" style={{ margin: 0, color: '#8C3C2A' }}>
          {error}
        </p>
      )}
    </div>
  )
}

function PlanChip({
  label,
  subLabel,
  subSubLabel,
  active,
  disabled,
  onClick,
}: {
  label: string
  subLabel: string
  subSubLabel?: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      aria-pressed={active}
      style={{
        flex: '1 1 12rem',
        minWidth: '10rem',
        padding: '0.65rem 0.85rem',
        borderRadius: 10,
        border: active ? '2px solid var(--color-copper)' : '1px solid var(--color-card-divider)',
        background: active ? 'rgba(168, 92, 50, 0.06)' : '#FFFFFF',
        cursor: active ? 'default' : disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.15rem',
        opacity: disabled && !active ? 0.6 : 1,
      }}
    >
      <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
        {label}
        {active && (
          <span
            style={{
              marginLeft: '0.4rem',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '0.15rem 0.45rem',
              borderRadius: 999,
              background: 'rgba(168, 92, 50, 0.16)',
              color: 'var(--color-copper)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Current
          </span>
        )}
      </span>
      <span style={{ fontSize: '0.9rem', color: 'var(--color-ink-soft)' }}>{subLabel}</span>
      {subSubLabel && (
        <span style={{ fontSize: '0.78rem', color: 'var(--color-copper)' }}>{subSubLabel}</span>
      )}
    </button>
  )
}
