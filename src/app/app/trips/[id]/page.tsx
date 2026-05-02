import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Pencil,
  Share2,
  ClipboardList,
  Calendar,
  Clock,
  MapPin,
  Building,
  Map,
  Mountain,
  TreeDeciduous,
  Crosshair,
  PawPrint,
  FileText,
  Users,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import {
  fetchTripDetail,
  fetchAcceptedHunters,
  fetchTripWalletLinks,
} from '../../_lib/queries'
import { fetchHarvestLogSummary } from '../../_lib/harvest-log-queries'
import StatusPill from '../../_components/StatusPill'
import { tripDateRange, initials, formatTripLocation } from '../../_lib/format'
import AddParticipantsForm from './AddParticipantsForm'
import WrapUpTripButton from './WrapUpTripButton'
import ReopenTripButton from './ReopenTripButton'
import CancelTripButton from './CancelTripButton'

type RouteParams = Promise<{ id: string }>

// v26.5.2: rebuilt to match Flavio's mockup IMG_6605. Each section card now
// has a circular copper section icon on the left of its header (Clipboard,
// Calendar, MapPin, Crosshair) with a hairline divider underneath. Inside
// each section the read-only fields render as DetailCell with their own
// per-field lucide glyphs in a 2- or 3-col grid:
//   BASICS:        Trip name | Activity | Status                  (3-col)
//   DATES:         Start | End | Range                            (3-col)
//   LOCATION:      City | State | Zone, then County alone         (3-col + 1)
//   HUNT DETAILS:  Species targeted | Method                      (2-col)
// Per Flavio's spec: Zone uses Mountain, Species uses PawPrint,
// Method uses Crosshair.
export default async function TripDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params
  const { profile } = await requireGuide()

  const detail = await fetchTripDetail(profile.id, id)
  if (!detail) notFound()

  // v27.1.1.0.3a: harvests pivoted to harvest_logs / harvest_log_entries.
  const { trip, participants } = detail
  const harvestLogSummary = await fetchHarvestLogSummary(trip.id)
  const isOpen = trip.status === 'planned' || trip.status === 'active'
  const isClosed = trip.status === 'completed' || trip.status === 'canceled'
  // v27.1.1.0.3a.4: hunt report only makes sense for trips that actually
  // happened. Canceled trips have nothing to report on, so the gate is
  // tighter than the generic isClosed.
  const isWrapped = trip.status === 'completed'

  const availableHunters = isOpen
    ? (await fetchAcceptedHunters(profile.id)).filter(
        (h) => !participants.some((p) => p.hunter_id === h.id)
      )
    : []

  const dateRange = tripDateRange(trip.starts_at, trip.ends_at)
  const locLabel = formatTripLocation(trip)

  // v27.0b.6 (C): per-hunter wallet-item links for the participant chips.
  // RLS lets the guide read participants' wallet items via the v27.0a.23
  // trip-link policy.
  const walletLinksByHunter = await fetchTripWalletLinks(trip.id)

  return (
    <main className="bb-app-main">
      <Link
        href="/app/trips"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All trips
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">{trip.kind === 'fishing' ? 'Fishing trip' : 'Hunting trip'}</p>
          <h1 className="bb-page-title">{trip.title}</h1>
          <p className="bb-page-sub">View and manage trip details.</p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusPill status={trip.status} />
        </div>
      </header>

      {/* v27.0b.9.1: trip actions promoted from the bottom of the page to
          a tight row right under the header. Primary action (Edit) uses
          bb-cta-sm copper styling so it matches Save Changes / Add
          Hunter / Wrap up across the rest of the app. Secondary actions
          (Wrap up / Cancel / Reopen / Share) keep bb-btn-secondary. */}
      <div
        className="mt-2 flex flex-wrap gap-2"
        aria-label="Trip actions"
        style={{ alignItems: 'center' }}
      >
        <Link
          href={`/app/trips/${trip.id}/edit`}
          className="bb-cta-sm"
          aria-label="Edit trip"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Pencil size={14} aria-hidden="true" />
          Edit
        </Link>
        {isOpen && <WrapUpTripButton tripId={trip.id} />}
        {isOpen && <CancelTripButton tripId={trip.id} />}
        {isClosed && <ReopenTripButton tripId={trip.id} />}
        {/* v27.1.1.0.3a.3 / .4: hunt report button in the top action row.
            Gated to wrapped trips only (status='completed') — canceled
            trips have nothing to report on, planned/active aren't done
            yet. Mid-page fallback section below renders under the same
            isWrapped gate so there's always a redundant entry point if
            the top row gets pushed off screen on mobile. */}
        {isWrapped && (
          <Link
            href={`/app/trips/${trip.id}/log`}
            className="bb-cta-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Activity size={14} aria-hidden="true" />
            {harvestLogSummary.exists ? 'View hunt report' : 'Generate hunt report'}
          </Link>
        )}
        <button
          type="button"
          className="bb-btn-secondary"
          disabled
          title="Warden share ships later in Sprint 2"
          aria-label="Share with warden (coming soon)"
        >
          <Share2 size={14} aria-hidden="true" />
          Share with warden
        </button>
      </div>

      <div className="bb-form-narrow mt-4 flex flex-col gap-4">
        {/* BASICS */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-basics">
          <div className="bb-tile-body">
            <SectionHead id="td-basics" icon={ClipboardList} label="Basics" />
            <div className="bb-detail-grid-3">
              <DetailCell icon={FileText} label="Trip name" value={trip.title} />
              <DetailCell
                icon={trip.kind === 'fishing' ? Activity : PawPrint}
                label="Activity"
                value={trip.kind === 'fishing' ? 'Fishing' : 'Hunting'}
              />
              <DetailCell
                icon={Activity}
                label="Status"
                node={<StatusPill status={trip.status} />}
              />
            </div>
          </div>
        </section>

        {/* DATES */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-dates">
          <div className="bb-tile-body">
            <SectionHead id="td-dates" icon={Calendar} label="Dates" />
            <div className="bb-detail-grid-3">
              <DetailCell
                icon={Calendar}
                label="Start"
                node={<DateTimeStack iso={trip.starts_at} />}
              />
              <DetailCell
                icon={Calendar}
                label="End"
                node={trip.ends_at ? <DateTimeStack iso={trip.ends_at} /> : <span className="bb-detail-cell-value">Not set</span>}
              />
              <DetailCell icon={Clock} label="Range" value={dateRange} />
            </div>
          </div>
        </section>

        {/* LOCATION */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-location">
          <div className="bb-tile-body">
            <SectionHead id="td-location" icon={MapPin} label="Location" />
            <div className="bb-detail-grid-3">
              <DetailCell icon={Building} label="City" value={trip.city || 'Not set'} />
              <DetailCell icon={Map} label="State" value={trip.state || 'Not set'} />
              <DetailCell icon={Mountain} label="Zone" value={trip.zone || 'Not set'} />
            </div>
            <div className="bb-detail-grid-3" style={{ marginTop: '0.85rem' }}>
              <DetailCell icon={TreeDeciduous} label="County" value={trip.county || 'Not set'} />
              {locLabel && (
                <div style={{ gridColumn: 'span 2' }}>
                  <DetailCell icon={MapPin} label="Summary" value={locLabel} />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* HUNT DETAILS */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-hunt">
          <div className="bb-tile-body">
            <SectionHead id="td-hunt" icon={Crosshair} label="Hunt details" />
            <div className="bb-detail-grid-2">
              <DetailCell icon={PawPrint} label="Species targeted" value={trip.species_targeted || 'Not set'} />
              <DetailCell icon={Crosshair} label="Method" value={trip.method || 'Not set'} />
            </div>
          </div>
        </section>

        {/* NOTES */}
        {trip.notes && (
          <section className="bb-tile bb-form-section" aria-labelledby="td-notes">
            <div className="bb-tile-body">
              <SectionHead id="td-notes" icon={FileText} label="Notes" />
              <p className="text-sm" style={{ color: 'var(--color-ink)', whiteSpace: 'pre-wrap' }}>
                {trip.notes}
              </p>
            </div>
          </section>
        )}

        {/* HUNTERS */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-hunters">
          <div className="bb-tile-body">
            <SectionHead id="td-hunters" icon={Users} label="Hunters" />
            {participants.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">No hunters yet</div>
                <p className="bb-empty-sub">
                  Add hunters to this trip. They&rsquo;ll see the active-hunt view from their phone.
                </p>
              </div>
            ) : (
              <div className="bb-detail-list">
                {participants.map((p) => {
                  const name = p.profile?.display_name ?? p.guest_name ?? 'Unnamed hunter'
                  // v27.0b.6 (C): wallet-item chips per hunter. Pulled from
                  // trip_wallet_items by hunter_id. Pending badge appears
                  // when no license OR no tag is linked (matches the
                  // hunter's Action-Needed card).
                  const links = p.hunter_id ? walletLinksByHunter.get(p.hunter_id) ?? [] : []
                  const hasLicense = links.some((l) => l.type === 'license')
                  const hasTag = links.some((l) => l.type === 'tag')
                  const pending: string[] = []
                  if (p.hunter_id) {
                    if (!hasLicense) pending.push('license')
                    if (!hasTag && trip.species_targeted) pending.push('tag')
                  }
                  return (
                    <div key={p.id} className="bb-detail-row">
                      <span className="bb-avatar" aria-hidden="true">{initials(name)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="bb-detail-name">{name}</div>
                        <div className="bb-detail-sub">
                          {p.profile ? 'Bite Book hunter' : 'Guest'} · {p.role}
                        </div>
                        {(links.length > 0 || pending.length > 0) && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '0.35rem',
                              marginTop: '0.4rem',
                            }}
                          >
                            {links.map((l) => {
                              const typeLabel =
                                l.type === 'license'
                                  ? 'License'
                                  : l.type === 'tag'
                                    ? 'Tag'
                                    : l.type === 'permit'
                                      ? 'Permit'
                                      : l.type === 'stamp'
                                        ? 'Stamp'
                                        : 'Doc'
                              return (
                                <span
                                  key={l.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '999px',
                                    background: 'var(--color-paper-tint)',
                                    border: '1px solid var(--color-ink-tint)',
                                    fontSize: '0.78rem',
                                    color: 'var(--color-ink)',
                                  }}
                                >
                                  <strong style={{ fontWeight: 600 }}>{typeLabel}:</strong>{' '}
                                  {l.identifier}
                                  {l.species ? ` · ${l.species}` : ''}
                                  {' ✓'}
                                </span>
                              )
                            })}
                            {pending.map((kind) => (
                              <span
                                key={`pending-${kind}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '999px',
                                  background: 'var(--color-copper)',
                                  color: '#fff',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                }}
                              >
                                Pending: {kind}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {isOpen && (
              <div className="mt-3">
                <AddParticipantsForm tripId={trip.id} availableHunters={availableHunters} />
              </div>
            )}
          </div>
        </section>

        {/* v27.1.1.0.3a.4: Hunt report section restored as a mid-page
            fallback. The top action row is the primary entry, but on
            small viewports the row can wrap and visually compete with
            other action buttons. This section guarantees a visible
            in-page CTA on every wrapped trip detail. Same isWrapped
            gate as the top button. */}
        {isWrapped && (
          <section
            className="bb-tile bb-form-section"
            aria-labelledby="td-hunt-report"
          >
            <div className="bb-tile-body">
              <SectionHead id="td-hunt-report" icon={Activity} label="Hunt report" />
              {harvestLogSummary.exists ? (
                <p className="bb-form-help" style={{ marginBottom: '0.75rem' }}>
                  {harvestLogSummary.total_entries} hunter
                  {harvestLogSummary.total_entries === 1 ? '' : 's'} on the report
                  {harvestLogSummary.total_entries > 0 && (
                    <>
                      {' · '}
                      {harvestLogSummary.included_entries} included
                      {harvestLogSummary.excluded_entries > 0
                        ? ` · ${harvestLogSummary.excluded_entries} excluded`
                        : ''}
                    </>
                  )}
                  .
                </p>
              ) : (
                <p className="bb-form-help" style={{ marginBottom: '0.75rem' }}>
                  Generate the hunt report. One entry per hunter on the trip — auto-fills license,
                  tag, phone, and address from the wallet and profile.
                </p>
              )}
              <Link href={`/app/trips/${trip.id}/log`} className="bb-cta-sm">
                {harvestLogSummary.exists ? 'View hunt report' : 'Generate hunt report'}
              </Link>
            </div>
          </section>
        )}

        {/* v27.0b.9.1: Trip actions section relocated to the top of the
            page (under the header). The bottom-of-page action row was
            removed in favor of the top placement so common actions
            (Edit / Wrap up / Cancel / Reopen) are reachable without
            scrolling. */}
      </div>
    </main>
  )
}

function SectionHead({ id, icon: Icon, label }: { id: string; icon: LucideIcon; label: string }) {
  return (
    <h2 id={id} className="bb-section-head-iconed">
      <span className="bb-section-head-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className="bb-section-head-label">{label}</span>
    </h2>
  )
}

function DetailCell({
  icon: Icon,
  label,
  value,
  node,
}: {
  icon: LucideIcon
  label: string
  value?: string
  node?: React.ReactNode
}) {
  return (
    <div className="bb-detail-cell">
      <span className="bb-detail-cell-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <div className="bb-detail-cell-body">
        <div className="bb-detail-cell-label">{label}</div>
        {node ? <div>{node}</div> : <div className="bb-detail-cell-value">{value}</div>}
      </div>
    </div>
  )
}

// v26.5.3: short single-line "Apr 28, 11:45 AM" format for read-only
// Start/End cells. Year dropped (rarely needed inline; full date is in the
// Range cell beside Start/End anyway), "at" connector dropped, comma keeps
// month-day legible. This matches Flavio's spec for the dates display.
function DateTimeStack({ iso }: { iso: string }) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return <span className="bb-detail-cell-value">{iso}</span>
  }
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return <div className="bb-detail-cell-value">{`${date}, ${time}`}</div>
}
