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
import { AlertCircle, Plus, Check, RefreshCw } from 'lucide-react'
import { linkWalletItemToTripAction, swapTripWalletItemAction } from '../actions'
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
  /** v27.0b.9: the hunter's currently-linked item for this action, if any.
   * When present the row morphs to a "linked" state with a Change
   * affordance instead of a Pick prompt. */
  currentLinked?: LinkedWalletItem | null
}

export default function ActionNeededCard({
  tripId,
  actions,
}: {
  tripId: string
  actions: ActionItem[]
}) {
  if (actions.length === 0) return null
  // v27.0b.9: header morphs based on completion state.
  const allLinked = actions.every((a) => !!a.currentLinked)
  const HeaderIcon = allLinked ? Check : AlertCircle
  const headerLabel = allLinked ? 'Trip credentials' : 'Action needed'
  const headerIconColor = allLinked ? 'var(--color-ink-soft)' : 'var(--color-copper)'
  const subtitle = allLinked
    ? 'Linked to your wallet. Tap Change if you picked the wrong one.'
    : 'Your guide needs these on file before the trip. Pick from your wallet or add new.'
  return (
    <section
      className="bb-tile bb-form-section"
      aria-labelledby="bb-action-needed"
      style={{
        borderColor: allLinked ? 'var(--color-ink-tint)' : 'var(--color-copper)',
        borderWidth: 1,
        borderStyle: 'solid',
      }}
    >
      <div className="bb-tile-body">
        <h2
          id="bb-action-needed"
          className="bb-form-section-head"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <HeaderIcon size={18} aria-hidden="true" style={{ color: headerIconColor }} />
          {headerLabel}
        </h2>
        <p className="bb-form-help" style={{ marginTop: '-0.3rem', marginBottom: '0.5rem' }}>
          {subtitle}
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
  // v27.0b.9: when an item is already linked, render a "linked" state
  // with a Change affordance. Tapping Change reveals the picker and
  // submits a swap (updates the existing trip_wallet_items row in
  // place). Picker stays usable on the unlinked state too.
  const linked = action.currentLinked ?? null
  const [selection, setSelection] = useState<string>(linked?.id ?? '')
  const [picking, setPicking] = useState<boolean>(!linked)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!selection) {
      setError('Pick a wallet item first.')
      return
    }
    if (linked && selection === linked.id) {
      setError('Same wallet item — no change.')
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('trip_id', tripId)
      if (linked) {
        // Swap path — update existing row.
        fd.set('old_wallet_item_id', linked.id)
        fd.set('new_wallet_item_id', selection)
        const res = await swapTripWalletItemAction(fd)
        if ('error' in res) {
          setError(res.error)
          return
        }
      } else {
        // First-link path — insert new row.
        fd.set('wallet_item_id', selection)
        const res = await linkWalletItemToTripAction(fd)
        if ('error' in res) {
          setError(res.error)
          return
        }
      }
      setSavedAt(Date.now())
      setPicking(false)
    })
  }

  const newHref = action.state
    ? `/app/h/wallet/new?type=${action.type}&state=${encodeURIComponent(action.state)}`
    : `/app/h/wallet/new?type=${action.type}`

  const hasCandidates = action.candidates.length > 0
  const linkedLabel = linked
    ? [linked.identifier, linked.state, linked.species, linked.zone].filter(Boolean).join(' · ')
    : null

  // Linked + not picking: compact summary row with Change button.
  if (linked && !picking) {
    return (
      <div
        className="bb-tile"
        style={{ padding: '0.75rem', borderColor: 'var(--color-ink-tint)' }}
      >
        <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>{action.label}</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
            <Check size={14} aria-hidden="true" style={{ color: 'var(--color-copper)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.92rem', color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {linkedLabel}
            </span>
          </div>
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => {
              setSelection(linked.id)
              setSavedAt(null)
              setError(null)
              setPicking(true)
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Change
          </button>
        </div>
      </div>
    )
  }

  // Picking state — both first-link and swap flows share this UI.
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
          {linked ? 'Swap to a different item' : 'Use existing from your wallet'}
        </label>
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
          onClick={handleSubmit}
          disabled={!hasCandidates || isPending || savedAt !== null || !selection}
        >
          {savedAt !== null
            ? linked ? 'Swapped' : 'Linked'
            : isPending
              ? linked ? 'Swapping…' : 'Linking…'
              : linked ? 'Save swap' : 'Use this'}
        </button>
        {linked && (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => {
              setSelection(linked.id)
              setError(null)
              setPicking(false)
            }}
            disabled={isPending}
          >
            Cancel
          </button>
        )}
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
