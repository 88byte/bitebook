'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Trash2 } from 'lucide-react'
import { methodsForKind } from '@/lib/methods'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { updateHarvestAction, deleteHarvestAction } from '../../../actions'

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
  // v27.0b.5.2: tag's weapon, normalized to canonical method or null.
  weapon_restriction: string | null
}

type TagOptions = {
  tags: TagOption[]
  default_tag_id: string | null
}

export type HarvestEditInitial = {
  id: string
  trip_id: string
  hunter_id: string | null
  kind: 'hunting' | 'fishing'
  species_name: string | null
  method: string | null
  quantity: number
  tag_number: string | null
  harvested_at: string
  notes: string | null
  consumed_wallet_item_id: string | null
}

type Props = {
  initial: HarvestEditInitial
  participants: ParticipantOption[]
  /** Per-hunter active tag inventory + default selection. */
  tagOptionsByHunter: Record<string, TagOptions>
  basePath: string
}

// v27.0b.3: edit harvest form. Mirrors AddHarvestForm's auto-fill +
// hunter-driven tag picker semantics, but in update mode against an
// existing row. Delete button + ConfirmModal live alongside Save.
export default function EditHarvestForm({ initial, participants, tagOptionsByHunter, basePath }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [hunterId, setHunterId] = useState<string>(initial.hunter_id ?? '')
  const [tagId, setTagId] = useState<string>(initial.consumed_wallet_item_id ?? '')
  const [speciesName, setSpeciesName] = useState<string>(initial.species_name ?? '')
  const [tagNumber, setTagNumber] = useState<string>(initial.tag_number ?? '')
  // v27.0b.4.3: track kind in state so the method dropdown filters by activity.
  const [harvestKind, setHarvestKind] = useState<'hunting' | 'fishing'>(initial.kind)

  const opts: TagOptions = hunterId
    ? tagOptionsByHunter[hunterId] ?? { tags: [], default_tag_id: null }
    : { tags: [], default_tag_id: null }
  const tagOptions = opts.tags
  const needsTagPick = tagOptions.length > 1
  const noTags = !!hunterId && tagOptions.length === 0
  const autoBoundTagId = tagOptions.length === 1 ? tagOptions[0].id : null
  const boundTagId = autoBoundTagId ?? tagId
  // v27.0b.5: heads-up when bound tag is multi-use.
  const boundTag = boundTagId ? tagOptions.find((t) => t.id === boundTagId) ?? null : null
  const multiUseHeadsUp = boundTag && boundTag.single_use === false

  // Same auto-fill rule as AddHarvestForm — tag selection wins on switch,
  // manual edits survive between switches. Initialize lastApplied to the
  // initial tag so we don't clobber the prefilled values on first render.
  const lastAppliedTagRef = useRef<string>(initial.consumed_wallet_item_id ?? '')
  useEffect(() => {
    if (boundTagId && boundTagId !== lastAppliedTagRef.current) {
      const tag = tagOptions.find((t) => t.id === boundTagId)
      if (tag) {
        setSpeciesName(tag.species ?? speciesName)
        setTagNumber(tag.identifier ?? '')
        lastAppliedTagRef.current = boundTagId
      }
    } else if (!boundTagId && lastAppliedTagRef.current !== '') {
      setSpeciesName('')
      setTagNumber('')
      lastAppliedTagRef.current = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundTagId, tagOptions])

  function nowOrInitial(): string {
    // Convert UTC ISO string to local "yyyy-MM-ddTHH:mm" for datetime-local.
    const d = new Date(initial.harvested_at)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setError(null)
    const fd = new FormData(ev.currentTarget)
    fd.set('harvest_id', initial.id)
    if (hunterId && tagOptions.length > 0 && !boundTagId) {
      setError('Pick which tag this harvest used.')
      return
    }
    if (boundTagId) {
      fd.set('consumed_wallet_item_id', boundTagId)
    } else {
      fd.set('consumed_wallet_item_id', '')
    }
    startTransition(async () => {
      const res = await updateHarvestAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.push(basePath)
      router.refresh()
    })
  }

  function onDelete() {
    setConfirmDelete(false)
    setError(null)
    startTransition(async () => {
      const res = await deleteHarvestAction(initial.id)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.push(basePath)
      router.refresh()
    })
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
              const next = e.target.value
              setHunterId(next)
              const dflt = next ? (tagOptionsByHunter[next]?.default_tag_id ?? '') : ''
              setTagId(dflt)
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
            className="bb-input"
            autoComplete="off"
            maxLength={120}
          />
        </div>
      </div>

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
          This hunter has no active tags in their wallet.
        </p>
      )}
      {/* v27.0b.5: multi-use heads-up. */}
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
              checked={harvestKind === 'hunting'}
              onChange={() => setHarvestKind('hunting')}
            />
            Hunting
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              value="fishing"
              checked={harvestKind === 'fishing'}
              onChange={() => setHarvestKind('fishing')}
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
            defaultValue={initial.method ?? ''}
            className="bb-input"
          >
            <option value="">Select method</option>
            {methodsForKind(harvestKind).map((m) => (
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
            defaultValue={initial.quantity}
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
          defaultValue={nowOrInitial()}
          className="bb-input"
        />
      </div>

      <div className="bb-form-row">
        <label className="bb-form-label" htmlFor="harvest_notes">Notes <span style={{ opacity: 0.6 }}>(optional)</span></label>
        <textarea
          id="harvest_notes"
          name="notes"
          rows={2}
          defaultValue={initial.notes ?? ''}
          className="bb-input"
          placeholder="Where it dropped, weight estimate, anything else."
        />
      </div>

      {error && <p style={{ color: '#8C3C2A', fontSize: '0.85rem' }} role="alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="submit" className="bb-cta-sm" disabled={isPending || noTags}>
          <Save size={14} aria-hidden="true" />
          {isPending ? 'Saving...' : 'Save changes'}
        </button>
        <button
          type="button"
          className="bb-btn-secondary"
          onClick={() => router.push(basePath)}
          disabled={isPending}
        >
          Cancel
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="bb-cta-sm bb-cta-sm-destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete
        </button>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Delete this harvest?"
        body="This permanently removes the harvest entry. If a tag was consumed by this harvest only, it'll be marked active again. If the same tag is shared by another harvest, it stays tagged out."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        isPending={isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </form>
  )
}
