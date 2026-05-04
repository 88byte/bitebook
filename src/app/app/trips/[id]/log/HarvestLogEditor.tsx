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
  setEntryUserInputAction,
} from '../../../_lib/harvest-log-actions'
import {
  generateFilledHarvestLogPDFsAction,
  deleteTripGeneratedLogAction,
  renameTripGeneratedLogAction,
} from '../../../_lib/harvest-log-fill'
import type {
  HarvestLogWithEntries,
  HarvestLogEntryWithRelations,
  HarvestLogEntrySpeciesRow,
  LogTimeMapping,
  MappedLogDoc,
  TripGeneratedLog,
} from '../../../_lib/harvest-log-queries'
import { Download, ExternalLink, Pencil, Check, X as XIcon, RotateCw, Signature } from 'lucide-react'
import SignModal from './SignModal'
import SpeciesField from '../../../_components/SpeciesField'

type SpeciesOption = { name: string; kind: 'hunting' | 'fishing' }

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
  tripSpecies,
  guideId,
  generatedLogs,
  speciesOptions,
}: {
  tripId: string
  log: HarvestLogWithEntries
  mappedDocs: MappedLogDoc[]
  tripState: string | null
  // v27.3.7.1 item 3: trip's species_targeted, used as the default
  // for new species rows so the guide doesn't have to retype it.
  tripSpecies: string
  guideId: string
  generatedLogs: TripGeneratedLog[]
  // v27.3.7.1 item 3: full species pool from the species table so
  // per-hunter species rows render the same SpeciesField dropdown
  // the trip form uses (consistency).
  speciesOptions: SpeciesOption[]
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

  return (
    <>
      <div className="flex flex-col gap-4 mt-4">
        {/* v27.3.7.1 item 2 — Generate stays at TOP. The Logs list moved
            to the BOTTOM of the page (was top in v27.3.7) per Flavio's
            screenshot — the nested-card visual + top-position cluttered
            the entry editing flow. */}
        <GeneratePdfsSection
          logId={log.id}
          mappedDocs={mappedDocs}
          tripState={tripState}
          guideId={guideId}
        />

        {/* v27.3.7 item 9 — divider directly beneath the Generate block
            so the "fill out details below" content reads as a separate
            phase from the generation tools. */}
        <div className="bb-page-divider" aria-hidden="true" />

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

            {/* v27.1.1.0.3e.5: Custom 2-col grid (~40/60) so the Hunt date
                column doesn't crowd the 3-col purpose pill grid on its
                right. Default .bb-form-grid-2 is 1fr/1fr which crushes
                the purpose pills at narrow widths.
                v27.1.1.0.3e.8: stack to 1-col below 26rem viewport — at
                360–375px the 40/60 split still leaves the Hunt date
                column too narrow for `<input type="date">`'s intrinsic
                picker chrome on iOS Safari. Stacking is the only clean
                fix that preserves the 3-col pill grid in column 2. */}
            <div className="bb-log-trip-grid" style={{ marginTop: '0.6rem' }}>
              <div className="bb-form-row" style={{ marginBottom: 0, minWidth: 0 }}>
                <label className="bb-form-label" htmlFor="log_date">Hunt date</label>
                <input
                  id="log_date"
                  type="date"
                  className="bb-input"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  onBlur={() => commitLogLevel(logDate, purposes)}
                  // v27.1.4.0.1: iOS Safari renders <input type="date">
                  // with -webkit-appearance:none reserved widths even
                  // when width:100% is applied — the native picker
                  // chrome contributes intrinsic width that bleeds past
                  // the parent column. Force display:block (kills the
                  // inline-block intrinsic) + maxWidth:100% (caps the
                  // computed width to the cell) so the input clips into
                  // its grid column instead of overflowing the card.
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div className="bb-form-row" style={{ marginBottom: 0, minWidth: 0 }}>
                <span className="bb-form-label" style={{ marginBottom: '0.4rem' }}>
                  Trip purpose
                </span>
                {/* v27.3.10.2 item 1 — plain HTML checkboxes. The pill
                    + colored ring around the whole label was reading as
                    a "circle indicator" around the selection. Stripped
                    to the standard square checkbox + text label
                    pattern, no surrounding chrome. */}
                <div className="bb-purpose-grid">
                  {PURPOSES.map((p) => (
                    <label
                      key={p.value}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        color: 'var(--color-ink)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={purposes.has(p.value)}
                        onChange={() => togglePurpose(p.value)}
                        style={{ width: '1rem', height: '1rem' }}
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
                tripSpecies={tripSpecies}
                speciesOptions={speciesOptions}
                logTimeMappings={log.log_time_mappings}
              />
            ))
          )}
        </section>

        {/* v27.3.7.1 item 2 — Logs list at the BOTTOM of the page (was
            top). Outer bb-tile wrapper stripped so the inner rows
            (themselves bb-tile cards) don't render as cards-inside-a
            -card. Heading + intro stay; rows render flat against the
            page surface like the entries list above. */}
        <GeneratedReportsTile generatedLogs={generatedLogs} logId={log.id} />

        {/* v27.3.7 — Danger zone (delete report) removed per Flavio:
            "every hunt gets this hunt report." Reports auto-exist
            per hunt; no manual deletion path. ConfirmModal removed
            too. */}

        <input type="hidden" name="trip_id" value={tripId} />
      </div>
    </>
  )
}

