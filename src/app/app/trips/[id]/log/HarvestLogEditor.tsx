'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Info,
  User,
} from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import {
  updateHarvestLogAction,
  updateHarvestLogEntryAction,
  addEntrySpeciesAction,
  createEntrySpeciesAction,
  updateEntrySpeciesAction,
  removeEntrySpeciesAction,
  deleteHarvestLogAndRedirectAction,
} from '../../../_lib/harvest-log-actions'
import {
  generateFilledHarvestLogPDFsAction,
  deleteTripGeneratedLogAction,
} from '../../../_lib/harvest-log-fill'
import type {
  HarvestLogWithEntries,
  HarvestLogEntryWithRelations,
  HarvestLogEntrySpeciesRow,
  MappedLogDoc,
  TripGeneratedLog,
} from '../../../_lib/harvest-log-queries'
import { Download, ExternalLink } from 'lucide-react'

// v27.1.1.0.3a   — accordion editor.
// v27.1.1.0.3a.1 — total_hours per-entry, Delete report.
// v27.1.1.0.3a.2 — date width cap, "Hunter info" section, phantom species
//                  row pre-filled from tag.
// v27.1.1.0.3a.3 — auto-save on blur for every input. Explicit Save buttons
//                  removed across the page (trip-level, per-entry, species
//                  rows). Each editable card gets a tiny status pill.
// v27.1.1.0.3e.4 — body layout rebuild against the mockup. Header band
//                  treatment dropped (eyebrow/title/back link stay on
//                  page.tsx). Reports row buttons restyled as square
//                  icon-tiles. Trip-level details split into a 2-col grid
//                  (date | purpose 3x2). Hunter rest-row reordered with
//                  avatar + counts sub-line + status moved to expanded
//                  body. Generate CTA full-width + warning tiles. Danger
//                  Zone CTA full-width destructive.

const PURPOSES: { value: string; label: string }[] = [
  { value: 'hunting', label: 'Hunting' },
  { value: 'big_game', label: 'Big game' },
  { value: 'fishing', label: 'Fishing' },
  { value: 'fly_fishing', label: 'Fly fishing' },
  { value: 'other', label: 'Other' },
]

// ── Status pill ─────────────────────────────────────────────────────────

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }

function StatusPill({ status }: { status: SaveStatus }) {
  if (status.kind === 'idle') return null
  if (status.kind === 'saving') {
    return (
      <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-soft)' }}>Saving…</span>
    )
  }
  if (status.kind === 'saved') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.8rem',
          color: 'var(--color-copper)',
        }}
      >
        <CheckCircle2 size={12} aria-hidden="true" />
        Saved
      </span>
    )
  }
  return (
    <span style={{ fontSize: '0.8rem', color: '#8C3C2A' }} role="alert">
      {status.message}
    </span>
  )
}

// Auto-clear "saved" status after 2s so the pill fades into idle.
function useFadingSavedStatus(): [SaveStatus, (s: SaveStatus) => void] {
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })
  useEffect(() => {
    if (status.kind !== 'saved') return
    const t = setTimeout(() => setStatus({ kind: 'idle' }), 2000)
    return () => clearTimeout(t)
  }, [status])
  return [status, setStatus]
}

// ── Top-level editor ────────────────────────────────────────────────────

