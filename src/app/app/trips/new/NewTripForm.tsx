'use client'

import { useState, useTransition } from 'react'
import { MapPin, FileText, Target } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { METHOD_OPTIONS } from '@/lib/methods'
import { createTripAction } from '../actions'
import HuntersMultiSelect, { type HunterOption } from '../_components/HuntersMultiSelect'
import DateTimeField from '../../_components/DateTimeField'

// v26.4: structured-section layout. Form now renders its own .bb-tile
// wrappers (one per section: Basics / Dates / Location / Hunt details /
// Hunters / Notes) so the parent page no longer wraps in a single tile.
// Mobile overflow is fixed by .bb-form-grid-2 (min-width:0 on grid + cells)
// instead of raw Tailwind grid which leaves cells at min-width:auto.
export default function NewTripForm({ hunters }: { hunters: HunterOption[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // v26.3: keep a local copy so the inline-invite path can append entries
  // without a full server round-trip. The canonical list refreshes when the
  // page revalidates after submit.
  const [hunterList, setHunterList] = useState<HunterOption[]>(hunters)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    selected.forEach((id) => {
      // pending: ids are placeholders for newly invited hunters whose canonical
      // profile.id we don't have yet. Skip them on submit.
      if (!id.startsWith('pending:')) fd.append('hunter_ids', id)
    })
    startTransition(async () => {
      try {
        await createTripAction(fd)
      } catch (err) {
        const e = err as Error & { digest?: string }
        if (e.digest?.startsWith('NEXT_REDIRECT')) throw err
        setError(e.message ?? 'Could not create trip.')
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
                placeholder="Spring black bear · Reyes party"
                className="bb-input bb-input-iconed"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
            <span className="bb-form-label">Activity</span>
            <div className="bb-segmented" role="radiogroup" aria-label="Activity">
              <label>
                <input type="radio" name="kind" value="hunting" defaultChecked />
                Hunting
              </label>
              <label>
                <input type="radio" name="kind" value="fishing" />
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
              <DateTimeField name="starts_at" required ariaLabel="Start date and time" />
            </div>
            <div className="bb-form-row">
              <span className="bb-form-label">End <span style={{ opacity: 0.6 }}>(optional)</span></span>
              <DateTimeField name="ends_at" ariaLabel="End date and time" />
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
                <span className="bb-field-icon"><MapPin size={18} aria-hidden="true" /></span>
                <input
                  id="city"
                  name="city"
                  type="text"
                  placeholder="Mendocino"
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="state">State</label>
              <select
                id="state"
                name="state"
                required
                defaultValue=""
                className="bb-input"
              >
                <option value="" disabled>Select a state</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="zone">Zone <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <input
                id="zone"
                name="zone"
                type="text"
                placeholder="D6, Zone B-2, etc."
                className="bb-input"
                autoComplete="off"
              />
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="county">County <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <input
                id="county"
                name="county"
                type="text"
                placeholder="Mendocino County"
                className="bb-input"
                autoComplete="off"
              />
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
                <span className="bb-field-icon"><Target size={18} aria-hidden="true" /></span>
                <input
                  id="species_targeted"
                  name="species_targeted"
                  type="text"
                  placeholder="Black bear, wild pig"
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="method">Method <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <select id="method" name="method" defaultValue="" className="bb-input">
                <option value="">Select method</option>
                {METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* HUNTERS */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Hunters</h2>
          <div className="bb-form-row">
            <span className="bb-form-label">Add hunters to this trip</span>
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
              className="bb-input"
              placeholder="Meet at the cabin trailhead 0530. Cold + clear forecast. Bring a layer."
              aria-label="Notes (optional)"
            />
          </div>
        </div>
      </section>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={pending} className="bb-cta">
          {pending ? 'Creating trip...' : 'Create trip'}
        </button>
      </div>
    </form>
  )
}
