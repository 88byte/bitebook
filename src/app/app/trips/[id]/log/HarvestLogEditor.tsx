'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
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
import type {
  HarvestLogWithEntries,
  HarvestLogEntryWithRelations,
  HarvestLogEntrySpeciesRow,
} from '../../../_lib/harvest-log-queries'

// v27.1.1.0.3a   — accordion editor.
// v27.1.1.0.3a.1 — total_hours per-entry, Delete report.
// v27.1.1.0.3a.2 — date width cap, "Hunter info" section, phantom species
//                  row pre-filled from tag.
// v27.1.1.0.3a.3 — auto-save on blur for every input. Explicit Save buttons
//                  removed across the page (trip-level, per-entry, species
//                  rows). Each editable card gets a tiny status pill that
//                  reads "Saving…" while the action is in-flight, "Saved"
//                  for ~2s after a successful write, or an inline error.
//                  Add species / Remove species / Generate PDFs / Delete
//                  report stay as explicit clicks.
//                  Schema cleanup: entry-level qty_harvested/kept/released
//                  dropped (duplicated species rows). species.qty_kept
//                  dropped (= qty_harvested per Flavio "kept and harvested
//                  are the same"). Species sub-table now species /
//                  harvested / released only.

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
}: {
  tripId: string
  log: HarvestLogWithEntries
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
    <div className="flex flex-col gap-4 mt-4">
      {/* Trip-level fields — auto-save on blur (date) / change (purpose) */}
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
          <div className="bb-form-row" style={{ marginTop: '0.6rem' }}>
            <label className="bb-form-label" htmlFor="log_date">Hunt date</label>
            <input
              id="log_date"
              type="date"
              className="bb-input"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              onBlur={() => commitLogLevel(logDate, purposes)}
              style={{ maxWidth: '12rem' }}
            />
            <p className="bb-form-help">
              Hours per hunter live on each hunter&rsquo;s entry below.
            </p>
          </div>
          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
            <span className="bb-form-label" style={{ marginBottom: '0.4rem' }}>
              Trip purpose
            </span>
            <div className="flex flex-wrap gap-2">
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

      {/* Generate Filled PDFs section — placeholder for v27.1.1.0.3b */}
      <section className="bb-tile" style={{ borderColor: 'var(--color-ink-tint)' }}>
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Generate filled PDFs</h2>
          <p className="bb-form-help" style={{ margin: 0 }}>
            Filled state-form generation ships in the next build (v27.1.1.0.3b).
          </p>
        </div>
      </section>

      {/* Danger zone — delete + start over */}
      <section className="bb-tile" style={{ borderColor: 'var(--color-ink-tint)' }}>
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Danger zone</h2>
          <p className="bb-form-help" style={{ marginTop: '-0.25rem' }}>
            Deletes this report and starts over. Tags consumed by entries get released.
          </p>
          <button
            type="button"
            className="bb-cta-sm bb-cta-sm-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Trash2 size={14} aria-hidden="true" />
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
      <div
        className="bb-tile-body"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse entry' : 'Expand entry'}
          aria-expanded={open}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--color-ink-soft)',
            flexShrink: 0,
          }}
        >
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              color: 'var(--color-ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {headerName}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-soft)' }}>
            {entry.species_rows.length > 0
              ? `${entry.species_rows.length} species rows · ${totalSpeciesQty} total`
              : 'No harvest logged'}
          </div>
        </div>

        {slot !== null && (
          <span
            aria-label={`Slot ${slot}`}
            style={{
              flexShrink: 0,
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '0.2rem 0.55rem',
              borderRadius: 999,
              background: 'rgba(168, 92, 50, 0.12)',
              color: 'var(--color-copper)',
              letterSpacing: '0.04em',
            }}
          >
            HUNTER {slot}
          </span>
        )}

        <label
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.85rem',
            color: 'var(--color-ink-soft)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={include}
            onChange={(e) => {
              setInclude(e.target.checked)
              commitEntry({ include: e.target.checked })
            }}
          />
          Include in report
        </label>
      </div>

      {open && (
        <div
          style={{
            padding: '0 1rem 1rem 1rem',
            borderTop: '1px solid var(--color-ink-tint)',
          }}
        >
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

          {/* Status pill at the bottom of the accordion body — captures
              every save fired from this entry's surface. */}
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

function AddressLine({ snapshot }: { snapshot: unknown }) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const s = snapshot as Record<string, string | null | undefined>
  const cityState = [s.city, s.state].filter(Boolean).join(', ')
  const parts = [s.street1, s.street2, cityState, s.postal_code].filter(Boolean)
  if (parts.length === 0) return null
  return <div>{parts.join(', ')}</div>
}
