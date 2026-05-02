'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle } from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import {
  updateHarvestLogAction,
  updateHarvestLogEntryAction,
  addEntrySpeciesAction,
  updateEntrySpeciesAction,
  removeEntrySpeciesAction,
  deleteHarvestLogAndRedirectAction,
} from '../../../_lib/harvest-log-actions'
import type {
  HarvestLogWithEntries,
  HarvestLogEntryWithRelations,
} from '../../../_lib/harvest-log-queries'

// v27.1.1.0.3a   — accordion editor.
// v27.1.1.0.3a.1 — total_hours moved to per-entry. Log-level fields shrink
//                  to date + purpose. "Include in PDF" relabeled
//                  "Include in report". Delete report button + ConfirmModal
//                  at the bottom. Top fields stack on narrow viewports —
//                  with only a date input remaining at log-level the
//                  earlier 2-col collision is gone, but the per-entry qty
//                  grid keeps .bb-form-grid-2 (which already collapses to
//                  1-col under 640px).

const PURPOSES: { value: string; label: string }[] = [
  { value: 'hunting', label: 'Hunting' },
  { value: 'big_game', label: 'Big game' },
  { value: 'fishing', label: 'Fishing' },
  { value: 'fly_fishing', label: 'Fly fishing' },
  { value: 'other', label: 'Other' },
]

