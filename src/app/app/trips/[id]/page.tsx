import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil, Share2 } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchTripDetail, fetchAcceptedHunters } from '../../_lib/queries'
import StatusPill from '../../_components/StatusPill'
import { tripDateRange, timeOfDay, initials, relativeOrDate, formatTripLocation } from '../../_lib/format'
import AddParticipantsForm from './AddParticipantsForm'
import AddHarvestForm from './AddHarvestForm'
import WrapUpTripButton from './WrapUpTripButton'
import ReopenTripButton from './ReopenTripButton'

type RouteParams = Promise<{ id: string }>

// v26.4: trip detail layout matched to the EditTripForm section structure
// (Basics / Dates / Location / Hunt details / Hunters / Harvests). Each
// section is its own .bb-tile so the read view and the edit view feel
// consistent. Header gets the small ArrowLeft back link + uppercase eyebrow
// + title pattern so the visual rhythm matches /app/trips/new and /edit.
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
            <h2 id="td-basics" className="bb-form-section-head">Basics</h2>
            <DetailRow label="Trip name" value={trip.title} />
            <DetailRow label="Activity" value={trip.kind === 'fishing' ? 'Fishing' : 'Hunting'} />
            <DetailRow label="Status" value={statusLabel(trip.status)} />
          </div>
        </section>

        {/* DATES */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-dates">
          <div className="bb-tile-body">
            <h2 id="td-dates" className="bb-form-section-head">Dates</h2>
            <DetailRow label="Start" value={new Date(trip.starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} />
            <DetailRow
              label="End"
              value={trip.ends_at ? new Date(trip.ends_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not set'}
            />
            <DetailRow label="Range" value={dateRange} />
          </div>
        </section>

        {/* LOCATION */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-location">
          <div className="bb-tile-body">
            <h2 id="td-location" className="bb-form-section-head">Location</h2>
            <DetailRow label="City" value={trip.city || 'Not set'} />
            <DetailRow label="State" value={trip.state || 'Not set'} />
            <DetailRow label="Zone" value={trip.zone || 'Not set'} />
            <DetailRow label="County" value={trip.county || 'Not set'} />
            {locLabel && <DetailRow label="Summary" value={locLabel} />}
          </div>
        </section>

        {/* HUNT DETAILS */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-hunt">
          <div className="bb-tile-body">
            <h2 id="td-hunt" className="bb-form-section-head">Hunt details</h2>
            <DetailRow label="Species targeted" value={trip.species_targeted || 'Not set'} />
            <DetailRow label="Method" value={trip.method || 'Not set'} />
          </div>
        </section>

        {/* NOTES */}
        {trip.notes && (
          <section className="bb-tile bb-form-section" aria-labelledby="td-notes">
            <div className="bb-tile-body">
              <h2 id="td-notes" className="bb-form-section-head">Notes</h2>
              <p className="text-sm" style={{ color: 'var(--color-ink)', whiteSpace: 'pre-wrap' }}>
                {trip.notes}
              </p>
            </div>
          </section>
        )}

        {/* HUNTERS */}
        <section className="bb-tile bb-form-section" aria-labelledby="td-hunters">
          <div className="bb-tile-body">
            <h2 id="td-hunters" className="bb-form-section-head">Hunters</h2>
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
            <h2 id="td-harvests" className="bb-form-section-head">Harvest log</h2>
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
                  participants={harvestParticipants}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0" style={{ paddingTop: '0.45rem', paddingBottom: '0.45rem' }}>
      <dt
        style={{
          fontFamily: 'var(--font-barlow-condensed)',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--color-ink-muted)',
          fontWeight: 700,
        }}
      >
        {label}
      </dt>
      <dd style={{ fontSize: '0.95rem', color: 'var(--color-ink)', overflowWrap: 'anywhere' }}>{value}</dd>
    </div>
  )
}

function statusLabel(status: 'planned' | 'active' | 'completed' | 'canceled'): string {
  switch (status) {
    case 'planned': return 'Pre-trip'
    case 'active': return 'In field'
    case 'completed': return 'Wrapped'
    case 'canceled': return 'Canceled'
  }
}
