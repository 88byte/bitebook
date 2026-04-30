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
  fetchHarvestTagOptions,
  type HarvestTagOptions,
} from '../../_lib/queries'
import StatusPill from '../../_components/StatusPill'
import { tripDateRange, timeOfDay, initials, relativeOrDate, formatTripLocation } from '../../_lib/format'
import AddParticipantsForm from './AddParticipantsForm'
import AddHarvestForm from './AddHarvestForm'
import WrapUpTripButton from './WrapUpTripButton'
import ReopenTripButton from './ReopenTripButton'

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

  const { trip, participants, harvests } = detail
  const isOpen = trip.status === 'planned' || trip.status === 'active'
  const isClosed = trip.status === 'completed' || trip.status === 'canceled'

  const availableHunters = isOpen
    ? (await fetchAcceptedHunters(profile.id)).filter(
        (h) => !participants.some((p) => p.hunter_id === h.id)
      )
    : []

  const harvestParticipants = participants
    .filter((p) => p.hunter_id && p.profile)
    .map((p) => ({ id: p.hunter_id as string, display_name: p.profile!.display_name }))

  // v27.0b.2: per-hunter linked-tag options for the harvest form. Map of
  // hunter_id → list of active tag wallet items they can consume on this
  // trip. Plain object so it serializes to the client component cleanly.
  const tagOptionsByHunter: Record<string, HarvestTagOptions> = {}
  if (isOpen) {
    const tagOptionsMap = await fetchHarvestTagOptions(
      profile.id,
      trip.id,
      harvestParticipants.map((p) => p.id)
    )
    tagOptionsMap.forEach((opts, hunterId) => {
      tagOptionsByHunter[hunterId] = opts
    })
  }

  const dateRange = tripDateRange(trip.starts_at, trip.ends_at)
  const locLabel = formatTripLocation(trip)

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
          <Link
            href={`/app/trips/${trip.id}/edit`}
            className="bb-btn-secondary"
            aria-label="Edit trip"
            style={{ color: 'var(--color-copper)' }}
          >
            <Pencil size={14} aria-hidden="true" />
            Edit
          </Link>
        </div>
      </header>

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
                  return (
                    <div key={p.id} className="bb-detail-row">
                      <span className="bb-avatar" aria-hidden="true">{initials(name)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="bb-detail-name">{name}</div>
                        <div className="bb-detail-sub">
                          {p.profile ? 'Bite Book hunter' : 'Guest'} · {p.role}
                        </div>
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

        {/* HARVEST LOG */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-harvests">
          <div className="bb-tile-body">
            <SectionHead id="td-harvests" icon={Activity} label="Harvest log" />
            {harvests.length === 0 ? (
              <div className="bb-empty">
                <div className="bb-empty-title">No harvests logged</div>
                <p className="bb-empty-sub">
                  {isOpen
                    ? 'Tap "Add harvest" below once you have one to log.'
                    : 'No harvests were logged on this trip.'}
                </p>
              </div>
            ) : (
              <div className="bb-detail-list">
                {harvests.map((h) => {
                  const hunterName = h.hunter_name ?? 'Unknown hunter'
                  const species = h.species_name ?? (h.kind === 'fishing' ? 'Catch' : 'Harvest')
                  const subParts: string[] = [hunterName, timeOfDay(h.harvested_at), relativeOrDate(h.harvested_at)]
                  if (h.method) subParts.push(h.method)
                  if (h.quantity > 1) subParts.push(`Qty ${h.quantity}`)
                  return (
                    <div key={h.id} className="bb-detail-row">
                      <span className="bb-avatar" aria-hidden="true">{initials(hunterName)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="bb-detail-name">
                          {species}
                          {h.tag_number ? <span style={{ color: 'var(--color-ink-soft)' }}> · Tag {h.tag_number}</span> : null}
                        </div>
                        <div className="bb-detail-sub">{subParts.join(' · ')}</div>
                        {h.notes && (
                          <div className="bb-detail-sub" style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                            {h.notes}
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
                <AddHarvestForm
                  tripId={trip.id}
                  tripKind={trip.kind}
                  defaultMethod={trip.method ?? null}
                  defaultSpecies={trip.species_targeted ?? null}
                  participants={harvestParticipants}
                  tagOptionsByHunter={tagOptionsByHunter}
                />
              </div>
            )}
          </div>
        </section>

        {/* ACTIONS */}
        <section aria-labelledby="trip-actions">
          <h2 id="trip-actions" className="sr-only">Trip actions</h2>
          <div className="flex flex-wrap gap-2">
            {isOpen && <WrapUpTripButton tripId={trip.id} />}
            {isClosed && <ReopenTripButton tripId={trip.id} />}
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
        </section>
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
