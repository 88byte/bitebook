'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building,
  Calendar,
  CheckCircle2,
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
import { updateTripAction } from './actions'
import HuntersMultiSelect, { type HunterOption } from '../_components/HuntersMultiSelect'
import DateTimeField from '../../_components/DateTimeField'
import SpeciesField from '../../_components/SpeciesField'

type SpeciesOption = { name: string; kind: 'hunting' | 'fishing' }

// v27.1.1.0.3e.6 — inline editor for /app/trips/[id]. Replaces the
// separate /edit page. Trip Overview card stays expanded with auto-save
// on blur (matches harvest-log autosave). Location, Hunt Details, Hunters,
// Notes are collapsed summary rows that expand inline on Edit / Manage /
// Add. Save still routes through updateTripAction (now returns a result
// instead of redirecting). Hunter side renders a separate read-only view
// — this component is the guide-side editor only.

type Initial = {
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

type SectionKey = 'location' | 'hunt' | 'hunters' | 'notes'

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function StatusPill({ status }: { status: SaveStatus }) {
  if (status.kind === 'idle') return null
  if (status.kind === 'saving') {
    return <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-soft)' }}>Saving…</span>
  }
  if (status.kind === 'saved') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.78rem',
          color: 'var(--color-copper)',
        }}
      >
        <CheckCircle2 size={11} aria-hidden="true" />
        Saved
      </span>
    )
  }
  return (
    <span style={{ fontSize: '0.78rem', color: '#8C3C2A' }} role="alert">
      {status.message}
    </span>
  )
}

