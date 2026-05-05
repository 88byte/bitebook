'use client'

import { useState, useTransition } from 'react'
import { FileText, Building, Map, Mountain, TreeDeciduous, Crosshair, Users, Paperclip } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { methodsForKind } from '@/lib/methods'
import { createTripAction } from '../actions'
import { createTripFromTemplateAction } from '../../_lib/trip-template-actions'
import HuntersMultiSelect, { type HunterOption } from '../_components/HuntersMultiSelect'
import DateTimeField from '../../_components/DateTimeField'
import SpeciesField from '../../_components/SpeciesField'
import type { AttachableDoc } from '../../_lib/trip-doc-queries'

type SpeciesOption = { name: string; kind: 'hunting' | 'fishing' }

const DOC_KIND_LABEL: Record<string, string> = {
  waiver: 'Waiver',
  resource: 'Resource',
  other: 'Doc',
}

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
  attachableDocs = [],
}: {
  hunters: HunterOption[]
  initial?: NewTripInitial | null
  templateId?: string | null
  // v27.1.3.0.2: full species pool from the species table for the
  // Hunt details Species picker. Same source as wallet/harvest forms.
  speciesOptions: SpeciesOption[]
  // v27.6.2.1: docs the guide can pre-attach at create time. Populated
  // from fetchAttachableDocsForGuide — owned + Bite Book templates,
  // archived + log-kind already filtered out.
  attachableDocs?: AttachableDoc[]
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
  // v27.6.2.1: pre-creation docs picker state. doc_ids are submitted
  // alongside hunter_ids; createTripAction attaches each post-insert.
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())

  function toggleDoc(id: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    selected.forEach((id) => {
      // pending: ids are placeholders for newly invited hunters whose canonical
      // profile.id we don't have yet. Skip them on submit.
      if (!id.startsWith('pending:')) fd.append('hunter_ids', id)
    })
    selectedDocs.forEach((id) => fd.append('doc_ids', id))
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
    <form id="new-trip-form" onSubmit={onSubmit} className="bb-trip-detail-grid">
      {/* v27.1.4: hidden template_id is only present when the form is in
          template-clone mode. createTripFromTemplateAction reads it from
          the FormData. */}
      {templateId && <input type="hidden" name="template_id" value={templateId} />}

      {/* v27.6.2.1 — full 2-col layout matching /app/trips/[id]:
          LEFT: editor sections (Trip overview / Location / Hunt details / Notes).
          LEFT BOTTOM: pre-creation docs picker.
          RIGHT (spans both rows): hunters multi-select panel.
          Mobile collapses to single column via bb-trip-detail-grid CSS. */}
      <div className="bb-trip-detail-grid-editor flex flex-col gap-4">

      {/* TRIP OVERVIEW — v27.6.2: matches /app/trips/[id]
          TripDetailEditor's layout. Activity (compact segmented) at
          the top, Trip name, then Start/End dates 2-col. Replaces
          the prior split Basics + Dates sections so Create-trip
          reads as a stripped-down trip detail.
          v27.6.2 (resume) — heading row gets a "New" pill on the
          right to mirror trip-detail's StatusPill placement. */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <h2 className="bb-form-section-head" style={{ margin: 0 }}>Trip overview</h2>
            <span className="bb-pill bb-pill-planned">New</span>
          </div>

          <div className="bb-form-row" style={{ marginTop: '0.6rem' }}>
            <span className="bb-form-label">Activity</span>
            <div
              className="bb-segmented bb-segmented-compact"
              role="radiogroup"
              aria-label="Activity"
            >
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

          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
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

          <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
            <div className="bb-form-row" style={{ marginBottom: 0 }}>
              <span className="bb-form-label">Start date</span>
              <DateTimeField name="starts_at" required ariaLabel="Start date and time" />
            </div>
            <div className="bb-form-row" style={{ marginBottom: 0 }}>
              <span className="bb-form-label">End date <span style={{ opacity: 0.6 }}>(optional)</span></span>
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

      {/* v27.3.3.1: bottom Create trip button removed — the top
          Create trip CTA in the page header (form='new-trip-form'
          attribute) is the single submit. Pending state on the top
          button covers the in-flight UX. */}
      {pending && (
        <p className="bb-form-help" role="status" style={{ marginTop: '0.25rem' }}>
          Creating trip…
        </p>
      )}

      </div>{/* /editor */}

      {/* DOCS — left-bottom column on desktop (matches /app/trips/[id]
          .bb-trip-detail-grid-docs slot which holds TripDocsCard). On
          mobile this stacks under the editor. v27.6.2.1 — pre-creation
          docs are queued in form state via doc_ids and attached server-
          side after the trip is inserted. */}
      <div className="bb-trip-detail-grid-docs">
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">
              <Paperclip size={14} aria-hidden="true" style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
              Docs
            </h2>
            {attachableDocs.length === 0 ? (
              <p className="bb-form-help">
                No attachable docs yet. Add waivers + resources from the Documents library so you can attach them to trips here.
              </p>
            ) : (
              <>
                <p className="bb-form-help" style={{ marginBottom: '0.5rem' }}>
                  Attach waivers + resources for hunters to see on this trip. You can also add more after the trip is created.
                </p>
                <div role="list" className="flex flex-col gap-2">
                  {attachableDocs.map((d) => {
                    const checked = selectedDocs.has(d.id)
                    return (
                      <label
                        key={d.id}
                        role="listitem"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          padding: '0.55rem 0.7rem',
                          border: `1px solid ${checked ? 'var(--color-copper)' : 'var(--color-card-divider)'}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: checked ? 'rgba(176, 108, 60, 0.06)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDoc(d.id)}
                          aria-label={`Attach ${d.label}`}
                          style={{ width: 16, height: 16 }}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 600, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.label}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-ink-soft)', marginTop: 1 }}>
                            {DOC_KIND_LABEL[d.kind] ?? d.kind}
                            {d.is_template ? ' · Bite Book template' : ''}
                            {d.state ? ` · ${d.state}` : ''}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </div>{/* /docs */}

      {/* HUNTERS — right column, spans both rows on desktop (matches
          /app/trips/[id] .bb-trip-detail-grid-hunters slot which holds
          HuntersOnTripPanel). Pre-creation: HuntersMultiSelect picks
          existing hunters AND/OR invites new ones; on submit those
          hunter_ids are attached to the new trip. */}
      <div className="bb-trip-detail-grid-hunters">
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">
              <Users size={14} aria-hidden="true" style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
              Hunters
            </h2>
            <p className="bb-form-help" style={{ marginBottom: '0.5rem' }}>
              Add hunters now or after the trip is created. Pick from your roster or invite by email.
            </p>
            <HuntersMultiSelect
              hunters={hunterList}
              selected={selected}
              onToggle={toggleHunter}
              onAddHunter={addHunter}
            />
          </div>
        </section>
      </div>{/* /hunters */}
    </form>
  )
}
