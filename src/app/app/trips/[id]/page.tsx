import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Pencil, Share2 } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import { fetchTripDetail, fetchAcceptedHunters } from '../../_lib/queries'
import StatusPill from '../../_components/StatusPill'
import { tripDateRange, timeOfDay, initials, relativeOrDate, formatTripLocation } from '../../_lib/format'
import AddParticipantsForm from './AddParticipantsForm'
import AddHarvestForm from './AddHarvestForm'
import WrapUpTripButton from './WrapUpTripButton'
import ReopenTripButton from './ReopenTripButton'

type RouteParams = Promise<{ id: string }>

// v26.3: trip detail rebuild. Sections in order:
//   1. Hero (title, kind, dates+location+counts, status pill, Edit button)
//   2. Trip details metadata grid (location / species / method / kind / notes)
//   3. Hunters section (list + Add hunters affordance for open trips)
//   4. Harvests section (list + AddHarvestForm for open trips)
//   5. Action bar (primary CTA flips on status; Wrap up / Reopen)
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

  return (
    <main className="bb-app-main">
      <Link
        href="/app/trips"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-1"
        style={{ color: 'var(--color-copper)' }}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        All trips
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="bb-page-eyebrow">{trip.kind === 'fishing' ? 'Fishing trip' : 'Hunting trip'}</p>
          <h1 className="bb-page-title">{trip.title}</h1>
          <div className="bb-meta-row mt-1.5">
            <span>{tripDateRange(trip.starts_at, trip.ends_at)}</span>
            {(() => {
              const loc = formatTripLocation(trip)
              return loc ? (
                <>
                  <span className="sep">·</span>
                  <span>{loc}</span>
                </>
              ) : null
            })()}
            <span className="sep">·</span>
            <span>{participants.length} {participants.length === 1 ? 'hunter' : 'hunters'}</span>
            <span className="sep">·</span>
            <span>{harvests.length} {harvests.length === 1 ? 'harvest' : 'harvests'}</span>
          </div>
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

      <section aria-labelledby="trip-details" className="mt-4">
        <h2 id="trip-details" className="bb-section-title">Trip details</h2>
        <div className="bb-tile">
          <div className="bb-tile-body">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <DetailRow label="Location" value={formatTripLocation(trip) ?? '—'} />
              <DetailRow label="County" value={trip.county || '—'} />
              <DetailRow label="Species targeted" value={trip.species_targeted || '—'} />
              <DetailRow label="Method" value={trip.method || '—'} />
              <DetailRow label="Activity" value={trip.kind === 'fishing' ? 'Fishing' : 'Hunting'} />
              <DetailRow label="Status" value={statusLabel(trip.status)} />
            </dl>
            {trip.notes && (
              <div className="mt-4">
                <dt className="bb-form-label" style={{ color: 'var(--color-ink-muted)' }}>Notes</dt>
                <dd className="text-sm whitespace-pre-wrap mt-1" style={{ color: 'var(--color-ink)' }}>
                  {trip.notes}
                </dd>
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="trip-hunters" className="mt-4">
        <h2 id="trip-hunters" className="bb-section-title">Hunters</h2>
        {participants.length === 0 ? (
          <div className="bb-empty">
            <div className="bb-empty-title">No hunters yet</div>
            <p className="bb-empty-sub">
              Add hunters to this trip — they&rsquo;ll see the active-hunt view from their phone.
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
          <AddParticipantsForm tripId={trip.id} availableHunters={availableHunters} />
        )}
      </section>

      <section aria-labelledby="trip-harvests" className="mt-4">
        <h2 id="trip-harvests" className="bb-section-title">Harvest log</h2>
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
      </section>

      <section aria-labelledby="trip-actions" className="mt-6">
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
    </main>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt
        style={{
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-ink-muted)',
          fontWeight: 600,
        }}
      >
        {label}
      </dt>
      <dd style={{ fontSize: '0.95rem', color: 'var(--color-ink)' }}>{value}</dd>
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
