'use client'

import { useState, useTransition } from 'react'
import { Plus, Check } from 'lucide-react'
import { METHOD_OPTIONS } from '@/lib/methods'
import { addHarvestAction } from './actions'

type ParticipantOption = { id: string; display_name: string }

type TagOption = {
  id: string
  identifier: string
  species: string | null
  state: string | null
  zone: string | null
  season_year: number | null
  valid_to: string
}

type Props = {
  tripId: string
  tripKind: 'hunting' | 'fishing'
  defaultMethod: string | null
  participants: ParticipantOption[]
  /** v27.0b.2: per-hunter tag options. Linked tags via trip_wallet_items
   * preferred; falls back to all active tags until v27.0b.3 ships. */
  tagOptionsByHunter: Record<string, TagOption[]>
}

// v26.3: per-trip harvest entry. Visible to the guide on planned/active
// trips. Self-cert is required: guide attests they personally witnessed
// the harvest (server enforces too). Photo upload is deferred to the
// Storage batch.
//
// v27.0b.2: hunter selector drives tag binding. After picking a hunter:
//   - 0 active tags → block save with "link a tag first" hint
//   - 1 active tag → auto-bind silently, no extra UI
//   - 2+ active tags → secondary tag picker scoped to that hunter
// On save, harvests.consumed_wallet_item_id is set; the v27.0b.0 trigger
// flips the linked wallet item to tagged_out_at.
export default function AddHarvestForm({ tripId, tripKind, defaultMethod, participants, tagOptionsByHunter }: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [hunterId, setHunterId] = useState<string>('')
  const [tagId, setTagId] = useState<string>('')

  const tagOptions = hunterId ? tagOptionsByHunter[hunterId] ?? [] : []
  const needsTagPick = tagOptions.length > 1
  const noTags = !!hunterId && tagOptions.length === 0
  const autoBoundTagId = tagOptions.length === 1 ? tagOptions[0].id : null

  function nowLocal(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('trip_id', tripId)
    // v27.0b.2: bind the consumed tag explicitly. Single-tag hunters get
    // auto-bound; multi-tag hunters use the picker; no-tag hunters are
    // blocked client-side here (server validates too).
    const boundTagId = autoBoundTagId ?? tagId
    if (hunterId && tagOptions.length > 0 && !boundTagId) {
      setError('Pick which tag this harvest used.')
      return
    }
    if (boundTagId) fd.set('consumed_wallet_item_id', boundTagId)
    startTransition(async () => {
      const res = await addHarvestAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedAt(Date.now())
      setOpen(false)
      setHunterId('')
      setTagId('')
      ;(e.target as HTMLFormElement).reset()
    })
  }

  const showSaved = savedAt !== null && Date.now() - savedAt < 4000

  if (participants.length === 0) {
    return (
      <p className="bb-form-help">
        Add a hunter to this trip before logging harvests.
      </p>
    )
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="bb-cta-sm"
          onClick={() => {
            setOpen(true)
            setError(null)
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Add harvest
        </button>
        {showSaved && (
          <span
            className="bb-pill bb-pill-active"
            role="status"
            aria-live="polite"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Check size={12} aria-hidden="true" />
            Harvest logged
          </span>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 mt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="harvest_hunter_id">Hunter</label>
          <select
            id="harvest_hunter_id"
            name="hunter_id"
            required
            value={hunterId}
            onChange={(e) => {
              setHunterId(e.target.value)
              setTagId('')
            }}
            className="bb-input"
          >
            <option value="" disabled>Select hunter</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="harvest_species">Species</label>
          <input
            id="harvest_species"
            name="species_name"
            type="text"
            required
            placeholder={tripKind === 'fishing' ? 'Rainbow trout' : 'Black bear'}
            className="bb-input"
            autoComplete="off"
            maxLength={120}
          />
        </div>
      </div>

      {/* v27.0b.2: tag picker — only when chosen hunter has 2+ active tags. */}
      {needsTagPick && (
        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="harvest_tag_id">Tag used</label>
          <select
            id="harvest_tag_id"
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            required
            className="bb-input"
          >
            <option value="" disabled>Pick a tag</option>
            {tagOptions.map((t) => {
              const parts = [
                t.species,
                t.state,
                t.zone ? `Zone ${t.zone}` : null,
                t.season_year ? `${t.season_year}` : null,
              ].filter(Boolean)
              return (
                <option key={t.id} value={t.id}>
                  {t.identifier}
                  {parts.length > 0 ? ` — ${parts.join(' · ')}` : ''}
                </option>
              )
            })}
          </select>
        </div>
      )}
      {noTags && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A' }}>
          This hunter has no active tags linked to this trip. Link a tag from
          their wallet first, then come back to log the harvest.
        </p>
      )}

      <div className="bb-form-row">
        <span className="bb-form-label">Activity</span>
        <div className="bb-segmented" role="radiogroup" aria-label="Activity">
          <label>
            <input
              type="radio"
              name="kind"
              value="hunting"
              defaultChecked={tripKind === 'hunting'}
            />
            Hunting
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              value="fishing"
              defaultChecked={tripKind === 'fishing'}
            />
            Fishing
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="harvest_method">Method</label>
          <select
            id="harvest_method"
            name="method"
            defaultValue={defaultMethod ?? ''}
            className="bb-input"
          >
            <option value="">Select method</option>
            {METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="harvest_tag">Tag # <span style={{ opacity: 0.6 }}>(optional)</span></label>
          <input
            id="harvest_tag"
            name="tag_number"
            type="text"
            className="bb-input"
            autoComplete="off"
            maxLength={40}
          />
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label" htmlFor="harvest_quantity">Quantity</label>
          <input
            id="harvest_quantity"
            name="quantity"
            type="number"
            min={1}
            max={99}
            defaultValue={1}
            className="bb-input"
          />
        </div>
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="harvest_at">When</label>
        <input
          id="harvest_at"
          name="harvested_at"
          type="datetime-local"
          defaultValue={nowLocal()}
          className="bb-input"
        />
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="harvest_notes">Notes <span style={{ opacity: 0.6 }}>(optional)</span></label>
        <textarea
          id="harvest_notes"
          name="notes"
          rows={2}
          className="bb-input"
          placeholder="Where it dropped, weight estimate, anything else worth remembering."
        />
      </div>

      <p className="bb-form-help">Photos coming soon.</p>

      <label
        className="bb-detail-row"
        style={{ alignItems: 'center', cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          name="self_cert"
          required
          className="h-4 w-4 accent-[color:var(--color-copper)]"
        />
        <span className="bb-detail-name" style={{ fontWeight: 500 }}>
          I personally witnessed and confirm this harvest.
        </span>
      </label>

      {error && (
        <p style={{ color: '#8C3C2A', fontSize: '0.85rem' }} role="alert">{error}</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" className="bb-cta-sm" disabled={isPending || noTags}>
          <Plus size={14} aria-hidden="true" />
          {isPending ? 'Saving...' : 'Save harvest'}
        </button>
        <button
          type="button"
          className="bb-btn-secondary"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
