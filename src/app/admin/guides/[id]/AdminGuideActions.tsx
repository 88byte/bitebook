'use client'

import { useState, useTransition } from 'react'
import { flipSubscriptionStatusAction, compAccountAction, clearCompAction, forceReactivateAction } from '../../_lib/admin-actions'
import type { Database } from '@/lib/supabase/types'

type SubStatus = Database['public']['Enums']['subscription_status']

const STATUS_OPTIONS: SubStatus[] = ['trialing', 'active', 'past_due', 'canceled', 'incomplete']

// v27.6.2 — per-status helper copy. Each describes the visible
// effect on the guide's /app experience when that status is set
// via this DB-only test override. Stripe state stays unchanged
// regardless — useful for sanity-checking the v27.4.3 banners +
// LockedInterstitial without touching billing.
const STATUS_HELPER: Record<SubStatus, string> = {
  trialing:   'Test mode: shows the guide as on trial. /app loads normally; banner reads "Trial — N days left" if trial_end is set.',
  active:     'Test mode: shows the guide as an active subscriber with full app access. No banners.',
  past_due:   'Test mode: triggers the read-only banner ("Subscription past due"). All write actions (creating trips, hunters, harvests) are blocked.',
  canceled:   'Test mode: triggers the canceled banner ("Subscription ended"). Write actions blocked, account read-only.',
  incomplete: 'Test mode: triggers the locked interstitial. Used for accounts that started signup but never confirmed payment — guide can only reach /app/settings or /app/support.',
}

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
        <div className="bb-admin-action-control" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <select
              value={pickedStatus}
              onChange={(e) => setPickedStatus(e.target.value as SubStatus)}
              className="bb-input"
              disabled={pending}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === 'incomplete' ? 'incomplete (setup incomplete)' : s}</option>
              ))}
            </select>
            <button type="button" onClick={runFlip} disabled={pending || pickedStatus === currentStatus} className="bb-btn-secondary">
              Apply
            </button>
          </div>
          {/* v27.6.2 — explain what the picked status DOES so the
              admin doesn't have to remember the gating matrix. */}
          <p className="bb-form-help" style={{ marginTop: '0.5rem', maxWidth: '36rem' }}>
            {STATUS_HELPER[pickedStatus]}
          </p>
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
          {/* v27.6.2 — fuller explainer. Use case: a guide canceled
              and now wants to come back without going through
              checkout again. We charge the card on file at the
              last-known interval immediately. */}
          <span className="bb-form-help">
            {hasStripeCustomer
              ? 'Creates a fresh Stripe subscription on this customer’s existing payment method, billed immediately at the last-known interval (monthly or annual). Use when a guide canceled and wants to come back without going through checkout again.'
              : 'No Stripe customer on file. The guide needs to go through /signup checkout — there’s no card to charge.'}
          </span>
        </div>
        <div className="bb-admin-action-control" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {!reactivateConfirm ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setReactivateConfirm(true)}
                disabled={pending || !hasStripeCustomer}
                className="bb-btn-secondary"
              >
                Reactivate
              </button>
            </div>
          ) : (
            <>
              <p className="bb-form-help" style={{ marginBottom: '0.5rem', maxWidth: '36rem' }}>
                <strong>Confirm:</strong> this will create a new active subscription
                billed immediately on the card on file. The guide will receive a
                Stripe receipt via email. Continue?
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button type="button" onClick={runReactivate} disabled={pending} className="bb-cta-sm">
                  Confirm reactivate
                </button>
                <button type="button" onClick={() => setReactivateConfirm(false)} disabled={pending} className="bb-btn-secondary">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