export default function HarvestLogEditor({
  tripId,
  log,
  mappedDocs,
  tripState,
  guideId,
  generatedLogs,
}: {
  tripId: string
  log: HarvestLogWithEntries
  mappedDocs: MappedLogDoc[]
  tripState: string | null
  guideId: string
  generatedLogs: TripGeneratedLog[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [logDate, setLogDate] = useState<string>(log.log_date ?? '')
  const initialPurposes = useMemo(() => {
    const raw = log.trip_purpose
    if (Array.isArray(raw)) return new Set(raw.map((v) => String(v)))
    return new Set<string>()
  }, [log.trip_purpose])
  const [purposes, setPurposes] = useState<Set<string>>(initialPurposes)
  const [logStatus, setLogStatus] = useFadingSavedStatus()

  const [confirmDelete, setConfirmDelete] = useState<boolean>(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const slotByEntryId = useMemo(() => {
    const map = new Map<string, number>()
    let slot = 1
    for (const e of log.entries) {
      if (e.include_in_report) map.set(e.id, slot++)
    }
    return map
  }, [log.entries])

  function commitLogLevel(nextDate: string, nextPurposes: Set<string>) {
    setLogStatus({ kind: 'saving' })
    const fd = new FormData()
    fd.set('log_id', log.id)
    if (nextDate) fd.set('log_date', nextDate)
    for (const p of nextPurposes) fd.append('trip_purpose', p)
    startTransition(async () => {
      const res = await updateHarvestLogAction(fd)
      if ('error' in res) {
        setLogStatus({ kind: 'error', message: res.error })
        return
      }
      setLogStatus({ kind: 'saved', at: Date.now() })
      router.refresh()
    })
  }

  function togglePurpose(p: string) {
    const next = new Set(purposes)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    setPurposes(next)
    commitLogLevel(logDate, next)
  }

  function runDelete() {
    setDeleteError(null)
    startTransition(async () => {
      const res = await deleteHarvestLogAndRedirectAction(log.id)
      if (res && 'error' in res) {
        setDeleteError(res.error)
      }
    })
  }

  return (
    <>
      <div className="flex flex-col gap-4 mt-4">
        {/* v27.1.1.0.3e.3: top-of-page tile listing already-generated PDFs
            for this trip, with Open / Download / Delete per row. Empty
            state nudges the guide to fill out the log + tap Generate. */}
        <GeneratedReportsTile generatedLogs={generatedLogs} />

        {/* Trip-level fields — auto-save on blur (date) / change (purpose).
            v27.1.1.0.3e.4 layout: 2-col grid (date | purpose), purpose
            laid out as 3-col pill grid. Helper text moves to a card-level
            footer outside both columns. */}
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
              <h2 className="bb-form-section-head" style={{ margin: 0 }}>
                Trip-level details
              </h2>
              <StatusPill status={logStatus} />
            </div>

            <div className="bb-form-grid-2" style={{ marginTop: '0.6rem' }}>
              <div className="bb-form-row" style={{ marginBottom: 0 }}>
                <label className="bb-form-label" htmlFor="log_date">Hunt date</label>
                <input
                  id="log_date"
                  type="date"
                  className="bb-input"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  onBlur={() => commitLogLevel(logDate, purposes)}
                />
              </div>

              <div className="bb-form-row" style={{ marginBottom: 0 }}>
                <span className="bb-form-label" style={{ marginBottom: '0.4rem' }}>
                  Trip purpose
                </span>
                <div className="bb-purpose-grid">
                  {PURPOSES.map((p) => (
                    <label
                      key={p.value}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.3rem 0.6rem',
                        borderRadius: 999,
                        border: `1px solid ${
                          purposes.has(p.value) ? 'var(--color-copper)' : 'var(--color-ink-tint)'
                        }`,
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        color: purposes.has(p.value) ? 'var(--color-copper)' : 'var(--color-ink-soft)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={purposes.has(p.value)}
                        onChange={() => togglePurpose(p.value)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <p className="bb-form-help" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              Hours per hunter live on each hunter&rsquo;s entry below.
            </p>
          </div>
        </section>

        {/* Entries */}
        <section className="flex flex-col gap-3">
          {log.entries.length === 0 ? (
            <div className="bb-tile">
              <div className="bb-tile-body" style={{ padding: '1rem' }}>
                <p className="bb-form-help" style={{ margin: 0 }}>
                  No entries yet. Add hunters to this trip and re-open the report.
                </p>
              </div>
            </div>
          ) : (
            log.entries.map((e) => (
              <EntryAccordion
                key={e.id}
                entry={e}
                slot={slotByEntryId.get(e.id) ?? null}
              />
            ))
          )}
        </section>

        {/* v27.1.1.0.3b: Generate filled PDFs.
            v27.1.1.0.3e.2: state-aware filtering — picker auto-narrows to
            mapped docs whose state === trip.state, with a fallback warning
            when the trip's state has no matching log. */}
        <GeneratePdfsSection
          logId={log.id}
          mappedDocs={mappedDocs}
          tripState={tripState}
          guideId={guideId}
        />


        {/* Danger zone — delete + start over. v27.1.1.0.3e.4: full-width
            destructive CTA matches the mockup's red bar. */}
        <section className="bb-tile" style={{ borderColor: 'var(--color-ink-tint)' }}>
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Danger zone</h2>
            <p className="bb-form-help" style={{ marginTop: '-0.25rem' }}>
              Deletes this report and starts over. Tags consumed by entries get released.
            </p>
            <button
              type="button"
              className="bb-cta-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              style={{ marginTop: '0.5rem' }}
            >
              <Trash2 size={16} aria-hidden="true" />
              Delete report
            </button>
            {deleteError && (
              <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', marginTop: '0.4rem' }}>
                {deleteError}
              </p>
            )}
          </div>
        </section>

        <ConfirmModal
          open={confirmDelete}
          title="Delete this hunt report and start over?"
          body="The report and every hunter's entry will be removed. Any tags consumed by these entries will be released. This can't be undone."
          confirmLabel="Delete report"
          destructive
          typeToConfirm="DELETE"
          isPending={pending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            runDelete()
          }}
        />

        <input type="hidden" name="trip_id" value={tripId} />
      </div>
    </>
  )
}

// ── EntryAccordion ──────────────────────────────────────────────────────

function EntryAccordion({
  entry,
  slot,
}: {
  entry: HarvestLogEntryWithRelations
  slot: number | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState<boolean>(false)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useFadingSavedStatus()

  const [include, setInclude] = useState<boolean>(entry.include_in_report)
  const [totalHours, setTotalHours] = useState<string>(
    entry.total_hours !== null && entry.total_hours !== undefined ? String(entry.total_hours) : ''
  )
  const [notes, setNotes] = useState<string>(entry.notes ?? '')

  const headerName = useMemo(() => {
    const profileName = entry.hunter?.display_name?.trim()
    return profileName || entry.guest_name || 'Unknown hunter'
  }, [entry.hunter, entry.guest_name])

  const totalSpeciesQty = useMemo(
    () => entry.species_rows.reduce((acc, r) => acc + (r.qty_harvested || 0), 0),
    [entry.species_rows]
  )

  const showExcludeWarning = !include && totalSpeciesQty > 0

  // Capture-and-commit pattern: every editable surface routes through this.
  // Sends the FULL current entry state (so partial-field edits don't drop
  // sibling values from a prior in-flight save).
  function commitEntry(next: { include?: boolean; totalHours?: string; notes?: string }) {
    const nextInclude = next.include ?? include
    const nextHours = next.totalHours ?? totalHours
    const nextNotes = next.notes ?? notes

    setStatus({ kind: 'saving' })
    const fd = new FormData()
    fd.set('entry_id', entry.id)
    if (nextHours) fd.set('total_hours', nextHours)
    fd.set('notes', nextNotes)
    if (nextInclude) fd.set('include_in_report', 'on')

    startTransition(async () => {
      const res = await updateHarvestLogEntryAction(fd)
      if ('error' in res) {
        setStatus({ kind: 'error', message: res.error })
        return
      }
      setStatus({ kind: 'saved', at: Date.now() })
      router.refresh()
    })
  }

  function addSpecies() {
    setStatus({ kind: 'saving' })
    startTransition(async () => {
      const res = await addEntrySpeciesAction(entry.id)
      if ('error' in res) {
        setStatus({ kind: 'error', message: res.error })
        return
      }
      setStatus({ kind: 'saved', at: Date.now() })
      router.refresh()
    })
  }

  return (
    <div className="bb-tile" style={{ overflow: 'hidden' }}>
      {/* v27.1.1.0.3e.4 rest-row order: avatar / name+sub / HUNTER N pill /
          Include checkbox / chevron. StatusPill moves into the expanded
          body (was here at rest in the previous build). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Collapse entry' : 'Expand entry'}
        aria-expanded={open}
        className="bb-tile-body"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          width: '100%',
          background: 'transparent',
          border: 0,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span className="bb-avatar-sm" aria-hidden="true">
          <User size={14} />
        </span>

        <span style={{ flex: '1 1 0', minWidth: 0, display: 'block' }}>
          <span
            style={{
              display: 'block',
              fontWeight: 600,
              color: 'var(--color-ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.95rem',
            }}
          >
            {headerName}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: '0.78rem',
              color: 'var(--color-ink-soft)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.species_rows.length > 0
              ? `${entry.species_rows.length} species rows · ${totalSpeciesQty} total`
              : 'No harvest logged'}
          </span>
        </span>

        {slot !== null && (
          <span
            aria-label={`Slot ${slot}`}
            style={{
              flexShrink: 0,
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '0.2rem 0.5rem',
              borderRadius: 999,
              background: 'rgba(168, 92, 50, 0.12)',
              color: 'var(--color-copper)',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            HUNTER {slot}
          </span>
        )}

        {/* The include-toggle is rendered as a span+input combo so the
            outer button still acts as the expand affordance. We
            stopPropagation on the input to keep clicks from collapsing
            the row. */}
        <span
          onClick={(e) => e.stopPropagation()}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.78rem',
            color: 'var(--color-ink-soft)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={include}
            aria-label="Include this hunter in report"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              setInclude(e.target.checked)
              commitEntry({ include: e.target.checked })
            }}
          />
          Include
        </span>

        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: 'var(--color-ink-soft)',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: '0 1rem 1rem 1rem',
            borderTop: '1px solid var(--color-ink-tint)',
          }}
        >
          {/* StatusPill moved here from the rest-row so the at-rest header
              stays uncluttered. */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              minHeight: '1.2rem',
              marginTop: '0.5rem',
            }}
          >
            <StatusPill status={status} />
          </div>

          {showExcludeWarning && (
            <p
              role="alert"
              style={{
                margin: '0.6rem 0 0.4rem 0',
                display: 'inline-flex',
                alignItems: 'flex-start',
                gap: '0.35rem',
                color: '#8C3C2A',
                fontSize: '0.85rem',
              }}
            >
              <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              This hunter has a logged harvest — excluding them from the report may not satisfy
              state requirements.
            </p>
          )}

          <section className="bb-form-row" style={{ marginTop: '0.6rem' }}>
            <span className="bb-form-label">Hunter info</span>
            <div
              className="bb-tile"
              style={{ padding: '0.6rem 0.75rem', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}
            >
              <div>{headerName}</div>
              {entry.hunter_phone_snapshot && <div>Phone: {entry.hunter_phone_snapshot}</div>}
              {entry.hunter_address_snapshot && <AddressLine snapshot={entry.hunter_address_snapshot} />}
              {entry.license && (
                <div>
                  License: {entry.license.identifier}
                  {entry.license.state ? ` (${entry.license.state})` : ''}
                </div>
              )}
              {entry.tag && (
                <div>
                  Tag: {entry.tag.identifier}
                  {entry.tag.species ? ` · ${entry.tag.species}` : ''}
                  {entry.tag.zone ? ` · zone ${entry.tag.zone}` : ''}
                </div>
              )}
            </div>
          </section>

          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
            <label className="bb-form-label" htmlFor={`hours_${entry.id}`}>Total hours</label>
            <input
              id={`hours_${entry.id}`}
              type="number"
              step="0.25"
              min="0"
              className="bb-input"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
              onBlur={() => commitEntry({ totalHours })}
              placeholder="0.0"
              style={{ maxWidth: '12rem' }}
            />
          </div>

          <section style={{ marginTop: '0.75rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.4rem',
              }}
            >
              <span className="bb-form-label" style={{ marginBottom: 0 }}>Species</span>
              {entry.species_rows.length > 0 && (
                <button
                  type="button"
                  className="bb-text-action bb-text-action-copper"
                  onClick={addSpecies}
                  disabled={pending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Plus size={14} aria-hidden="true" />
                  Add species
                </button>
              )}
            </div>

            {entry.species_rows.length === 0 ? (
              entry.tag?.species ? (
                <>
                  <p className="bb-form-help" style={{ margin: '0 0 0.4rem 0' }}>
                    Fill in the details below. Add more species if more than one was harvested.
                  </p>
                  <PhantomSpeciesRow
                    entryId={entry.id}
                    tagSpecies={entry.tag.species}
                  />
                </>
              ) : (
                <p className="bb-form-help" style={{ margin: 0 }}>
                  Optional. Add a species if this hunter took game on the trip.
                </p>
              )
            ) : (
              <>
                <p className="bb-form-help" style={{ margin: '0 0 0.4rem 0' }}>
                  Fill in the details below. Add more species if more than one was harvested.
                </p>
                <div className="flex flex-col gap-2">
                  {entry.species_rows.map((s) => (
                    <SpeciesRow key={s.id} row={s} />
                  ))}
                </div>
              </>
            )}
          </section>

          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
            <label className="bb-form-label" htmlFor={`notes_${entry.id}`}>Notes</label>
            <textarea
              id={`notes_${entry.id}`}
              className="bb-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => commitEntry({ notes })}
              placeholder="Optional"
              maxLength={500}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── SpeciesRow (real, persisted) ────────────────────────────────────────

function SpeciesRow({ row }: { row: HarvestLogEntrySpeciesRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useFadingSavedStatus()
  const [species, setSpecies] = useState(row.species ?? '')
  const [qH, setQH] = useState(String(row.qty_harvested))
  const [qR, setQR] = useState(String(row.qty_released))

  // Latest-state ref so onBlur callbacks always send fresh values.
  const stateRef = useRef({ species, qH, qR })
  stateRef.current = { species, qH, qR }

  function commit() {
    const { species: sp, qH: h, qR: r } = stateRef.current
    setStatus({ kind: 'saving' })
    const fd = new FormData()
    fd.set('species_id', row.id)
    fd.set('species', sp)
    fd.set('qty_harvested', h || '0')
    fd.set('qty_released', r || '0')
    startTransition(async () => {
      const res = await updateEntrySpeciesAction(fd)
      if ('error' in res) {
        setStatus({ kind: 'error', message: res.error })
        return
      }
      setStatus({ kind: 'saved', at: Date.now() })
      router.refresh()
    })
  }

  function remove() {
    setStatus({ kind: 'saving' })
    startTransition(async () => {
      const res = await removeEntrySpeciesAction(row.id)
      if ('error' in res) {
        setStatus({ kind: 'error', message: res.error })
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      className="bb-tile"
      style={{ padding: '0.6rem 0.75rem', borderColor: 'var(--color-ink-tint)' }}
    >
      <div className="bb-form-grid-2" style={{ gap: '0.4rem' }}>
        <div className="bb-form-row" style={{ gridColumn: '1 / -1' }}>
          <label className="bb-form-label" htmlFor={`sp_${row.id}`}>Species</label>
          <input
            id={`sp_${row.id}`}
            type="text"
            className="bb-input"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            onBlur={commit}
            placeholder="e.g. Mule deer"
          />
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label">Harvested</label>
          <input
            type="number"
            min="0"
            className="bb-input"
            value={qH}
            onChange={(e) => setQH(e.target.value)}
            onBlur={commit}
          />
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label">Released</label>
          <input
            type="number"
            min="0"
            className="bb-input"
            value={qR}
            onChange={(e) => setQR(e.target.value)}
            onBlur={commit}
          />
        </div>
      </div>
      <div
        style={{
          marginTop: '0.4rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}
      >
        <button
          type="button"
          className="bb-text-action bb-text-action-copper"
          onClick={remove}
          disabled={pending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <Trash2 size={14} aria-hidden="true" />
          Remove
        </button>
        <StatusPill status={status} />
      </div>
    </div>
  )
}

// ── PhantomSpeciesRow ───────────────────────────────────────────────────
//
// Pre-fills species from the entry's linked tag.species (live-pull). On
// any blur with non-zero data, calls createEntrySpeciesAction which inserts
// the row server-side; the page refresh then renders a real SpeciesRow.

function PhantomSpeciesRow({
  entryId,
  tagSpecies,
}: {
  entryId: string
  tagSpecies: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useFadingSavedStatus()
  const [species, setSpecies] = useState(tagSpecies)
  const [qH, setQH] = useState('0')
  const [qR, setQR] = useState('0')

  const stateRef = useRef({ species, qH, qR })
  stateRef.current = { species, qH, qR }

  function commit() {
    const { species: sp, qH: h, qR: r } = stateRef.current
    // Don't materialize an empty row — wait for the user to actually
    // type something or set qty>0 before promoting to a real row.
    if (!sp.trim() && (h === '' || h === '0') && (r === '' || r === '0')) return
    setStatus({ kind: 'saving' })
    const fd = new FormData()
    fd.set('entry_id', entryId)
    fd.set('species', sp)
    fd.set('qty_harvested', h || '0')
    fd.set('qty_released', r || '0')
    startTransition(async () => {
      const res = await createEntrySpeciesAction(fd)
      if ('error' in res) {
        setStatus({ kind: 'error', message: res.error })
        return
      }
      setStatus({ kind: 'saved', at: Date.now() })
      router.refresh()
    })
  }

  return (
    <div
      className="bb-tile"
      style={{ padding: '0.6rem 0.75rem', borderColor: 'var(--color-ink-tint)' }}
    >
      <div className="bb-form-grid-2" style={{ gap: '0.4rem' }}>
        <div className="bb-form-row" style={{ gridColumn: '1 / -1' }}>
          <label className="bb-form-label" htmlFor={`phantom_sp_${entryId}`}>Species</label>
          <input
            id={`phantom_sp_${entryId}`}
            type="text"
            className="bb-input"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            onBlur={commit}
            placeholder="e.g. Mule deer"
          />
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label">Harvested</label>
          <input
            type="number"
            min="0"
            className="bb-input"
            value={qH}
            onChange={(e) => setQH(e.target.value)}
            onBlur={commit}
          />
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label">Released</label>
          <input
            type="number"
            min="0"
            className="bb-input"
            value={qR}
            onChange={(e) => setQR(e.target.value)}
            onBlur={commit}
          />
        </div>
      </div>
      <div
        style={{
          marginTop: '0.4rem',
          display: 'flex',
          justifyContent: 'flex-end',
          minHeight: '1.2rem',
        }}
      >
        <StatusPill status={status} />
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
      {pending}
    </div>
  )
}

// ── GeneratePdfsSection ─────────────────────────────────────────────────
//
// v27.1.1.0.3b. Doc picker + Generate button at the bottom of /log.
// Auto-selects the only mapped log doc when there's exactly one. Empty
// state when none are mapped: copy + link out to Documents library.
//
// v27.1.1.0.3e.3: artifacts no longer rendered locally — generated PDFs
// surface from the server-rendered <GeneratedReportsTile> at the top
// of the page. After generation we call router.refresh() to re-pull
// that list. Warnings still render inline so the guide sees them in
// context with the Generate button.
//
// v27.1.1.0.3e.4: CTA goes full-width. "Using …" indicator now always
// renders above the CTA (was conditional on length === 1). Warnings are
// rendered as info-icon tiles instead of a <ul> of bullets.

function GeneratePdfsSection({
  logId,
  mappedDocs,
  tripState,
  guideId,
}: {
  logId: string
  mappedDocs: MappedLogDoc[]
  tripState: string | null
  guideId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  // v27.1.1.0.3e.2: smart state filtering. When the trip has a state,
  // narrow to docs that match — auto-select the single match, surface
  // only matches in the picker on multi-match, fall through to all
  // docs (with a warning) on zero match. Trip state null → all docs,
  // existing behavior. Bite Book templates count as matches if their
  // state field is set; templates with state=null fall into the "any"
  // pool below.
  const stateMatches = useMemo(() => {
    if (!tripState) return mappedDocs
    return mappedDocs.filter((d) => d.state === tripState)
  }, [mappedDocs, tripState])

  const usingFallback = !!tripState && stateMatches.length === 0
  const visibleDocs = usingFallback ? mappedDocs : stateMatches

  // Sort: matching state first, then non-matching. Stable across
  // renders by mapping back to mappedDocs order within each bucket.
  const sortedDocs = useMemo(() => {
    if (!tripState || usingFallback) {
      // No state filter (or fallback showing all) — sort: matching
      // state first, then everything else.
      const match: MappedLogDoc[] = []
      const other: MappedLogDoc[] = []
      for (const d of mappedDocs) {
        if (tripState && d.state === tripState) match.push(d)
        else other.push(d)
      }
      return [...match, ...other]
    }
    return visibleDocs
  }, [mappedDocs, visibleDocs, tripState, usingFallback])

  // Default-pick the first doc in the visible/sorted list. Auto-select
  // sticks when sortedDocs reduces to length 1.
  const [docId, setDocId] = useState<string>(sortedDocs[0]?.id ?? '')
  // If the visible list changes (e.g. tripState arrives async), keep
  // the selected doc valid.
  useEffect(() => {
    if (sortedDocs.length === 0) return
    if (!sortedDocs.some((d) => d.id === docId)) {
      setDocId(sortedDocs[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedDocs.map((d) => d.id).join(',')])

  function describeDoc(d: MappedLogDoc): string {
    const ownerTag = d.is_template
      ? 'Bite Book template'
      : d.guide_id === guideId
      ? 'your library'
      : 'your library'
    const stateTag = d.state ?? 'no state'
    return `${stateTag} · ${ownerTag}`
  }

  function generate() {
    setError(null)
    setWarnings([])
    if (!docId) {
      setError('Pick a mapped log doc first.')
      return
    }
    startTransition(async () => {
      const res = await generateFilledHarvestLogPDFsAction(logId, docId)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setWarnings(res.warnings)
      router.refresh()
    })
  }

  if (mappedDocs.length === 0) {
    return (
      <section className="bb-tile" style={{ borderColor: 'var(--color-ink-tint)' }}>
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Generate filled PDFs</h2>
          <p className="bb-form-help" style={{ margin: 0 }}>
            No mapped log docs yet. Upload a state harvest log under Documents and map its
            fields, then come back here to fill it from this report.
          </p>
        </div>
      </section>
    )
  }

  const activeDoc = sortedDocs.find((d) => d.id === docId) ?? sortedDocs[0]

  return (
    <section className="bb-tile" style={{ borderColor: 'var(--color-ink-tint)' }}>
      <div className="bb-tile-body">
        <h2 className="bb-form-section-head">Generate filled PDFs</h2>
        <p className="bb-form-help" style={{ marginTop: '-0.25rem' }}>
          Fills the picked state form with this report. Hunters with
          &ldquo;Include in report&rdquo; unchecked are skipped. Forms with
          per-hunter slots overflow into multiple PDFs when needed.
        </p>

        {/* v27.1.1.0.3e.2: warning banner when the trip's state has no
            matching mapped log. Falls through to showing all docs. */}
        {usingFallback && (
          <p
            className="bb-form-help"
            role="alert"
            style={{
              margin: '0.5rem 0',
              padding: '0.5rem 0.75rem',
              borderRadius: 6,
              background: 'rgba(140, 60, 42, 0.08)',
              color: '#8C3C2A',
            }}
          >
            No log template found for <strong>{tripState}</strong>. Pick one below or upload a{' '}
            <strong>{tripState}</strong> log first.
          </p>
        )}

        {sortedDocs.length > 1 && (
          <div className="bb-form-row" style={{ marginTop: '0.5rem' }}>
            <label className="bb-form-label" htmlFor="fill_doc_picker">Pick a log doc</label>
            <select
              id="fill_doc_picker"
              className="bb-input"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
            >
              {sortedDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} ({describeDoc(d)})
                  {d.mapping_status === 'partial' ? ' · partial mapping' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* v27.1.1.0.3e.4: "Using …" indicator always rendered above the
            CTA, even on multi-doc state. Reflects the currently-picked
            doc so the guide sees what's about to be filled. */}
        {activeDoc && (
          <p className="bb-form-help" style={{ margin: '0.4rem 0' }}>
            Using <strong>{activeDoc.label}</strong> ({describeDoc(activeDoc)})
            {activeDoc.mapping_status === 'partial' ? ' · partial mapping' : ''}.
          </p>
        )}

        <div style={{ marginTop: '0.6rem' }}>
          <button
            type="button"
            className="bb-cta-sm bb-cta-full"
            onClick={generate}
            disabled={pending || !docId}
          >
            <FileText size={14} aria-hidden="true" />
            {pending ? 'Generating…' : 'Generate filled PDFs'}
          </button>
        </div>

        {error && (
          <p
            className="bb-form-help"
            role="alert"
            style={{ color: '#8C3C2A', marginTop: '0.5rem' }}
          >
            {error}
          </p>
        )}

        {warnings.length > 0 && (
          <div
            style={{
              marginTop: '0.6rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            {warnings.map((w, i) => (
              <div key={i} className="bb-warning-tile" role="alert">
                <Info size={16} aria-hidden="true" className="bb-warning-tile-icon" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ── GeneratedReportsTile ────────────────────────────────────────────────
//
// v27.1.1.0.3e.3 — server-rendered list of every PDF that's been
// generated for this trip. Replaces the local artifacts state in
// GeneratePdfsSection so reports persist across reloads / hunters /
// devices and don't depend on the latest in-memory generate() call.
//
// v27.1.1.0.3e.4: per-row buttons restyled as 3 square icon-tiles
// (Open / Download / Delete) with stacked icon+label, ~3.25rem square.

function GeneratedReportsTile({ generatedLogs }: { generatedLogs: TripGeneratedLog[] }) {
  if (generatedLogs.length === 0) {
    return (
      <section className="bb-tile" style={{ borderColor: 'var(--color-ink-tint)' }}>
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head" style={{ marginBottom: '0.25rem' }}>Reports</h2>
          <p className="bb-form-help" style={{ margin: 0 }}>
            No reports yet. Fill out the log below and tap{' '}
            <strong>Generate filled PDFs</strong> to create one.
          </p>
        </div>
      </section>
    )
  }
  return (
    <section className="bb-tile" style={{ borderColor: 'var(--color-ink-tint)' }}>
      <div className="bb-tile-body">
        <h2 className="bb-form-section-head" style={{ marginBottom: '0.25rem' }}>Reports</h2>
        <p className="bb-form-help" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
          Filled state forms generated from this report. Tap any to open or download.
        </p>
        <div className="flex flex-col gap-2">
          {generatedLogs.map((g) => (
            <GeneratedReportRow key={g.id} row={g} />
          ))}
        </div>
      </div>
    </section>
  )
}

function GeneratedReportRow({ row }: { row: TripGeneratedLog }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function runDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteTripGeneratedLogAction(row.id)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      className="bb-tile"
      style={{
        padding: '0.6rem 0.75rem',
        borderColor: 'var(--color-ink-tint)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
      }}
    >
      <FileText size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--color-ink-soft)' }} />
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            color: 'var(--color-ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={row.file_name}
        >
          {row.file_name}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-soft)', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          <span>{relativeTime(row.created_at)}</span>
          {row.pass_total > 1 && <span>· Pass {row.pass_index} of {row.pass_total}</span>}
          {row.page_count !== null && row.page_count !== undefined && (
            <span>· {row.page_count} {row.page_count === 1 ? 'page' : 'pages'}</span>
          )}
        </div>
        {error && (
          <p
            className="bb-form-help"
            role="alert"
            style={{ color: '#8C3C2A', marginTop: '0.25rem' }}
          >
            {error}
          </p>
        )}
      </div>
      <div style={{ display: 'inline-flex', gap: '0.4rem', flexShrink: 0 }}>
        {row.signed_url ? (
          <>
            <a
              href={row.signed_url}
              target="_blank"
              rel="noreferrer noopener"
              className="bb-icon-tile"
              aria-label={`Open ${row.file_name}`}
            >
              <ExternalLink size={16} aria-hidden="true" />
              <span>Open</span>
            </a>
            <a
              href={row.signed_url}
              download={row.file_name}
              className="bb-icon-tile"
              aria-label={`Download ${row.file_name}`}
            >
              <Download size={16} aria-hidden="true" />
              <span>Download</span>
            </a>
          </>
        ) : (
          <span style={{ fontSize: '0.8rem', color: '#8C3C2A' }}>File missing</span>
        )}
        <button
          type="button"
          className="bb-icon-tile bb-icon-tile--destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          aria-label={`Delete ${row.file_name}`}
        >
          <Trash2 size={16} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
      <ConfirmModal
        open={confirmOpen}
        title="Delete this generated PDF?"
        body="The file is removed from your trip and from storage. This can't be undone."
        confirmLabel="Delete"
        destructive
        isPending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          runDelete()
        }}
      />
    </div>
  )
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const sec = Math.round(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString()
}

function AddressLine({ snapshot }: { snapshot: unknown }) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const s = snapshot as Record<string, string | null | undefined>
  const cityState = [s.city, s.state].filter(Boolean).join(', ')
  const parts = [s.street1, s.street2, cityState, s.postal_code].filter(Boolean)
  if (parts.length === 0) return null
  return <div>{parts.join(', ')}</div>
}
