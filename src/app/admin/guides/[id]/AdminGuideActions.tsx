'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { flipSubscriptionStatusAction, compAccountAction, clearCompAction, forceReactivateAction, deleteAccountAction } from '../../_lib/admin-actions'
import ConfirmModal from '@/app/_components/ConfirmModal'
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
  guideEmail,
  currentStatus,
  currentCompUntil,
  hasStripeCustomer,
}: {
  guideId: string
  // v27.8.4 — needed for the type-to-confirm delete modal.
  guideEmail: string
  currentStatus: SubStatus
  currentCompUntil: string | null
  hasStripeCustomer: boolean
}) {
  const router = useRouter()
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
  // v27.8.4 — delete-account modal state.
  const [deleteOpen, setDeleteOpen] = useState(false)

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

  // v27.8.4 — delete account. ConfirmModal handles the type-to-confirm
  // gate (typed email must match guideEmail before Confirm enables);
  // the server action re-checks defense-in-depth. On success we route
  // back to the /admin index since the detail page is gone.
  function runDelete(typedEmail: string) {
    setError(null)
    startTransition(async () => {
      const r = await deleteAccountAction(guideId, typedEmail)
      if ('error' in r) {
        setError(r.error)
        setDeleteOpen(false)
        return
      }
      // Account is gone; the current page would 404 on refresh.
      router.replace('/admin?deleted=1')
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
            // v27.8.4.4 — bb-cta-sm provides display/padding/border-radius
            // that bb-cta-sm-destructive overlays the red surface on top
            // of. Without the base class the button rendered as a bare
            // unstyled element. Same fix applied to Delete account below.
            <button type="button" onClick={runClearComp} disabled={pending} className="bb-cta-sm bb-cta-sm-destructive">
              Clear comp
            </button>
          ) : null}
        </div>
      </div>

      {/* v27.8.4 — Force reactivate stays mid-panel; Danger zone (delete)
          lives below in its own visually-separated subsection so it can't
          be reached by an accidental Tab-to-the-bottom muscle memory. */}
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

      {/* v27.8.4 — Danger zone. Subsection visually separated by a
          horizontal rule + red-tinted heading so it doesn't blend with
          the routine actions above. Type-to-confirm gate inside the
          modal blocks misclicks; the action also re-validates the
          email server-side. */}
      <div
        style={{
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid rgba(140, 60, 42, 0.25)',
        }}
      >
        <div className="bb-admin-action-row">
          <div className="bb-admin-action-label">
            <strong style={{ color: '#8C3C2A' }}>Danger zone — Delete account</strong>
            <span className="bb-form-help">
              Permanently deletes <strong>{guideEmail}</strong> and every
              attached row: profile, guide_profile, subscription, trips,
              hunters they invited (relationship only — those accounts
              survive), wallet items, docs, and the auth record. Stripe
              subscription cancels (best-effort). Audit row preserved.
              Cannot be undone.
            </span>
          </div>
          <div className="bb-admin-action-control">
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={pending}
              // v27.8.4.4 — bb-cta-sm + bb-cta-sm-destructive paired
              // (was just the destructive class, which only paints
              // background+color and inherits everything else from
              // .bb-cta-sm). Without the base class the button rendered
              // with no padding / no border-radius / no font sizing.
              // Inline `style` removed — .bb-cta-sm already sets
              // display:inline-flex + align-items:center + gap:0.4rem.
              className="bb-cta-sm bb-cta-sm-destructive"
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete account
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={deleteOpen}
        title="Delete this account permanently?"
        body={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p>
              This deletes <strong>{guideEmail}</strong>&rsquo;s profile, guide
              profile, subscription, and auth record. Their trips, harvests,
              wallet items, and docs will be cascade-deleted. Hunters they
              invited keep their own accounts.
            </p>
            <p>
              The Stripe subscription will be canceled (best-effort).
              An <code>admin_actions</code> audit row is written first and
              survives the delete.
            </p>
            <p>
              <strong>This cannot be undone.</strong>
            </p>
          </div>
        }
        confirmLabel="Delete forever"
        cancelLabel="Cancel"
        destructive
        typeToConfirm={guideEmail}
        onConfirm={() => runDelete(guideEmail)}
        onCancel={() => setDeleteOpen(false)}
        isPending={pending}
      />
    </div>
  )
}
