'use client'

// v27.0b.6 (B): Action-needed card on /app/h/trips/[id]. Surfaced at the
// top when the hunter has unfulfilled trip prep actions — typically a
// hunting license + a tag for the targeted species. Each action has two
// paths: pick from existing wallet items (dropdown), or jump to the
// wallet new form prefilled with type. When no actions remain the card
// returns null (parent already gates by !actions.length, but defensive).
//
// Action items derived server-side in page.tsx from trip metadata
// (species_targeted + state). v27.0b.6 ships a sane default: 1 license
// + 1 tag per species. v27.1 will refine with real form-mapped reqs.

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { AlertCircle, Plus } from 'lucide-react'
import { linkWalletItemToTripAction } from '../actions'
import type { LinkedWalletItem } from '../../../../_lib/queries'

export type ActionItem = {
  key: string
  label: string
  /** which wallet type satisfies this action */
  type: 'license' | 'tag' | 'permit' | 'stamp' | 'harvest_report_card'
  /** matching wallet items the hunter already has */
  candidates: LinkedWalletItem[]
  /** prefill state on the wallet new link, when known */
  state?: string | null
}

export default function ActionNeededCard({
  tripId,
  actions,
}: {
  tripId: string
  actions: ActionItem[]
}) {
  if (actions.length === 0) return null
  return (
    <section
      className="bb-tile bb-form-section"
      aria-labelledby="bb-action-needed"
      style={{ borderColor: 'var(--color-copper)', borderWidth: 1, borderStyle: 'solid' }}
    >
      <div className="bb-tile-body">
        <h2
          id="bb-action-needed"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <AlertCircle size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
          Action needed
        </h2>
        <p className="bb-form-help" style={{ marginTop: '-0.3rem', marginBottom: '0.5rem' }}>
          Your guide needs these on file before the trip. Pick from your wallet or add new.
        </p>
        <div className="flex flex-col gap-3">
          {actions.map((a) => (
            <ActionRow key={a.key} tripId={tripId} action={a} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ActionRow({ tripId, action }: { tripId: string; action: ActionItem }) {
  const [selection, setSelection] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleLink() {
    if (!selection) {
      setError('Pick a wallet item first.')
      return
    }
    setError(null)
    const fd = new FormData()
    fd.set('trip_id', tripId)
    fd.set('wallet_item_id', selection)
    startTransition(async () => {
      const res = await linkWalletItemToTripAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedAt(Date.now())
    })
  }

  const newHref = action.state
    ? `/app/h/wallet/new?type=${action.type}&state=${encodeURIComponent(action.state)}`
    : `/app/h/wallet/new?type=${action.type}`

  // v27.0b.7: always render BOTH paths side-by-side. Even when the hunter
  // has no matching items, the dropdown still appears (with a "No
  // matching items" placeholder) so the user knows the option exists.
  // Add new is always there as the alternative.
  const hasCandidates = action.candidates.length > 0

  return (
    <div
      className="bb-tile"
      style={{ padding: '0.75rem', borderColor: 'var(--color-ink-tint)' }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{action.label}</div>
      <div
        className="bb-form-row"
        style={{ marginBottom: '0.5rem', position: 'relative', zIndex: 1 }}
      >
        <label
          className="bb-form-label"
          style={{ marginBottom: '0.25rem' }}
          htmlFor={`action-${action.key}-pick`}
        >
          Use existing from your wallet
        </label>
        {/* v27.0b.8: removed the !hasCandidates clause from `disabled`.
            When empty the only option is the "No matching items"
            placeholder, but the select stays tappable so iOS doesn't
            render it as a non-interactive gray field. Pointer-events
            forced auto via inline style as defense against any
            ancestor pointer-events:none. */}
        <select
          id={`action-${action.key}-pick`}
          name={`action-${action.key}-pick`}
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          className="bb-input"
          disabled={isPending || savedAt !== null}
          style={{ pointerEvents: 'auto' }}
        >
          {hasCandidates ? (
            <option value="">— Pick from your wallet —</option>
          ) : (
            <option value="">— No matching items in your wallet —</option>
          )}
          {action.candidates.map((c) => {
            const label = [c.identifier, c.state, c.species, c.zone]
              .filter(Boolean)
              .join(' · ')
            return (
              <option key={c.id} value={c.id}>
                {label}
              </option>
            )
          })}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="bb-cta-sm"
          onClick={handleLink}
          disabled={!hasCandidates || isPending || savedAt !== null || !selection}
        >
          {savedAt !== null ? 'Linked' : isPending ? 'Linking…' : 'Use this'}
        </button>
        <span style={{ alignSelf: 'center', color: 'var(--color-ink-soft)', fontSize: '0.85rem' }}>
          or
        </span>
        <Link
          href={newHref}
          className="bb-btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <Plus size={14} aria-hidden="true" />
          Add new
        </Link>
      </div>
      {error && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', marginTop: '0.4rem' }}>
          {error}
        </p>
      )}
    </div>
  )
}
