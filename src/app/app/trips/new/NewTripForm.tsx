'use client'

import { useState, useTransition } from 'react'
import { FileText, Building, Map, Mountain, TreeDeciduous, PawPrint, Crosshair } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { methodsForKind } from '@/lib/methods'
import { createTripAction } from '../actions'
import { createTripFromTemplateAction } from '../../_lib/trip-template-actions'
import HuntersMultiSelect, { type HunterOption } from '../_components/HuntersMultiSelect'
import DateTimeField from '../../_components/DateTimeField'
import SpeciesField from '../../_components/SpeciesField'

type SpeciesOption = { name: string; kind: 'hunting' | 'fishing' }

// v27.1.4: optional initial values for the "Use template" flow. When the
// caller passes initial+templateId, the form pre-fills activity/location/
// hunt-detail fields and routes submit through createTripFromTemplateAction
// (which also auto-attaches the template's linked docs to the new trip).
// Without these props we fall back to the createTripAction happy path.
export type NewTripInitial = {
  kind: 'hunting' | 'fishing'
  city: string
  state: string
  zone: string
  county: string
  species_targeted: string
  method: string
}

// v26.4: structured-section layout. Form now renders its own .bb-tile
// wrappers (one per section: Basics / Dates / Location / Hunt details /
// Hunters / Notes) so the parent page no longer wraps in a single tile.
// Mobile overflow is fixed by .bb-form-grid-2 (min-width:0 on grid + cells)
// instead of raw Tailwind grid which leaves cells at min-width:auto.
export default function NewTripForm({
  hunters,
  initial = null,
  templateId = null,
  speciesOptions,
}: {
  hunters: HunterOption[]
  initial?: NewTripInitial | null
  templateId?: string | null
  // v27.1.3.0.2: full species pool from the species table for the
  // Hunt details Species picker. Same source as wallet/harvest forms.
  speciesOptions: SpeciesOption[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // v27.0b.4.3: track kind in state so the method dropdown filters by activity
  // without a full re-render. Switching to fishing reveals fishing methods.
  const [kind, setKind] = useState<'hunting' | 'fishing'>(initial?.kind ?? 'hunting')
  // v26.3: keep a local copy so the inline-invite path can append entries
  // without a full server round-trip. The canonical list refreshes when the
  // page revalidates after submit.
  const [hunterList, setHunterList] = useState<HunterOption[]>(hunters)
  // v27.1.3.0.2: controlled value for the SpeciesField so kind-toggle and
  // template pre-fill flow through cleanly.
  const [species, setSpecies] = useState<string>(initial?.species_targeted ?? '')

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
        // v27.1.4: when a templateId is present we route through
        // createTripFromTemplateAction so the template's linked docs
        // auto-attach. Otherwise it's the standard createTripAction
        // happy path. Both redirect on success.
        if (templateId) {
          await createTripFromTemplateAction(fd)
        } else {
          await createTripAction(fd)
        }
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
      {/* v27.1.4: hidden template_id is only present when the form is in
          template-clone mode. createTripFromTemplateAction reads it from
          the FormData. */}
      {templateId && <input type="hidden" name="template_id" value={templateId} />}

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
                <input
                  type="radio"
                  name="kind"
                  value="hunting"
                  checked={kind === 'hunting'}
                  onChange={() => setKind('hunting')}
                />
                Hunting
              </label>
              <label>
                <input
                  type="radio"
                  name="kind"
                  value="fishing"
                  checked={kind === 'fishing'}
                  onChange={() => setKind('fishing')}
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
                <span className="bb-field-icon"><Building size={18} aria-hidden="true" /></span>
                <input
                  id="city"
                  name="city"
                  type="text"
                  placeholder="Mendocino"
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                  defaultValue={initial?.city ?? ''}
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
                  defaultValue={initial?.state ?? ''}
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
                  placeholder="D6, Zone B-2, etc."
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                  defaultValue={initial?.zone ?? ''}
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
                  placeholder="Mendocino County"
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                  defaultValue={initial?.county ?? ''}
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
              {/* v27.1.3.0.2: SpeciesField — full pool, kind-filtered. */}
              <SpeciesField
                id="species_targeted"
                name="species_targeted"
                value={species}
                onChange={setSpecies}
                options={speciesOptions}
                kind={kind}
                placeholder="Pick a species"
              />
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="method">Method <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <label className="bb-field">
                <span className="bb-field-icon"><Crosshair size={18} aria-hidden="true" /></span>
                <select
                  id="method"
                  name="method"
                  defaultValue={initial?.method ?? ''}
                  className="bb-input bb-input-iconed"
                >
                  <option value="">Select method</option>
                  {methodsForKind(kind).map((m) => (
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