export default function TripDetailEditor({
  tripId,
  initial,
  candidates,
  initialSelectedIds,
  speciesOptions,
}: {
  tripId: string
  initial: Initial
  candidates: HunterOption[]
  initialSelectedIds: string[]
  // v27.1.3.0.2: full species pool from the species table (40 hunting +
  // 41 fishing). SpeciesField filters to the trip's current activity.
  speciesOptions: SpeciesOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })

  // Editable state
  const [title, setTitle] = useState(initial.title)
  const [kind, setKind] = useState<'hunting' | 'fishing'>(initial.kind)
  const [startsAt, setStartsAt] = useState<string>(toLocalInput(initial.starts_at))
  const [endsAt, setEndsAt] = useState<string>(toLocalInput(initial.ends_at))
  const [city, setCity] = useState(initial.city ?? '')
  const [state, setState] = useState(initial.state ?? '')
  const [zone, setZone] = useState(initial.zone ?? '')
  const [county, setCounty] = useState(initial.county ?? '')
  const [speciesTargeted, setSpeciesTargeted] = useState(initial.species_targeted ?? '')
  const [method, setMethod] = useState(initial.method ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [hunterList, setHunterList] = useState<HunterOption[]>(candidates)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds))

  // v27.1.1.0.3e.7: mirror every editable field into a single ref so the
  // autoSave function always reads CURRENT values regardless of when it
  // was scheduled. The previous implementation captured state at render
  // time and the section "Save" buttons fired the stale closure — which
  // was why edits inside Location / Hunt details / Hunters / Notes
  // appeared to save in the UI but never reached the server.
  const fieldsRef = useRef({
    title,
    kind,
    startsAt,
    endsAt,
    city,
    state,
    zone,
    county,
    speciesTargeted,
    method,
    notes,
    selected,
  })
  fieldsRef.current = {
    title,
    kind,
    startsAt,
    endsAt,
    city,
    state,
    zone,
    county,
    speciesTargeted,
    method,
    notes,
    selected,
  }

  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set())
  function toggleSection(key: SectionKey) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // v27.1.1.0.3e.7: collapsing a section now ALWAYS fires an explicit
  // autoSave. The prior implementation only re-collapsed local UI state
  // and relied on per-input onBlur — which was unreliable because (a)
  // the Save button click could happen before some browsers fired blur
  // and (b) the ref pattern wasn't in place so even when blur did fire,
  // the autoSave closure read pre-render state. Now: tap Save on any
  // section → explicit save with the right syncParticipants flag → page
  // refresh → DB row reflects the edit.
  function handleSectionToggle(key: SectionKey) {
    const wasOpen = expanded.has(key)
    toggleSection(key)
    if (wasOpen) {
      // Hunters needs the participant diff; everything else is scalar-only.
      autoSave({ syncParticipants: key === 'hunters' })
    }
  }

  // Auto-save fader: clear Saved pill after 2s.
  useEffect(() => {
    if (status.kind !== 'saved') return
    const t = setTimeout(() => setStatus({ kind: 'idle' }), 2000)
    return () => clearTimeout(t)
  }, [status])

  // Build a fresh FormData from CURRENT state (via fieldsRef so we never
  // close over stale values). The action validates a few required fields
  // (title / state / startsAt / kind) — if any are blank we skip the call
  // so the user isn't bothered with a save error mid-typing.
  function buildFormData(opts: { syncParticipants?: boolean }): FormData | null {
    const f = fieldsRef.current
    if (!f.title.trim() || !f.startsAt || !f.state) return null
    const fd = new FormData()
    fd.set('trip_id', tripId)
    fd.set('title', f.title.trim())
    fd.set('kind', f.kind)
    fd.set('starts_at', f.startsAt)
    if (f.endsAt) fd.set('ends_at', f.endsAt)
    fd.set('city', f.city)
    fd.set('state', f.state)
    fd.set('zone', f.zone)
    fd.set('county', f.county)
    fd.set('species_targeted', f.speciesTargeted)
    fd.set('method', f.method)
    fd.set('notes', f.notes)
    if (opts.syncParticipants) {
      f.selected.forEach((id) => {
        if (!id.startsWith('pending:')) fd.append('hunter_ids', id)
      })
    } else {
      fd.set('sync_participants', '0')
    }
    return fd
  }

  function autoSave(opts: { syncParticipants?: boolean } = {}) {
    const fd = buildFormData({ syncParticipants: opts.syncParticipants ?? false })
    if (!fd) return
    setStatus({ kind: 'saving' })
    startTransition(async () => {
      const res = await updateTripAction(fd)
      if ('error' in res) {
        setStatus({ kind: 'error', message: res.error })
        return
      }
      setStatus({ kind: 'saved', at: Date.now() })
      router.refresh()
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

  // Derived summaries for the collapsed cards.
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
    return `${realIds.length} selected · ${names.join(', ')}${extra > 0 ? ` +${extra}` : ''}`
  }, [selected, hunterList])

  const notesSummary = notes.trim() ? 'Notes added' : 'No notes added'

  return (
    <div className="bb-form-narrow flex flex-col gap-4">
      {/* TRIP OVERVIEW (always expanded, auto-save on blur) */}
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
            <StatusPill status={status} />
          </div>

          {/* v27.3.10.1 - Activity toggle moved ABOVE Trip name and
              switched to the compact segmented variant (inline-flex
              binary pill instead of two wide CTAs). The activity is
              the first decision the guide makes about a trip; the
              name flows from there. */}
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
                  onChange={() => {
                    setKind('hunting')
                    // Save activity changes immediately — radio has no blur.
                    setTimeout(() => autoSave(), 0)
                  }}
                />
                Hunting
              </label>
              <label>
                <input
                  type="radio"
                  name="kind"
                  value="fishing"
                  checked={kind === 'fishing'}
                  onChange={() => {
                    setKind('fishing')
                    setTimeout(() => autoSave(), 0)
                  }}
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
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => autoSave()}
                className="bb-input bb-input-iconed"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
            <div className="bb-form-row" style={{ marginBottom: 0 }}>
              <span className="bb-form-label">Start date</span>
              <DateTimeField
                name="starts_at"
                defaultValue={startsAt}
                required
                ariaLabel="Start date and time"
                onChange={(v) => {
                  setStartsAt(v)
                  setTimeout(() => autoSave(), 0)
                }}
              />
            </div>
            <div className="bb-form-row" style={{ marginBottom: 0 }}>
              <span className="bb-form-label">End date <span style={{ opacity: 0.6 }}>(optional)</span></span>
              <DateTimeField
                name="ends_at"
                defaultValue={endsAt}
                ariaLabel="End date and time"
                onChange={(v) => {
                  setEndsAt(v)
                  setTimeout(() => autoSave(), 0)
                }}
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
        actionLabel={expanded.has('location') ? 'Save' : 'Edit'}
        expanded={expanded.has('location')}
        onToggle={() => handleSectionToggle('location')}
      >
        <div className="bb-form-grid-2">
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="city">City <span style={{ opacity: 0.6 }}>(optional)</span></label>
            <label className="bb-field">
              <span className="bb-field-icon"><Building size={18} aria-hidden="true" /></span>
              <input
                id="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onBlur={() => autoSave()}
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
                required
                value={state}
                onChange={(e) => {
                  setState(e.target.value)
                  setTimeout(() => autoSave(), 0)
                }}
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
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                onBlur={() => autoSave()}
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
                type="text"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                onBlur={() => autoSave()}
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
        actionLabel={expanded.has('hunt') ? 'Save' : 'Edit'}
        expanded={expanded.has('hunt')}
        onToggle={() => handleSectionToggle('hunt')}
      >
        <div className="bb-form-grid-2">
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="species_targeted">Species targeted <span style={{ opacity: 0.6 }}>(optional)</span></label>
            {/* v27.1.3.0.2: replace plain text input with the shared
                SpeciesField — full hunting / fishing pool (40 / 41
                species), kind-filtered by the current trip activity.
                Picking from the dropdown auto-saves; switching to "Other"
                opens a free-text input that auto-saves on blur. */}
            <SpeciesField
              id="species_targeted"
              name="species_targeted"
              value={speciesTargeted}
              onChange={(next) => {
                setSpeciesTargeted(next)
                // Defer the save by a tick so React's state update flushes
                // into fieldsRef before buildFormData reads it.
                setTimeout(() => autoSave(), 0)
              }}
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
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value)
                  setTimeout(() => autoSave(), 0)
                }}
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

      {/* v27.3.8.1 item 1 — Hunters CollapsedSection removed. The
          new HuntersOnTripPanel above the editor owns the full
          flow (status pills + add/remove). The participant state +
          HuntersMultiSelect helpers in this component are unused
          for now; left in place because the autoSave plumbing
          still serializes them into FormData via syncParticipants
          (no-op at the action level when canonical participant
          sync runs through syncTripParticipantsAction). */}

      {/* NOTES (collapsed → expand inline) */}
      <CollapsedSection
        icon={<StickyNote size={18} aria-hidden="true" />}
        eyebrow="Notes"
        summary={notesSummary}
        actionLabel={expanded.has('notes') ? 'Save' : notes.trim() ? 'Edit' : 'Add'}
        expanded={expanded.has('notes')}
        onToggle={() => handleSectionToggle('notes')}
      >
        <div className="bb-form-row">
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => autoSave()}
            placeholder="Trip notes, observations, conditions…"
            aria-label="Notes (optional)"
            className="bb-input"
          />
        </div>
      </CollapsedSection>

      {pending && status.kind !== 'saving' && (
        <span className="sr-only" aria-live="polite">Saving…</span>
      )}
    </div>
  )
}

// Reusable summary-row card. Identical anatomy to the v3e.5 EditTripForm
// version — kept inline here so the editor is one self-contained file
// after the /edit route is folded in.
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
