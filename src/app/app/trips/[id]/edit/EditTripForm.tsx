'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Building, Map, Mountain, TreeDeciduous, PawPrint, Crosshair } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { METHOD_OPTIONS } from '@/lib/methods'
import { updateTripAction } from '../actions'
import HuntersMultiSelect, { type HunterOption } from '../../_components/HuntersMultiSelect'
import DateTimeField from '../../../_components/DateTimeField'

type EditTripFormProps = {
  tripId: string
  initial: {
    title: string
    kind: 'hunting' | 'fishing'
    starts_at: string
    ends_at: string | null
    city: string | null
    state: string
    zone: string | null
    county: string | null
    species_targeted: string | null
    method: string | null
    notes: string | null
  }
  candidates: HunterOption[]
  initialSelectedIds: string[]
}

// Convert an ISO timestamp to the local-time string `<input type="datetime-local">`
// expects: yyyy-MM-ddTHH:mm. We render in the browser's locale so the displayed
// time matches what the guide saved.
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// v26.4: structured-section layout matching NewTripForm. Each section
// renders its own .bb-tile wrapper. The mobile overflow that broke v26.3
// edit-trip is fixed by .bb-form-grid-2 (min-width:0 on grid + cells).
export default function EditTripForm({
  tripId,
  initial,
  candidates,
  initialSelectedIds,
}: EditTripFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [hunterList, setHunterList] = useState<HunterOption[]>(candidates)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds))

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('trip_id', tripId)
    selected.forEach((id) => {
      if (!id.startsWith('pending:')) fd.append('hunter_ids', id)
    })
    startTransition(async () => {
      try {
        await updateTripAction(fd)
      } catch (err) {
        const e = err as Error & { digest?: string }
        if (e.digest?.startsWith('NEXT_REDIRECT')) throw err
        setError(e.message ?? 'Could not update trip.')
      }
    })
  }

  function toggleHunter(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addHunter(h: HunterOption, autoSelect: boolean) {
    setHunterList((prev) => (prev.find((x) => x.id === h.id) ? prev : [h, ...prev]))
    if (autoSelect) {
      setSelected((prev) => new Set(prev).add(h.id))
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* BASICS */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Basics</h2>
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="title">Trip name</label>
            <label className="bb-field">
              <span className="bb-field-icon"><FileText size={18} aria-hidden="true" /></span>
              <input
                id="title"
                name="title"
                type="text"
                required
                defaultValue={initial.title}
                className="bb-input bb-input-iconed"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
            <span className="bb-form-label">Activity</span>
            <div className="bb-segmented" role="radiogroup" aria-label="Activity">
              <label>
                <input
                  type="radio"
                  name="kind"
                  value="hunting"
                  defaultChecked={initial.kind === 'hunting'}
                />
                Hunting
              </label>
              <label>
                <input
                  type="radio"
                  name="kind"
                  value="fishing"
                  defaultChecked={initial.kind === 'fishing'}
                />
                Fishing
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* DATES */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Dates</h2>
          <div className="bb-form-grid-2">
            <div className="bb-form-row">
              <span className="bb-form-label">Start</span>
              <DateTimeField
                name="starts_at"
                defaultValue={toLocalInput(initial.starts_at)}
                required
                ariaLabel="Start date and time"
              />
            </div>
            <div className="bb-form-row">
              <span className="bb-form-label">End <span style={{ opacity: 0.6 }}>(optional)</span></span>
              <DateTimeField
                name="ends_at"
                defaultValue={toLocalInput(initial.ends_at)}
                ariaLabel="End date and time"
              />
            </div>
          </div>
        </div>
      </section>

      {/* LOCATION */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Location</h2>
          <div className="bb-form-grid-2">
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="city">City <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <label className="bb-field">
                <span className="bb-field-icon"><Building size={18} aria-hidden="true" /></span>
                <input
                  id="city"
                  name="city"
                  type="text"
                  defaultValue={initial.city ?? ''}
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="state">State</label>
              <label className="bb-field">
                <span className="bb-field-icon"><Map size={18} aria-hidden="true" /></span>
                <select
                  id="state"
                  name="state"
                  required
                  defaultValue={initial.state || ''}
                  className="bb-input bb-input-iconed"
                >
                  <option value="" disabled>Select a state</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="zone">Zone <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <label className="bb-field">
                <span className="bb-field-icon"><Mountain size={18} aria-hidden="true" /></span>
                <input
                  id="zone"
                  name="zone"
                  type="text"
                  defaultValue={initial.zone ?? ''}
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="county">County <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <label className="bb-field">
                <span className="bb-field-icon"><TreeDeciduous size={18} aria-hidden="true" /></span>
                <input
                  id="county"
                  name="county"
                  type="text"
                  defaultValue={initial.county ?? ''}
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                />
              </label>
              <p className="bb-form-help">Required for some state logs.</p>
            </div>
          </div>
        </div>
      </section>

      {/* HUNT DETAILS */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Hunt details</h2>
          <div className="bb-form-grid-2">
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="species_targeted">Species targeted <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <label className="bb-field">
                <span className="bb-field-icon"><PawPrint size={18} aria-hidden="true" /></span>
                <input
                  id="species_targeted"
                  name="species_targeted"
                  type="text"
                  defaultValue={initial.species_targeted ?? ''}
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="method">Method <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <label className="bb-field">
                <span className="bb-field-icon"><Crosshair size={18} aria-hidden="true" /></span>
                <select
                  id="method"
                  name="method"
                  defaultValue={initial.method ?? ''}
                  className="bb-input bb-input-iconed"
                >
                  <option value="">Select method</option>
                  {METHOD_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* HUNTERS */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Hunters</h2>
          <div className="bb-form-row">
            <span className="bb-form-label">Hunters on this trip</span>
            <HuntersMultiSelect
              hunters={hunterList}
              selected={selected}
              onToggle={toggleHunter}
              onAddHunter={addHunter}
            />
          </div>
        </div>
      </section>

      {/* NOTES */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Notes</h2>
          <div className="bb-form-row">
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={initial.notes ?? ''}
              placeholder="Trip notes, observations, conditions…"
              aria-label="Notes (optional)"
              className="bb-input"
            />
          </div>
        </div>
      </section>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={pending} className="bb-cta">
          {pending ? 'Saving...' : 'Save changes'}
        </button>
        <button
          type="button"
          className="bb-btn-secondary"
          onClick={() => router.push(`/app/trips/${tripId}`)}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
