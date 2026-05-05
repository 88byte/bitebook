'use client'

import { useState, useTransition } from 'react'
import { flipSubscriptionStatusAction, compAccountAction, clearCompAction, forceReactivateAction } from '../../_lib/admin-actions'
import type { Database } from '@/lib/supabase/types'

type SubStatus = Database['public']['Enums']['subscription_status']

const STATUS_OPTIONS: SubStatus[] = ['trialing', 'active', 'past_due', 'canceled', 'incomplete']

// v27.6.0 — Action panel on /admin/guides/[id].
//
// Three live actions:
//   1. Flip subscription status (DB-only override) — dropdown + Apply.
//      Banner reads "Test override — Stripe state unchanged" so the
//      admin doesn't confuse this with a real cancel.
//   2. Comp this account — date input + Apply. (Or Clear comp when
//      already comped.)
//   3. Force reactivate — confirm modal then fire. Disabled when
//      there's no Stripe customer on file.
//
// All three call into admin-actions.ts which writes an audit row
// before the underlying mutation. Errors render inline.
export default function AdminGuideActions({
  guideId,
  currentStatus,
  currentCompUntil,
  hasStripeCustomer,
}: {
  guideId: string
  currentStatus: SubStatus
  currentCompUntil: string | null
  hasStripeCustomer: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [okFlash, setOkFlash] = useState<string | null>(null)
  const [pickedStatus, setPickedStatus] = useState<SubStatus>(currentStatus)
  const today = new Date().toISOString().slice(0, 10)
  const defaultCompUntil = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })()
  const [compUntil, setCompUntil] = useState<string>(currentCompUntil ?? defaultCompUntil)
  const [reactivateConfirm, setReactivateConfirm] = useState(false)

  function flash(msg: string) {
    setOkFlash(msg)
    setTimeout(() => setOkFlash(null), 2500)
  }

  function runFlip() {
    setError(null)
    startTransition(async () => {
      const r = await flipSubscriptionStatusAction(guideId, pickedStatus)
      if ('error' in r) setError(r.error)
      else flash(`Status flipped to ${pickedStatus}.`)
    })
  }

  function runComp() {
    setError(null)
    startTransition(async () => {
      const r = await compAccountAction(guideId, compUntil)
      if ('error' in r) setError(r.error)
      else flash(`Comped until ${compUntil}.`)
    })
  }

  function runClearComp() {
    setError(null)
    startTransition(async () => {
      const r = await clearCompAction(guideId)
      if ('error' in r) setError(r.error)
      else flash('Comp cleared.')
    })
  }

  function runReactivate() {
    setError(null)
    setReactivateConfirm(false)
    startTransition(async () => {
      const r = await forceReactivateAction(guideId)
      if ('error' in r) setError(r.error)
      else flash('Subscription reactivated.')
    })
  }

  const isComped = !!currentCompUntil && currentCompUntil >= today

  return (
    <div className="bb-admin-actions">
      {error ? <div className="bb-form-error">{error}</div> : null}
      {okFlash ? <div className="bb-form-success">{okFlash}</div> : null}

      <div className="bb-admin-action-row">
        <div className="bb-admin-action-label">
          <strong>Flip subscription status</strong>
          <span className="bb-form-help">Test override — Stripe state unchanged.</span>
        </div>
        <div className="bb-admin-action-control">
          <select
            value={pickedStatus}
            onChange={(e) => setPickedStatus(e.target.value as SubStatus)}
            className="bb-input"
            disabled={pending}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button type="button" onClick={runFlip} disabled={pending || pickedStatus === currentStatus} className="bb-btn-secondary">
            Apply
          </button>
        </div>
      </div>

      <div className="bb-admin-action-row">
        <div className="bb-admin-action-label">
          <strong>{isComped ? 'Update comp window' : 'Comp this account'}</strong>
          <span className="bb-form-help">
            {isComped
              ? `Currently comped until ${currentCompUntil}. Update or clear below.`
              : 'Marks the account active until the date below. Clears any Stripe subscription link from our row.'}
          </span>
        </div>
        <div className="bb-admin-action-control">
          <input
            type="date"
            value={compUntil}
            min={today}
            onChange={(e) => setCompUntil(e.target.value)}
            className="bb-input"
            disabled={pending}
          />
          <button type="button" onClick={runComp} disabled={pending} className="bb-btn-secondary">
            {isComped ? 'Update' : 'Comp'}
          </button>
          {isComped ? (
            <button type="button" onClick={runClearComp} disabled={pending} className="bb-cta-sm-destructive">
              Clear comp
            </button>
          ) : null}
        </div>
      </div>

      <div className="bb-admin-action-row">
        <div className="bb-admin-action-label">
          <strong>Force reactivate subscription</strong>
          <span className="bb-form-help">
            {hasStripeCustomer
              ? 'Creates a new Stripe subscription on the existing customer at the last-known interval. Requires a payment method on file.'
              : 'No Stripe customer on file — send the guide through checkout instead.'}
          </span>
        </div>
        <div className="bb-admin-action-control">
          {!reactivateConfirm ? (
            <button
              type="button"
              onClick={() => setReactivateConfirm(true)}
              disabled={pending || !hasStripeCustomer}
              className="bb-btn-secondary"
            >
              Reactivate
            </button>
          ) : (
            <>
              <button type="button" onClick={runReactivate} disabled={pending} className="bb-cta-sm">
                Confirm reactivate
              </button>
              <button type="button" onClick={() => setReactivateConfirm(false)} disabled={pending} className="bb-btn-secondary">
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