// ── EntryAccordion ──────────────────────────────────────────────────────

function EntryAccordion({
  entry,
  slot,
  tripSpecies,
  speciesOptions,
  logTimeMappings,
}: {
  entry: HarvestLogEntryWithRelations
  slot: number | null
  // v27.3.7.1 item 3: trip-level species default + species pool for
  // the per-row SpeciesField dropdown.
  tripSpecies: string
  speciesOptions: SpeciesOption[]
  // v27.3.9: "Filled at log time" mappings, aggregated across every
  // log doc the guide could generate against this trip. Each entry's
  // accordion filters by hunter_slot to render its own subset.
  logTimeMappings: LogTimeMapping[]
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
        {/* v27.3.10 item 7: Include checkbox moved to the LEFT of
            the hunter name (was on the right). Standard checkbox-
            label pattern. The span+input combo keeps the outer
            button as the expand affordance. */}
        <span
          onClick={(e) => e.stopPropagation()}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
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
            style={{ width: '1.05rem', height: '1.05rem' }}
          />
        </span>

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

          {/* v27.3.9 - per-entry "Filled at log time" inputs sit ABOVE
              "Total hours" so the guide's eye lands on them while still
              in the per-hunter editing context. One input per mapping
              that targets this hunter's slot. The fill engine refuses
              to generate when any of these are blank for an included
              entry. */}
          <CustomLogFieldsSection
            entryId={entry.id}
            slot={slot}
            logTimeMappings={logTimeMappings}
            initialValues={entry.user_inputs}
          />

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

          {/* v27.3.7 — REGRESSION FIX: Species / Harvested / Released
              fields were invisible when an entry had zero species rows
              and no linked tag. The "Add species" button was gated on
              length>0, and PhantomSpeciesRow only rendered with
              entry.tag?.species. End state: the user saw only the
              "Optional. Add a species" helper text with no inputs and
              no Add button. Now: PhantomSpeciesRow always renders when
              there are no real species rows (with a blank species
              field if there's no tag), and the "Add species" button
              shows in the header at all times so users can stack
              multiple harvests. */}
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
              <>
                <p className="bb-form-help" style={{ margin: '0 0 0.4rem 0' }}>
                  Fill in the details below. Add more species if more than one was harvested.
                </p>
                <PhantomSpeciesRow
                  entryId={entry.id}
                  tagSpecies={entry.tag?.species ?? ''}
                  tripSpecies={tripSpecies}
                  speciesOptions={speciesOptions}
                />
              </>
            ) : (
              <>
                <p className="bb-form-help" style={{ margin: '0 0 0.4rem 0' }}>
                  Fill in the details below. Add more species if more than one was harvested.
                </p>
                <div className="flex flex-col gap-2">
                  {entry.species_rows.map((s, i) => (
                    <SpeciesRow
                      key={s.id}
                      row={s}
                      rowIndex={i}
                      entryTagIdentifier={entry.tag?.identifier ?? ''}
                      // v27.3.7.3: report_card isn't loaded in the
                      // editor query (HarvestLogEntryWithRelations
                      // doesn't include it; the fill engine live-
                      // loads it from trip_wallet_items at generate
                      // time). The dropdown label hides the value
                      // until that data flows here in a later ship.
                      entryReportCardIdentifier=""
                      speciesOptions={speciesOptions}
                    />
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

function SpeciesRow({
  row,
  rowIndex,
  entryTagIdentifier,
  entryReportCardIdentifier,
  speciesOptions,
}: {
  row: HarvestLogEntrySpeciesRow
  // v27.3.7.3: 0-based row index. The first species (index 0) hides
  // the manual Tag # / Report card # inputs so they don't compete
  // with the entry's auto-filled wallet-linked items. 2nd+ rows
  // surface a mandatory dropdown (same|manual).
  rowIndex: number
  // v27.3.7.3: entry-level wallet-linked tag + report card identifiers
  // shown in the "Same as first species" dropdown copy so the guide
  // can verify the value before picking that option.
  entryTagIdentifier: string
  entryReportCardIdentifier: string
  // v27.3.7.1 item 3: shared species pool drives the SpeciesField
  // dropdown so this row matches the picker on every other form.
  speciesOptions: SpeciesOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useFadingSavedStatus()
  const [species, setSpecies] = useState(row.species ?? '')
  const [qH, setQH] = useState(String(row.qty_harvested))
  const [qR, setQR] = useState(String(row.qty_released))
  // v27.3.7.3 + v27.3.8.1: tag # / report card # mode + value state.
  // Modes are 'same' | 'manual' | 'blank' | '' (placeholder; treated
  // as null on save).
  type Mode = 'same' | 'manual' | 'blank' | ''
  const initialTagMode: Mode =
    row.tag_identifier_mode === 'same' ||
    row.tag_identifier_mode === 'manual' ||
    row.tag_identifier_mode === 'blank'
      ? row.tag_identifier_mode
      : ''
  const initialReportMode: Mode =
    row.report_card_identifier_mode === 'same' ||
    row.report_card_identifier_mode === 'manual' ||
    row.report_card_identifier_mode === 'blank'
      ? row.report_card_identifier_mode
      : ''
  const [tagMode, setTagMode] = useState<Mode>(initialTagMode)
  const [tagId, setTagId] = useState(row.tag_identifier ?? '')
  const [reportMode, setReportMode] = useState<Mode>(initialReportMode)
  const [reportId, setReportId] = useState(row.report_card_identifier ?? '')

  // Latest-state ref so onBlur callbacks always send fresh values.
  const stateRef = useRef({ species, qH, qR, tagMode, tagId, reportMode, reportId })
  stateRef.current = { species, qH, qR, tagMode, tagId, reportMode, reportId }

  function commit() {
    const cur = stateRef.current
    setStatus({ kind: 'saving' })
    const fd = new FormData()
    fd.set('species_id', row.id)
    fd.set('species', cur.species)
    fd.set('qty_harvested', cur.qH || '0')
    fd.set('qty_released', cur.qR || '0')
    fd.set('tag_identifier', cur.tagMode === 'manual' ? cur.tagId : '')
    fd.set('tag_identifier_mode', cur.tagMode)
    fd.set('report_card_identifier', cur.reportMode === 'manual' ? cur.reportId : '')
    fd.set('report_card_identifier_mode', cur.reportMode)
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
          {/* v27.3.7.1 item 3: shared SpeciesField (same select used by
              the trip form + wallet). Commits on next change since
              <select> doesn't fire onBlur the same way as text inputs. */}
          <SpeciesField
            id={`sp_${row.id}`}
            name={`species_${row.id}`}
            value={species}
            onChange={(next) => {
              setSpecies(next)
              // Commit on selection change. stateRef is updated above
              // synchronously via the closure above, but ref captures
              // post-render — schedule the commit after state flushes.
              setTimeout(() => commit(), 0)
            }}
            options={speciesOptions}
            placeholder="Pick a species"
          />
        </div>
        {/* v27.3.7.3: 2nd+ species rows surface mandatory mode
            dropdowns for Tag # and Report Card #. "Same as first
            species" reuses the entry-level linked wallet item id;
            "Enter manually" reveals a free-text input. Until the
            guide picks one (mode==''), the row is flagged as
            incomplete and the resolver returns blank for these
            paths. The 1st species (rowIndex 0) auto-fills from the
            entry's wallet-linked tag/report card without any UI. */}
        {rowIndex > 0 && (
          <>
            <SpeciesIdField
              kind="tag"
              fieldId={`tag_${row.id}`}
              mode={tagMode}
              setMode={setTagMode}
              value={tagId}
              setValue={setTagId}
              firstValue={entryTagIdentifier}
              commit={commit}
            />
            <SpeciesIdField
              kind="report_card"
              fieldId={`rc_${row.id}`}
              mode={reportMode}
              setMode={setReportMode}
              value={reportId}
              setValue={setReportId}
              firstValue={entryReportCardIdentifier}
              commit={commit}
            />
          </>
        )}
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

// ── SpeciesIdField (mandatory mode dropdown) ────────────────────────────
//
// v27.3.7.3: shared field for Tag # and Report Card # on 2nd+ species
// rows. Mode dropdown is mandatory; until the guide picks 'same' or
// 'manual', the row is flagged incomplete (red helper text). 'manual'
// reveals the free-text input below.

// ── CustomLogFieldsSection (v27.3.9) ────────────────────────────────────
//
// Renders one input per "Filled at log time" mapping that targets this
// hunter's slot. Auto-saves on blur via setEntryUserInputAction.
// De-duplicates mappings by (field_name, label) so guides who have the
// same field on multiple log docs don't see the input twice.

function CustomLogFieldsSection({
  entryId,
  slot,
  logTimeMappings,
  initialValues,
}: {
  entryId: string
  slot: number | null
  logTimeMappings: LogTimeMapping[]
  initialValues: Record<string, string>
}) {
  // De-dupe by field_name (collapse same-named fields across multiple
  // mapped log docs). When two docs use the SAME field name with
  // different labels, the first label wins — vanishingly rare in
  // practice and a downstream cleanup if it surfaces.
  const slotForLookup = slot ?? 1
  const mineByName = useMemo(() => {
    const out = new Map<string, LogTimeMapping>()
    for (const m of logTimeMappings) {
      if (m.hunter_slot !== slotForLookup) continue
      if (!out.has(m.field_name)) out.set(m.field_name, m)
    }
    return Array.from(out.values())
  }, [logTimeMappings, slotForLookup])

  if (mineByName.length === 0) return null

  return (
    <section style={{ marginTop: '0.75rem' }}>
      <span className="bb-form-label" style={{ display: 'block', marginBottom: '0.4rem' }}>
        Custom fields <span style={{ opacity: 0.6, fontWeight: 400 }}>(filled at log time)</span>
      </span>
      <div className="flex flex-col gap-2">
        {mineByName.map((m) => (
          <CustomLogFieldRow
            key={`${m.doc_id}:${m.field_name}`}
            entryId={entryId}
            mapping={m}
            initialValue={initialValues[m.field_name] ?? ''}
          />
        ))}
      </div>
    </section>
  )
}

function CustomLogFieldRow({
  entryId,
  mapping,
  initialValue,
}: {
  entryId: string
  mapping: LogTimeMapping
  initialValue: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(initialValue)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useFadingSavedStatus()

  function commit() {
    setStatus({ kind: 'saving' })
    startTransition(async () => {
      const res = await setEntryUserInputAction(entryId, mapping.field_name, value)
      if ('error' in res) {
        setStatus({ kind: 'error', message: res.error })
        return
      }
      setStatus({ kind: 'saved', at: Date.now() })
      router.refresh()
    })
  }

  const fieldId = `userinput_${entryId}_${mapping.field_name.replace(/\W+/g, '_')}`
  return (
    <div className="bb-form-row" style={{ marginBottom: 0 }}>
      <label className="bb-form-label" htmlFor={fieldId}>
        {mapping.user_label}
      </label>
      <input
        id={fieldId}
        type="text"
        className="bb-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        maxLength={500}
        disabled={pending}
      />
      <div style={{ minHeight: '1rem', marginTop: '0.2rem' }}>
        <StatusPill status={status} />
      </div>
    </div>
  )
}

function SpeciesIdField({
  kind,
  fieldId,
  mode,
  setMode,
  value,
  setValue,
  firstValue,
  commit,
}: {
  kind: 'tag' | 'report_card'
  fieldId: string
  mode: 'same' | 'manual' | 'blank' | ''
  setMode: (m: 'same' | 'manual' | 'blank' | '') => void
  value: string
  setValue: (v: string) => void
  firstValue: string
  commit: () => void
}) {
  const label = kind === 'tag' ? 'Tag #' : 'Report card #'
  const sameLabel = firstValue
    ? `Same as first species (${firstValue})`
    : 'Same as first species'
  const isUnset = mode === ''
  return (
    <div className="bb-form-row" style={{ gridColumn: '1 / -1' }}>
      <label className="bb-form-label" htmlFor={fieldId}>
        {label} <span style={{ color: '#B33A2E' }}>*</span>
      </label>
      <select
        id={fieldId}
        className="bb-input"
        value={mode}
        onChange={(e) => {
          const next = e.target.value as 'same' | 'manual' | 'blank' | ''
          setMode(next)
          if (next !== 'manual') setValue('')
          setTimeout(() => commit(), 0)
        }}
        style={isUnset ? { borderColor: '#B33A2E' } : undefined}
      >
        <option value="">Choose…</option>
        <option value="same">{sameLabel}</option>
        <option value="manual">Enter manually</option>
        {/* v27.3.8.1 item 2a: explicit "Leave blank" so the guide
            can confirm a deliberately-empty field on the PDF. */}
        <option value="blank">Leave blank</option>
      </select>
      {mode === 'manual' && (
        <input
          type="text"
          className="bb-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          placeholder={kind === 'tag' ? 'e.g. T-1234567' : 'e.g. RC-987654'}
          maxLength={80}
          style={{ marginTop: '0.4rem' }}
          autoFocus
        />
      )}
      {isUnset && (
        <p className="bb-form-help" style={{ color: '#B33A2E', marginTop: '0.25rem' }}>
          {label} required for additional species — pick &ldquo;same as first&rdquo;, enter manually, or leave blank.
        </p>
      )}
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
  tripSpecies,
  speciesOptions,
}: {
  entryId: string
  tagSpecies: string
  // v27.3.7.1 item 3: trip-level species fallback default. Tag species
  // wins when set (tag was explicitly linked); otherwise we fall back
  // to the trip's species_targeted so the guide doesn't have to retype
  // it for every hunter.
  tripSpecies: string
  speciesOptions: SpeciesOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useFadingSavedStatus()
  const [species, setSpecies] = useState(tagSpecies || tripSpecies || '')
  const [qH, setQH] = useState('0')
  const [qR, setQR] = useState('0')

  // v27.3.7.3: phantom row is ALWAYS the first species (index 0), so
  // the Tag # input is intentionally absent — the entry's wallet-
  // linked tag auto-fills the first species's tag # via the
  // resolver fallback (sp.tag_identifier ?? entry.tag.identifier).
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
    // tag_identifier intentionally not sent — first row auto-fills.
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
          {/* v27.3.7.1 item 3: shared SpeciesField. Default-fills from
              tag.species OR trip.species_targeted (whichever is set). */}
          <SpeciesField
            id={`phantom_sp_${entryId}`}
            name={`phantom_species_${entryId}`}
            value={species}
            onChange={(next) => {
              setSpecies(next)
              setTimeout(() => commit(), 0)
            }}
            options={speciesOptions}
            placeholder="Pick a species"
          />
        </div>
        {/* v27.3.7.3: Tag # input removed from phantom row — first
            species auto-fills from the entry's wallet-linked tag.
            2nd+ species rows (rendered as real SpeciesRow once
            inserted) carry the manual override input. */}
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
  // v27.3.9.1: soft confirmation when "Filled at log time" inputs
  // are blank. Modal lists offending hunter+field pairs; guide can
  // either Generate anyway or close + scroll to the first blank
  // input.
  const [blanksWarning, setBlanksWarning] = useState<
    | null
    | Array<{ hunter: string; label: string; field_name: string; hunter_slot: number }>
  >(null)

  // v27.1.1.0.3e.2: smart state filtering. When the trip has a state,
  // narrow to docs that match — auto-select the single match, surface
  // only matches in the picker on multi-match, fall through to all
  // docs (with a warning) on zero match. Trip state null → all docs,
  // existing behavior. Bite Book templates count as matches if their
  // state field is set; templates with state=null fall into the "any"
  // pool below.
  // v27.3.7.2 item 2 — dropdown ALWAYS shows every mapped log
  // (guide's library + Bite Book templates). Sort matching-state
  // first so the most likely default lands on top. The previous
  // narrow-to-state behavior was hiding non-matching docs entirely
  // — Flavio could only see the auto-pick.
  const sortedDocs = useMemo(() => {
    const match: MappedLogDoc[] = []
    const other: MappedLogDoc[] = []
    for (const d of mappedDocs) {
      if (tripState && d.state === tripState) match.push(d)
      else other.push(d)
    }
    return [...match, ...other]
  }, [mappedDocs, tripState])

  // Surface a soft warning (not a filter) when the trip has a state
  // but no mapped log matches it — guide still sees everything but
  // knows to upload the right state's log if they have one.
  const usingFallback = useMemo(
    () => !!tripState && !mappedDocs.some((d) => d.state === tripState),
    [mappedDocs, tripState]
  )

  // Default-pick the first doc in the visible/sorted list. Auto-select
  // sticks when sortedDocs reduces to length 1.
  const [docId, setDocId] = useState<string>(sortedDocs[0]?.id ?? '')
  // v27.1.4.0.1: optional Report name. Empty → fall through to the
  // engine's auto-generated `{trip.title} — {doc.label}` pattern.
  const [reportName, setReportName] = useState<string>('')
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

  // v27.3.9.1: shared invocation. acknowledgeBlanks=true is set by
  // the confirmation modal's "Generate anyway" path so the action
  // skips its blank-check on retry.
  function runGenerate(acknowledgeBlanks: boolean) {
    setError(null)
    setWarnings([])
    setBlanksWarning(null)
    if (!docId) {
      setError('Pick a mapped log doc first.')
      return
    }
    startTransition(async () => {
      const res = await generateFilledHarvestLogPDFsAction(
        logId,
        docId,
        reportName.trim() || undefined,
        undefined,
        acknowledgeBlanks
      )
      if ('error' in res) {
        setError(res.error)
        return
      }
      if ('blanks_warning' in res) {
        setBlanksWarning(res.blanks_warning)
        return
      }
      setWarnings(res.warnings)
      // v27.1.4.0.1: clear the typed name after a successful generate so
      // a subsequent run defaults back to the auto-name (otherwise the
      // input feels sticky and confusing).
      setReportName('')
      router.refresh()
    })
  }
  function generate() {
    runGenerate(false)
  }
  function generateAnyway() {
    runGenerate(true)
  }
  function focusFirstBlank() {
    if (!blanksWarning || blanksWarning.length === 0) {
      setBlanksWarning(null)
      return
    }
    const first = blanksWarning[0]
    // Match the id pattern set by CustomLogFieldRow.
    const fieldId = `userinput_*_${first.field_name.replace(/\W+/g, '_')}`
    setBlanksWarning(null)
    if (typeof document !== 'undefined') {
      // Find any input whose id ends with the same field-name suffix —
      // we don't carry the entry id in the warning, so fall back to
      // the first matching node.
      const inputs = document.querySelectorAll<HTMLInputElement>('input[id^="userinput_"]')
      for (const el of Array.from(inputs)) {
        if (el.id.endsWith(`_${first.field_name.replace(/\W+/g, '_')}`)) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.focus()
          return
        }
      }
      // No exact match — just focus the first user-input field.
      void fieldId
      const fallback = inputs[0]
      if (fallback) {
        fallback.scrollIntoView({ behavior: 'smooth', block: 'center' })
        fallback.focus()
      }
    }
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
        {/* v27.3.7 — restructured Generate card per Flavio's flow:
            instructional copy → name input → log template dropdown →
            "Generate Filled Out Log" button. Section heading dropped
            so the helper copy reads as the header itself. */}
        <p className="bb-form-help" style={{ margin: 0 }}>
          Generate a filled state harvest log for this trip. Hunters
          with &ldquo;Include in report&rdquo; unchecked are skipped.
        </p>

        {/* warning banner when the trip's state has no matching
            mapped log. Falls through to showing all docs. */}
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

        {/* Title input first (before dropdown). */}
        <div className="bb-form-row" style={{ marginTop: '0.6rem' }}>
          <label className="bb-form-label" htmlFor="report_name">
            Log title <span style={{ opacity: 0.6 }}>(optional)</span>
          </label>
          <input
            id="report_name"
            type="text"
            className="bb-input"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder={activeDoc ? `e.g. ${activeDoc.label}` : 'e.g. Spring Black Bear log'}
            maxLength={120}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          />
          <p className="bb-form-help">Leave blank to use the auto-generated name.</p>
        </div>

        {/* v27.3.7.1 item 1 — Log template dropdown ALWAYS rendered, even
            with a single option, so guides can switch templates. The
            previous "single option falls back to a paragraph" pattern
            hid the picker entirely when only one mapped log existed,
            which made the auto-selected default feel like a hard pin. */}
        <div className="bb-form-row" style={{ marginTop: '0.6rem' }}>
          <label className="bb-form-label" htmlFor="fill_doc_picker">Log template</label>
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

        {/* v27.3.7.3: drop bb-cta-full — button was stretching the
            full card width, which felt oversized vs page-level
            primary CTAs (Create Trip, Add new card, Send invite,
            etc.). Plain bb-cta-sm sizes it inline-flex like the
            rest of the system. */}
        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="bb-cta-sm"
            onClick={generate}
            disabled={pending || !docId}
          >
            <FileText size={14} aria-hidden="true" />
            {pending ? 'Generating…' : 'Generate Filled Out Log'}
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

      {/* v27.3.9.1: soft confirmation modal for blank "Filled at log
          time" inputs. Replaces v27.3.9's hard refusal — guides can
          proceed with blanks ("Generate anyway") or close the modal
          and jump to the first missing input. */}
      <ConfirmModal
        open={blanksWarning !== null && blanksWarning.length > 0}
        title="Some custom fields are blank"
        body={
          blanksWarning && blanksWarning.length > 0 ? (
            <>
              <p style={{ margin: '0 0 0.6rem' }}>
                These &ldquo;Filled at log time&rdquo; fields are still empty. They&rsquo;ll
                fill blank on the generated PDF unless you go back and add a value:
              </p>
              <ul
                style={{
                  margin: '0 0 0.6rem',
                  paddingLeft: '1.1rem',
                  color: 'var(--color-ink)',
                  fontSize: '0.9rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                {blanksWarning.slice(0, 8).map((m, i) => (
                  <li key={i}>
                    <strong>{m.hunter}</strong> — {m.label}
                  </li>
                ))}
                {blanksWarning.length > 8 && (
                  <li style={{ color: 'var(--color-ink-soft)' }}>
                    …and {blanksWarning.length - 8} more
                  </li>
                )}
              </ul>
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Generate anyway"
        cancelLabel="Go back and fill them in"
        isPending={pending}
        onCancel={focusFirstBlank}
        onConfirm={generateAnyway}
      />
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

function GeneratedReportsTile({
  generatedLogs,
  logId,
}: {
  generatedLogs: TripGeneratedLog[]
  // v27.1.3.0.3: thread logId so each row's Re-generate button can call
  // generateFilledHarvestLogPDFsAction(logId, source_doc_id, ..., row.id).
  logId: string
}) {
  // v27.3.7.1 item 2 — Render flat. The outer bb-tile wrapper was
  // stripped (was creating window-within-a-window with the inner
  // bb-tile rows). Heading + intro paragraph live on the page
  // surface; rows render as standalone cards beneath them.
  if (generatedLogs.length === 0) {
    return (
      <section style={{ paddingTop: '0.5rem' }}>
        <h2 className="bb-form-section-head" style={{ marginBottom: '0.25rem' }}>Logs</h2>
        <p className="bb-form-help" style={{ margin: 0 }}>
          No logs yet. Fill out the report above and tap{' '}
          <strong>Generate Filled Out Log</strong> to create one.
        </p>
      </section>
    )
  }
  return (
    <section style={{ paddingTop: '0.5rem' }}>
      <h2 className="bb-form-section-head" style={{ marginBottom: '0.25rem' }}>Logs</h2>
      <p className="bb-form-help" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
        Filled state forms generated from this report. Tap any to open or download.
      </p>
      <div className="flex flex-col gap-2">
        {generatedLogs.map((g) => (
          <GeneratedReportRow key={g.id} row={g} logId={logId} />
        ))}
      </div>
    </section>
  )
}

function GeneratedReportRow({
  row,
  logId,
}: {
  row: TripGeneratedLog
  // v27.1.3.0.3: logId threaded down so the Re-generate button can
  // invoke the fill action with the same (logId, source_doc_id) pair
  // that originally produced this row.
  logId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // v27.2.0.1: sign-modal open state. Signed files use the same Open /
  // Download buttons but point at signed_url_signed when set.
  const [signOpen, setSignOpen] = useState(false)

  // v27.1.4.0.1: inline rename. Tap pencil → swap filename for an
  // editable input → Save calls renameTripGeneratedLogAction → row
  // refreshes with new file_name. Storage path is untouched.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(() => stripPdfExt(row.file_name))

  // v27.2.0.1: when the row has been signed, prefer the signed copy
  // for Open / Download. The unsigned PDF is still accessible via the
  // sign modal ("Open unsigned PDF in a new tab") for audit.
  const isSigned = !!row.signed_at && !!row.signed_url_signed
  const displayUrl = isSigned ? row.signed_url_signed! : row.signed_url
  const displayName = isSigned ? row.signed_file_name ?? row.file_name : row.file_name

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

  function runRename() {
    setError(null)
    startTransition(async () => {
      const res = await renameTripGeneratedLogAction(row.id, draft)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function cancelRename() {
    setDraft(stripPdfExt(row.file_name))
    setEditing(false)
    setError(null)
  }

  // v27.1.3.0.3: Re-generate this PDF in place. Reuses the existing
  // file_path so any cached signed-URL references stay live; the row's
  // file_name + page_count + updated_at refresh, but no new row is
  // inserted. Skips when source_doc_id is missing (rare — happens when
  // the original log doc was deleted with ON DELETE SET NULL).
  function runRegenerate() {
    setError(null)
    if (!row.source_doc_id) {
      setError('The original log doc is no longer available — re-generate isn\'t possible.')
      return
    }
    const sourceDocId = row.source_doc_id
    // Strip the suffix the engine reapplies on save (filledLabel + .pdf).
    const customName = stripPdfExt(row.file_name)
    startTransition(async () => {
      const res = await generateFilledHarvestLogPDFsAction(
        logId,
        sourceDocId,
        customName,
        row.id,
      )
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
        {editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              type="text"
              className="bb-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  runRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelRename()
                }
              }}
              maxLength={200}
              autoFocus
              aria-label="Report name"
              style={{
                display: 'block',
                flex: '1 1 0',
                minWidth: 0,
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '0.4rem 0.6rem',
                fontSize: '0.9rem',
              }}
            />
            <button
              type="button"
              onClick={runRename}
              disabled={pending || !draft.trim()}
              aria-label="Save report name"
              className="bb-text-action bb-text-action-copper"
              style={{ padding: '0.25rem', flexShrink: 0 }}
            >
              <Check size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={cancelRename}
              disabled={pending}
              aria-label="Cancel rename"
              className="bb-text-action"
              style={{ padding: '0.25rem', flexShrink: 0, color: 'var(--color-ink-soft)' }}
            >
              <XIcon size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
            {/* v27.3.10.2 item 2 — rename pencil moved to the LEFT of
                the doc name (was on the right). Order: [pencil] [name]. */}
            <button
              type="button"
              onClick={() => {
                setDraft(stripPdfExt(row.file_name))
                setEditing(true)
              }}
              aria-label={`Rename ${row.file_name}`}
              className="bb-text-action"
              style={{
                padding: '0.2rem',
                color: 'var(--color-ink-soft)',
                flexShrink: 0,
              }}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <span
              style={{
                fontWeight: 600,
                color: 'var(--color-ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: '1 1 0',
                minWidth: 0,
              }}
              title={row.file_name}
            >
              {row.file_name}
            </span>
          </div>
        )}
        <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-soft)', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {/* v27.1.3.0.4: show "Updated X ago" when the row has been
              re-generated since creation, otherwise "Generated X ago".
              Threshold of 1s on the diff to avoid showing "Updated"
              for the initial insert (created_at == updated_at). */}
          {(() => {
            const created = new Date(row.created_at).getTime()
            const updated = new Date(row.updated_at).getTime()
            const wasRegenerated = Number.isFinite(updated) && updated - created > 1000
            const ts = wasRegenerated ? row.updated_at : row.created_at
            const label = wasRegenerated ? 'Updated' : 'Generated'
            // v27.3.7: pair "X ago" with the explicit date so the
            // user can see both relative + absolute at a glance.
            const dateStr = new Date(ts).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric'
            })
            return <span>{label} {relativeTime(ts)} · {dateStr}</span>
          })()}
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
      <div className="bb-genrow-actions">
        {/* v27.2.0.1: Signed-on pill rendered before the action tiles
            when the report has been signed.
            v27.3.7 item 1: action cluster pulled onto its own row on
            mobile (<640px) via .bb-genrow-actions so 4-5 icon tiles
            don't crowd the filename + meta on narrow viewports. */}
        {isSigned && (
          <span
            aria-label={`Signed ${new Date(row.signed_at!).toLocaleDateString()}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.2rem 0.5rem',
              borderRadius: 999,
              background: '#DDEEDD',
              color: '#2E5E2E',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            <Signature size={12} aria-hidden="true" />
            Signed {new Date(row.signed_at!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
        {displayUrl ? (
          <>
            <a
              href={displayUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="bb-icon-tile"
              aria-label={`Open ${displayName}`}
            >
              <ExternalLink size={16} aria-hidden="true" />
              <span>Open</span>
            </a>
            <a
              href={displayUrl}
              download={displayName}
              className="bb-icon-tile"
              aria-label={`Download ${displayName}`}
            >
              <Download size={16} aria-hidden="true" />
              <span>Download</span>
            </a>
          </>
        ) : (
          <span style={{ fontSize: '0.8rem', color: '#8C3C2A' }}>File missing</span>
        )}
        {/* v27.2.0.1: Sign and finalize. Button label flips to
            "Re-sign" when a prior signature exists; the modal copies
            the same wording. Disabled when the unsigned PDF is missing
            (nothing to sign). */}
        <button
          type="button"
          className="bb-icon-tile"
          onClick={() => setSignOpen(true)}
          disabled={pending || !row.signed_url}
          aria-label={isSigned ? `Re-sign ${row.file_name}` : `Sign ${row.file_name}`}
          title={
            isSigned
              ? 'Replace the existing signature with a new one'
              : 'Draw your signature and stamp today’s date on the report'
          }
        >
          {/* v27.3.7: Signature icon (was PenLine) — collided with the
              Pencil icon used for rename. Different visual now. */}
          <Signature size={16} aria-hidden="true" />
          <span>{isSigned ? 'Re-sign' : 'Sign'}</span>
        </button>
        <button
          type="button"
          className="bb-icon-tile"
          onClick={() => setConfirmRegen(true)}
          disabled={pending || !row.source_doc_id}
          aria-label={`Re-generate ${row.file_name}`}
          title={
            row.source_doc_id
              ? 'Re-generate this PDF with fresh data from the harvest log'
              : 'Original log doc no longer available'
          }
        >
          <RotateCw size={16} aria-hidden="true" />
          <span>Re-generate</span>
        </button>
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
      <SignModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        generatedLogId={row.id}
        fileName={row.file_name}
        unsignedUrl={row.signed_url}
        alreadySigned={isSigned}
      />
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
      <ConfirmModal
        open={confirmRegen}
        title="Re-generate this PDF?"
        body="The current file will be overwritten with fresh data from your harvest log. The download link stays the same; the report's name doesn't change unless you rename it after."
        confirmLabel="Re-generate"
        isPending={pending}
        onCancel={() => setConfirmRegen(false)}
        onConfirm={() => {
          setConfirmRegen(false)
          runRegenerate()
        }}
      />
    </div>
  )
}

// v27.1.4.0.1: strip the trailing `.pdf` so the rename input shows the
// human-readable name only. The action re-appends .pdf on save.
function stripPdfExt(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? name.slice(0, -4) : name
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
