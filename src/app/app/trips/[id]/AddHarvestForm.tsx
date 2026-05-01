'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Plus, Check } from 'lucide-react'
import { methodsForKind } from '@/lib/methods'
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
  // v27.0b.5: false → multi-use tag won't auto-tag-out on save.
  single_use: boolean
}

type TagOptions = {
  tags: TagOption[]
  default_tag_id: string | null
}

type Props = {
  tripId: string
  tripKind: 'hunting' | 'fishing'
  defaultMethod: string | null
  /** v27.0a.23: trip's structured species_targeted, used to prefill the
   * Species field so guides aren't re-typing it. Guide can override for
   * opportunistic harvests. */
  defaultSpecies: string | null
  participants: ParticipantOption[]
  /** v27.0b.2.1: per-hunter active tag inventory + default selection.
   * Always shows the hunter's full active tag list; trip_wallet_items
   * only drives the default selection. Guide can always override. */
  tagOptionsByHunter: Record<string, TagOptions>
}

// v26.3: per-trip harvest entry. Visible to the guide on planned/active
// trips. Self-cert is required: guide attests they personally witnessed
// the harvest (server enforces too). Photo upload is deferred to the
// Storage batch.
//
// v27.0b.2.1: hunter selector → tag picker shows hunter's FULL active
// tag inventory (not filtered by trip linkage). trip_wallet_items only
// drives the default selection — guide can always override. Cases:
//   - 0 active tags total → empty state, save blocked
//   - 1 active tag → auto-bind silently, no picker
//   - 2+ active tags → picker, pre-selected to default_tag_id if set,
//     otherwise blank (guide must pick)
//
// Data fetch lives in the parent server component (trips/[id]/page.tsx)
// and is recomputed on every page load — no client-side memoization, so
// hunter wallet edits propagate next time the guide reopens this page.
export default function AddHarvestForm({ tripId, tripKind, defaultMethod, defaultSpecies, participants, tagOptionsByHunter }: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [hunterId, setHunterId] = useState<string>('')
  const [tagId, setTagId] = useState<string>('')
  // v27.0a.24: tag selection drives species_name + tag_number. These two
  // fields become controlled (vs. uncontrolled defaultValue) so a
  // selection change can rewrite them. Trip-level defaultSpecies stays
  // as the initial fallback when no tag is bound.
  const [speciesName, setSpeciesName] = useState<string>(defaultSpecies ?? '')
  const [tagNumber, setTagNumber] = useState<string>('')

  const opts: TagOptions = hunterId
    ? tagOptionsByHunter[hunterId] ?? { tags: [], default_tag_id: null }
    : { tags: [], default_tag_id: null }
  const tagOptions = opts.tags
  const needsTagPick = tagOptions.length > 1
  const noTags = !!hunterId && tagOptions.length === 0
  const autoBoundTagId = tagOptions.length === 1 ? tagOptions[0].id : null
  const boundTagId = autoBoundTagId ?? tagId
  // v27.0b.5: surface a heads-up when the bound tag is multi-use. Multi-use
  // tags don't auto-tag-out on harvest, so the hunter has to manually mark
  // tagged-out from the wallet when the season's done.
  const boundTag = boundTagId ? tagOptions.find((t) => t.id === boundTagId) ?? null : null
  const multiUseHeadsUp = boundTag && boundTag.single_use === false

  // v27.0a.24: when the bound tag changes, pull species + tag_number
  // forward from the wallet item. Predictable rule: tag selection always
  // wins — switching to a new tag overwrites whatever was in those fields.
  // Manual edits between tag changes survive (no re-application unless the
  // tag id actually changes). When the bound tag clears (no hunter, or
  // hunter with no tags), fall back to the trip-level species default.
  const lastAppliedTagRef = useRef<string>('')
  useEffect(() => {
    if (boundTagId && boundTagId !== lastAppliedTagRef.current) {
      const tag = tagOptions.find((t) => t.id === boundTagId)
      if (tag) {
        setSpeciesName(tag.species ?? defaultSpecies ?? '')
        setTagNumber(tag.identifier ?? '')
        lastAppliedTagRef.current = boundTagId
      }
    } else if (!boundTagId && lastAppliedTagRef.current !== '') {
      // Tag cleared — reset to trip default for species, blank for tag #.
      setSpeciesName(defaultSpecies ?? '')
      setTagNumber('')
      lastAppliedTagRef.current = ''
    }
  }, [boundTagId, tagOptions, defaultSpecies])

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
      setSpeciesName(defaultSpecies ?? '')
      setTagNumber('')
      lastAppliedTagRef.current = ''
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
              const newHunter = e.target.value
              setHunterId(newHunter)
              // v27.0b.3.1: empty value clears tag + dependent fields so
              // the guide can switch hunters cleanly.
              const next = newHunter ? (tagOptionsByHunter[newHunter]?.default_tag_id ?? '') : ''
              setTagId(next)
            }}
            className="bb-input"
          >
            <option value="">— Select hunter —</option>
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
            value={speciesName}
            onChange={(e) => setSpeciesName(e.target.value)}
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
          This hunter has no active tags in their wallet. They&apos;ll need to
          add a tag before this harvest can be logged.
        </p>
      )}
      {/* v27.0b.5: multi-use heads-up. Single-use tags auto-tag-out on
          harvest save via the _on_harvest_consume_tag trigger; multi-use
          tags don't, so the hunter has to mark tagged-out manually from
          the wallet when they're done with the season. */}
      {multiUseHeadsUp && (
        <p className="bb-form-help" style={{ color: 'var(--color-copper)' }}>
          This tag is multi-use — won&rsquo;t auto-tag-out. Mark it tagged out from the wallet when done.
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
            {methodsForKind(tripKind).map((m) => (
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
            value={tagNumber}
            onChange={(e) => setTagNumber(e.target.value)}
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