export default function HarvestLogEditor({
  tripId,
  log,
}: {
  tripId: string
  log: HarvestLogWithEntries
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Log-level state (date + purpose only as of v27.1.1.0.3a.1)
  const [logDate, setLogDate] = useState<string>(log.log_date ?? '')
  const initialPurposes = useMemo(() => {
    const raw = log.trip_purpose
    if (Array.isArray(raw)) return new Set(raw.map((v) => String(v)))
    return new Set<string>()
  }, [log.trip_purpose])
  const [purposes, setPurposes] = useState<Set<string>>(initialPurposes)

  // Confirm-modal state for the destructive Delete report flow.
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Slot map for the dynamic Hunter N badge — only included entries get a
  // slot, ordered by participant order (which the query preserves via
  // created_at ascending).
  const slotByEntryId = useMemo(() => {
    const map = new Map<string, number>()
    let slot = 1
    for (const e of log.entries) {
      if (e.include_in_report) map.set(e.id, slot++)
    }
    return map
  }, [log.entries])

  function togglePurpose(p: string) {
    setPurposes((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  function saveLogLevel() {
    setError(null)
    setSavedAt(null)
    const fd = new FormData()
    fd.set('log_id', log.id)
    if (logDate) fd.set('log_date', logDate)
    for (const p of purposes) fd.append('trip_purpose', p)
    startTransition(async () => {
      const res = await updateHarvestLogAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedAt(Date.now())
      router.refresh()
    })
  }

  function runDelete() {
    setDeleteError(null)
    startTransition(async () => {
      const res = await deleteHarvestLogAndRedirectAction(log.id)
      // The server action redirects on success; if we get here with an
      // error envelope, surface it.
      if (res && 'error' in res) {
        setDeleteError(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* Log-level fields — date + trip purpose only */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Trip-level details</h2>
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="log_date">Log date</label>
            <input
              id="log_date"
              type="date"
              className="bb-input"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
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
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              className="bb-cta-sm"
              onClick={saveLogLevel}
              disabled={pending}
            >
              {savedAt !== null ? 'Saved' : pending ? 'Saving…' : 'Save trip details'}
            </button>
          </div>
          {error && (
            <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', marginTop: '0.4rem' }}>
              {error}
            </p>
          )}
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
            Filled state-form generation ships in the next build (v27.1.1.0.3b). Map a log
            doc&apos;s fields in the Documents section first; the generator will read those
            mappings + this report and produce per-hunter PDFs with overflow handling.
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
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const [include, setInclude] = useState<boolean>(entry.include_in_report)
  const [qHarv, setQHarv] = useState<string>(String(entry.qty_harvested))
  const [qKept, setQKept] = useState<string>(String(entry.qty_kept))
  const [qRel, setQRel] = useState<string>(String(entry.qty_released))
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

  const showExcludeWarning =
    !include && (Number(qHarv || 0) > 0 || totalSpeciesQty > 0)

  function saveEntry() {
    setError(null)
    setSavedAt(null)
    const fd = new FormData()
    fd.set('entry_id', entry.id)
    fd.set('qty_harvested', qHarv || '0')
    fd.set('qty_kept', qKept || '0')
    fd.set('qty_released', qRel || '0')
    if (totalHours) fd.set('total_hours', totalHours)
    fd.set('notes', notes)
    if (include) fd.set('include_in_report', 'on')
    startTransition(async () => {
      const res = await updateHarvestLogEntryAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedAt(Date.now())
      router.refresh()
    })
  }

  function addSpecies() {
    setError(null)
    startTransition(async () => {
      const res = await addEntrySpeciesAction(entry.id)
      if ('error' in res) {
        setError(res.error)
        return
      }
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
              : entry.qty_harvested > 0
                ? `${entry.qty_harvested} harvested`
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
            onChange={(e) => setInclude(e.target.checked)}
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
            <span className="bb-form-label">Auto-filled identity</span>
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

          {/* v27.1.1.0.3a.1: Total hours per hunter */}
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
              placeholder="0.0"
            />
          </div>

          <div className="bb-form-grid-2" style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor={`qh_${entry.id}`}>Qty harvested</label>
              <input
                id={`qh_${entry.id}`}
                type="number"
                min="0"
                className="bb-input"
                value={qHarv}
                onChange={(e) => setQHarv(e.target.value)}
              />
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor={`qk_${entry.id}`}>Qty kept</label>
              <input
                id={`qk_${entry.id}`}
                type="number"
                min="0"
                className="bb-input"
                value={qKept}
                onChange={(e) => setQKept(e.target.value)}
              />
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor={`qr_${entry.id}`}>Qty released</label>
              <input
                id={`qr_${entry.id}`}
                type="number"
                min="0"
                className="bb-input"
                value={qRel}
                onChange={(e) => setQRel(e.target.value)}
              />
            </div>
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
              <span className="bb-form-label" style={{ marginBottom: 0 }}>Species breakdown</span>
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
            </div>
            {entry.species_rows.length === 0 ? (
              <p className="bb-form-help" style={{ margin: 0 }}>
                Optional. Useful when one hunter took multiple species.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {entry.species_rows.map((s) => (
                  <SpeciesRow key={s.id} row={s} />
                ))}
              </div>
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
              placeholder="Optional"
              maxLength={500}
            />
          </div>

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              className="bb-cta-sm"
              onClick={saveEntry}
              disabled={pending}
            >
              {savedAt !== null ? 'Saved' : pending ? 'Saving…' : 'Save entry'}
            </button>
          </div>
          {error && (
            <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', marginTop: '0.4rem' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── SpeciesRow ──────────────────────────────────────────────────────────

function SpeciesRow({
  row,
}: {
  row: import('../../../_lib/harvest-log-queries').HarvestLogEntrySpeciesRow
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [species, setSpecies] = useState(row.species ?? '')
  const [qH, setQH] = useState(String(row.qty_harvested))
  const [qK, setQK] = useState(String(row.qty_kept))
  const [qR, setQR] = useState(String(row.qty_released))

  function save() {
    setError(null)
    setSavedAt(null)
    const fd = new FormData()
    fd.set('species_id', row.id)
    fd.set('species', species)
    fd.set('qty_harvested', qH || '0')
    fd.set('qty_kept', qK || '0')
    fd.set('qty_released', qR || '0')
    startTransition(async () => {
      const res = await updateEntrySpeciesAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSavedAt(Date.now())
      router.refresh()
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      const res = await removeEntrySpeciesAction(row.id)
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
            placeholder="e.g. Mule deer"
          />
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label">Harvested</label>
          <input type="number" min="0" className="bb-input" value={qH} onChange={(e) => setQH(e.target.value)} />
        </div>
        <div className="bb-form-row">
          <label className="bb-form-label">Kept</label>
          <input type="number" min="0" className="bb-input" value={qK} onChange={(e) => setQK(e.target.value)} />
        </div>
        <div className="bb-form-row" style={{ gridColumn: '1 / -1' }}>
          <label className="bb-form-label">Released</label>
          <input type="number" min="0" className="bb-input" value={qR} onChange={(e) => setQR(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" className="bb-btn-secondary" onClick={save} disabled={pending}>
          {savedAt !== null ? 'Saved' : pending ? 'Saving…' : 'Save row'}
        </button>
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
      </div>
      {error && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', marginTop: '0.3rem' }}>
          {error}
        </p>
      )}
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
