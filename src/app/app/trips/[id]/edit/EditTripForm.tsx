'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building,
  ChevronDown,
  ChevronRight,
  Crosshair,
  FileText,
  Map as MapIcon,
  MapPin,
  Mountain,
  PawPrint,
  StickyNote,
  TreeDeciduous,
  Users,
} from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { methodsForKind } from '@/lib/methods'
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

// v27.1.1.0.3e.5: Trip-detail edit redesigned to a collapsed-row pattern
// matching Flavio's mockup. The Trip Overview card stays expanded — name,
// activity, dates are the high-frequency edits. Location, Hunt details,
// Hunters, and Notes each render as a single summary row (icon · eyebrow ·
// summary line · Edit/Manage/Add link). Tapping the action expands that
// row inline to show the full edit form for that section. Tapping again
// (Done) collapses back to the summary.
//
// Form submit + server action contract are unchanged — every input still
// lives inside the same <form>, just visibility-toggled. updateTripAction
// reads the same FormData regardless of which sections were expanded
// when Save was tapped.

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type SectionKey = 'location' | 'hunt' | 'hunters' | 'notes'

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
  const [kind, setKind] = useState<'hunting' | 'fishing'>(initial.kind)

  // Live mirror of the field values so the collapsed summaries reflect
  // edits made inside the expanded sections without needing the user to
  // collapse the row first.
  const [city, setCity] = useState(initial.city ?? '')
  const [state, setState] = useState(initial.state ?? '')
  const [zone, setZone] = useState(initial.zone ?? '')
  const [county, setCounty] = useState(initial.county ?? '')
  const [speciesTargeted, setSpeciesTargeted] = useState(initial.species_targeted ?? '')
  const [method, setMethod] = useState(initial.method ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')

  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set())
  function toggleSection(key: SectionKey) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const locationSummary = useMemo(() => {
    const cs = [city, state].filter(Boolean).join(', ')
    const parts = [cs, zone ? `Zone ${zone}` : '', county ? `${county} County` : ''].filter(Boolean)
    return parts.join(' · ') || 'Not set'
  }, [city, state, zone, county])

  const huntSummary = useMemo(() => {
    const parts = [speciesTargeted, method].filter(Boolean)
    return parts.join(' · ') || 'Not set'
  }, [speciesTargeted, method])

  const huntersSummary = useMemo(() => {
    const realIds = Array.from(selected).filter((id) => !id.startsWith('pending:'))
    if (realIds.length === 0) return 'No hunters selected'
    const names = realIds
      .slice(0, 2)
      .map((id) => hunterList.find((h) => h.id === id)?.display_name ?? 'Unknown')
    const extra = realIds.length - names.length
    const joined = names.join(', ')
    return `${realIds.length} selected · ${joined}${extra > 0 ? ` +${extra}` : ''}`
  }, [selected, hunterList])

  const notesSummary = notes.trim() ? 'Notes added' : 'No notes added'

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
      {/* TRIP OVERVIEW (always expanded) */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Trip overview</h2>

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

          <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
            <div className="bb-form-row">
              <span className="bb-form-label">Start date</span>
              <DateTimeField
                name="starts_at"
                defaultValue={toLocalInput(initial.starts_at)}
                required
                ariaLabel="Start date and time"
              />
            </div>
            <div className="bb-form-row">
              <span className="bb-form-label">End date <span style={{ opacity: 0.6 }}>(optional)</span></span>
              <DateTimeField
                name="ends_at"
                defaultValue={toLocalInput(initial.ends_at)}
                ariaLabel="End date and time"
              />
            </div>
          </div>
        </div>
      </section>

      {/* LOCATION (collapsed → expand inline) */}
      <CollapsedSection
        icon={<MapPin size={18} aria-hidden="true" />}
        eyebrow="Location"
        summary={locationSummary}
        actionLabel={expanded.has('location') ? 'Done' : 'Edit'}
        expanded={expanded.has('location')}
        onToggle={() => toggleSection('location')}
      >
        <div className="bb-form-grid-2">
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="city">City <span style={{ opacity: 0.6 }}>(optional)</span></label>
            <label className="bb-field">
              <span className="bb-field-icon"><Building size={18} aria-hidden="true" /></span>
              <input
                id="city"
                name="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="bb-input bb-input-iconed"
                autoComplete="off"
              />
            </label>
          </div>
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="state">State</label>
            <label className="bb-field">
              <span className="bb-field-icon"><MapIcon size={18} aria-hidden="true" /></span>
              <select
                id="state"
                name="state"
                required
                value={state}
                onChange={(e) => setState(e.target.value)}
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
                value={zone}
                onChange={(e) => setZone(e.target.value)}
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
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                className="bb-input bb-input-iconed"
                autoComplete="off"
              />
            </label>
            <p className="bb-form-help">Required for some state logs.</p>
          </div>
        </div>
      </CollapsedSection>

      {/* HUNT DETAILS (collapsed → expand inline) */}
      <CollapsedSection
        icon={<Crosshair size={18} aria-hidden="true" />}
        eyebrow="Hunt details"
        summary={huntSummary}
        actionLabel={expanded.has('hunt') ? 'Done' : 'Edit'}
        expanded={expanded.has('hunt')}
        onToggle={() => toggleSection('hunt')}
      >
        <div className="bb-form-grid-2">
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="species_targeted">Species targeted <span style={{ opacity: 0.6 }}>(optional)</span></label>
            <label className="bb-field">
              <span className="bb-field-icon"><PawPrint size={18} aria-hidden="true" /></span>
              <input
                id="species_targeted"
                name="species_targeted"
                type="text"
                value={speciesTargeted}
                onChange={(e) => setSpeciesTargeted(e.target.value)}
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
                value={method}
                onChange={(e) => setMethod(e.target.value)}
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
      </CollapsedSection>

      {/* HUNTERS (collapsed → expand inline) */}
      <CollapsedSection
        icon={<Users size={18} aria-hidden="true" />}
        eyebrow="Hunters"
        summary={huntersSummary}
        actionLabel={expanded.has('hunters') ? 'Done' : 'Manage'}
        expanded={expanded.has('hunters')}
        onToggle={() => toggleSection('hunters')}
      >
        <div className="bb-form-row">
          <span className="bb-form-label">Hunters on this trip</span>
          <HuntersMultiSelect
            hunters={hunterList}
            selected={selected}
            onToggle={toggleHunter}
            onAddHunter={addHunter}
          />
        </div>
      </CollapsedSection>

      {/* NOTES (collapsed → expand inline) */}
      <CollapsedSection
        icon={<StickyNote size={18} aria-hidden="true" />}
        eyebrow="Notes"
        summary={notesSummary}
        actionLabel={expanded.has('notes') ? 'Done' : notes.trim() ? 'Edit' : 'Add'}
        expanded={expanded.has('notes')}
        onToggle={() => toggleSection('notes')}
      >
        <div className="bb-form-row">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Trip notes, observations, conditions…"
            aria-label="Notes (optional)"
            className="bb-input"
          />
        </div>
      </CollapsedSection>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      {/* Bottom action bar — Cancel + Save changes. Save copper-primary,
          Cancel quiet secondary, full mobile width. */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className="bb-btn-secondary"
          onClick={() => router.push(`/app/trips/${tripId}`)}
          disabled={pending}
        >
          Cancel
        </button>
        <button type="submit" disabled={pending} className="bb-cta">
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

// ── CollapsedSection ────────────────────────────────────────────────────
//
// Reusable summary-row card. At rest renders a single horizontal flex
// row: icon · eyebrow + summary stack · Edit/Manage/Add action link.
// When expanded, the children render below the divider line.
//
// The action button is a plain <button type="button"> so submit-on-enter
// inside any nested input doesn't accidentally trigger it. The whole
// row is also clickable for a bigger tap target.

function CollapsedSection({
  icon,
  eyebrow,
  summary,
  actionLabel,
  expanded,
  onToggle,
  children,
}: {
  icon: React.ReactNode
  eyebrow: string
  summary: string
  actionLabel: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="bb-tile bb-form-section">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="bb-tile-body"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          width: '100%',
          padding: '0.85rem 1rem',
          background: 'transparent',
          border: 0,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            background: 'var(--color-paper-tint)',
            color: 'var(--color-ink-soft)',
          }}
        >
          {icon}
        </span>
        <span style={{ flex: '1 1 0', minWidth: 0, display: 'block' }}>
          <span
            className="bb-form-section-head"
            style={{
              display: 'block',
              margin: 0,
              fontSize: '0.7rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: '0.9rem',
              color: 'var(--color-ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '0.15rem',
            }}
          >
            {summary}
          </span>
        </span>
        <span
          className="bb-text-action bb-text-action-copper"
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          {actionLabel}
          {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            padding: '0 1rem 1rem 1rem',
            borderTop: '1px solid var(--color-ink-tint)',
          }}
        >
          <div style={{ marginTop: '0.85rem' }}>{children}</div>
        </div>
      )}
    </section>
  )
}
